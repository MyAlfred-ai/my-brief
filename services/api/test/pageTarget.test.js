/**
 * Pagimètre côté serveur : mesurer le résumé rendu et, hors tolérance, le faire
 * reprendre UNE fois — sans jamais toucher au reste du compte rendu, ni échouer
 * pour une reprise ratée.
 */
import { describe, it, expect, vi } from 'vitest';
import { parsePagePlan, mainVerbosity, enforcePageTarget } from '../lib/pageTarget.js';
import { estimatePages } from '../lib/pageMeter.js';

const SENTENCE =
  "L'équipe a passé en revue l'avancement du projet de refonte du portail client, lancé en juin.";
/** n paragraphes de quatre phrases : ~0,12 page chacun dans le PDF. */
const body = (n) =>
  Array.from(
    { length: n },
    (_, i) => `<p>${i} ${SENTENCE} ${SENTENCE} ${SENTENCE} ${SENTENCE}</p>`,
  ).join('\n');
const HEAD = '<h1>Compte rendu — 30-09-2026</h1>\n<p><em>Auteur : Alex</em></p>\n<h2>Synthèse</h2>';
const TAIL =
  '<h2>Actions à mener</h2>\n<ul>\n<li><strong>Relancer le client</strong> — Marie</li>\n</ul>';
const doc = (n) => `${HEAD}\n${body(n)}\n${TAIL}`;
const ANCHORS = { before: '<h2>Synthèse</h2>', beforeCount: 1, after: '<h2>Actions à mener</h2>' };
const FIX = {
  expand: 'DÉVELOPPE : {{mots_actuels}} → {{mots_cibles}} ({{mots_min}}-{{mots_max}})',
  condense: 'CONDENSE : {{mots_actuels}} → {{mots_cibles}} ({{mots_min}}-{{mots_max}})',
};
/** Transcription assez longue pour ne rien plafonner. */
const LONG_TRANSCRIPT = 'mot '.repeat(40000);

const plan = (pages, overrides = {}) =>
  parsePagePlan({ pages, anchors: ANCHORS, fix: FIX, ...overrides }, LONG_TRANSCRIPT);

describe('parsePagePlan', () => {
  it('sans Pagimètre, ou longueur invalide : null — le compte rendu part comme avant', () => {
    expect(parsePagePlan(undefined, '')).toBeNull();
    expect(parsePagePlan(null, '')).toBeNull();
    expect(parsePagePlan({ pages: 42 }, '')).toBeNull();
    expect(parsePagePlan({ pages: 'x' }, '')).toBeNull();
  });

  it('longueur ramenée au pas, cible recalculée depuis la transcription reçue', () => {
    expect(plan(1.3).pages).toBe(1.5);
    expect(plan(3).target).toBe(3);
    // 1 500 mots dits : la matière plafonne vers 1,5 page, quoi qu'on demande.
    const short = parsePagePlan({ pages: 10, anchors: ANCHORS, fix: FIX }, 'mot '.repeat(1500));
    expect(short.pages).toBe(10);
    expect(short.target).toBeCloseTo(1.5, 1);
  });

  it('bornes des chaînes reçues : ancre trop longue ignorée, consigne géante ignorée', () => {
    const p = plan(1, {
      anchors: { before: 'x'.repeat(501), beforeCount: 'deux', after: '<h2>A</h2>' },
      fix: { expand: 'y'.repeat(60_001), condense: 'ok' },
    });
    expect(p.anchors).toEqual({ before: null, beforeCount: 1, after: '<h2>A</h2>' });
    expect(p.fix).toEqual({ expand: null, condense: 'ok' });
    expect(plan(1, { anchors: 'pas un objet' }).anchors).toBeNull();
  });
});

describe('mainVerbosity', () => {
  it('bref pour un quart de page, développé au-delà de deux pages', () => {
    expect(mainVerbosity(0.25)).toBe('low');
    expect(mainVerbosity(0.5)).toBe('low');
    expect(mainVerbosity(1)).toBe('medium');
    expect(mainVerbosity(2)).toBe('medium');
    expect(mainVerbosity(2.5)).toBe('high');
  });
});

