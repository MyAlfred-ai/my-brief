/**
 * Hachage et politique de mot de passe — scrypt de `node:crypto`.
 *
 * Pourquoi scrypt et pas bcrypt/argon2 : l'image est `node:22-alpine`. bcrypt
 * est un addon natif (node-gyp + python3 + build-base : image qui triple,
 * builds CI fragiles) et @node-rs/argon2 dépend de binaires optionnels par
 * plateforme (linux-x64-musl / arm64-musl), risqué pour le déploiement on-prem.
 * scrypt est dans le runtime, asynchrone (threadpool libuv, il ne bloque pas
 * l'event loop) et ne coûte aucune dépendance.
 *
 * Le hash stocké est auto-descriptif — les paramètres voyagent avec lui, donc
 * on pourra les durcir plus tard sans invalider les mots de passe existants :
 *   scrypt$N=16384,r=8,p=1$<selB64url>$<cléB64url>
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * N=16384 → mémoire 128*N*r = 16 Mio, sous la limite `maxmem` par défaut
 * (32 Mio). Passer à N=32768 demanderait 33,5 Mio et jetterait
 * ERR_CRYPTO_INVALID_SCRYPT_PARAMS : on fixe maxmem explicitement pour que le
 * jour où on durcit les paramètres, ça ne casse pas silencieusement.
 */
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 10;
/** Borne haute : scrypt hache l'entrée entière, une saisie de 1 Mo serait un DoS gratuit. */
export const MAX_PASSWORD_LENGTH = 200;

/**
 * Liste courte des mots de passe les plus utilisés. Pas une protection sérieuse
 * (c'est le rôle de la longueur minimale), juste un garde-fou contre les
 * classiques absolus. NIST 800-63B recommande cette approche plutôt que des
 * règles de composition (majuscule + chiffre + symbole), qui produisent des
 * mots de passe faibles ET impossibles à retenir.
 */
const BANNED = new Set([
  'password',
  'motdepasse',
  'azertyuiop',
  'qwertyuiop',
  '1234567890',
  'motdepasse1',
  'password1',
  'password123',
  'azerty123',
  'qwerty123',
  'administrator',
  'letmein123',
  'welcome123',
  'iloveyou123',
  'changeme123',
  'mybrief123',
  'myalfred123',
]);

function b64url(buf) {
  return buf.toString('base64url');
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    const { keylen, ...params } = SCRYPT_PARAMS;
    scrypt(password, salt, keylen, params, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/**
 * @param {string} password
 * @returns {Promise<string>} hash auto-descriptif
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$N=${N},r=${r},p=${p}$${b64url(salt)}$${b64url(key)}`;
}

/** @returns {{N:number,r:number,p:number,salt:Buffer,key:Buffer}|null} */
function parseHash(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return null;
  const params = {};
  for (const pair of parts[1].split(',')) {
    const [k, v] = pair.split('=');
    const n = Number.parseInt(v, 10);
    if (!Number.isInteger(n) || n <= 0) return null;
    params[k] = n;
  }
  if (!params.N || !params.r || !params.p) return null;
  try {
    return {
      ...params,
      salt: Buffer.from(parts[2], 'base64url'),
      key: Buffer.from(parts[3], 'base64url'),
    };
  } catch {
    return null;
  }
}

/**
 * Vérifie un mot de passe. Ne jette jamais : un hash corrompu en base doit
 * refuser la connexion, pas provoquer un 500.
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  try {
    const key = await new Promise((resolve, reject) => {
      scrypt(
        password,
        parsed.salt,
        parsed.key.length,
        { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: SCRYPT_PARAMS.maxmem },
        (err, out) => (err ? reject(err) : resolve(out)),
      );
    });
    return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
  } catch {
    return false;
  }
}

/**
 * Hash « bidon » servant à égaliser le temps de réponse de /login quand le
 * compte n'existe pas. Sans ça, l'écart de latence (~60 ms avec vérification
 * contre ~0 ms sans) est un oracle d'énumération d'utilisateurs exploitable.
 *
 * Calculé paresseusement une seule fois : sa valeur n'a aucune importance,
 * seul son coût compte.
 * @returns {Promise<string>}
 */
let dummyHashPromise = null;
export function dummyHash() {
  dummyHashPromise ??= hashPassword(b64url(randomBytes(24)));
  return dummyHashPromise;
}

/** Brûle le même temps CPU qu'une vérification réelle, puis renvoie false. */
export async function burnVerify(password) {
  await verifyPassword(typeof password === 'string' ? password : '', await dummyHash());
  return false;
}

/**
 * Politique de mot de passe. S'applique au changement volontaire, au reset et
 * à la création par un admin — mais PAS au compte de bootstrap, dont le mot de
 * passe est volontairement hors politique et forcé au changement.
 *
 * @param {string} password
 * @param {{email?: string}} [ctx]
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function checkPasswordPolicy(password, { email = '' } = {}) {
  if (typeof password !== 'string' || password.length === 0)
    return { ok: false, reason: 'required' };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'too_short' };
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, reason: 'too_long' };

  const lower = password.toLowerCase();
  if (BANNED.has(lower)) return { ok: false, reason: 'too_common' };

  const localPart = String(email).split('@')[0].toLowerCase();
  if (localPart.length >= 3 && lower.includes(localPart))
    return { ok: false, reason: 'contains_email' };

  return { ok: true };
}

/**
 * Mot de passe temporaire lisible, pour le reset admin sans saisie.
 * base64url exclut les caractères ambigus des jeux alphanumériques classiques
 * (pas de confusion possible à la lecture entre `-` et `_`, contrairement à
 * O/0 ou l/1 d'un alphabet complet).
 * @param {number} [bytes]
 */
export function generatePassword(bytes = 12) {
  return b64url(randomBytes(bytes));
}
