/**
 * Administration → MyBrain (routes/admin/myBrain.js).
 *
 * Garanties tenues ici :
 *   - la connexion est vérifiée AVANT d'être enregistrée : une clé refusée, ou
 *     sans le droit « nourrir », n'est jamais écrite ;
 *   - la clé ne sort jamais de l'API, et elle est scellée au repos quand le
 *     coffre est configuré ;
 *   - un refus de myBrain ne répond jamais 401/403 — le frontend y lirait la
 *     perte de SA session ;
 *   - changer la politique ne dépend pas de la disponibilité de myBrain.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, createFakeMyBrain } from './helpers.js';
import { MyBrainError } from '../lib/myBrain/client.js';
import {
  normalizeMyBrainUrl,
  normalizeMyBrainKey,
  myBrainKeyHint,
  MYBRAIN_SETTINGS_KEY,
} from '../lib/repositories/myBrainSettings.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const API_KEY = `mbk_AbCd${'x'.repeat(32)}wxyz`;
const KEY_HEX = 'a'.repeat(64);

const seed = () => ({ user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)] });

function post(app, url, body, email = ADMIN) {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      ...identityHeaders(email),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const get = (app, url, email = ADMIN) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

const storedDoc = (db) =>
  (db.data.get('appSettings') || []).find((doc) => doc.key === MYBRAIN_SETTINGS_KEY);

describe('normalisation de la saisie', () => {
  it("accepte l'URL de l'API telle que myBrain l'affiche, et en garde la base", () => {
    expect(normalizeMyBrainUrl(' https://cerveau.example.test/api/v1/ ')).toEqual({
      url: 'https://cerveau.example.test',
      problem: '',
    });
    expect(normalizeMyBrainUrl('http://mybrain:3000').url).toBe('http://mybrain:3000');
    expect(normalizeMyBrainUrl('https://intranet.example.test/cerveau/').url).toBe(
      'https://intranet.example.test/cerveau',
    );
  });

  it("refuse ce qui n'est pas une adresse web, et les identifiants dans l'adresse", () => {
    for (const bad of [
      'cerveau',
      'ftp://cerveau.example.test',
      'https://moi:secret@cerveau.example.test',
    ]) {
      expect(normalizeMyBrainUrl(bad).problem).toBe('mybrain_url_invalid');
    }
    expect(normalizeMyBrainUrl('')).toEqual({ url: '', problem: '' });
  });

  it("nettoie une clé collée avec l'en-tête, refuse ce qui n'en est pas une", () => {
    expect(normalizeMyBrainKey(`  Bearer ${API_KEY}\n`)).toEqual({ key: API_KEY, problem: '' });
    expect(normalizeMyBrainKey('sk-proj-une-cle-openai').problem).toBe('mybrain_key_malformed');
    expect(normalizeMyBrainKey('mbk_court').problem).toBe('mybrain_key_malformed');
  });

  it("montre l'aperçu de myBrain, pour rapprocher les deux écrans", () => {
    expect(myBrainKeyHint(API_KEY)).toBe('mbk_AbCd…wxyz');
  });
});

describe('GET /api/admin/settings/mybrain', () => {
  it('réservé aux administrateurs', async () => {
    const { app } = buildTestApp({ seed: seed() });
    expect((await get(app, '/api/admin/settings/mybrain', USER)).statusCode).toBe(403);
  });

  it('débranché par défaut : personne n’envoie rien', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app, '/api/admin/settings/mybrain');
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({
      url: '',
      hasKey: false,
      policy: 'off',
      configured: false,
      active: false,
    });
  });
});

describe('POST /api/admin/settings/mybrain', () => {
  it('vérifie la connexion, puis enregistre — la clé scellée, jamais renvoyée', async () => {
    const { app, db, myBrain } = buildTestApp({
      seed: seed(),
      config: { connections: { encryptionKey: KEY_HEX } },
    });
    const res = await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test/api/v1',
      apiKey: API_KEY,
      policy: 'optin',
    });

    expect(res.statusCode).toBe(200);
    expect(myBrain.calls).toEqual([
      { method: 'whoami', url: 'https://cerveau.example.test', apiKey: API_KEY },
    ]);
    expect(res.body).not.toContain(API_KEY);
    expect(res.json().settings).toMatchObject({
      url: 'https://cerveau.example.test',
      hasKey: true,
      keyHint: 'mbk_AbCd…wxyz',
      policy: 'optin',
      configured: true,
      active: true,
      application: 'myBrief',
      droits: ['lire', 'nourrir'],
      publicUrl: 'https://cerveau.example.test',
      updatedBy: ADMIN,
    });
    // Au repos : une enveloppe, pas la clé.
    const doc = storedDoc(db);
    expect(JSON.stringify(doc)).not.toContain(API_KEY);
    expect(doc.apiKey).toMatchObject({ v: 1 });
    expect((await app.myBrainSettings.get()).apiKey).toBe(API_KEY);
  });

  it("une clé sans le droit « nourrir » est refusée, et rien n'est écrit", async () => {
    const { app, db } = buildTestApp({
      seed: seed(),
      myBrain: createFakeMyBrain({ whoami: { application: 'myBrief', droits: ['lire'], api: '' } }),
    });
    const res = await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('mybrain_right_missing');
    expect(storedDoc(db)).toBeUndefined();
  });

  it('une clé refusée par myBrain répond 400 — jamais 401, qui déconnecterait l’administrateur', async () => {
    const { app } = buildTestApp({
      seed: seed(),
      myBrain: createFakeMyBrain({
        whoami: () => {
          throw new MyBrainError('mybrain_key_rejected', {
            status: 401,
            upstreamMessage: 'clé d’API manquante ou invalide',
          });
        },
      }),
    });
    const res = await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'mybrain_key_rejected',
      upstreamStatus: 401,
      upstreamMessage: 'clé d’API manquante ou invalide',
    });
  });

  it('une clé mal formée ou une adresse invalide sont refusées sans appel réseau', async () => {
    const { app, myBrain } = buildTestApp({ seed: seed() });
    const badKey = await post(app, '/api/admin/settings/mybrain', { apiKey: 'sk-openai' });
    expect(badKey.json().error).toBe('mybrain_key_malformed');
    const badUrl = await post(app, '/api/admin/settings/mybrain', { url: 'ftp://cerveau' });
    expect(badUrl.json().error).toBe('mybrain_url_invalid');
    expect(myBrain.calls).toHaveLength(0);
  });

  it('changer la politique ne revérifie pas la connexion', async () => {
    const { app, myBrain } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    myBrain.calls.length = 0;

    const res = await post(app, '/api/admin/settings/mybrain', { policy: 'forced' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({ policy: 'forced', active: true, hasKey: true });
    expect(myBrain.calls).toHaveLength(0);
  });

  it('retirer la clé débranche, et oublie la vérification', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
      policy: 'forced',
    });
    const res = await post(app, '/api/admin/settings/mybrain', { apiKey: '' });
    expect(res.json().settings).toMatchObject({
      hasKey: false,
      configured: false,
      active: false,
      application: '',
      policy: 'forced',
    });
  });

  it('la clé enregistrée ne part jamais vers un autre hôte : il faut la recoller', async () => {
    const { app, myBrain } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    myBrain.calls.length = 0;

    const refused = await post(app, '/api/admin/settings/mybrain', {
      url: 'https://ailleurs.example',
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toBe('mybrain_key_required');
    expect(myBrain.calls).toHaveLength(0);
    expect((await app.myBrainSettings.get()).url).toBe('https://cerveau.example.test');

    // Même hôte, autre chemin : la clé reste chez elle, la vérification passe.
    const samehost = await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test/api/v1',
    });
    expect(samehost.statusCode).toBe(200);

    // Autre hôte, clé recollée : c'est un geste délibéré.
    const moved = await post(app, '/api/admin/settings/mybrain', {
      url: 'https://ailleurs.example',
      apiKey: API_KEY,
    });
    expect(moved.statusCode).toBe(200);
    expect(myBrain.calls.at(-1)).toMatchObject({
      url: 'https://ailleurs.example',
      apiKey: API_KEY,
    });
  });

  it("l'envoi n'est jamais rétroactif : le point de départ bouge à l'activation et au changement de politique, pas à la rotation de clé", async () => {
    const { app } = buildTestApp({ seed: seed() });
    const since = async () => (await app.myBrainSettings.get()).activeSince;

    await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
      policy: 'optin',
    });
    const activated = await since();
    expect(activated).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await post(app, '/api/admin/settings/mybrain', { apiKey: `mbk_${'z'.repeat(40)}` });
    expect(await since()).toBe(activated);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await post(app, '/api/admin/settings/mybrain', { policy: 'forced' });
    expect(new Date(await since()).getTime()).toBeGreaterThan(new Date(activated).getTime());
  });

  it('refusé à un utilisateur ordinaire', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/mybrain', { policy: 'forced' }, USER);
    expect(res.statusCode).toBe(403);
  });

  it('une clé scellée qui ne s’ouvre plus (coffre changé) rend la connexion « à reconfigurer »', async () => {
    const first = buildTestApp({
      seed: seed(),
      config: { connections: { encryptionKey: KEY_HEX } },
    });
    await post(first.app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
      policy: 'forced',
    });
    const second = buildTestApp({
      seed: { user: seed().user, appSettings: first.db.data.get('appSettings') },
      config: { connections: { encryptionKey: 'b'.repeat(64) } },
    });
    const view = (await get(second.app, '/api/admin/settings/mybrain')).json().settings;
    expect(view).toMatchObject({
      hasKey: true,
      keyUnreadable: true,
      configured: false,
      active: false,
    });
  });
});

describe('POST /api/admin/settings/mybrain/test', () => {
  it('teste la connexion enregistrée, sans changer l’auteur du réglage', async () => {
    const { app, myBrain } = buildTestApp({
      seed: { ...seed(), user: [...seed().user, userDoc('autre@client.fr', { role: 'admin' })] },
    });
    await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    myBrain.calls.length = 0;

    const res = await post(app, '/api/admin/settings/mybrain/test', undefined, 'autre@client.fr');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      settings: { application: 'myBrief', updatedBy: ADMIN },
    });
    expect(myBrain.calls).toHaveLength(1);
  });

  it('sans connexion enregistrée ni saisie, le dit', async () => {
    const { app } = buildTestApp({ seed: seed() });
    for (const body of [undefined, {}, { url: 'https://cerveau.example.test' }]) {
      const res = await post(app, '/api/admin/settings/mybrain/test', body);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('mybrain_not_configured');
    }
  });

  it('teste la saisie AVANT tout enregistrement, sans rien écrire', async () => {
    const { app, db, myBrain } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/mybrain/test', {
      url: 'https://cerveau.example.test/api/v1',
      apiKey: API_KEY,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      draft: true,
      application: 'myBrief',
      droits: ['lire', 'nourrir'],
      settings: { configured: false, hasKey: false },
    });
    expect(res.body).not.toContain(API_KEY);
    expect(myBrain.calls).toEqual([
      { method: 'whoami', url: 'https://cerveau.example.test', apiKey: API_KEY },
    ]);
    expect(storedDoc(db)).toBeUndefined();
  });

  it('une clé saisie à la place de celle enregistrée est essayée, sans la remplacer', async () => {
    const { app, myBrain } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    const before = await app.myBrainSettings.get();
    myBrain.calls.length = 0;

    const other = `mbk_${'z'.repeat(40)}`;
    const res = await post(app, '/api/admin/settings/mybrain/test', { apiKey: other });
    expect(res.json()).toMatchObject({ ok: true, draft: true });
    expect(myBrain.calls).toEqual([
      { method: 'whoami', url: 'https://cerveau.example.test', apiKey: other },
    ]);
    const after = await app.myBrainSettings.get();
    expect(after.apiKey).toBe(API_KEY);
    expect(after.verified).toEqual(before.verified);
  });

  it('le test non plus ne porte jamais la clé enregistrée vers un autre hôte', async () => {
    const { app, myBrain } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/mybrain', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    myBrain.calls.length = 0;

    const res = await post(app, '/api/admin/settings/mybrain/test', {
      url: 'https://ailleurs.example',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('mybrain_key_required');
    expect(myBrain.calls).toHaveLength(0);
  });

  it('une saisie mal formée est refusée sans appel réseau', async () => {
    const { app, myBrain } = buildTestApp({ seed: seed() });
    const badKey = await post(app, '/api/admin/settings/mybrain/test', {
      url: 'https://cerveau.example.test',
      apiKey: 'sk-openai',
    });
    expect(badKey.json().error).toBe('mybrain_key_malformed');
    const badUrl = await post(app, '/api/admin/settings/mybrain/test', {
      url: 'ftp://cerveau',
      apiKey: API_KEY,
    });
    expect(badUrl.json().error).toBe('mybrain_url_invalid');
    expect(myBrain.calls).toHaveLength(0);
  });

  it('un refus de myBrain sur une saisie répond 400, avec son message', async () => {
    const { app } = buildTestApp({
      seed: seed(),
      myBrain: createFakeMyBrain({ whoami: { application: 'myBrief', droits: ['lire'], api: '' } }),
    });
    const res = await post(app, '/api/admin/settings/mybrain/test', {
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('mybrain_right_missing');
  });
});
