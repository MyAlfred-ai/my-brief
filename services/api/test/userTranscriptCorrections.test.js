/**
 * « Mots remplacés » d'un compte — sa liste de corrections de la transcription,
 * et son remplissage par les remplacements écrits dans les notes.
 *
 * Ce que ces tests protègent : la liste est PAR COMPTE (prendre des notes ne
 * réécrit jamais la transcription d'un autre) ; un remplacement déjà présent
 * n'est pas recopié ; au plafond rien n'est évincé en silence ; et le choix de
 * ne rien apprendre est tenu par le serveur, pas par l'écran.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import {
  learnCorrections,
  readUserCorrections,
  USER_CORRECTIONS_MAX,
  VARIANTS_MAX,
} from '../lib/transcriptCorrections.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const OTHER = 'autre@client.fr';
const URL = '/api/transcript-corrections';

const seed = () => ({
  user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER), userDoc(OTHER)],
});

const get = (app, url, email = USER) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

const post = (app, url, body, email = USER) =>
  app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const learn = (app, replacements, email = USER) =>
  post(app, `${URL}/learn`, { replacements }, email);

describe('learnCorrections', () => {
  it('ajoute une ligne, puis range une autre écriture du même mot en variante', () => {
    const first = learnCorrections([], [{ from: ' Durend ', to: 'Durand' }]);
    expect(first).toEqual({
      rules: [{ from: ['Durend'], to: 'Durand' }],
      added: [{ from: 'Durend', to: 'Durand' }],
      full: false,
    });
    const second = learnCorrections(first.rules, [{ from: 'Durant', to: 'Durand' }]);
    expect(second.rules).toEqual([{ from: ['Durend', 'Durant'], to: 'Durand' }]);
  });

  it('déjà présent — casse et accents confondus — : rien ne bouge', () => {
    const rules = [{ from: ['Klobex'], to: 'Globex' }];
    const out = learnCorrections(rules, [
      { from: 'klobèx', to: 'Globex' },
      { from: 'Klobex', to: 'Globex' },
    ]);
    expect(out).toEqual({ rules, added: [], full: false });
  });

  it('déjà corrigé de la même façon pour toute l’organisation : pas recopié', () => {
    const shared = [{ from: ['Klobex'], to: 'Globex' }];
    expect(learnCorrections([], [{ from: 'Klobex', to: 'Globex' }], { shared }).added).toEqual([]);
    // Une AUTRE graphie que celle de l'organisation : c'est le choix du compte.
    expect(learnCorrections([], [{ from: 'Klobex', to: 'GLOBEX' }], { shared }).rules).toEqual([
      { from: ['Klobex'], to: 'GLOBEX' },
    ]);
  });

  it('la même écriture vers un autre mot : la consigne la plus récente l’emporte', () => {
    const out = learnCorrections(
      [{ from: ['Alexe', 'Alexx'], to: 'Alex' }],
      [{ from: 'Alexe', to: 'Alexis' }],
    );
    expect(out.rules).toEqual([
      { from: ['Alexx'], to: 'Alex' },
      { from: ['Alexe'], to: 'Alexis' },
    ]);
    expect(out.added).toEqual([{ from: 'Alexe', to: 'Alexis' }]);
  });

  it('la correction exactement inverse fait tomber l’ancienne', () => {
    const out = learnCorrections(
      [{ from: ['Alexe'], to: 'Alex' }],
      [{ from: 'Alex', to: 'Alexe' }],
    );
    expect(out.rules).toEqual([{ from: ['Alex'], to: 'Alexe' }]);
  });

  it('au plafond : pas retenu, rien d’évincé, et c’est dit', () => {
    const fullList = Array.from({ length: 3 }, (_, i) => ({
      from: [`faute${i}`],
      to: `Juste${i}`,
    }));
    const out = learnCorrections(
      fullList,
      [
        { from: 'Durend', to: 'Durand' },
        // Une variante d'une ligne existante tient encore : la liste ne s'allonge pas.
        { from: 'fote0', to: 'Juste0' },
      ],
      { max: 3 },
    );
    expect(out.full).toBe(true);
    expect(out.added).toEqual([{ from: 'fote0', to: 'Juste0' }]);
    expect(out.rules).toHaveLength(3);
    expect(out.rules[0].from).toEqual(['faute0', 'fote0']);
  });

  it('une ligne pleine de variantes n’en prend pas une de plus : nouvelle ligne', () => {
    const crowded = [
      { from: Array.from({ length: VARIANTS_MAX }, (_, i) => `ecriture${i}`), to: 'Durand' },
    ];
    const out = learnCorrections(crowded, [{ from: 'Durend', to: 'Durand' }]);
    expect(out.rules).toHaveLength(2);
    expect(out.rules[1]).toEqual({ from: ['Durend'], to: 'Durand' });
  });

  it('écarte ce qui ne corrige rien', () => {
    const out = learnCorrections(
      [],
      [
        { from: 'x', to: 'Y' },
        { from: 'Durand', to: 'Durand' },
        { from: 'Durend', to: '  ' },
        null,
      ],
    );
    expect(out).toEqual({ rules: [], added: [], full: false });
  });

  it('un compte sans document : liste vide, apprentissage allumé', () => {
    expect(readUserCorrections(undefined)).toEqual({ rules: [], learn: true });
    expect(readUserCorrections({ learn: false }).learn).toBe(false);
  });
});

describe(URL, () => {
  it('exige une identité', async () => {
    const { app } = buildTestApp({ seed: seed() });
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: `${URL}/learn`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replacements: [{ from: 'Durend', to: 'Durand' }] }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rend une liste vide et l’apprentissage allumé à qui n’a rien réglé', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app, URL);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      settings: { rules: [], learn: true },
      max: USER_CORRECTIONS_MAX,
    });
  });

  it('enregistre la liste du compte — et de lui seul', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const saved = await post(app, URL, {
      rules: [{ from: ['  Durend ', 'DUREND', 'Durant'], to: 'Durand' }],
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().settings).toEqual({
      rules: [{ from: ['Durend', 'Durant'], to: 'Durand' }],
      learn: true,
    });
    expect((await get(app, URL)).json().settings.rules).toHaveLength(1);
    expect((await get(app, URL, OTHER)).json().settings.rules).toEqual([]);
  });

  it('un champ absent reste inchangé', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, URL, { rules: [{ from: ['Durend'], to: 'Durand' }] });
    const res = await post(app, URL, { learn: false });
    expect(res.json().settings).toEqual({
      rules: [{ from: ['Durend'], to: 'Durand' }],
      learn: false,
    });
  });

  it('refuse une liste au-delà du plafond, sans la tronquer', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const rules = Array.from({ length: USER_CORRECTIONS_MAX + 1 }, (_, i) => ({
      from: [`faute${i}`],
      to: `Juste${i}`,
    }));
    expect((await post(app, URL, { rules })).statusCode).toBe(400);
    expect((await get(app, URL)).json().settings.rules).toEqual([]);
  });

  it('refuse un objet là où une chaîne est attendue', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await learn(app, [{ from: { $ne: '' }, to: 'Durand' }]);
    expect(res.statusCode).toBe(400);
  });
});

describe(`${URL}/learn`, () => {
  it('verse les remplacements des notes dans la liste du compte, une seule fois', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const first = await learn(app, [
      { from: 'Durend', to: 'Durand' },
      { from: 'Market', to: 'Marquet' },
    ]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      settings: {
        rules: [
          { from: ['Durend'], to: 'Durand' },
          { from: ['Market'], to: 'Marquet' },
        ],
        learn: true,
      },
      added: [
        { from: 'Durend', to: 'Durand' },
        { from: 'Market', to: 'Marquet' },
      ],
      full: false,
      max: USER_CORRECTIONS_MAX,
    });

    const again = await learn(app, [{ from: 'durend', to: 'Durand' }]);
    expect(again.json().added).toEqual([]);
    expect(again.json().settings.rules).toHaveLength(2);
    // La liste d'un autre compte n'a pas bougé.
    expect((await get(app, URL, OTHER)).json().settings.rules).toEqual([]);
  });

  it('ne recopie pas ce que l’organisation corrige déjà de la même façon', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(
      app,
      '/api/admin/settings/transcript-corrections',
      { rules: [{ from: ['Klobex'], to: 'Globex' }] },
      ADMIN,
    );
    const res = await learn(app, [
      { from: 'Klobex', to: 'Globex' },
      { from: 'Durend', to: 'Durand' },
    ]);
    expect(res.json().added).toEqual([{ from: 'Durend', to: 'Durand' }]);
  });

  it('n’apprend rien quand le compte a coupé l’apprentissage', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, URL, { learn: false });
    const res = await learn(app, [{ from: 'Durend', to: 'Durand' }]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ settings: { rules: [], learn: false }, added: [] });
  });

  it('dit quand la liste est pleine, et ne retient pas le remplacement', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const rules = Array.from({ length: USER_CORRECTIONS_MAX }, (_, i) => ({
      from: [`faute${i}`],
      to: `Juste${i}`,
    }));
    await post(app, URL, { rules });
    const res = await learn(app, [{ from: 'Durend', to: 'Durand' }]);
    expect(res.json()).toMatchObject({ added: [], full: true });
    expect(res.json().settings.rules).toHaveLength(USER_CORRECTIONS_MAX);
  });
});

describe('GET /api/templates', () => {
  it('sert au compte SA liste, avec celle de l’organisation', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await learn(app, [{ from: 'Durend', to: 'Durand' }]);
    const mine = (await get(app, '/api/templates')).json();
    expect(mine.userTranscriptCorrections).toEqual({
      rules: [{ from: ['Durend'], to: 'Durand' }],
      learn: true,
    });
    const theirs = (await get(app, '/api/templates', OTHER)).json();
    expect(theirs.userTranscriptCorrections).toEqual({ rules: [], learn: true });
  });
});
