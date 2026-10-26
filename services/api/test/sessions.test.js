import { describe, it, expect } from 'vitest';
import { createFakeDb } from './helpers.js';
import { createSessionStore, hashToken } from '../lib/auth/sessions.js';
import { createResetTokenStore } from '../lib/auth/resetTokens.js';
import { bootstrap, seedAdmin } from '../lib/bootstrap.js';
import { verifyPassword } from '../lib/auth/password.js';

const EMAIL = 'user@example.com';

describe('magasin de sessions', () => {
  it('crée une session résolvable et ne stocke que le hash du jeton', async () => {
    const db = createFakeDb();
    const sessions = createSessionStore(db);
    const { token } = await sessions.create(EMAIL);

    const stored = db.data.get('authSession')[0];
    expect(stored.tokenHash).toBe(hashToken(token));
    // Une fuite de la base ne doit pas donner de session utilisable.
    expect(JSON.stringify(stored)).not.toContain(token);

    expect((await sessions.resolve(token)).emailLower).toBe(EMAIL);
  });

  it('ne résout pas une session expirée même si le document existe encore', async () => {
    const db = createFakeDb();
    const sessions = createSessionStore(db, { ttlMs: 1000 });
    const { token } = await sessions.create(EMAIL);
    // Le moniteur TTL de Mongo ne passe que toutes les 60 s : un document peut
    // survivre à son échéance. Seul le contrôle applicatif protège ici.
    db.data.get('authSession')[0].expiresAt = new Date(Date.now() - 1);
    expect(await sessions.resolve(token)).toBeNull();
  });

  it('destroy supprime la session ciblée uniquement', async () => {
    const db = createFakeDb();
    const sessions = createSessionStore(db);
    const a = await sessions.create(EMAIL);
    const b = await sessions.create(EMAIL);
    await sessions.destroy(a.token);
    expect(await sessions.resolve(a.token)).toBeNull();
    expect(await sessions.resolve(b.token)).not.toBeNull();
  });

  it('destroyAllFor révoque tous les appareils d un compte', async () => {
    const db = createFakeDb();
    const sessions = createSessionStore(db);
    await sessions.create(EMAIL);
    await sessions.create(EMAIL);
    await sessions.create('autre@example.com');
    await sessions.destroyAllFor(EMAIL);
    expect(db.data.get('authSession').map((s) => s.emailLower)).toEqual(['autre@example.com']);
  });

  it('touch n écrit pas tant que la session est fraîche', async () => {
    const db = createFakeDb();
    const sessions = createSessionStore(db);
    const { token } = await sessions.create(EMAIL);
    const session = await sessions.resolve(token);
    await sessions.touch(session);
    // Sinon chaque requête de l'API deviendrait une écriture Mongo.
    expect(db.calls.filter((c) => c.op === 'updateOne')).toHaveLength(0);
  });

  it('touch prolonge une session proche de l échéance', async () => {
    const db = createFakeDb();
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    const sessions = createSessionStore(db, { ttlMs });
    const { token } = await sessions.create(EMAIL);
    // La session n'a plus que 30 min à vivre : sous le seuil d'une heure.
    db.data.get('authSession')[0].expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await sessions.touch(await sessions.resolve(token));
    expect(db.calls.filter((c) => c.op === 'updateOne')).toHaveLength(1);
    const renewed = db.data.get('authSession')[0].expiresAt.getTime();
    expect(renewed - Date.now()).toBeGreaterThan(ttlMs - 60_000);
  });
});

describe('jetons de réinitialisation', () => {
  it('ne stocke que le hash et ne se consomme qu une fois', async () => {
    const db = createFakeDb();
    const store = createResetTokenStore(db);
    const { token } = await store.issue({ emailLower: EMAIL });
    expect(JSON.stringify(db.data.get('authResetToken')[0])).not.toContain(token);

    expect((await store.consume(token)).emailLower).toBe(EMAIL);
    expect(await store.consume(token)).toBeNull();
  });

  it('refuse un jeton expiré', async () => {
    const db = createFakeDb();
    const store = createResetTokenStore(db, { ttlMs: 1000 });
    const { token } = await store.issue({ emailLower: EMAIL });
    db.data.get('authResetToken')[0].expiresAt = new Date(Date.now() - 1);
    expect(await store.consume(token)).toBeNull();
  });

  it('purgeFor efface tous les liens en vol d un compte', async () => {
    const db = createFakeDb();
    const store = createResetTokenStore(db);
    await store.issue({ emailLower: EMAIL });
    await store.issue({ emailLower: EMAIL });
    await store.purgeFor(EMAIL);
    expect(db.data.get('authResetToken')).toHaveLength(0);
  });
});

