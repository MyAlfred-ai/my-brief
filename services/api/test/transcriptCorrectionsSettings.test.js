/**
 * Corrections automatiques de la transcription — réglées dans l'onglet
 * Configuration de l'administration, appliquées par le navigateur aux
 * réunions de tous les comptes.
 *
 * Quatre garanties : écriture réservée aux administrateurs ; la liste servie
 * est propre et bornée (ce que l'écran montre est ce qui s'applique) ; elle
 * descend AVEC les templates à tout compte authentifié ; elle ne passe JAMAIS
 * par la sonde publique /api/auth/config.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import {
  sanitizeTranscriptCorrections,
  CORRECTIONS_MAX,
  VARIANTS_MAX,
} from '../lib/transcriptCorrections.js';
import { toPublicTranscriptCorrections } from '../lib/repositories/settings.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const URL = '/api/admin/settings/transcript-corrections';
const RULES = [
  { from: ['Klobex', 'Clobex'], to: 'Globex' },
  { from: ['la dévé'], to: "l'ADV" },
];

const seed = () => ({ user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)] });

const get = (app, url, email = ADMIN) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

const post = (app, url, body, email = ADMIN) =>
  app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('sanitizeTranscriptCorrections', () => {
  it('nettoie, dédoublonne casse et accents confondus, écarte ce qui ne corrige rien', () => {
    expect(
      sanitizeTranscriptCorrections([
        { from: ['  Klobex  ', 'KLOBÈX', 'x', ''], to: ' Globex ' },
        { from: ['klobex'], to: 'Autre' },
        { from: ['Globex'], to: 'Globex' },
        { from: ['orphelin'], to: '   ' },
        'pas un objet',
      ]),
    ).toEqual([{ from: ['Klobex'], to: 'Globex' }]);
  });

  it('borne la liste et les variantes, même hors de la route', () => {
    const many = Array.from({ length: CORRECTIONS_MAX + 3 }, (_, i) => ({
      from: Array.from({ length: VARIANTS_MAX + 2 }, (_, j) => `terme${i}x${j}`),
      to: `Juste${i}`,
    }));
    const out = sanitizeTranscriptCorrections(many);
    expect(out).toHaveLength(CORRECTIONS_MAX);
    expect(out.every((r) => r.from.length === VARIANTS_MAX)).toBe(true);
    expect(sanitizeTranscriptCorrections({ from: ['a'] })).toEqual([]);
  });

  it("la projection ne divulgue pas l'administrateur sans withMeta", () => {
    const doc = { rules: RULES, updatedBy: ADMIN };
    expect(JSON.stringify(toPublicTranscriptCorrections(doc))).not.toContain(ADMIN);
    expect(toPublicTranscriptCorrections(doc, { withMeta: true }).updatedBy).toBe(ADMIN);
    expect(toPublicTranscriptCorrections(null)).toEqual({ rules: [] });
  });
});

describe(URL, () => {
  it("refuse la lecture et l'écriture à un compte non administrateur", async () => {
    const { app } = buildTestApp({ seed: seed() });
    expect((await post(app, URL, { rules: RULES }, USER)).statusCode).toBe(403);
    expect((await get(app, URL, USER)).statusCode).toBe(403);
  });

  it('enregistre la liste, la relit nettoyée, avec son auteur', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, URL, {
      rules: [...RULES, { from: [' KLOBEX '], to: 'Doublon' }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({ rules: RULES, updatedBy: ADMIN });
    expect((await get(app, URL)).json().settings.rules).toEqual(RULES);
  });

  it('une liste vide retire toutes les corrections', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, URL, { rules: RULES });
    await post(app, URL, { rules: [] });
    expect((await get(app, URL)).json().settings.rules).toEqual([]);
  });

  it('un corps sans `rules` ne touche pas à la liste', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, URL, { rules: RULES });
    await post(app, URL, {});
    expect((await get(app, URL)).json().settings.rules).toEqual(RULES);
  });

  it('refuse (400) une liste au-delà des plafonds, sans rien écrire', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const tooMany = Array.from({ length: CORRECTIONS_MAX + 1 }, (_, i) => ({
      from: [`terme${i}`],
      to: `Juste${i}`,
    }));
    expect((await post(app, URL, { rules: tooMany })).statusCode).toBe(400);
    expect(
      (await post(app, URL, { rules: [{ from: ['x'.repeat(61)], to: 'Y' }] })).statusCode,
    ).toBe(400);
    expect((await post(app, URL, { rules: [{ from: ['ok'] }] })).statusCode).toBe(400);
    expect((await get(app, URL)).json().settings.rules).toEqual([]);
  });

  it('relit nettoyé un document écrit hors de la route', async () => {
    const { app } = buildTestApp({
      seed: {
        ...seed(),
        appSettings: [
          { key: 'transcriptCorrections', rules: [{ from: ['Klobex', 'klobex'], to: 'Globex' }] },
        ],
      },
    });
    expect((await get(app, URL)).json().settings.rules).toEqual([
      { from: ['Klobex'], to: 'Globex' },
    ]);
  });
});

describe('GET /api/templates', () => {
  it('sert la liste à tout compte authentifié, sans son auteur', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, URL, { rules: RULES });
    const res = await get(app, '/api/templates', USER);
    expect(res.statusCode).toBe(200);
    expect(res.json().transcriptCorrections).toEqual(RULES);
    expect(res.payload).not.toContain(ADMIN);
  });
});

describe('sonde publique /api/auth/config', () => {
  it('ne transporte JAMAIS les corrections : ce sont des noms de clients', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, URL, { rules: RULES });
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain('Globex');
    expect(res.json().transcriptCorrections).toBeUndefined();
  });
});
