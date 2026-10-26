#!/usr/bin/env node
// Génère/actualise docs/technique/**.md via l'API OpenAI, à partir des fichiers
// source (JS front + backend services/api) modifiés depuis le dernier run.
// Usage: node scripts/generate-docs.mjs
// Env requis: OPENAI_API_KEY
// Env optionnels:
//   DOCS_MODEL       modèle OpenAI (défaut: gpt-6-luna)
//   DOCS_MAX_FILES   plafond de fichiers envoyés par run (défaut: 80)
//   DOCS_FORCE_FULL  =1 pour ignorer le plafond (regénération volontaire)
//   DOCS_DRY_RUN     =1 pour lister les fichiers concernés sans appeler OpenAI
//
// Point de départ du diff (dans l'ordre) :
//   1. le marqueur .docs-auto-sha de la branche PR docs-auto/update ;
//   2. à défaut, la base de cette branche (merge-base avec HEAD) — cas d'une
//      branche produite par l'ancien script, sans marqueur ;
//   3. à défaut, le marqueur de HEAD (PR mergée) ;
//   4. à défaut, le dernier commit ayant touché docs/technique/code.
// Les docs déjà générées dans la branche PR sont reprises avant d'ajouter les
// nouveautés : la PR s'accumule au lieu d'être recalculée depuis zéro.
// Historique : avant ce mécanisme, le point de départ ne bougeait que quand la
// PR était mergée. Jamais mergée → chaque push renvoyait TOUS les fichiers
// modifiés depuis des semaines (160 fichiers, 1,9 Mo, plusieurs dollars par
// run en gpt-4.1), d'où une facture OpenAI qui gonflait de semaine en semaine.

import { execSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOCS_DIR = join(ROOT, 'docs', 'technique');
const CODE_DIR = join(DOCS_DIR, 'code');
const MARKER_FILE = join(DOCS_DIR, '.docs-auto-sha');
const PR_BRANCH = 'docs-auto/update';
const PR_REF = `origin/${PR_BRANCH}`;

const MODEL = process.env.DOCS_MODEL || 'gpt-6-luna';
const MAX_FILES = Number(process.env.DOCS_MAX_FILES) || 80; // valeur non numérique → 80, jamais « sans plafond »
const FORCE_FULL = process.env.DOCS_FORCE_FULL === '1';
// `reasoning_effort: 'none'` n'existe que pour gpt-5.1+ et la famille gpt-6 ;
// gpt-4.1 et gpt-4.1-mini (DOCS_MODEL) refusent le paramètre.
const REASONING_MODEL = /^gpt-(5\.\d|6)/.test(MODEL);

// Tarifs publics ($ / 1M jetons) pour l'estimation affichée en fin de run.
// Indicatif seulement : vérifier sur platform.openai.com en cas de doute.
const PRICES = {
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};

// Groupes de sources → fichier doc cible + prompt adapté au type de contenu.
const CODE_GROUPS = [
  { glob: 'src/utils', out: join(CODE_DIR, 'utils.md'), title: 'src/utils' },
  { glob: 'src/config', out: join(CODE_DIR, 'config.md'), title: 'src/config' },
  { glob: 'src/lib/tiptap', out: join(CODE_DIR, 'tiptap.md'), title: 'src/lib/tiptap' },
  { glob: 'services/api', out: join(CODE_DIR, 'api.md'), title: 'services/api' },
];
const WATCHED_PATHS = 'src/utils src/config src/lib/tiptap services/api';

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function trySh(cmd) {
  try {
    return sh(cmd);
  } catch {
    return '';
  }
}

function rel(absPath) {
  return relative(ROOT, absPath);
}

function commitExists(sha) {
  return /^[0-9a-f]{7,40}$/.test(sha) && trySh(`git cat-file -t ${sha}`) === 'commit';
}

function isAncestorOfHead(sha) {
  try {
    sh(`git merge-base --is-ancestor ${sha} HEAD`);
    return true;
  } catch {
    return false;
  }
}

// Lit un fichier dans un commit/branche (chaîne vide s'il n'existe pas).
// Contenu brut, sans trim : un saut de ligne final retiré ici ferait diverger
// l'ancêtre de la copie de travail, et la fusion à 3 voies tomberait en conflit
// dès que la PR a ajouté une section en fin de fichier.
function gitShow(ref, relPath) {
  try {
    return execSync(`git show ${ref}:"${relPath}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

function prBranchExists() {
  // En CI (checkout fetch-depth 0) la branche est déjà là ; en local, on la
  // récupère au besoin. Échec silencieux : pas de branche = pas de PR ouverte.
  trySh(`git fetch --no-tags --quiet origin ${PR_BRANCH}:refs/remotes/${PR_REF}`);
  return commitExists(trySh(`git rev-parse --verify --quiet ${PR_REF}`));
}

// Détermine le commit de départ et d'où viennent les docs déjà générées.
function resolveBase() {
  const markerRel = rel(MARKER_FILE);

  if (prBranchExists()) {
    const marker = gitShow(PR_REF, markerRel).trim();
    if (commitExists(marker) && isAncestorOfHead(marker)) {
      return { sha: marker, docsFrom: PR_REF, how: `marqueur de ${PR_REF}` };
    }
    const mergeBase = trySh(`git merge-base ${PR_REF} HEAD`);
    if (commitExists(mergeBase)) {
      return { sha: mergeBase, docsFrom: PR_REF, how: `base de ${PR_REF}` };
    }
  }

  const headMarker = existsSync(MARKER_FILE) ? readFileSync(MARKER_FILE, 'utf8').trim() : '';
  if (commitExists(headMarker) && isAncestorOfHead(headMarker)) {
    return { sha: headMarker, docsFrom: null, how: 'marqueur de HEAD' };
  }

  // Ancien comportement : dernier commit ayant touché le dossier GÉNÉRÉ (code/).
  // Borné à `code/` et NON à docs/technique/ : un fichier écrit à la main dans ce
  // dossier serait sinon pris pour « déjà généré ».
  const lastDocsCommit = trySh(`git log -1 --format=%H -- "${rel(CODE_DIR)}"`);
  if (commitExists(lastDocsCommit)) {
    return { sha: lastDocsCommit, docsFrom: null, how: 'dernier commit de docs/technique/code' };
  }
  return { sha: '', docsFrom: null, how: 'aucun (première génération)' };
}

// Reprend, depuis la branche PR, les docs générées lors des runs précédents.
// Fusion à 3 voies pour ne pas écraser une retouche faite sur develop entre-temps ;
// en cas de conflit, la version de develop est conservée : les sections de la PR
// pour ce fichier de doc sont perdues, chaque source sera redocumentée à sa
// prochaine modification.
function restoreGeneratedDocs(base) {
  if (!base.docsFrom) return;
  const tracked = trySh(`git ls-tree -r --name-only ${base.docsFrom} -- "${rel(CODE_DIR)}"`)
    .split('\n')
    .filter((f) => f.endsWith('.md'));
  if (tracked.length === 0) return;

  const tmp = mkdtempSync(join(tmpdir(), 'docs-auto-'));
  try {
    for (const relPath of tracked) {
      const theirs = gitShow(base.docsFrom, relPath);
      const absPath = join(ROOT, relPath);
      const ours = existsSync(absPath) ? readFileSync(absPath, 'utf8') : '';
      const ancestor = base.sha ? gitShow(base.sha, relPath) : '';

      if (ours === theirs) continue;
      if (ours === ancestor) {
        // Rien n'a bougé sur develop depuis la génération : on reprend la PR telle quelle.
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, theirs);
        continue;
      }
      const fOurs = join(tmp, 'ours.md');
      const fBase = join(tmp, 'base.md');
      const fTheirs = join(tmp, 'theirs.md');
      writeFileSync(fOurs, ours);
      writeFileSync(fBase, ancestor);
      writeFileSync(fTheirs, theirs);
      try {
        const merged = execSync(`git merge-file -p "${fOurs}" "${fBase}" "${fTheirs}"`, {
          cwd: ROOT,
          encoding: 'utf8',
        });
        writeFileSync(absPath, merged);
      } catch {
        console.warn(`Conflit de fusion sur ${relPath} : version de develop conservée.`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function changedFiles(base) {
  if (!base.sha) {
    return sh(`git ls-files ${WATCHED_PATHS}`).split('\n').filter(Boolean);
  }
  const diff = sh(`git diff --name-only --diff-filter=ACMR ${base.sha} HEAD -- ${WATCHED_PATHS}`);
  return diff.split('\n').filter(Boolean);
}

function targetForCodeFile(relPath) {
  return CODE_GROUPS.find((g) => relPath.startsWith(g.glob + '/') || relPath === g.glob);
}

function isDocumentable(relPath) {
  if (!relPath.endsWith('.js')) return false;
  if (!targetForCodeFile(relPath)) return false;
  // Tests exclus : la doc décrit le code de production.
  if (relPath.includes('/test/') || relPath.endsWith('.test.js')) return false;
  return existsSync(join(ROOT, relPath)); // fichier supprimé : on ne le retire pas de la doc auto
}

const usage = { input: 0, output: 0, calls: 0 };

async function askLLM(client, { relPath, content }) {
  const prompt = `Tu documentes un fichier source JS pour un repo technique. Fichier: ${relPath}.
Rédige en français une section markdown concise (titre \`### ${relPath}\`) décrivant: le rôle du fichier, les fonctions exportées (nom, paramètres, retour, effet de bord notable), points d'attention (edge cases, dépendances). Pas de blabla, factuel, format liste à puces sous le titre.

Code:
\`\`\`js
${content}
\`\`\``;

  // gpt-4.1 est retiré par OpenAI le 2027-01-14 ; gpt-6-luna est le remplaçant
  // désigné (20× moins cher en entrée). Sans raisonnement, comme gpt-4.1 : des
  // jetons de raisonnement mangeraient le budget de sortie. La famille gpt-6
  // refuse `max_tokens`.
  const res = await client.chat.completions.create({
    model: MODEL,
    ...(REASONING_MODEL && { reasoning_effort: 'none' }),
    max_completion_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  usage.calls += 1;
  usage.input += res.usage?.prompt_tokens ?? 0;
  usage.output += res.usage?.completion_tokens ?? 0;
  return (res.choices[0]?.message?.content ?? '').trim();
}

function upsertSection(filePath, relPath, section) {
  mkdirSync(dirname(filePath), { recursive: true });
  const header = `### ${relPath}`;
  let existing = existsSync(filePath)
    ? readFileSync(filePath, 'utf8')
    : `# ${basename(filePath, '.md')}\n\n`;

  const headerIdx = existing.indexOf(header);
  if (headerIdx === -1) {
    existing = existing.trimEnd() + '\n\n' + section + '\n';
  } else {
    const nextHeaderIdx = existing.indexOf('\n### ', headerIdx + header.length);
    const before = existing.slice(0, headerIdx);
    const after = nextHeaderIdx === -1 ? '' : existing.slice(nextHeaderIdx + 1);
    existing = before + section + '\n\n' + after;
  }
  writeFileSync(filePath, existing.trimEnd() + '\n');
}

function regenerateIndex() {
  const lines = [
    '# Doc technique (générée)',
    '',
    '_Régénérée automatiquement — ne pas éditer ces fichiers à la main._',
    '',
  ];
  for (const sub of ['code']) {
    const dir = join(DOCS_DIR, sub);
    if (!existsSync(dir)) continue;
    lines.push(`## ${sub}`, '');
    for (const f of readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()) {
      lines.push(`- [${f}](./${sub}/${f})`);
    }
    lines.push('');
  }
  writeFileSync(join(DOCS_DIR, 'README.md'), lines.join('\n').trimEnd() + '\n');
}

function writeMarker() {
  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(MARKER_FILE, sh('git rev-parse HEAD') + '\n');
}

function reportUsage() {
  const price = PRICES[MODEL];
  const cost = price
    ? ` ≈ $${((usage.input * price.input + usage.output * price.output) / 1e6).toFixed(3)}`
    : '';
  console.log(
    `OpenAI (${MODEL}) : ${usage.calls} appels, ${usage.input} jetons en entrée, ${usage.output} en sortie${cost}.`,
  );
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY manquant — abandon.');
    process.exit(1);
  }

  const base = resolveBase();
  console.log(`Point de départ : ${base.sha ? base.sha.slice(0, 10) : '(aucun)'} — ${base.how}.`);

  const files = changedFiles(base).filter(isDocumentable);
  if (files.length === 0) {
    console.log('Aucun fichier source changé depuis la dernière doc — rien à faire.');
    // La PR est recréée depuis develop à chaque run : sans ce report, un run sans
    // nouveauté (push de tests seuls, relance manuelle) la viderait, et
    // delete-branch la fermerait avec toute la doc déjà générée.
    if (base.docsFrom && process.env.DOCS_DRY_RUN !== '1') {
      restoreGeneratedDocs(base);
      regenerateIndex();
      writeMarker();
    }
    return;
  }

  // Garde-fou : un point de départ qui n'avance plus se voit ici, avant la facture.
  if (files.length > MAX_FILES && !FORCE_FULL) {
    console.error(
      `${files.length} fichiers à documenter, plafond DOCS_MAX_FILES=${MAX_FILES} dépassé — abandon.\n` +
        `Si c'est voulu (regénération complète), relancer le workflow avec l'option « tout » ` +
        `(DOCS_FORCE_FULL=1).`,
    );
    process.exit(1);
  }
  console.log(`${files.length} fichier(s) à documenter avec ${MODEL}.`);
  if (process.env.DOCS_DRY_RUN === '1') {
    const bytes = files.reduce((n, f) => n + readFileSync(join(ROOT, f)).length, 0);
    console.log(files.map((f) => `  - ${f}`).join('\n'));
    console.log(`DOCS_DRY_RUN=1 : ${bytes} octets seraient envoyés, aucun appel OpenAI.`);
    return;
  }

  restoreGeneratedDocs(base);

  const client = new OpenAI({ apiKey });

  for (const relPath of files) {
    const group = targetForCodeFile(relPath);
    const content = readFileSync(join(ROOT, relPath), 'utf8');
    const section = await askLLM(client, { relPath, content });
    upsertSection(group.out, relPath, section);
    console.log(`Doc mise à jour: ${rel(group.out)} (${relPath})`);
  }

  regenerateIndex();
  writeMarker();
  reportUsage();
}

main().catch((err) => {
  console.error(err);
  reportUsage();
  process.exit(1);
});