describe('amorçage de la base', () => {
  const seedConfig = { email: 'admin@example.test', password: 'Seed-Password-2026', enabled: true };

  it('crée le compte admin avec changement de mot de passe obligatoire', async () => {
    const db = createFakeDb();
    await seedAdmin(db, seedConfig);
    const doc = db.data.get('user')[0];
    expect(doc).toMatchObject({
      emailLower: 'admin@example.test',
      role: 'admin',
      mustChangePassword: true,
    });
    expect(await verifyPassword('Seed-Password-2026', doc.passwordHash)).toBe(true);
  });

  it('est idempotent : un second passage ne réécrit rien', async () => {
    const db = createFakeDb();
    await seedAdmin(db, seedConfig);
    const firstHash = db.data.get('user')[0].passwordHash;
    await seedAdmin(db, seedConfig);
    expect(db.data.get('user')).toHaveLength(1);
    expect(db.data.get('user')[0].passwordHash).toBe(firstHash);
  });

  it("n'écrase JAMAIS un mot de passe déjà changé", async () => {
    const db = createFakeDb({
      user: [
        {
          email: 'admin@example.test',
          emailLower: 'admin@example.test',
          role: 'admin',
          passwordHash: 'scrypt$deja-change',
          mustChangePassword: false,
        },
      ],
    });
    await seedAdmin(db, seedConfig);
    expect(db.data.get('user')[0].passwordHash).toBe('scrypt$deja-change');
    expect(db.data.get('user')[0].mustChangePassword).toBe(false);
  });

  it('pose un mot de passe sur un compte OIDC existant sans en créer un second', async () => {
    const db = createFakeDb({
      user: [
        {
          email: 'Admin@MyAlfred.ai',
          emailLower: 'admin@example.test',
          role: 'user',
          authProviders: ['oidc'],
        },
      ],
    });
    await seedAdmin(db, seedConfig);
    expect(db.data.get('user')).toHaveLength(1);
    expect(db.data.get('user')[0]).toMatchObject({ role: 'admin', mustChangePassword: true });
    expect(db.data.get('user')[0].authProviders).toEqual(['oidc', 'password']);
  });

  it('désactivable', async () => {
    const db = createFakeDb();
    await seedAdmin(db, { ...seedConfig, enabled: false });
    expect(db.data.get('user') || []).toHaveLength(0);
  });

  it('ne crée RIEN sur une installation qui a déjà des comptes', async () => {
    // Sécurité : sur une mise à jour de production, un compte d'amorçage avec
    // le mot de passe par défaut connu de tous permettrait au premier venu de
    // le changer et de devenir administrateur.
    const db = createFakeDb({
      user: [{ email: 'deja@client.fr', emailLower: 'deja@client.fr', role: 'user' }],
    });
    const res = await seedAdmin(db, seedConfig);
    expect(res).toEqual({ created: false, reason: 'existing_installation' });
    expect(db.data.get('user')).toHaveLength(1);
  });
});

describe('promotion par ADMIN_EMAILS', () => {
  const config = { adminSeed: { enabled: false }, legacyAdminDomain: '' };

  it('promeut un compte existant', async () => {
    const db = createFakeDb({
      user: [{ email: 'Chef@Client.fr', emailLower: 'chef@client.fr', role: 'user' }],
    });
    await bootstrap(db, { ...config, adminEmails: ['chef@client.fr'] });
    expect(db.data.get('user')[0].role).toBe('admin');
  });

  it('crée le compte si l administrateur ne s est jamais connecté', async () => {
    // Permet de désigner l'administrateur AVANT sa première connexion SSO.
    const db = createFakeDb();
    await bootstrap(db, { ...config, adminEmails: [' Futur@Client.fr '] });
    const doc = db.data.get('user')[0];
    expect(doc).toMatchObject({ emailLower: 'futur@client.fr', role: 'admin', disabled: false });
    // Compte SSO : aucun mot de passe, donc aucun verrou de changement.
    expect(doc.passwordHash).toBeUndefined();
    expect(doc.mustChangePassword).toBe(false);
  });

  it('est idempotent et ne rétrograde personne', async () => {
    const db = createFakeDb({
      user: [{ email: 'chef@client.fr', emailLower: 'chef@client.fr', role: 'admin' }],
    });
    await bootstrap(db, { ...config, adminEmails: ['chef@client.fr'] });
    await bootstrap(db, { ...config, adminEmails: [] });
    expect(db.data.get('user')).toHaveLength(1);
    expect(db.data.get('user')[0].role).toBe('admin');
  });
});

describe('migrations au démarrage', () => {
  const config = { adminSeed: { enabled: false }, legacyAdminDomain: 'myalfred.ai' };

  it('renseigne emailLower et promeut les comptes du domaine historique', async () => {
    const db = createFakeDb({
      user: [{ email: 'Alex@MyAlfred.ai' }, { email: 'client@ailleurs.fr' }],
    });
    await bootstrap(db, config);
    const [alex, client] = db.data.get('user');
    expect(alex).toMatchObject({ emailLower: 'alex@myalfred.ai', role: 'admin' });
    // La règle historique `isInternalEmail` ne concernait qu'un domaine.
    expect(client).toMatchObject({ emailLower: 'client@ailleurs.fr', role: 'user' });
  });

  it('ne rejoue pas la promotion sur un compte rétrogradé depuis', async () => {
    const db = createFakeDb({
      user: [{ email: 'alex@myalfred.ai', emailLower: 'alex@myalfred.ai', role: 'user' }],
    });
    await bootstrap(db, config);
    // La migration est unique : après elle, seul un admin promeut.
    expect(db.data.get('user')[0].role).toBe('user');
  });

  it('la promotion est désactivable', async () => {
    const db = createFakeDb({ user: [{ email: 'alex@myalfred.ai' }] });
    await bootstrap(db, { ...config, legacyAdminDomain: '' });
    expect(db.data.get('user')[0].role).toBe('user');
  });
});
