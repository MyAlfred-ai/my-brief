/**
 * Portée des données par utilisateur, insensible à la casse de l'email.
 *
 * Le défaut corrigé ici : les réunions étaient cherchées par égalité EXACTE sur
 * `email`, alors que la casse de l'email porté par la requête dépend du chemin
 * de connexion (en-tête de l'annuaire côté OIDC, document `user` côté session
 * native). Un utilisateur changeant de chemin voyait un historique VIDE — avec
 * un HTTP 200 et aucune erreur en console, donc sans rien pour le diagnostiquer.
 *
 * L'autre moitié du contrat compte tout autant : élargir la recherche ne doit
 * PAS faire fuiter les réunions d'un homonyme d'un autre domaine.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, sessionCookieHeaders } from './helpers.js';
import {
  ownerFilter,
  ownerFields,
  backfillOwnerEmails,
  OWNED_COLLECTIONS,
} from '../lib/ownerScope.js';
import { createFakeDb } from './helpers.js';

const LOWER = 'alex@myalfred.ai';
const UPPER = 'Alex@MyAlfred.ai';
const AUTRE = 'alex@autre-societe.fr';

/** Réunion telle que l'écrivaient les versions précédentes : `email` seul. */
const legacyMeeting = (email, meetingId, title) => ({
  meetingId,
  email,
  title,
  now: '2026-08-01T10:00:00.000Z',
  lastConnecion: '2026-08-01T10:00:00.000Z',
});

const SILENT_LOG = { info() {}, warn() {} };

/**
 * Application montée sur des documents HISTORIQUES, après l'étape de démarrage
 * qui les normalise.
 *
 * Le backfill est rejoué ici parce que `server.js` l'exécute — de façon
 * bloquante, avant d'accepter la moindre requête (cf. lib/bootstrap.js). Une
 * base qui n'y est jamais passée garde des documents sans `emailLower`, et
 * c'est justement l'état qui rendait l'historique invisible.
 */
async function bootedApp(seed) {
  const built = buildTestApp({ seed });
  await backfillOwnerEmails(built.db, SILENT_LOG);
  return built;
}

const history = (app, headers) => app.inject({ method: 'GET', url: '/api/history', headers });

describe('ownerFilter', () => {
  it('cherche sur emailLower, et retombe sur l email brut', () => {
    expect(ownerFilter(UPPER)).toEqual({ $or: [{ emailLower: LOWER }, { email: UPPER }] });
  });

  it('combine les critères additionnels en ET', () => {
    expect(ownerFilter(LOWER, { meetingId: 'm-1' })).toEqual({
      meetingId: 'm-1',
      $or: [{ emailLower: LOWER }, { email: LOWER }],
    });
  });

  it('ownerFields conserve la casse d origine ET pose la forme normalisée', () => {
    expect(ownerFields(UPPER)).toEqual({ email: UPPER, emailLower: LOWER });
  });
});

describe('GET /api/history — casse de l email', () => {
  it('retrouve les réunions écrites dans une autre casse', async () => {
    const { app } = await bootedApp({
      user: [userDoc(LOWER)],
      resume: [legacyMeeting(LOWER, 'm-1', 'Réunion de la semaine dernière')],
    });
    // L'annuaire renvoie l'email en casse mixte : c'est le cas qui vidait
    // l'historique.
    const res = await history(app, identityHeaders(UPPER));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].title).toBe('Réunion de la semaine dernière');
  });

  it('retrouve les réunions quand c est le document qui porte la casse mixte', async () => {
    const { app } = await bootedApp({
      user: [userDoc(LOWER)],
      resume: [legacyMeeting(UPPER, 'm-1', 'Ancienne réunion')],
    });
    const res = await history(app, identityHeaders(LOWER));
    expect(res.json()).toHaveLength(1);
  });

  it('même historique par session native que par en-tête OIDC', async () => {
    const { app } = await bootedApp({
      user: [userDoc(UPPER)],
      resume: [legacyMeeting(LOWER, 'm-1', 'Réunion'), legacyMeeting(LOWER, 'm-2', 'Autre')],
    });
    const { token } = await app.sessions.create(LOWER);

    const parHeader = await history(app, identityHeaders(UPPER));
    const parSession = await history(app, sessionCookieHeaders(token));
    expect(parSession.json().map((m) => m.meetingId)).toEqual(
      parHeader.json().map((m) => m.meetingId),
    );
    expect(parSession.json()).toHaveLength(2);
  });

  it('NE FUITE PAS les réunions d un homonyme d un autre domaine', async () => {
    const { app } = await bootedApp({
      user: [userDoc(LOWER), userDoc(AUTRE)],
      resume: [legacyMeeting(AUTRE, 'm-9', 'Confidentiel voisin')],
    });
    const res = await history(app, identityHeaders(UPPER));
    expect(res.json()).toEqual([]);
  });
});

