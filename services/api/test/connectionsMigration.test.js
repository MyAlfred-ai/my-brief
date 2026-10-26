/**
 * Reprise des connexions Gmail vers la collection généralisée `userConnections`
 * (lib/bootstrap.js).
 *
 * La contrainte à tenir est une promesse faite aux utilisateurs déjà connectés :
 * après la mise à jour, leurs envois doivent continuer de partir de leur Gmail
 * SANS qu'ils aient à réautoriser quoi que ce soit. En contrepartie, la reprise
 * ne peut pas leur inventer le scope Drive qu'ils n'ont jamais accordé — ils
 * l'obtiendront à leur prochaine reconnexion.
 */
import { describe, it, expect } from 'vitest';
import { createFakeDb } from './helpers.js';
import { migrateMailAccountsToConnections } from '../lib/bootstrap.js';

const SILENT = { info() {}, warn() {}, error() {} };
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const legacyAccount = (emailLower, refreshToken) => ({
  emailLower,
  provider: 'google',
  account: `${emailLower.split('@')[0]}@gmail.com`,
  refreshToken,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
});

describe('migrateMailAccountsToConnections', () => {
  it('reprend les connexions avec les scopes historiques, sans le Drive', async () => {
    const db = createFakeDb({
      userMailAccounts: [
        legacyAccount('a@client.fr', 'rt-a'),
        legacyAccount('b@client.fr', 'rt-b'),
      ],
    });

    expect(await migrateMailAccountsToConnections(db, SILENT)).toBe(2);

    const repris = db.data.get('userConnections');
    expect(repris).toHaveLength(2);
    const premier = repris.find((d) => d.emailLower === 'a@client.fr');
    expect(premier.refreshToken).toBe('rt-a');
    expect(premier.provider).toBe('google');
    expect(premier.scopes).toContain('https://www.googleapis.com/auth/gmail.send');
    // La promesse inverse : pas de Drive tant que l'utilisateur n'a pas
    // re-consenti. Le prétendre produirait un bouton qui échoue au premier clic.
    expect(premier.scopes).not.toContain(DRIVE_SCOPE);
    // Les dates d'origine sont conservées : c'est bien la même connexion.
    expect(premier.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it("laisse l'ancienne collection en place — filet de retour arrière", async () => {
    const db = createFakeDb({ userMailAccounts: [legacyAccount('a@client.fr', 'rt-a')] });
    await migrateMailAccountsToConnections(db, SILENT);
    expect(db.data.get('userMailAccounts')).toHaveLength(1);
  });

  it('est idempotente : un second démarrage ne duplique rien', async () => {
    const db = createFakeDb({ userMailAccounts: [legacyAccount('a@client.fr', 'rt-a')] });
    expect(await migrateMailAccountsToConnections(db, SILENT)).toBe(1);
    expect(await migrateMailAccountsToConnections(db, SILENT)).toBe(0);
    expect(db.data.get('userConnections')).toHaveLength(1);
  });

  it('ne touche à rien si des connexions existent déjà', async () => {
    // Cas d'un retour arrière puis d'une remise à jour : la collection cible
    // fait foi, l'ancienne peut être périmée.
    const db = createFakeDb({
      userMailAccounts: [legacyAccount('a@client.fr', 'rt-perime')],
      userConnections: [
        { emailLower: 'a@client.fr', provider: 'google', refreshToken: 'rt-a-jour', scopes: [] },
      ],
    });
    expect(await migrateMailAccountsToConnections(db, SILENT)).toBe(0);
    expect(db.data.get('userConnections')[0].refreshToken).toBe('rt-a-jour');
  });

  it('ignore les documents sans refresh token — ils ne servaient déjà à rien', async () => {
    const db = createFakeDb({
      userMailAccounts: [
        { emailLower: 'vide@client.fr', provider: 'google', account: 'x@gmail.com' },
        legacyAccount('a@client.fr', 'rt-a'),
      ],
    });
    expect(await migrateMailAccountsToConnections(db, SILENT)).toBe(1);
    expect(db.data.get('userConnections')[0].emailLower).toBe('a@client.fr');
  });

  it('sur une base neuve : rien à faire, aucune erreur', async () => {
    const db = createFakeDb({});
    expect(await migrateMailAccountsToConnections(db, SILENT)).toBe(0);
  });
});
