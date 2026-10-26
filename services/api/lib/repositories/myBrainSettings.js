/**
 * Branchement à myBrain — réglage d'ORGANISATION, `appSettings{key:'myBrain'}`.
 *
 * Trois valeurs, posées par un administrateur (Administration → MyBrain) :
 *   - `url`    : l'adresse du myBrain de l'organisation ;
 *   - `apiKey` : la clé d'application (`mbk_…`) émise par myBrain, droit
 *                « nourrir » ;
 *   - `policy` : qui envoie ses réunions —
 *       `off`    personne (défaut : déployer cette version ne change rien) ;
 *       `optin`  chaque utilisateur choisit, dans « Ma configuration », et rien
 *                ne part tant qu'il n'a pas activé l'envoi ;
 *       `forced` tout le monde, sans interrupteur côté utilisateur.
 *
 * Même collection que les autres réglages d'organisation, module à part pour
 * deux raisons : la clé est SCELLÉE au repos — c'est la seule valeur de
 * `appSettings` qui passe par le coffre (lib/crypto/secretBox.js, clé
 * `CONNECTIONS_ENC_KEY`) —, et repositories/settings.js n'avait pas à grossir
 * d'un domaine qui ne partage rien avec les siens.
 *
 * Pourquoi sceller cette clé-là, quand la clé OpenAI est en clair à côté : une
 * clé myBrain lit TOUT le wiki partagé de l'équipe (droit « lire », souvent
 * coché avec « nourrir ») et y dépose au nom de myBrief. Une copie de la base
 * qui voyage — mongodump, archive de sauvegarde — ne doit pas l'offrir. Sans
 * `CONNECTIONS_ENC_KEY`, elle est stockée en clair, comme les refresh tokens.
 *
 * Aucun secret ne sort de l'API : la projection publique ne porte que
 * `hasKey` et l'aperçu `mbk_AbCd…wxyz` — le MÊME que celui qu'affiche myBrain
 * dans sa liste de clés, pour qu'un administrateur rapproche les deux écrans.
 */
import { SETTINGS_COLLECTION } from './settings.js';

export const MYBRAIN_SETTINGS_KEY = 'myBrain';
export const MYBRAIN_POLICIES = ['off', 'optin', 'forced'];
export const MYBRAIN_URL_MAX = 500;

/** Forme d'une clé émise par myBrain (FORMAT_CLE de cles-applications.ts). */
export const MYBRAIN_KEY_PATTERN = /^mbk_[A-Za-z0-9_-]{32,64}$/;

/**
 * Lie le chiffré à son emplacement : recopié dans un autre document, il ne
 * s'ouvre plus (cf. l'AAD de secretBox.open).
 */
const KEY_AAD = 'appSettings:myBrain';

/** Coffre inerte, pour les appels sans coffre (tests unitaires du dépôt). */
const PLAIN_BOX = {
  seal: (plaintext) => String(plaintext),
  open: (stored) => (typeof stored === 'string' ? stored : ''),
};

/**
 * Adresse de myBrain, normalisée : protocole + hôte (+ chemin de base si
 * myBrain est servi sous un préfixe), sans barre finale.
 *
 * L'URL de l'API telle que myBrain l'affiche à la création d'une clé
 * (`https://…/api/v1`) est ACCEPTÉE : c'est ce que l'administrateur a sous les
 * yeux et copie, lui refuser serait un ticket de support garanti. On en garde
 * la base. Pas d'identifiants dans l'adresse, pas de requête ni d'ancre : elles
 * finiraient dans les journaux, ou dans la clé d'un autre.
 *
 * http:// reste admis : une installation sur site joint son myBrain par le
 * réseau interne (`http://mybrain:3000`). La clé voyage dans un en-tête — c'est
 * à l'administrateur de ne pas l'exposer sur un réseau ouvert.
 *
 * @param {string} raw
 * @returns {{url: string, problem: string}}
 */
