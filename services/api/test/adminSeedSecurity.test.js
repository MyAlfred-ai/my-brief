import { describe, it, expect } from 'vitest';
import { createFakeDb } from './helpers.js';
import { loadConfig } from '../lib/config.js';
import { bootstrap, seedAdmin } from '../lib/bootstrap.js';

// Aucun identifiant d'administration connu de tous, et aucune promotion
// implicite par domaine : une installation tierce ne doit dépendre que de ce
// que son exploitant a écrit dans son .env.

const STRONG = 'Correct-Horse-Battery-9';

describe('valeurs par défaut de la configuration', () => {
  it("n'a ni email ni mot de passe d'amorçage par défaut", () => {
    const { adminSeed } = loadConfig({});
    expect(adminSeed.email).toBe('');
    expect(adminSeed.password).toBe('');
  });

  it("n'a aucun domaine promu administrateur par défaut", () => {
    expect(loadConfig({}).legacyAdminDomain).toBe('');
  });

  it('garde LEGACY_ADMIN_DOMAIN quand une installation le fixe', () => {
    expect(loadConfig({ LEGACY_ADMIN_DOMAIN: 'example.test' }).legacyAdminDomain).toBe(
      'example.test',
    );
  });
});

describe("compte d'amorçage sur une base vierge", () => {
  it('refuse de démarrer sans ADMIN_SEED_PASSWORD', async () => {
    const db = createFakeDb();
    await expect(
      seedAdmin(db, { enabled: true, email: 'admin@example.test', password: '' }),
    ).rejects.toThrow(/ADMIN_SEED_PASSWORD/);
    expect(db.data.get('user') || []).toHaveLength(0);
  });

  it('refuse un mot de passe de moins de 12 caractères', async () => {
    const db = createFakeDb();
    await expect(
      seedAdmin(db, { enabled: true, email: 'admin@example.test', password: 'admin' }),
    ).rejects.toThrow(/ADMIN_SEED_PASSWORD/);
  });

  it('refuse de démarrer sans ADMIN_SEED_EMAIL', async () => {
    const db = createFakeDb();
    await expect(seedAdmin(db, { enabled: true, email: '', password: STRONG })).rejects.toThrow(
      /ADMIN_SEED_EMAIL/,
    );
  });

  it("crée le compte avec un mot de passe solide", async () => {
    const db = createFakeDb();
    const res = await seedAdmin(db, { enabled: true, email: 'admin@example.test', password: STRONG });
    expect(res.created).toBe(true);
    expect(db.data.get('user')[0]).toMatchObject({ role: 'admin', mustChangePassword: true });
  });

  it('désactivé, ne demande rien', async () => {
    const db = createFakeDb();
    await expect(seedAdmin(db, { enabled: false, email: '', password: '' })).resolves.toEqual({
      created: false,
      reason: 'disabled',
    });
  });
});

describe('installation existante', () => {
  it("n'arrête pas le démarrage quand l'amorçage n'est pas configuré", async () => {
    const db = createFakeDb({ user: [{ email: 'a@example.test', emailLower: 'a@example.test' }] });
    await expect(seedAdmin(db, { enabled: true, email: '', password: '' })).resolves.toMatchObject({
      created: false,
    });
  });

  it("ne pose jamais un mot de passe faible sur un compte existant", async () => {
    const existing = {
      email: 'admin@example.test',
      emailLower: 'admin@example.test',
      role: 'user',
      authProviders: ['oidc'],
    };
    const db = createFakeDb({ user: [{ ...existing }] });
    const res = await seedAdmin(db, { enabled: true, email: 'admin@example.test', password: 'admin' });
    expect(res).toEqual({ created: false, reason: 'weak_password' });
    expect(db.data.get('user')[0]).toEqual(existing);
  });

  it("avec la configuration par défaut, un compte @myalfred.ai n'est pas promu", async () => {
    const db = createFakeDb({ user: [{ email: 'quelquun@myalfred.ai' }] });
    const { adminEmails, adminEmailDomains, legacyAdminDomain } = loadConfig({});
    await bootstrap(db, {
      adminSeed: { enabled: false },
      adminEmails,
      adminEmailDomains,
      legacyAdminDomain,
    });
    expect(db.data.get('user')[0].role).not.toBe('admin');
  });
});
