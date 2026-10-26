/**
 * Écrit src/whats-new.json — les nouveautés montrées par la popup du numéro
 * de version — à partir de NOUVEAUTES.md, daté par l'historique git.
 *
 * Appelé par le hook .githooks/post-commit, qui glisse le fichier dans le
 * commit courant SI le contenu a changé. D'où trois exigences :
 *
 *  - la source est lue TELLE QU'ELLE EST COMMITÉE (HEAD), pas sur le disque :
 *    une retouche non indexée de NOUVEAUTES.md serait sinon publiée — et
 *    amendée — dans un commit qui ne la contient pas ;
 *  - déterministe : aucune horodatation « maintenant » (cf. whats-new-lib) ;
 *  - silencieux quand rien ne change : le fichier n'est réécrit que si la
 *    liste diffère réellement de celle déjà publiée. Un commit qui ne touche
 *    pas NOUVEAUTES.md ne produit donc rien, quel que soit son type.
 *
 * Usage :
 *   node scripts/generate-whats-new.mjs            écrit si nécessaire
 *   node scripts/generate-whats-new.mjs --check    n'écrit pas, sort en 1 si obsolète
 *   node scripts/generate-whats-new.mjs --verbose  liste ce qui est publié
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  SOURCE_PATH,
  BIRTH_LOG_ARGS,
  parseSource,
  validateEntries,
  birthsFromLog,
  buildPublished,
  sameEntries,
} from './whats-new-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outFile = resolve(repoRoot, 'src/whats-new.json');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const verbose = args.includes('--verbose');

function git(gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** HEAD d'abord ; le disque seulement tant que la source n'a jamais été commitée. */
function readSource() {
  try {
    return git(['show', `HEAD:${SOURCE_PATH}`]);
  } catch {
    const onDisk = resolve(repoRoot, SOURCE_PATH);
    return existsSync(onDisk) ? readFileSync(onDisk, 'utf8') : '';
  }
}

const versionCache = new Map();
function versionAt(sha) {
  if (!versionCache.has(sha)) {
    let version = null;
    try {
      version = JSON.parse(git(['show', `${sha}:src/version.json`])).version || null;
    } catch {
      version = null; // commit antérieur au fichier de version
    }
    versionCache.set(sha, version);
  }
  return versionCache.get(sha);
}

function readBirths() {
  try {
    return birthsFromLog(git(BIRTH_LOG_ARGS));
  } catch {
    return new Map(); // pas de dépôt, ou source jamais commitée
  }
}

const entries = parseSource(readSource());

// Une faute dans un texte d'annonce ne fait jamais échouer un commit : on
// prévient, et seule l'entrée inutilisable reste à quai.
const errors = validateEntries(entries);
for (const error of errors) {
  console.error(`[whats-new] ${error.blocking ? 'écartée' : 'à revoir'} — ${error.message}`);
}

const published = buildPublished(entries, readBirths(), versionAt);

if (verbose) {
  for (const entry of published) {
    console.log(`✓ ${entry.date || '(non commitée)'} v${entry.version || '?'}  ${entry.title}`);
  }
}

if (published.length === 0) {
  console.error(`[whats-new] aucune nouveauté dans ${SOURCE_PATH} — fichier laissé en l’état`);
  process.exit(checkOnly ? 1 : 0);
}

const previous = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;

if (previous && sameEntries(previous.entries, published)) {
  if (verbose) console.log('[whats-new] inchangé');
  process.exit(0);
}

if (checkOnly) {
  console.error('[whats-new] src/whats-new.json est obsolète — lancez: npm run whats-new');
  process.exit(1);
}

writeFileSync(outFile, JSON.stringify({ entries: published }, null, 2) + '\n');
console.log(`[whats-new] ${published.length} nouveautés — en tête : « ${published[0].title} »`);