export function normalizeMyBrainUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { url: '', problem: '' };
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { url: '', problem: 'mybrain_url_invalid' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { url: '', problem: 'mybrain_url_invalid' };
  }
  if (parsed.username || parsed.password) return { url: '', problem: 'mybrain_url_invalid' };
  const path = parsed.pathname
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/i, '')
    .replace(/\/+$/, '');
  const url = `${parsed.protocol}//${parsed.host}${path}`;
  if (url.length > MYBRAIN_URL_MAX) return { url: '', problem: 'mybrain_url_invalid' };
  return { url, problem: '' };
}

/**
 * Clé collée depuis la carte « Clé créée » de myBrain : espaces, retour à la
 * ligne, parfois l'en-tête entier (`Bearer mbk_…`). Une clé qui n'a pas la
 * forme d'une clé myBrain est refusée ICI, avant tout appel réseau.
 *
 * @param {string} raw
 * @returns {{key: string, problem: string}}
 */
export function normalizeMyBrainKey(raw) {
  const value = String(raw ?? '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!value) return { key: '', problem: '' };
  if (!MYBRAIN_KEY_PATTERN.test(value)) return { key: value, problem: 'mybrain_key_malformed' };
  return { key: value, problem: '' };
}

/** Aperçu d'une clé — la forme exacte de l'« apercu » de myBrain. */
export function myBrainKeyHint(key) {
  const value = String(key || '');
  if (!value) return '';
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

/**
 * La connexion est-elle utilisable, et quelqu'un doit-il envoyer ?
 * @param {{url?: string, apiKey?: string, policy?: string}} settings - cf. get()
 */
export function isMyBrainActive(settings) {
  return !!(settings?.url && settings?.apiKey) && settings.policy !== 'off';
}

/**
 * Réglages lisibles, clé OUVERTE — usage serveur uniquement.
 *
 * Une clé scellée qui ne s'ouvre plus (coffre changé, document recopié) rend
 * `apiKey: ''` et `keyUnreadable: true` : la connexion est alors « à
 * reconfigurer », jamais tentée avec une clé vide.
 */
function readDoc(doc, box) {
  const stored = doc?.apiKey;
  const apiKey = stored ? box.open(stored, KEY_AAD) : '';
  const verified = doc?.verified && typeof doc.verified === 'object' ? doc.verified : null;
  return {
    url: typeof doc?.url === 'string' ? doc.url : '',
    apiKey,
    keyHint: typeof doc?.keyHint === 'string' ? doc.keyHint : '',
    keyUnreadable: !!stored && !apiKey,
    policy: MYBRAIN_POLICIES.includes(doc?.policy) ? doc.policy : 'off',
    verified: verified
      ? {
          application: String(verified.application || ''),
          droits: Array.isArray(verified.droits) ? verified.droits.map(String) : [],
          publicUrl: String(verified.publicUrl || ''),
          at: verified.at || null,
        }
      : null,
    // Depuis quand l'installation envoie, sous sa politique actuelle — cf. update().
    // À défaut (document antérieur), la dernière écriture du réglage : jamais
    // « depuis toujours », qui rendrait l'envoi rétroactif.
    activeSince: doc?.activeSince || doc?.updatedAt || null,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
}

/**
 * Projection d'ADMINISTRATION — le seul point à relire pour savoir ce qui sort.
 * La clé n'y figure jamais, seulement son existence et son aperçu.
 *
 * @param {ReturnType<typeof readDoc>} settings
 */
export function toPublicMyBrainSettings(settings) {
  return {
    url: settings.url,
    hasKey: !!settings.keyHint,
    keyHint: settings.keyHint,
    keyUnreadable: settings.keyUnreadable,
    policy: settings.policy,
    configured: !!(settings.url && settings.apiKey),
    active: isMyBrainActive(settings),
    // Ce que myBrain a répondu au dernier test réussi : sous quel nom la clé
    // signe ses dépôts, et avec quels droits.
    application: settings.verified?.application || '',
    droits: settings.verified?.droits || [],
    publicUrl: settings.verified?.publicUrl || '',
    verifiedAt: settings.verified?.at || null,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

/**
 * @param {object} db
 * @param {{seal: Function, open: Function}} [secretBox] - le coffre de l'app
 */
export function createMyBrainSettingsRepo(db, secretBox = PLAIN_BOX) {
  const settings = () => db.collection(SETTINGS_COLLECTION);

  return {
    toPublic: toPublicMyBrainSettings,

    /** @returns {Promise<ReturnType<typeof readDoc>>} clé incluse — usage serveur uniquement */
    async get() {
      return readDoc(await settings().findOne({ key: MYBRAIN_SETTINGS_KEY }), secretBox);
    },

    /**
     * Même contrat que les autres réglages d'organisation : champ ABSENT =
     * inchangé, champ présent mais VIDE = retiré (`apiKey: ''` débranche).
     * Revalidé ici en plus de la route : ce dépôt est appelé par les tests, il
     * ne peut pas dépendre d'une validation qui vit ailleurs.
     *
     * `verified` : ce que myBrain a répondu au test de la connexion, `null`
     * pour l'oublier (connexion changée sans être revérifiée).
     *
     * `activeSince` — l'envoi n'est JAMAIS rétroactif : seules partent les
     * réunions commencées après ce moment (cf. lib/myBrain/feed.js). Il est
     * reposé quand l'envoi DEVIENT actif (connexion rétablie, politique rouverte)
     * et à chaque changement de politique — passer de « au choix » à « imposé »
     * ne doit pas emporter les réunions de ceux qui n'avaient rien demandé.
     * Changer seulement de clé ou d'adresse (rotation) ne le touche pas.
     *
     * @param {{url?: string, apiKey?: string, policy?: string}} patch
     * @param {{actor?: string|null, verified?: object|null}} [context]
     */
    async update({ url, apiKey, policy } = {}, { actor = null, verified } = {}) {
      const current = await this.get();
      const now = new Date().toISOString();
      const next = { updatedAt: now, updatedBy: actor };
      if (url !== undefined) {
        const normalized = normalizeMyBrainUrl(url);
        if (normalized.problem) throw new Error(`adresse myBrain invalide: ${url}`);
        next.url = normalized.url;
      }
      if (apiKey !== undefined) {
        const normalized = normalizeMyBrainKey(apiKey);
        if (normalized.problem) throw new Error('clé myBrain mal formée');
        next.apiKey = normalized.key ? secretBox.seal(normalized.key, KEY_AAD) : '';
        next.keyHint = myBrainKeyHint(normalized.key);
      }
      if (policy !== undefined) {
        if (!MYBRAIN_POLICIES.includes(policy))
          throw new Error(`politique myBrain inconnue: ${policy}`);
        next.policy = policy;
      }
      if (verified !== undefined) next.verified = verified;

      const after = {
        url: next.url ?? current.url,
        apiKey: apiKey === undefined ? current.apiKey : normalizeMyBrainKey(apiKey).key,
        policy: next.policy ?? current.policy,
      };
      const becameActive = isMyBrainActive(after) && !isMyBrainActive(current);
      const policyChanged = next.policy !== undefined && next.policy !== current.policy;
      if (becameActive || (isMyBrainActive(after) && policyChanged)) next.activeSince = now;

      await settings().updateOne(
        { key: MYBRAIN_SETTINGS_KEY },
        { $set: next, $setOnInsert: { key: MYBRAIN_SETTINGS_KEY, createdAt: now } },
        { upsert: true },
      );
      return this.get();
    },

    /**
     * Le résultat d'un test réussi, SEUL : tester n'est pas modifier, et
     * « Enregistré par » doit rester l'auteur du réglage, pas du dernier test.
     * @param {object|null} verified
     */
    async saveVerification(verified) {
      await settings().updateOne({ key: MYBRAIN_SETTINGS_KEY }, { $set: { verified } });
      return this.get();
    },
  };
}
