/**
 * Déduplication des connexions mail au démarrage (lib/bootstrap.js).
 *
 * Pourquoi cette étape existe : l'index unique posé sur
 * `userMailAccounts.emailLower` refuserait de se créer si la base porte déjà
 * deux documents pour le même compte — et `ensureIndexes` est FAIL-FAST, donc
 * l'API entrerait en crash-loop. Or ces doublons sont précisément ce que
 * l'absence d'index a pu laisser passer : l'upsert de `setGoogle` n'était
 * protégé d'aucune course.
 *
 * Le double de base est local à ce fichier : le fake partagé (test/helpers.js)
 * n'attribue pas d'`_id` et renvoie toujours une agrégation vide, alors que
 * c'est exactement ce que cette fonction manipule.
 */
import { describe, it, expect } from 'vitest';
import { dedupeMailAccounts, bootstrap, warnDuplicateEmails } from '../lib/bootstrap.js';
import { createFakeDb, userDoc } from './helpers.js';

const SILENT = { info() {}, warn() {}, error() {} };

const bootConfig = {
  adminSeed: { enabled: false, email: '', password: '' },
  legacyAdminDomain: '',
  adminEmails: [],
  adminEmailDomains: [],
};

/**
 * Base minimale : juste l'agrégation de regroupement et `deleteMany({_id: $in})`
 * dont dépend la déduplication.
 */
function fakeDb(docs) {
  const store = docs.map((d, i) => ({ _id: `id-${i}`, ...d }));
  return {
    docs: () => store,
    collection() {
      return {
        aggregate() {
          const groups = new Map();
          for (const doc of store) {
            const key = doc.emailLower;
            if (!groups.has(key)) groups.set(key, { _id: key, count: 0, ids: [] });
            const group = groups.get(key);
            group.count += 1;
            group.ids.push(doc._id);
          }
          const dups = [...groups.values()].filter((g) => g.count > 1);
          return {
            async toArray() {
              return dups;
            },
          };
        },
        async deleteMany(filter) {
          const doomed = new Set(filter?._id?.$in || []);
          let deletedCount = 0;
          for (let i = store.length - 1; i >= 0; i -= 1) {
            if (doomed.has(store[i]._id)) {
              store.splice(i, 1);
              deletedCount += 1;
            }
          }
          return { deletedCount };
        },
      };
    },
  };
}

describe('dedupeMailAccounts', () => {
  it('ne touche à rien quand chaque compte a une seule connexion', async () => {
    const db = fakeDb([
      { emailLower: 'a@client.fr', refreshToken: 'rt-a' },
      { emailLower: 'b@client.fr', refreshToken: 'rt-b' },
    ]);
    expect(await dedupeMailAccounts(db, SILENT)).toBe(0);
    expect(db.docs()).toHaveLength(2);
  });

  it('garde la connexion la plus récente et supprime les autres', async () => {
    // `_id` ObjectId est monotone : le plus grand est le dernier inséré, donc
    // le consentement le plus récent — le seul dont le jeton est vivant.
    const db = fakeDb([
      { emailLower: 'a@client.fr', refreshToken: 'rt-vieux' },
      { emailLower: 'a@client.fr', refreshToken: 'rt-recent' },
      { emailLower: 'b@client.fr', refreshToken: 'rt-b' },
    ]);
    expect(await dedupeMailAccounts(db, SILENT)).toBe(1);

    const rest = db.docs();
    expect(rest).toHaveLength(2);
    expect(rest.find((d) => d.emailLower === 'a@client.fr').refreshToken).toBe('rt-recent');
    expect(rest.find((d) => d.emailLower === 'b@client.fr')).toBeTruthy();
  });

  it('est idempotente : un second passage ne supprime plus rien', async () => {
    const db = fakeDb([
      { emailLower: 'a@client.fr', refreshToken: 'rt-1' },
      { emailLower: 'a@client.fr', refreshToken: 'rt-2' },
    ]);
    expect(await dedupeMailAccounts(db, SILENT)).toBe(1);
    expect(await dedupeMailAccounts(db, SILENT)).toBe(0);
    expect(db.docs()).toHaveLength(1);
  });

  it("ne bloque pas le démarrage si l'agrégation échoue", async () => {
    // Non bloquant à dessein : c'est `ensureIndexes`, juste après, qui décide
    // si la base est exploitable. Échouer ici priverait d'un diagnostic clair.
    const db = {
      collection: () => ({
        aggregate() {
          throw new Error('agrégation indisponible');
        },
      }),
    };
    await expect(dedupeMailAccounts(db, SILENT)).resolves.toBe(0);
  });
});

