/**
 * « Quoi de neuf ? » — ce que la popup a le droit d'afficher.
 *
 * Trois propriétés valent la peine d'être verrouillées :
 *  - la source rédigée (NOUVEAUTES.md) reste lisible par un utilisateur :
 *    aucune entrée invalide, aucun mot qui ne parle qu'aux développeurs ;
 *  - une entrée est datée par le commit qui l'a fait NAÎTRE, et ni une
 *    retouche ultérieure ni l'amende du hook (qui change le SHA) ne la
 *    re-datent — sans quoi le hook réécrirait la liste à chaque commit ;
 *  - le fichier publié garde la forme que lit WhatsNewBadge.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  SOURCE_PATH,
  MAX_PUBLISHED,
  BIRTH_LOG_ARGS,
  parseSource,
  validateEntries,
  birthsFromLog,
  buildPublished,
  sameEntries,
} from './whats-new-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function entry({ title = 'Un titre', id = 'un-id', meta = '', body = 'Une phrase.' } = {}) {
  return `## ${title}\n<!-- id: ${id}${meta} -->\n\n${body}\n`;
}

describe('parseSource', () => {
  it('lit titre, métadonnées et texte, dans l’ordre du fichier', () => {
    const entries = parseSource(
      '# Nouveautés\n\nMode d’emploi.\n\n' +
        entry({
          title: 'Récent',
          id: 'recent',
          meta: ' | genre: correctif | pour: administrateurs',
        }) +
        '\n' +
        entry({ title: 'Ancien', id: 'ancien', meta: ' | date: 2026-08-02 | version: 1.2.0.35' }),
    );
    expect(entries.map((e) => e.id)).toEqual(['recent', 'ancien']);
    expect(entries[0]).toMatchObject({
      title: 'Récent',
      genre: 'correctif',
      pour: 'administrateurs',
      body: 'Une phrase.',
    });
    expect(entries[1]).toMatchObject({ genre: 'nouveaute', pour: 'tous', date: '2026-08-02' });
    expect(entries[1].version).toBe('1.2.0.35');
  });

  it('ignore le mode d’emploi, y compris l’exemple dans un bloc de code', () => {
    const entries = parseSource(
      '# Nouveautés\n\n```markdown\n## Titre d’exemple\n<!-- id: exemple -->\n```\n\n' + entry(),
    );
    expect(entries.map((e) => e.id)).toEqual(['un-id']);
  });

  it('recolle les lignes d’un paragraphe et garde les paragraphes séparés', () => {
    const [parsed] = parseSource(
      entry({ body: 'Une phrase\ncoupée en deux.\n\nUn second paragraphe.' }),
    );
    expect(parsed.body).toBe('Une phrase coupée en deux.\n\nUn second paragraphe.');
  });

  it('retire les commentaires laissés au rédacteur', () => {
    const [parsed] = parseSource(entry({ body: 'Visible.\n<!-- note interne -->' }));
    expect(parsed.body).toBe('Visible.');
  });

  it('lit la traduction anglaise facultative', () => {
    const [parsed] = parseSource(
      entry({ body: 'Texte français.\n\n### en: English title\n\nEnglish text.' }),
    );
    expect(parsed.body).toBe('Texte français.');
    expect(parsed.en).toEqual({ title: 'English title', body: 'English text.' });
  });
});

describe('validateEntries', () => {
  const errorsOf = (markdown) => validateEntries(parseSource(markdown));

  it('ne dit rien d’une entrée bien formée', () => {
    expect(errorsOf(entry())).toEqual([]);
  });

  it('bloque une entrée sans identifiant unique et valide', () => {
    const missing = errorsOf('## Sans id\n\nTexte.\n');
    const invalid = errorsOf(entry({ id: 'Majuscules_Et_Espaces' }));
    const duplicate = errorsOf(entry() + entry({ title: 'Autre' }));
    for (const errors of [missing, invalid, duplicate]) {
      expect(errors).toHaveLength(1);
      expect(errors[0].blocking).toBe(true);
    }
  });

  it('bloque un genre ou un public inconnu, et une entrée sans texte', () => {
    expect(errorsOf(entry({ meta: ' | genre: refactor' }))[0].blocking).toBe(true);
    expect(errorsOf(entry({ meta: ' | pour: developpeurs' }))[0].blocking).toBe(true);
    expect(errorsOf(entry({ body: '' }))[0].blocking).toBe(true);
  });

  it('signale sans bloquer un texte trop long ou une traduction incomplète', () => {
    const long = errorsOf(entry({ body: 'mot '.repeat(150) }));
    const halfEnglish = errorsOf(entry({ body: 'Texte.\n\n### en: Title only' }));
    expect(long).toHaveLength(1);
    expect(long[0].blocking).toBe(false);
    expect(halfEnglish).toHaveLength(1);
    expect(halfEnglish[0].blocking).toBe(false);
  });
});

describe('birthsFromLog', () => {
  const log = (sha, date, lines) =>
    `\x1e${sha}\x1f${date}\n\ndiff --git a/${SOURCE_PATH} b/${SOURCE_PATH}\n` +
    `--- a/${SOURCE_PATH}\n+++ b/${SOURCE_PATH}\n@@ -1,0 +1,2 @@\n${lines.join('\n')}\n`;

  it('date un identifiant par le premier commit qui AJOUTE sa ligne', () => {
    const births = birthsFromLog(
      log('aaa', '2026-09-01', ['+## Premier', '+<!-- id: premier | genre: nouveaute -->']) +
        log('bbb', '2026-09-03', [
          '+<!-- id: second -->',
          '-<!-- id: premier | genre: nouveaute -->',
          '+<!-- id: premier | genre: amelioration -->',
        ]),
    );
    expect(births.get('premier')).toEqual({ sha: 'aaa', date: '2026-09-01' });
    expect(births.get('second')).toEqual({ sha: 'bbb', date: '2026-09-03' });
  });

  it('ignore les lignes retirées', () => {
    const births = birthsFromLog(log('aaa', '2026-09-01', ['-<!-- id: disparu -->']));
    expect(births.has('disparu')).toBe(false);
  });
});

describe('buildPublished', () => {
  const source = parseSource(
    entry({ title: 'Neuve', id: 'neuve', meta: ' | pour: administrateurs' }) +
      entry({ title: 'Brouillon', id: 'brouillon' }) +
      entry({ title: 'Cassée', id: 'cassee', meta: ' | genre: refactor' }) +
      entry({
        title: 'Historique',
        id: 'historique',
        meta: ' | genre: correctif | date: 2026-08-02 | version: 1.2.0.35',
      }),
  );
  const births = new Map([
    ['neuve', { sha: 'sha-neuve', date: '2026-09-10' }],
    ['historique', { sha: 'sha-autre', date: '2026-09-10' }],
  ]);
  const versionAt = (sha) => ({ 'sha-neuve': '1.3.0.9', 'sha-autre': '9.9.9.9' })[sha] || null;

  it('date par le commit de naissance, sauf date et version écrites à la main', () => {
    const published = buildPublished(source, births, versionAt);
    expect(published.map((e) => [e.id, e.date, e.version])).toEqual([
      ['neuve', '2026-09-10', '1.3.0.9'],
      ['brouillon', '', ''],
      ['historique', '2026-08-02', '1.2.0.35'],
    ]);
  });

  it('écarte l’entrée inutilisable et traduit genre et public pour la popup', () => {
    const published = buildPublished(source, births, versionAt);
    expect(published.find((e) => e.id === 'cassee')).toBeUndefined();
    expect(published[0]).toMatchObject({ kind: 'new', audience: 'admins' });
    expect(published[2]).toMatchObject({ kind: 'fix', audience: 'all' });
  });

  it('ne publie la traduction anglaise que complète', () => {
    const [full, half] = buildPublished(
      parseSource(
        entry({ id: 'complete', body: 'Texte.\n\n### en: Title\n\nText.' }) +
          entry({ id: 'partielle', body: 'Texte.\n\n### en: Title only' }),
      ),
    );
    expect(full.en).toEqual({ title: 'Title', body: 'Text.' });
    expect(half.en).toBeUndefined();
  });

  it(`borne la liste à ${MAX_PUBLISHED} entrées, dans l’ordre du fichier`, () => {
    const many = Array.from({ length: MAX_PUBLISHED + 3 }, (_, i) => entry({ id: `e-${i}` }));
    const published = buildPublished(parseSource(many.join('\n')));
    expect(published).toHaveLength(MAX_PUBLISHED);
    expect(published[0].id).toBe('e-0');
  });

  it('ne dépend pas du SHA — l’amende du hook ne change rien', () => {
    const amended = new Map([...births].map(([id, b]) => [id, { ...b, sha: `${b.sha}-amende` }]));
    const sameVersion = (sha) => versionAt(sha.replace(/-amende$/, ''));
    expect(
      sameEntries(
        buildPublished(source, births, versionAt),
        buildPublished(source, amended, sameVersion),
      ),
    ).toBe(true);
  });
});

describe('datation par un vrai dépôt git', () => {
  let dir;
  const run = (args, date = '2026-09-01T10:00:00') =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_AUTHOR_DATE: `${date} +0200`,
        GIT_COMMITTER_DATE: `${date} +0200`,
      },
    });
  const commit = (content, date) => {
    writeFileSync(join(dir, SOURCE_PATH), content);
    run(['add', SOURCE_PATH], date);
    run(['commit', '-q', '-m', 'docs: nouveautés'], date);
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'whats-new-'));
    run(['init', '-q']);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('lit la naissance de chaque entrée dans la sortie réelle de git', () => {
    commit(entry({ id: 'premiere' }), '2026-09-01T10:00:00');
    commit(
      entry({ id: 'seconde', title: 'Seconde' }) + entry({ id: 'premiere', body: 'Enrichie.' }),
      '2026-09-03T10:00:00',
    );
    const births = birthsFromLog(run(BIRTH_LOG_ARGS));
    expect(births.get('premiere').date).toBe('2026-09-01');
    expect(births.get('seconde').date).toBe('2026-09-03');

    // L'amende du hook garde la date d'auteur : la naissance ne bouge pas.
    run(['commit', '--amend', '-q', '--no-edit'], '2026-09-04T10:00:00');
    const afterAmend = birthsFromLog(run(BIRTH_LOG_ARGS));
    expect(afterAmend.get('seconde').date).toBe('2026-09-03');
    expect(afterAmend.get('seconde').sha).not.toBe(births.get('seconde').sha);
  }, 30_000);
});

describe('la source du dépôt (NOUVEAUTES.md)', () => {
  const entries = parseSource(readFileSync(resolve(here, '..', SOURCE_PATH), 'utf8'));

  it('ne contient aucune entrée invalide, trop longue ou mal traduite', () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(validateEntries(entries).map((e) => e.message)).toEqual([]);
  });

  it('parle à des utilisateurs, pas à des développeurs', () => {
    // Chaque motif a déjà fui dans la popup, ou y fuirait au premier relâchement.
    const jargon =
      /`|\*\*|\.(js|mjs|svelte|json|css|sh|ya?ml)\b|\/api\b|=>|\w\(\)|\b\d+\s?px\b|\b(commit|backend|frontend|endpoint|refactor|traefik|docker|mongo|oidc|oauth|scaffold|websocket|localstorage|payload|overflow|gpt-[\w.]+)\b/i;
    for (const e of entries) {
      for (const text of [e.title, e.body, e.en?.title || '', e.en?.body || '']) {
        expect(text, `« ${e.title} »`).not.toMatch(jargon);
      }
    }
  });

  it('range les entrées datées à la main de la plus récente à la plus ancienne', () => {
    const dates = entries.map((e) => e.date).filter(Boolean);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe('le fichier publié (src/whats-new.json)', () => {
  const published = JSON.parse(readFileSync(resolve(here, '../src/whats-new.json'), 'utf8'));

  it(`porte au plus ${MAX_PUBLISHED} nouveautés, de la plus récente à la plus ancienne`, () => {
    expect(published.entries.length).toBeGreaterThan(0);
    expect(published.entries.length).toBeLessThanOrEqual(MAX_PUBLISHED);
    const dates = published.entries.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('donne à chaque entrée un identifiant unique, un texte, un genre et un public connus', () => {
    const ids = new Set();
    for (const e of published.entries) {
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.body.length).toBeGreaterThan(3);
      expect(['new', 'improvement', 'fix']).toContain(e.kind);
      expect(['all', 'admins']).toContain(e.audience);
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
    }
  });
});