describe('enforcePageTarget', () => {
  const log = { info: vi.fn(), warn: vi.fn() };

  it('à la bonne longueur : aucune reprise, document intact', async () => {
    const pages = estimatePages(body(8));
    const chat = vi.fn();
    const html = doc(8);
    const out = await enforcePageTarget({ html, plan: plan(pages), transcription: '', chat, log });
    expect(chat).not.toHaveBeenCalled();
    expect(out.html).toBe(html);
    expect(out.report).toMatchObject({ verdict: 'ok', corrected: false });
  });

  it('trop court : développé en puisant dans la transcription, recollé entre les ancres', async () => {
    const chat = vi.fn(async () => body(9));
    const out = await enforcePageTarget({
      html: doc(1),
      plan: plan(1),
      transcription: 'La transcription.',
      chat,
      log,
    });
    expect(chat).toHaveBeenCalledTimes(1);
    const { system, user, verbosity } = chat.mock.calls[0][0];
    // Consigne de développement, nombres reportés ; mots visés à la densité mesurée.
    expect(system).toMatch(/^DÉVELOPPE : \d+ → \d+ \(\d+-\d+\)$/);
    const [, current, target] = system.match(/(\d+) → (\d+)/).map(Number);
    expect(target).toBeGreaterThan(current * 5);
    expect(user).toContain('#TRANSCRIPTION DE LA RÉUNION');
    expect(user).toContain('La transcription.');
    expect(user).toContain('#RÉSUMÉ_À_REPRENDRE');
    expect(verbosity).toBe('medium');
    // Titre, auteur et actions : jamais passés par la reprise.
    expect(out.html.startsWith(`${HEAD}\n`)).toBe(true);
    expect(out.html.endsWith(TAIL)).toBe(true);
    expect(out.html).toContain(body(9));
    expect(out.report).toMatchObject({ verdict: 'short', corrected: true });
    expect(out.report.final).toBeCloseTo(estimatePages(body(9)), 2);
  });

  it('trop long : condensé', async () => {
    const chat = vi.fn(async () => body(8));
    const out = await enforcePageTarget({
      html: doc(30),
      plan: plan(1),
      transcription: '',
      chat,
      log,
    });
    expect(chat.mock.calls[0][0].system).toMatch(/^CONDENSE/);
    expect(chat.mock.calls[0][0].verbosity).toBe('low');
    expect(out.html).toBe(`${HEAD}\n${body(8)}\n${TAIL}`);
    expect(out.report).toMatchObject({ verdict: 'long', corrected: true });
  });

  it('reprise qui ne rapproche pas de la cible : le premier jet reste', async () => {
    const html = doc(30);
    // « condensé »… mais plus long encore
    const out = await enforcePageTarget({
      html,
      plan: plan(1),
      transcription: '',
      chat: async () => body(40),
      log,
    });
    expect(out.html).toBe(html);
    expect(out.report).toMatchObject({ corrected: false, skipped: 'not_better' });
  });

  it('reprise qui déborde sur la mise en forme (titre des actions recopié) : refusée', async () => {
    const html = doc(1);
    const out = await enforcePageTarget({
      html,
      plan: plan(1),
      transcription: '',
      chat: async () => `${body(9)}\n<h2>Actions à mener</h2>\n<ul><li>Inventée</li></ul>`,
      log,
    });
    expect(out.html).toBe(html);
    expect(out.report.skipped).toBe('leak');
  });

  it('clôtures de code et enveloppe de document retirées de la reprise', async () => {
    const out = await enforcePageTarget({
      html: doc(1),
      plan: plan(1),
      transcription: '',
      chat: async () => '```html\n<body>' + body(9) + '</body>\n```',
      log,
    });
    expect(out.report.corrected).toBe(true);
    expect(out.html).not.toContain('```');
    expect(out.html).not.toContain('<body>');
  });

  it('reprise en échec (panne, délai) : premier jet gardé, jamais d’erreur', async () => {
    const html = doc(1);
    const warn = vi.fn();
    const out = await enforcePageTarget({
      html,
      plan: plan(1),
      transcription: '',
      chat: async () => {
        throw new Error('timeout');
      },
      log: { info: vi.fn(), warn },
    });
    expect(out.html).toBe(html);
    expect(out.report.skipped).toBe('fix_failed');
    expect(warn).toHaveBeenCalled();
  });

  it('mise en forme retouchée par le modèle (ancre introuvable) : ni mesure ni reprise', async () => {
    const chat = vi.fn();
    const html = doc(1).replace('<h2>Synthèse</h2>', '<h2>Résumé</h2>');
    const out = await enforcePageTarget({ html, plan: plan(1), transcription: '', chat, log });
    expect(chat).not.toHaveBeenCalled();
    expect(out.html).toBe(html);
    expect(out.report).toMatchObject({ skipped: 'anchors', measured: null });
  });

  it('consigne de la bonne direction absente : pas de reprise', async () => {
    const chat = vi.fn();
    const out = await enforcePageTarget({
      html: doc(1),
      plan: plan(1, { fix: { expand: null, condense: 'x' } }),
      transcription: '',
      chat,
      log,
    });
    expect(chat).not.toHaveBeenCalled();
    expect(out.report.skipped).toBe('no_prompt');
  });

  it('seconde passe, mesurée sur la première, quand celle-ci n’a pas suffi', async () => {
    // 1re reprise : mieux, mais encore court (le résumé a changé de forme) ; 2e : au but.
    const chat = vi.fn().mockResolvedValueOnce(body(5)).mockResolvedValueOnce(body(11));
    const out = await enforcePageTarget({
      html: doc(1),
      plan: plan(1),
      transcription: '',
      chat,
      log,
      maxPasses: 2,
    });
    expect(chat).toHaveBeenCalledTimes(2);
    // La seconde consigne part du résumé de la première reprise, pas du premier jet.
    expect(chat.mock.calls[1][0].user).toContain(body(5));
    expect(out.html).toBe(`${HEAD}\n${body(11)}\n${TAIL}`);
    expect(out.report).toMatchObject({ passes: 2, corrected: true });
    expect(out.report.final).toBeCloseTo(estimatePages(body(11)), 2);
  });

  it('une reprise qui dépasse la cible est reprise dans l’autre sens', async () => {
    const chat = vi.fn().mockResolvedValueOnce(body(20)).mockResolvedValueOnce(body(11));
    const out = await enforcePageTarget({
      html: doc(1),
      plan: plan(1),
      transcription: '',
      chat,
      log,
      maxPasses: 2,
    });
    expect(chat.mock.calls[0][0].system).toMatch(/^DÉVELOPPE/);
    expect(chat.mock.calls[1][0].system).toMatch(/^CONDENSE/);
    expect(out.report).toMatchObject({ passes: 2, corrected: true, verdict: 'short' });
  });

  it('délai dépassé : pas de seconde passe, le meilleur jet obtenu part', async () => {
    const chat = vi.fn().mockResolvedValueOnce(body(5)).mockResolvedValueOnce(body(11));
    const out = await enforcePageTarget({
      html: doc(1),
      plan: plan(1),
      transcription: '',
      chat,
      log,
      maxPasses: 2,
      canRetry: () => false,
    });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(out.html).toBe(`${HEAD}\n${body(5)}\n${TAIL}`);
    expect(out.report).toMatchObject({ passes: 1, corrected: true, skipped: 'budget' });
  });

  it('au but dès la première reprise : aucune seconde passe', async () => {
    const chat = vi.fn(async () => body(11));
    const out = await enforcePageTarget({
      html: doc(1),
      plan: plan(1),
      transcription: '',
      chat,
      log,
      maxPasses: 2,
    });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(out.report).toMatchObject({ passes: 1, corrected: true });
    expect(out.report).not.toHaveProperty('skipped');
  });

  it('chaque passage laisse une trace : demandé, visé, mesuré, repris ou non', async () => {
    const info = vi.fn();
    await enforcePageTarget({
      html: doc(1),
      plan: plan(1),
      transcription: '',
      chat: async () => body(9),
      log: { info, warn: vi.fn() },
    });
    const [payload, message] = info.mock.calls[0];
    expect(message).toBe('/resume : Pagimètre');
    expect(payload.pageMeter).toMatchObject({ requested: 1, target: 1, corrected: true });
    expect(payload.pageMeter.measured).toBeLessThan(0.3);
  });
});