describe('écritures scopées', () => {
  it('un renommage atteint une réunion écrite dans une autre casse', async () => {
    const { app, db } = await bootedApp({
      user: [userDoc(UPPER)],
      resume: [legacyMeeting(LOWER, 'm-1', 'Sans titre')],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/history/rename',
      headers: { ...identityHeaders(UPPER), 'content-type': 'application/json' },
      body: JSON.stringify({ meetingId: 'm-1', title: 'Comité de pilotage' }),
    });
    expect(res.statusCode).toBe(200);
    expect(db.data.get('resume')[0].title).toBe('Comité de pilotage');
  });

  it('une suppression ne touche pas la réunion d un autre compte', async () => {
    const { app, db } = await bootedApp({
      user: [userDoc(LOWER)],
      resume: [legacyMeeting(AUTRE, 'm-1', 'Réunion du voisin')],
    });
    await app.inject({
      method: 'POST',
      url: '/api/history/delete',
      headers: { ...identityHeaders(UPPER), 'content-type': 'application/json' },
      body: JSON.stringify({ meetingId: 'm-1' }),
    });
    expect(db.data.get('resume')).toHaveLength(1);
  });

  it('les nouveaux documents portent emailLower dès l insertion', async () => {
    const { app, db } = buildTestApp({
      seed: { user: [userDoc(UPPER)] },
      openai: { chat: 'Résumé' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/user-config/save',
      headers: { ...identityHeaders(UPPER), 'content-type': 'application/json' },
      body: JSON.stringify({ context: 'Je suis responsable produit.' }),
    });
    expect(db.data.get('userConfig')[0]).toMatchObject({ email: UPPER, emailLower: LOWER });
  });
});

describe('backfillOwnerEmails', () => {
  it('complète les documents métier historiques et reste idempotent', async () => {
    const db = createFakeDb({
      resume: [legacyMeeting(UPPER, 'm-1', 'A'), legacyMeeting(LOWER, 'm-2', 'B')],
      userTemplates: [{ email: UPPER, value: 'compta' }],
      userConfig: [{ email: LOWER, context: 'x' }],
    });
    expect(await backfillOwnerEmails(db, SILENT_LOG)).toBe(4);
    expect(db.data.get('resume').every((d) => d.emailLower === LOWER)).toBe(true);
    expect(db.data.get('userTemplates')[0].emailLower).toBe(LOWER);
    // Rejouable : le second passage ne réécrit rien.
    expect(await backfillOwnerEmails(db, SILENT_LOG)).toBe(0);
  });

  it('ne touche pas aux documents sans email', async () => {
    const db = createFakeDb({ resume: [{ meetingId: 'orphelin', title: 'Sans propriétaire' }] });
    await backfillOwnerEmails(db, SILENT_LOG);
    expect(db.data.get('resume')[0].emailLower).toBeUndefined();
  });
});

describe('OWNED_COLLECTIONS', () => {
  it('couvre toutes les collections par utilisateur connues', async () => {
    // Épingle volontaire plutôt qu'un simple `toContain` : ajouter une
    // collection par utilisateur SANS l'inscrire ici laisse des données
    // derrière une suppression de compte annoncée complète. Ce test échoue
    // alors, et le message dit quoi faire.
    expect([...OWNED_COLLECTIONS].sort()).toEqual([
      // Piste d'audit des envois d'action : porte des adresses de tiers, mais la
      // promesse de suppression complète prime (cf. lib/actions/mailLog.js).
      'actionMailLog',
      // Minutes des réunions supprimées : le quota les garde jusqu'à la fin du
      // mois (cf. lib/quota.js). Elles partent avec le compte.
      'deletedMeetingUsage',
      // Une image par réunion : elle dit ce qui s'y est dit.
      'infographics',
      'resume',
      'userActionSettings',
      'userConfig',
      'userConnections',
      // Héritée : plus aucun code n'y écrit, elle reste couverte par la purge
      // tant qu'elle n'est pas supprimée de la base.
      'userMailAccounts',
      'userTags',
      'userTemplates',
    ]);
  });
});
