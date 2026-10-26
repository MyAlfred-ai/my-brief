/**
 * États OAuth en vol (collection `authOAuthState`).
 *
 * Chaque démarrage de flux crée un document court : le `state` anti-CSRF et le
 * `code_verifier` PKCE, qui doit survivre à la redirection vers Google sans
 * jamais transiter par le navigateur.
 *
 * Le `state` est en plus déposé dans un cookie de courte durée. Au retour, on
 * exige l'égalité des trois : URL, cookie, base. Sans le cookie, un attaquant
 * pourrait faire consommer SON code d'autorisation par la victime (login CSRF)
 * et la connecter silencieusement sur le compte de l'attaquant.
 *
 * Même mécanique que lib/auth/resetTokens.js : usage unique garanti par un
 * findOneAndUpdate atomique.
 */
import { randomBytes } from 'node:crypto';

export const OAUTH_STATE_COLLECTION = 'authOAuthState';

/**
 * ⚠️ Nom FIXE, câblé dans les deux composes : le routeur du callback Entra
 * matche `HeadersRegexp(Cookie, (^|;\s*)mybrief_oauth=)` pour distinguer le flux
 * natif de celui du plugin Traefik, qui partagent la même URI de redirection
 * `/oauth2/callback`. Le renommer sans toucher les composes enverrait tous les
 * retours d'Entra au plugin, qui ne reconnaîtrait pas leur `state`.
 *
 * Ce cookie sert à DEUX flux, distingués par leur marqueur en base : le login
 * Entra et la connexion d'un compte Microsoft, qui doivent tous deux revenir
 * sur cette URI (cf. lib/connections/providers.js et routes/oauth2.js).
 *
 * Il doit rester SameSite=Lax (défaut de serializeCookie) : le retour de l'IdP
 * est une navigation GET top-level cross-site, `Strict` ne l'accompagnerait pas.
 */
export const OAUTH_STATE_COOKIE = 'mybrief_oauth';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export function createOAuthStateStore(db, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const states = () => db.collection(OAUTH_STATE_COLLECTION);

  return {
    ttlMs,

    /**
     * `provider` est relu au retour : un state émis pour Google ne doit pas
     * pouvoir être présenté sur le callback Entra, sinon un code obtenu chez
     * l'un serait échangé chez l'autre.
     *
     * `meta` : charge utile propre au flux (ex. le compte qui a INITIÉ la
     * connexion d'un compte externe, cf. routes/connect.js). Transite par la
     * base, jamais par l'IdP ni le navigateur.
     * @param {{codeVerifier: string, redirectUri: string, provider?: string, ip?: string,
     *          meta?: object|null}} payload
     * @returns {Promise<{state: string, expiresAt: Date}>}
     */
    async issue({
      codeVerifier,
      redirectUri,
      provider = 'google',
      next = '/',
      ip = null,
      meta = null,
    }) {
      const state = randomBytes(24).toString('base64url');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);
      await states().insertOne({
        state,
        codeVerifier,
        redirectUri,
        provider,
        next,
        ip,
        meta,
        createdAt: now,
        expiresAt,
        usedAt: null,
      });
      return { state, expiresAt };
    },

    /**
     * Flux auquel appartient un state, SANS le consommer.
     *
     * Sert au seul endroit où deux flux partagent une URI de redirection :
     * `/oauth2/callback` reçoit à la fois le login Entra et la connexion d'un
     * compte Microsoft, et doit savoir lequel traiter avant de le traiter
     * (cf. routes/oauth2.js). L'usage unique reste garanti par `consume`, que
     * le handler retenu appelle ensuite ; lire le marqueur ne révèle rien au
     * client, qui a déjà le state en main.
     *
     * @returns {Promise<string>} marqueur de flux, chaîne vide si inconnu
     */
    async peekProvider(state) {
      if (!state) return '';
      const doc = await states().findOne(
        { state, usedAt: null, expiresAt: { $gt: new Date() } },
        { projection: { provider: 1 } },
      );
      return doc?.provider || '';
    },

    /**
     * Consommation atomique : un rejeu du même `state` ne peut pas réussir deux
     * fois, même en concurrence. Le contrôle d'`expiresAt` double l'index TTL,
     * que Mongo n'applique qu'une fois par minute.
     * @returns {Promise<{codeVerifier: string, redirectUri: string, provider: string}|null>}
     */
    async consume(state) {
      if (!state) return null;
      const doc = await states().findOneAndUpdate(
        { state, usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (!doc) return null;
      return {
        codeVerifier: doc.codeVerifier,
        redirectUri: doc.redirectUri,
        // Documents émis avant l'ajout du champ : c'était forcément Google.
        provider: doc.provider || 'google',
        // Le `next` transite par la BASE, jamais par l'IdP : il n'est donc pas
        // manipulable entre le départ et le retour du flux.
        next: doc.next || '/',
        meta: doc.meta || null,
      };
    },
  };
}
