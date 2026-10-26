/**
 * Chiffrement des refresh tokens de connexion, au repos.
 *
 * ── Ce que ça protège, et ce que ça ne protège pas ─────────────────────────
 * L'objection classique est juste : chiffrer avec une clé rangée dans la même
 * base ne protège de rien. C'est pourquoi la clé ne vient PAS de la base — elle
 * vient de l'environnement du déploiement (`CONNECTIONS_ENC_KEY`).
 *
 * La menace visée est donc précise : une COPIE DE LA BASE séparée de son
 * environnement — un `mongodump`, une archive de `backup.sh`, un volume Docker
 * récupéré, une sauvegarde qui voyage. Sans la clé, un refresh token y devient
 * inexploitable. Et un refresh token n'est pas une donnée comme une autre :
 * c'est le pouvoir d'écrire depuis la boîte d'une personne, renouvelable
 * indéfiniment et invisible pour elle.
 *
 * Ça ne protège de rien d'autre. Qui lit l'environnement du conteneur lit la
 * clé ; ce n'est pas la question posée.
 *
 * ── Compatibilité ascendante ───────────────────────────────────────────────
 * Les connexions existantes sont en clair. Elles continuent de fonctionner et
 * sont re-scellées à leur prochaine écriture (reconnexion, rotation du jeton).
 * Aucune reconnexion n'est imposée à qui que ce soit : ce serait faire payer à
 * tous les utilisateurs une amélioration qu'ils ne voient pas.
 *
 * ── Clé absente ────────────────────────────────────────────────────────────
 * Rien ne casse : on écrit en clair, comme avant. Même contrat que `SMTP_HOST`
 * vide pour le mailer — une variable non posée désactive proprement, elle
 * n'empêche pas de démarrer.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
/** 96 bits : taille nominale du GCM, la seule qui évite un re-hachage du nonce. */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 1;

const noopLogger = { info() {}, warn() {} };

/**
 * Accepte base64 ou hexadécimal : le premier est ce que produit
 * `openssl rand -base64 32`, le second `openssl rand -hex 32`. Refuser l'un des
 * deux ne protégerait de rien et garantirait un ticket de support.
 *
 * @param {string|undefined} raw
 * @returns {{key: Buffer|null, problem: string}}
 */
export function parseKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return { key: null, problem: '' };

  let buf;
  if (/^[0-9a-f]{64}$/i.test(value)) {
    buf = Buffer.from(value, 'hex');
  } else {
    buf = Buffer.from(value, 'base64');
    // `Buffer.from` ignore SILENCIEUSEMENT les caractères invalides : une clé
    // tronquée ou mal collée passerait si on ne vérifiait que la longueur.
    if (buf.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
      return { key: null, problem: 'not_base64_or_hex' };
    }
  }

  if (buf.length !== KEY_BYTES) {
    return { key: null, problem: `expected_${KEY_BYTES}_bytes_got_${buf.length}` };
  }
  return { key: buf, problem: '' };
}

/** Reconnaît une enveloppe produite par ce module — le reste est du clair hérité. */
export function isSealed(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    value.v === VERSION &&
    typeof value.iv === 'string' &&
    typeof value.tag === 'string' &&
    typeof value.data === 'string'
  );
}

/** Coffre inerte : écrit et relit en clair, exactement comme avant. */
const DISABLED = {
  enabled: false,
  seal: (plaintext) => String(plaintext),
  open: (stored) => (typeof stored === 'string' ? stored : ''),
};

/**
 * @param {string} [rawKey] - `config.connections.encryptionKey`
 * @param {{info: Function, warn: Function}} [log]
 * @returns {{enabled: boolean, seal: Function, open: Function}}
 */
export function createSecretBox(rawKey, log = noopLogger) {
  const { key, problem } = parseKey(rawKey);

  if (!key) {
    if (problem) {
      // Une clé POSÉE mais invalide est une erreur de déploiement, pas un
      // choix : elle se désactive comme l'absence, mais en le criant.
      log.warn(
        `[api] CONNECTIONS_ENC_KEY invalide (${problem}) — refresh tokens stockés en clair. ` +
          'Attendu : 32 octets en base64 ou hexadécimal (openssl rand -base64 32).',
      );
    }
    return DISABLED;
  }

  return {
    enabled: true,

    /**
     * @param {string} plaintext
     * @param {string} [aad] - lie le chiffré à sa ligne (cf. `open`)
     * @returns {{v: number, iv: string, tag: string, data: string}}
     */
    seal(plaintext, aad = '') {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGO, key, iv);
      if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
      const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
      return {
        v: VERSION,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
      };
    },

    /**
     * Ouvre une enveloppe, ou rend tel quel un clair hérité.
     *
     * L'AAD lie le chiffré à son propriétaire : déplacer un document d'un compte
     * à un autre — le seul geste utile à qui sait écrire dans Mongo sans
     * connaître la clé — casse le déchiffrement au lieu d'offrir la boîte de la
     * victime.
     *
     * @param {object|string} stored
     * @param {string} [aad]
     * @returns {string} le jeton, ou '' si l'enveloppe est illisible
     */
    open(stored, aad = '') {
      // Connexion antérieure au chiffrement : elle doit continuer de marcher.
      if (typeof stored === 'string') return stored;
      if (!isSealed(stored)) return '';

      try {
        const tag = Buffer.from(stored.tag, 'base64');
        if (tag.length !== TAG_BYTES) return '';
        const decipher = createDecipheriv(ALGO, key, Buffer.from(stored.iv, 'base64'));
        if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
        decipher.setAuthTag(tag);
        return Buffer.concat([
          decipher.update(Buffer.from(stored.data, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Clé changée, document altéré, ou déplacé d'un compte à un autre. Les
        // trois appellent la même réponse — une reconnexion — et le dépôt la
        // produit en rendant une connexion absente (cf. repositories/connections.js).
        return '';
      }
    },
  };
}
