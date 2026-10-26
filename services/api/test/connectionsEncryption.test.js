/**
 * Chiffrement des refresh tokens de connexion, au repos.
 *
 * Ce qui est vérifié ici n'est visible nulle part ailleurs : un module de
 * chiffrement qui renverrait le clair sous un autre nom passerait TOUS les
 * tests fonctionnels — l'envoi marcherait, la connexion marcherait — et ne se
 * verrait que dans un dump de base, c'est-à-dire trop tard.
 *
 * Deux exigences pèsent autant que le chiffrement lui-même :
 *   - les connexions existantes, en clair, continuent de fonctionner ;
 *   - sans clé, rien ne change du comportement historique.
 * Une amélioration de sécurité qui obligerait tous les utilisateurs à se
 * reconnecter, ou qui casserait un déploiement n'ayant pas posé la variable, ne
 * serait pas déployable.
 */
import { describe, it, expect } from 'vitest';
import { createFakeDb, buildTestApp, userDoc, identityHeaders } from './helpers.js';
import { createConnectionsRepo } from '../lib/repositories/connections.js';
import { createSecretBox, parseKey, isSealed } from '../lib/crypto/secretBox.js';

const KEY_HEX = 'a'.repeat(64);
const KEY_B64 = Buffer.from(KEY_HEX, 'hex').toString('base64');
const OTHER_KEY = 'b'.repeat(64);

const USER = 'alex@client.fr';
const OTHER = 'autre@client.fr';
const TOKEN = '1//09-refresh-token-tres-secret';

const box = (key = KEY_HEX) => createSecretBox(key);
const repoWith = (key, db = createFakeDb()) => ({
  db,
  repo: createConnectionsRepo(db, key === null ? undefined : box(key)),
});
const rowsOf = (db) => db.data.get('userConnections') || [];

describe('parseKey', () => {
  it('accepte l’hexadécimal et le base64 pour la MÊME clé', () => {
    expect(parseKey(KEY_HEX).key.equals(parseKey(KEY_B64).key)).toBe(true);
  });

  it('refuse une clé de la mauvaise taille en le disant', () => {
    const { key, problem } = parseKey(Buffer.alloc(16).toString('base64'));
    expect(key).toBeNull();
    expect(problem).toContain('16');
  });

  it('refuse une chaîne qui n’est ni base64 ni hexadécimal', () => {
    // `Buffer.from(..., 'base64')` ignore SILENCIEUSEMENT les caractères
    // invalides : sans le contrôle d'aller-retour, cette clé passerait.
    expect(parseKey('pas-du-tout-une-clé !!').problem).toBe('not_base64_or_hex');
  });

  it('traite l’absence de clé comme un non-réglage, pas comme une erreur', () => {
    expect(parseKey(undefined)).toEqual({ key: null, problem: '' });
    expect(parseKey('   ')).toEqual({ key: null, problem: '' });
  });
});

describe('createSecretBox', () => {
  it('scelle et rouvre', () => {
    const b = box();
    const sealed = b.seal(TOKEN, 'google|alex');
    expect(isSealed(sealed)).toBe(true);
    expect(b.open(sealed, 'google|alex')).toBe(TOKEN);
  });

  it('ne laisse AUCUNE trace du clair dans le scellé', () => {
    const serialized = JSON.stringify(box().seal(TOKEN, 'google|alex'));
    expect(serialized).not.toContain(TOKEN);
    // Ni en fragments : un « chiffrement » qui ne ferait qu'encoder laisserait
    // passer un préfixe reconnaissable.
    expect(serialized).not.toContain(TOKEN.slice(0, 12));
  });

  it('produit un chiffré différent à chaque scellement du même secret', () => {
    const b = box();
    expect(b.seal(TOKEN, 'a').data).not.toBe(b.seal(TOKEN, 'a').data);
  });

  it('refuse d’ouvrir avec une autre AAD, une autre clé, ou altéré', () => {
    const b = box();
    const sealed = b.seal(TOKEN, 'google|victime');
    expect(b.open(sealed, 'google|attaquant')).toBe('');
    expect(box(OTHER_KEY).open(sealed, 'google|victime')).toBe('');

    const data = Buffer.from(sealed.data, 'base64');
    data[0] ^= 0xff;
    expect(b.open({ ...sealed, data: data.toString('base64') }, 'google|victime')).toBe('');
  });

  it('rend tel quel un clair hérité', () => {
    // C'est ce qui permet de déployer sans imposer une reconnexion à tous.
    expect(box().open(TOKEN, 'google|alex')).toBe(TOKEN);
  });

  it('sans clé, se comporte exactement comme avant', () => {
    const inerte = createSecretBox('');
    expect(inerte.enabled).toBe(false);
    expect(inerte.seal(TOKEN)).toBe(TOKEN);
    expect(inerte.open(TOKEN)).toBe(TOKEN);
  });

  it('avec une clé invalide, se désactive ET le crie dans les logs', () => {
    const warnings = [];
    const b = createSecretBox('trop-court', { info() {}, warn: (m) => warnings.push(m) });
    expect(b.enabled).toBe(false);
    // Une erreur de déploiement muette coûterait une soirée de diagnostic.
    expect(warnings.join(' ')).toMatch(/CONNECTIONS_ENC_KEY/);
  });
});

