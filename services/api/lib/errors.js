/**
 * Contrat d'erreur des routes ajoutées avec l'authentification native.
 *
 * Les routes héritées de n8n renvoient certaines erreurs de validation en HTTP
 * 200 avec `{ok:false, error}` — comportement volontaire et documenté dans
 * routes/templates.js, dont le frontend dépend. On ne l'étend pas : les
 * nouvelles routes utilisent de vrais codes HTTP.
 *
 *   succès : 200 {…} · 201 {…} · 202 {ok:true} · 204 (vide)
 *   erreur : <code> { error: '<slug stable>', message?, fields? }
 *
 * `error` est un slug stable que le frontend mappe vers une chaîne i18n :
 * aucune chaîne affichable à l'utilisateur ne vient du serveur.
 */

/**
 * @param {import('fastify').FastifyReply} reply
 * @param {number} status
 * @param {string} code
 * @param {object} [extra]
 */
export function fail(reply, status, code, extra = {}) {
  return reply.code(status).send({ error: code, ...extra });
}

export const unauthenticated = (reply, extra) => fail(reply, 401, 'unauthenticated', extra);
export const forbidden = (reply, extra) => fail(reply, 403, 'forbidden', extra);

/**
 * Error handler RACINE (posé par app.js sur toute l'application).
 *
 * Avant lui, seuls /api/auth, /api/admin et /api/actions normalisaient leurs
 * erreurs (trois copies du même bloc) ; core, ai, meetings, templates et mail
 * retombaient sur le défaut Fastify — qui relaie `err.message` dans le corps
 * du 500, hors contrat et potentiellement bavard (chemin, détail Mongo…).
 *
 * Deux cas :
 *   - erreur de validation ajv → 400 { error:'invalid_body', fields } ;
 *   - tout le reste → statut conservé s'il est < 500 (413 multipart, 415…),
 *     sinon 500, corps { error:'internal_error' }. Le détail part dans les
 *     logs serveur, jamais dans la réponse.
 *
 * Les UpstreamError OpenAI n'arrivent pas ici : les routes qui appellent
 * OpenAI les relaient verbatim via replyUpstreamError (le frontend inspecte
 * ce corps pour distinguer « crédit épuisé »).
 */
export function slugErrorHandler(err, req, reply) {
  if (err.validation) {
    return reply.code(400).send({
      error: 'invalid_body',
      fields: err.validation.map((v) => v.instancePath || v.params?.missingProperty || ''),
    });
  }
  req.log?.error({ err }, 'erreur non gérée');
  return reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({
    error: 'internal_error',
  });
}
