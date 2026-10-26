/**
 * Piste d'audit des envois d'action (collection `actionMailLog`).
 *
 * Elle existe parce que le garde-fou a été levé : un envoi pouvait autrefois
 * n'atteindre que le titulaire du compte, il peut désormais atteindre des tiers.
 * L'exploitant doit pouvoir répondre à « ce compte a écrit à qui, et quand »
 * des semaines plus tard — les journaux d'un conteneur, eux, sont éphémères.
 *
 * ── Ce qui n'y est PAS ─────────────────────────────────────────────────────
 * Ni le contenu du document, ni la pièce jointe. Ce sont les données de réunion
 * de l'utilisateur ; une piste d'audit qui les recopierait serait une seconde
 * copie de tout ce que myBrief traite, conservée trois mois, hors de portée de
 * l'écran qui les affiche.
 *
 * ── Rétention et purge ─────────────────────────────────────────────────────
 * Index TTL de 90 jours (lib/bootstrap.js). La collection figure dans
 * `OWNED_COLLECTIONS` : supprimer un compte efface aussi sa piste d'audit. C'est
 * une tension assumée — le dépôt promet une suppression complète, et cette
 * promesse-là prime.
 */

export const MAIL_LOG_COLLECTION = 'actionMailLog';

/** 90 jours. Assez pour une réclamation, pas assez pour constituer un fichier. */
export const MAIL_LOG_TTL_SECONDS = 90 * 24 * 3600;

/**
 * Consigne une tentative d'envoi — réussie ou non.
 *
 * N'échoue JAMAIS vers l'appelant : le mail est déjà parti quand on arrive ici,
 * et faire échouer la réponse parce que la trace n'a pas pu s'écrire ferait
 * croire à l'utilisateur que son envoi n'a pas eu lieu. L'incident part dans les
 * journaux.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{user: object, kind: string, via: string, from?: string,
 *   to?: string[], cc?: string[], subject?: string, ok: boolean,
 *   error?: string|null, degraded?: string|null,
 *   log?: {warn: Function, info: Function}}} entry
 */
export async function recordMailAttempt(app, entry) {
  const log = entry.log || { warn() {}, info() {} };
  const record = {
    emailLower: entry.user.emailLower,
    kind: entry.kind,
    via: entry.via,
    from: entry.from || '',
    to: entry.to || [],
    cc: entry.cc || [],
    subject: entry.subject || '',
    ok: !!entry.ok,
    error: entry.error || null,
    degraded: entry.degraded || null,
    at: new Date(),
  };

  // Journal applicatif : le seul endroit qui se voit en direct pendant un
  // incident. Ni le contenu, ni le titre — c'est de la donnée de réunion.
  log.info(
    {
      actor: record.emailLower,
      kind: record.kind,
      via: record.via,
      toCount: record.to.length,
      ccCount: record.cc.length,
      ok: record.ok,
      ...(record.degraded ? { degraded: record.degraded } : {}),
    },
    "envoi d'action",
  );

  try {
    await app.db.collection(MAIL_LOG_COLLECTION).insertOne(record);
  } catch (err) {
    log.warn({ err: err.message }, "trace d'envoi non enregistrée");
  }
}