describe('dépôt des connexions', () => {
  it('écrit une enveloppe, jamais le jeton en clair', async () => {
    const { db, repo } = repoWith(KEY_HEX);
    await repo.set(USER, { provider: 'google', account: USER, refreshToken: TOKEN, scopes: ['s'] });

    const stored = rowsOf(db)[0];
    expect(isSealed(stored.refreshToken)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(TOKEN);
    // …et le rend déchiffré à l'usage.
    expect((await repo.get(USER)).refreshToken).toBe(TOKEN);
  });

  it('lit une connexion HÉRITÉE stockée en clair', async () => {
    const db = createFakeDb({
      userConnections: [
        { emailLower: USER, provider: 'google', account: USER, refreshToken: TOKEN, scopes: [] },
      ],
    });
    const { repo } = repoWith(KEY_HEX, db);
    // Sans ça, poser la clé déconnecterait tout le monde d'un coup.
    expect((await repo.get(USER)).refreshToken).toBe(TOKEN);
  });

  it('re-scelle une connexion héritée à sa prochaine écriture', async () => {
    const db = createFakeDb({
      userConnections: [
        { emailLower: USER, provider: 'google', account: USER, refreshToken: TOKEN, scopes: [] },
      ],
    });
    const { repo } = repoWith(KEY_HEX, db);
    await repo.set(USER, { provider: 'google', account: USER, refreshToken: TOKEN, scopes: [] });
    expect(isSealed(rowsOf(db)[0].refreshToken)).toBe(true);
  });

  it('sans clé, stocke en clair — comportement historique intact', async () => {
    const { db, repo } = repoWith('');
    await repo.set(USER, { provider: 'google', account: USER, refreshToken: TOKEN, scopes: [] });
    expect(rowsOf(db)[0].refreshToken).toBe(TOKEN);
    expect((await repo.get(USER)).refreshToken).toBe(TOKEN);
  });

  it('un document déplacé d’un compte à un autre devient une connexion ABSENTE', async () => {
    const { db, repo } = repoWith(KEY_HEX);
    await repo.set(USER, { provider: 'google', account: USER, refreshToken: TOKEN, scopes: [] });

    // Le seul geste utile à qui sait écrire dans Mongo sans connaître la clé.
    rowsOf(db)[0].emailLower = OTHER;

    // « Absente » et non « erreur » : l'interface propose déjà une reconnexion
    // pour une connexion absente, ce qui est exactement la bonne réponse.
    expect(await repo.get(OTHER)).toBeNull();
    expect(await repo.getByProvider(OTHER, 'google')).toBeNull();
    expect(await repo.listFor(OTHER)).toEqual([]);
  });

  it('une clé changée rend la connexion absente plutôt que de planter', async () => {
    const { db, repo } = repoWith(KEY_HEX);
    await repo.set(USER, { provider: 'google', account: USER, refreshToken: TOKEN, scopes: [] });
    const { repo: rotated } = repoWith(OTHER_KEY, db);
    expect(await rotated.get(USER)).toBeNull();
  });

  it('préserve les scopes et le compte externe', async () => {
    const { repo } = repoWith(KEY_HEX);
    await repo.set(USER, {
      provider: 'microsoft',
      account: 'boite@client.fr',
      refreshToken: TOKEN,
      scopes: ['Mail.Send', 'offline_access'],
    });
    expect(await repo.getByProvider(USER, 'microsoft')).toMatchObject({
      provider: 'microsoft',
      account: 'boite@client.fr',
      scopes: ['Mail.Send', 'offline_access'],
      refreshToken: TOKEN,
    });
  });
});

describe('câblage dans l’application', () => {
  it('la clé vient de la configuration, pas de l’environnement', async () => {
    const { app, db } = buildTestApp({
      seed: { user: [userDoc(USER)] },
      config: { connections: { encryptionKey: KEY_HEX } },
    });
    expect(app.secretBox.enabled).toBe(true);

    await app.connections.set(USER, {
      provider: 'google',
      account: USER,
      refreshToken: TOKEN,
      scopes: [],
    });
    // Le chiffrement traverse bien l'injection, jusqu'au document réellement
    // écrit — c'est le document en base qu'on regarde, pas ce que le dépôt
    // prétend en avoir fait.
    const stored = rowsOf(db)[0];
    expect(isSealed(stored.refreshToken)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(TOKEN);
    expect((await app.connections.get(USER)).refreshToken).toBe(TOKEN);
  });

  it('sans clé configurée, l’application démarre et fonctionne comme avant', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)] } });
    expect(app.secretBox.enabled).toBe(false);
    await app.connections.set(USER, {
      provider: 'google',
      account: USER,
      refreshToken: TOKEN,
      scopes: [],
    });
    expect((await app.connections.get(USER)).refreshToken).toBe(TOKEN);
  });

  it('le jeton ne sort jamais par une route', async () => {
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        userConnections: [
          { emailLower: USER, provider: 'google', account: USER, refreshToken: TOKEN, scopes: [] },
        ],
      },
      config: { connections: { encryptionKey: KEY_HEX } },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/status',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(TOKEN);
  });
});
