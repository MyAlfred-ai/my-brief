/**
 * Destinataires d'un envoi d'action — normalisation, plafond, copie au compte.
 *
 * Module PUR : ni Fastify, ni Mongo, ni réseau. C'est voulu — la règle qui
 * décide qui reçoit un compte rendu doit être lisible et testable en table,
 * pas répartie dans un handler.
 *
 * ── Pourquoi ce module existe ───────────────────────────────────────────────
 * L'envoi ne pouvait historiquement atteindre QUE le titulaire du compte : le
 * destinataire n'était pas un champ du corps, ce qui interdisait à la route de
 * servir de relais. Les destinataires paramétrables lèvent ce garde-fou, et le
 * remplacent par trois compensations qui vivent toutes ici :
 *
 *   1. la liste vient des RÉGLAGES PERSISTÉS de l'utilisateur, jamais d'une
 *      requête d'envoi (cf. l'en-tête de routes/actions/execute.js) ;
 *   2. elle est plafonnée en nombre, avec un plafond dur que l'administration
 *      elle-même ne peut pas dépasser ;
 *   3. le compte connecté est TOUJOURS en copie — personne ne peut faire partir
 *      un document en son nom sans en garder trace dans sa propre boîte.
 */
import { EMAIL_RE } from '../auth/emailPattern.js';

/**
 * Plafond dur. L'administration règle le sien en dessous, jamais au-dessus :
 * au-delà, ce n'est plus un compte rendu envoyé à ses interlocuteurs, c'est une
 * liste de diffusion — et myBrief n'en est pas une.
 */
export const MAX_RECIPIENTS_CEILING = 20;

/** Valeur par défaut du plafond réglable. */
export const DEFAULT_MAX_RECIPIENTS = 10;

/**
 * Caractères qu'une adresse ne peut pas porter.
 *
 * `EMAIL_PATTERN` seul ne suffit pas : il n'interdit ni la virgule, ni les
 * chevrons, ni les guillemets. `a@b.fr,victime` le passe (un seul `@`), et un
 * transport qui joint la liste en une chaîne y verrait deux destinataires. Les
 * parenthèses et crochets sont la syntaxe de commentaire et de littéral d'adresse
 * de la RFC 5322 — aucune adresse réelle n'en porte, et les interpréter serait
 * une surface de plus.
 *
 * Sans drapeau `g` : une expression régulière globale garde son `lastIndex`
 * entre deux `.test()`, et un appel sur deux renverrait faux.
 */
const FORBIDDEN_IN_ADDRESS = /[,;:<>"\\()[\]\s\u0000-\u001f\u007f]/;

/**
 * Normalise une liste d'adresses saisie.
 *
 * Tourne DEUX fois dans la vie d'un réglage, et c'est délibéré : à l'écriture
 * (la route refuse et nomme ce qu'elle rejette) et à la lecture (le résolveur
 * filtre en silence). Un document écrit par une version antérieure, ou modifié
 * directement en base, ne doit pas pouvoir contourner le plafond.
 *
 * @param {unknown} list
 * @param {{max?: number}} [options]
 * @returns {{recipients: string[], rejected: string[], truncated: boolean}}
 */
export function normalizeRecipients(list, { max = DEFAULT_MAX_RECIPIENTS } = {}) {
  const limit = Math.max(0, Math.min(Number(max) || 0, MAX_RECIPIENTS_CEILING));
  const rejected = [];
  const seen = new Set();
  const kept = [];

  for (const raw of Array.isArray(list) ? list : []) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    if (value.length > 320 || FORBIDDEN_IN_ADDRESS.test(value) || !EMAIL_RE.test(value)) {
      rejected.push(value);
      continue;
    }
    // La casse ne distingue pas deux boîtes : la garder ferait passer
    // `DG@client.fr` et `dg@client.fr` pour deux destinataires.
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(normalized);
  }

  return { recipients: kept.slice(0, limit), rejected, truncated: kept.length > limit };
}

/**
 * Destinataires effectifs d'un envoi.
 *
 * Trois couches, dans cet ordre — la première non vide gagne :
 *
 *   1. `tagStored` : la liste du TAG que porte la conversation. Un tag est un
 *      classeur (« Client Acme »), et ses interlocuteurs ne sont pas ceux du
 *      classeur d'à côté ;
 *   2. `stored` : la liste par défaut du compte ;
 *   3. à défaut, le compte connecté seul — le comportement d'avant les
 *      destinataires paramétrables, qui reste le défaut.
 *
 * La liste d'un tag REMPLACE celle du compte, elle ne s'y ajoute pas. C'est la
 * même règle que pour le dossier (cf. `resolveFolder` dans resolve.js) : une
 * destination de tag est un choix explicite, et deux règles qui se cumulent
 * enverraient le compte rendu d'un client aux interlocuteurs d'un autre — le
 * genre de fuite qu'on ne découvre qu'après coup. Les deux écrans le disent.
 *
 * Le compte connecté reste TOUJOURS en copie, quelle que soit la couche : la
 * troisième compensation de l'en-tête de ce fichier ne dépend pas du tag.
 *
 * @param {{stored?: unknown, tagStored?: unknown, account: string, max?: number}} params
 * @returns {{to: string[], cc: string[], source: 'tag'|'user'|'account'}}
 */
export function resolveRecipients({ stored, tagStored, account, max = DEFAULT_MAX_RECIPIENTS }) {
  const self = String(account || '').trim();
  // Le compte en copie, sauf s'il figure déjà parmi les destinataires (un
  // doublon visible ressemble à un bug).
  const copySelf = (list) => (self && !list.includes(self.toLowerCase()) ? [self] : []);

  const { recipients: fromTag } = normalizeRecipients(tagStored, { max });
  if (fromTag.length > 0) {
    return { to: fromTag, cc: copySelf(fromTag), source: 'tag' };
  }

  const { recipients } = normalizeRecipients(stored, { max });
  if (recipients.length === 0) {
    return { to: self ? [self] : [], cc: [], source: 'account' };
  }
  return { to: recipients, cc: copySelf(recipients), source: 'user' };
}