describe('séquence de démarrage complète', () => {
  // `bootstrap` est FAIL-FAST : une erreur ici met l'API en crash-loop, sur
  // toutes les installations à la fois. Les tests par fonction ne couvrent pas
  // l'enchaînement — c'est lui qu'on éprouve ici.

  it('démarre sur une base vierge', async () => {
    const db = createFakeDb({});
    await expect(bootstrap(db, bootConfig, SILENT, {})).resolves.toBeUndefined();
  });

  it('démarre sur une base portant des connexions mail héritées', async () => {
    const db = createFakeDb({
      user: [userDoc('a@client.fr')],
      userMailAccounts: [
        {
          emailLower: 'a@client.fr',
          provider: 'google',
          account: 'a@gmail.com',
          refreshToken: 'rt-a',
        },
      ],
    });
    await expect(bootstrap(db, bootConfig, SILENT, {})).resolves.toBeUndefined();

    // La reprise a bien eu lieu dans la foulée, et l'ancienne collection reste.
    expect(db.data.get('userConnections')).toHaveLength(1);
    expect(db.data.get('userConnections')[0].refreshToken).toBe('rt-a');
    expect(db.data.get('userMailAccounts')).toHaveLength(1);
  });

  it('est rejouable : un second démarrage ne duplique rien', async () => {
    const db = createFakeDb({
      user: [userDoc('a@client.fr')],
      userMailAccounts: [{ emailLower: 'a@client.fr', provider: 'google', refreshToken: 'rt-a' }],
    });
    await bootstrap(db, bootConfig, SILENT, {});
    await bootstrap(db, bootConfig, SILENT, {});
    expect(db.data.get('userConnections')).toHaveLength(1);
  });

  it("pose l'index d'unicité des connexions", async () => {
    // Sans lui, l'upsert du callback OAuth n'est protégé d'aucune course.
    const db = createFakeDb({});
    await bootstrap(db, bootConfig, SILENT, {});

    const index = db.calls.find(
      (c) => c.collection === 'userConnections' && c.op === 'createIndex',
    );
    expect(index.spec).toEqual({ emailLower: 1, provider: 1 });
    expect(index.options.unique).toBe(true);
  });
});

/**
 * Le MESSAGE d'alerte des comptes en doublon.
 *
 * Ce que le message dit compte autant que sa présence : c'est la seule chose
 * qu'un exploitant voit, et son déploiement l'imprime à chaque démarrage.
 * Relevé sur la recette : deux comptes aux adresses IDENTIQUES octet pour
 * octet, annoncés comme un « doublon de casse ». On cherchait une différence
 * de majuscules qui n'existait pas.
 *
 * Le regroupement lui-même est celui de Mongo : ces tests portent sur la
 * formulation, en injectant directement le résultat de l'agrégation.
 */
describe('warnDuplicateEmails — ce que lit l’exploitant', () => {
  function dbWithGroups(groups) {
    return {
      collection: () => ({
        aggregate: () => ({
          async toArray() {
            return groups;
          },
        }),
      }),
    };
  }

  function capture() {
    const lines = [];
    return { logger: { info() {}, warn: (m) => lines.push(m), error() {} }, lines };
  }

  it('adresses identiques : ne parle PAS de casse', async () => {
    const { logger, lines } = capture();
    await warnDuplicateEmails(
      dbWithGroups([
        {
          _id: 'alex@myalfred.ai',
          count: 2,
          emails: ['alex@myalfred.ai', 'alex@myalfred.ai'],
          servis: 1,
          roles: ['admin', 'user'],
        },
      ]),
      logger,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/casse/);
    expect(lines[0]).toMatch(/EXACTEMENT identique/);
  });

  it('casse réellement différente : la nomme, avec les deux adresses', async () => {
    const { logger, lines } = capture();
    await warnDuplicateEmails(
      dbWithGroups([
        {
          _id: 'alex@myalfred.ai',
          count: 2,
          emails: ['Alex@myalfred.ai', 'alex@myalfred.ai'],
          servis: 1,
          roles: ['admin', 'user'],
        },
      ]),
      logger,
    );
    expect(lines[0]).toMatch(/doublon de casse/);
    expect(lines[0]).toContain('Alex@myalfred.ai');
  });

  it('dit lequel sert et rassure sur les réunions', async () => {
    const { logger, lines } = capture();
    await warnDuplicateEmails(
      dbWithGroups([
        {
          _id: 'alex@myalfred.ai',
          count: 2,
          emails: ['alex@myalfred.ai', 'alex@myalfred.ai'],
          servis: 1,
          roles: ['admin', 'user'],
        },
      ]),
      logger,
    );
    // Le compte inerte le reste : l'index unique partiel le rejette à chaque
    // démarrage. Sans cette phrase, un rôle « user » affiché à côté de l'admin
    // en service se lit comme une perte de droits.
    expect(lines[0]).toMatch(/1 porte\(nt\) emailLower/);
    expect(lines[0]).toMatch(/1 inerte\(s\)/);
    expect(lines[0]).toMatch(/aucune n'est perdue ni scindée/);
  });

  it('aucun doublon → aucun message', async () => {
    const { logger, lines } = capture();
    expect(await warnDuplicateEmails(dbWithGroups([]), logger)).toBe(0);
    expect(lines).toHaveLength(0);
  });
});
