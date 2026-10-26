/**
 * Jetons à usage unique (OTT) du flux d'authentification mobile.
 *
 * L'app native fait son login dans le NAVIGATEUR SYSTÈME (Google interdit
 * OAuth dans les WebViews embarquées), puis doit récupérer le résultat dans la
 * WebView. Le pont est un OTT déposé dans un deep link `mybrief://…?ott=…`.
 *
 * Un deep link est interceptable : n'importe quelle application installée peut
 * déclarer le même scheme. L'OTT seul ne vaut donc rien — il est lié à un
 * challenge PKCE dont le `verifier` ne quitte jamais l'app légitime.
 *
 * Garanties :
 *   - 32 octets aléatoires (impossible à deviner dans la fenêtre de vie) ;
 *   - TTL court (60 s par défaut) ;
 *   - usage unique, y compris quand la vérification ÉCHOUE : sinon un
 *     intercepteur pourrait réessayer avec d'autres verifiers.
 *
 * Stockage en mémoire, comme le sidecar qu'il remplace : les composes ne
 * lancent qu'une réplique d'`api`, et un redémarrage ne perd qu'une fenêtre de
 * 60 secondes (l'app relance son login).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** @param {string} value @returns {string} SHA-256 en base64url */
export function sha256b64url(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('base64url');
}

/** Comparaison à temps constant de deux chaînes (longueurs comprises). */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Forme du code challenge accepté (base64url d'un SHA-256, ou équivalent) —
 * contrôlée AVANT toute résolution d'identité : inutile d'envoyer quelqu'un se
 * connecter pour lui refuser son jeton au retour.
 */
export const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * @param {{ttlMs?: number, sweepMs?: number, now?: () => number}} [opts]
 * @returns {{issue(cc: string, identity: object): string,
 *            consume(ott: string, verifier: string):
 *              {ok: true, identity: object}|{ok: false, reason: string},
 *            size(): number, stop(): void}}
 */
export function createOttStore({ ttlMs = 60_000, sweepMs = 30_000, now = Date.now } = {}) {
  /** @type {Map<string, {identity: object, cc: string, expiresAt: number}>} */
  const otts = new Map();

  // .unref() indispensable : sans lui le timer garde la boucle d'événements
  // vivante et le process ne s'arrête plus (ni au SIGTERM, ni en fin de test).
  const sweeper = setInterval(() => {
    const t = now();
    for (const [key, entry] of otts) if (entry.expiresAt < t) otts.delete(key);
  }, sweepMs);
  sweeper.unref?.();

  return {
    issue(cc, identity) {
      const ott = randomBytes(32).toString('base64url');
      otts.set(ott, { identity, cc, expiresAt: now() + ttlMs });
      return ott;
    },

    consume(ott, verifier) {
      const entry = ott ? otts.get(ott) : null;
      // Usage unique AVANT toute vérification : un OTT présenté est un OTT
      // brûlé, quel que soit le sort de la vérification qui suit.
      if (ott) otts.delete(ott);

      if (!entry || entry.expiresAt < now()) return { ok: false, reason: 'ott_invalid' };
      if (!verifier || !safeEqual(sha256b64url(verifier), entry.cc)) {
        return { ok: false, reason: 'verifier_mismatch' };
      }
      return { ok: true, identity: entry.identity };
    },

    size() {
      return otts.size;
    },
    stop() {
      clearInterval(sweeper);
      otts.clear();
    },
  };
}
