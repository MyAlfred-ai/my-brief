/**
 * Désignation des administrateurs par domaine (`ADMIN_EMAIL_DOMAINS`).
 *
 * Le trou comblé ici : `LEGACY_ADMIN_DOMAIN` ne promeut que les comptes SANS
 * champ `role`, c'est-à-dire ceux antérieurs à la migration. Un compte créé
 * ensuite naît `role: 'user'` (via /api/init) et n'est donc jamais promu — un
 * exploitant se retrouvait sans accès à sa propre administration, sans autre
 * issue qu'un `ADMIN_EMAILS` posé par SSH.
 */
import { describe, it, expect } from 'vitest';
import { createFakeDb, userDoc } from './helpers.js';
import { bootstrap } from '../lib/bootstrap.js';
import { loadConfig } from '../lib/config.js';

const SILENT = { info() {}, warn() {}, error() {} };

const baseConfig = (over = {}) => ({
  adminSeed: { enabled: false, email: '', password: '' },
  legacyAdminDomain: '',
  adminEmails: [],
  adminEmailDomains: [],
  ...over,
});

const roleOf = (db, emailLower) =>
  db.data.get('user').find((u) => u.emailLower === emailLower)?.role;

describe('ADMIN_EMAIL_DOMAINS', () => {
  it('promeut un compte déjà créé avec le rôle « user » — ce que la migration ne faisait pas', async () => {
    const db = createFakeDb({ user: [userDoc('alex@myalfred.ai', { role: 'user' })] });
    await bootstrap(db, baseConfig({ adminEmailDomains: ['myalfred.ai'] }), SILENT, {});
    expect(roleOf(db, 'alex@myalfred.ai')).toBe('admin');
  });

  it('laisse « user » quand aucun domaine n est déclaré', async () => {
    const db = createFakeDb({ user: [userDoc('alex@myalfred.ai', { role: 'user' })] });
    await bootstrap(db, baseConfig(), SILENT, {});
    expect(roleOf(db, 'alex@myalfred.ai')).toBe('user');
  });

  it('ne promeut PAS un domaine qui se contente de ressembler au bon', async () => {
    const db = createFakeDb({
      user: [
        userDoc('pirate@myalfred.ai.attaquant.com', { role: 'user' }),
        userDoc('voisin@pasmyalfred.ai', { role: 'user' }),
      ],
    });
    await bootstrap(db, baseConfig({ adminEmailDomains: ['myalfred.ai'] }), SILENT, {});
    expect(roleOf(db, 'pirate@myalfred.ai.attaquant.com')).toBe('user');
    expect(roleOf(db, 'voisin@pasmyalfred.ai')).toBe('user');
  });

  it('ne touche pas aux comptes des autres domaines', async () => {
    const db = createFakeDb({
      user: [
        userDoc('alex@myalfred.ai', { role: 'user' }),
        userDoc('client@client.fr', { role: 'user' }),
      ],
    });
    await bootstrap(db, baseConfig({ adminEmailDomains: ['myalfred.ai'] }), SILENT, {});
    expect(roleOf(db, 'client@client.fr')).toBe('user');
  });

  it('ne crée aucun compte : un domaine désigne des personnes, pas des adresses connues', async () => {
    const db = createFakeDb({ user: [] });
    await bootstrap(db, baseConfig({ adminEmailDomains: ['myalfred.ai'] }), SILENT, {});
    expect(db.data.get('user')).toHaveLength(0);
  });

  it('accepte plusieurs domaines, avec ou sans arobase', () => {
    expect(
      loadConfig({ ADMIN_EMAIL_DOMAINS: '@myalfred.ai, Client.FR ,' }).adminEmailDomains,
    ).toEqual(['myalfred.ai', 'client.fr']);
  });

  it('vide par défaut — aucun domaine n est administrateur sans déclaration explicite', () => {
    expect(loadConfig({}).adminEmailDomains).toEqual([]);
  });
});

describe('installation sans administrateur', () => {
  it('le signale dans les journaux, avec les deux moyens d en sortir', async () => {
    const warnings = [];
    const log = { info() {}, warn: (m) => warnings.push(m), error() {} };
    const db = createFakeDb({ user: [userDoc('simple@client.fr', { role: 'user' })] });

    await bootstrap(db, baseConfig(), log, {});
    const alerte = warnings.find((m) => m.includes('AUCUN compte administrateur'));
    expect(alerte).toBeTruthy();
    expect(alerte).toContain('ADMIN_EMAILS');
    expect(alerte).toContain('ADMIN_EMAIL_DOMAINS');
  });

  it('se tait dès qu un administrateur existe', async () => {
    const warnings = [];
    const log = { info() {}, warn: (m) => warnings.push(m), error() {} };
    const db = createFakeDb({ user: [userDoc('patron@client.fr', { role: 'admin' })] });

    await bootstrap(db, baseConfig(), log, {});
    expect(warnings.find((m) => m.includes('AUCUN compte administrateur'))).toBeUndefined();
  });
});
