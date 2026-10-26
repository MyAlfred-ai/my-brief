/**
 * « Rédiger dans ma messagerie » (mobile) : un mail prêt à relire, ouvert dans
 * l'application de messagerie du téléphone par un lien `mailto:`.
 *
 * Pourquoi en plus de « Envoyer via le tag » : l'envoi automatique part tel
 * quel, aux destinataires décidés par le serveur. Ici l'utilisateur relit le
 * texte, ajoute un interlocuteur de passage, écrit deux mots d'introduction —
 * et c'est SA messagerie qui envoie. Aucun relais du serveur n'intervient :
 * les garde-fous de `/api/actions/email` (destination jamais tirée de la
 * requête, plafond, piste d'audit) n'ont rien à protéger, l'utilisateur voit
 * tout avant d'envoyer.
 *
 * Les destinataires sont PRÉ-REMPLIS avec ceux qu'aurait choisis l'envoi
 * automatique : la liste du tag de la réunion, sinon la liste par défaut —
 * même règle que `resolveRecipients` (services/api/lib/actions/resolve.js),
 * reprise ici pour l'affichage et le brouillon. Le compte de l'utilisateur
 * n'est pas ajouté en copie : c'est lui qui envoie. L'objet suit la même
 * chaîne que l'envoi automatique : gabarit personnel, sinon celui de
 * l'organisation, sinon l'objet intégré.
 *
 * Pas de pièce jointe : un `mailto:` ne sait pas en porter. Le document va
 * dans le corps, en texte — le résumé est converti depuis le HTML de
 * l'éditeur (titres, listes à puces et numérotées conservés).
 */
import { renderSubjectTemplate } from './filename.js';

/**
 * Au-delà, le corps est coupé. Un lien `mailto:` voyage dans une URL : les
 * messageries mobiles tronquent ou refusent les très longues (une heure de
 * transcription dépasse 50 000 caractères, trois fois plus une fois encodée).
 * Un résumé tient toujours ; une transcription d'une demi-heure aussi.
 */
export const MAILTO_BODY_MAX = 20000;

/**
 * Motif PERMISSIF d'une adresse saisie (réglages, fenêtre « Et maintenant ? ») :
 * il écarte les fautes de frappe et les listes collées (`a@b.fr,c@d.fr`), la
 * règle stricte vit au serveur.
 */
const LOOKS_LIKE_EMAIL = /^[^@\s,;:<>"\\()[\]]+@[^@\s,;:<>"\\()[\]]+\.[^@\s,;:<>"\\()[\]]+$/;

/** @param {string} value */
export const looksLikeEmail = (value) => LOOKS_LIKE_EMAIL.test(String(value || '').trim());

/** Éléments qui, hors d'une puce, s'entourent d'une ligne vide. */
const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'TR']);

/** La ligne ne porte encore que sa puce (« • » ou « 3. »). */
const onlyMarker = (line) => /^\s*(•|\d+\.) $/.test(line);

/**
 * HTML de l'éditeur → texte lisible dans un mail. Titres et paragraphes
 * séparés d'une ligne vide ; listes en « • » ou « 1. », indentées par niveau.
 * TipTap met un paragraphe dans chaque puce : il reste sur la ligne de la puce.
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const lines = [];
  let line = '';

  const endLine = () => {
    if (line.trim() && !onlyMarker(line)) lines.push(line.replace(/\s+$/, ''));
    line = '';
  };
  const gap = () => {
    endLine();
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
  };
  const text = (value) => {
    let chunk = value.replace(/\s+/g, ' ');
    if (!line.trim() || onlyMarker(line)) chunk = chunk.replace(/^ /, '');
    line += chunk;
  };

  function list(node, depth) {
    if (depth === 0) gap();
    else endLine();
    const items = [...node.children].filter((child) => child.nodeName === 'LI');
    items.forEach((item, i) => {
      endLine();
      line = `${'  '.repeat(depth)}${node.nodeName === 'OL' ? `${i + 1}.` : '•'} `;
      item.childNodes.forEach((child) => walk(child, depth + 1, true));
      endLine();
    });
    if (depth === 0) gap();
  }

  function walk(node, depth, inItem) {
    if (node.nodeType === 3) return text(node.nodeValue);
    if (node.nodeType !== 1) return;
    const tag = node.nodeName;
    if (tag === 'BR') return endLine();
    if (tag === 'UL' || tag === 'OL') return list(node, depth);
    if (tag === 'HR') {
      gap();
      lines.push('———', '');
      return;
    }
    const block = BLOCKS.has(tag);
    // Deux paragraphes dans une même puce : séparés d'une espace, pas collés.
    if (block && inItem && line.trim() && !onlyMarker(line)) line += ' ';
    if (block && !inItem) gap();
    node.childNodes.forEach((child) => walk(child, depth, inItem));
    if (block && !inItem) gap();
  }

  doc.body.childNodes.forEach((child) => walk(child, 0, false));
  endLine();
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Destinataires qu'aurait choisis l'envoi automatique : la liste du tag s'il en
 * porte une, sinon la liste par défaut de l'utilisateur.
 *
 * @param {{mail?: {recipients?: string[], tagRecipients?: {tagId: string,
 *   recipients: string[]}[]}}|null} settings - réglages d'actions (stores/actionSettings.js)
 * @param {string|null} tagId - tag de la réunion
 * @returns {{source: 'tag'|'user', recipients: string[]}}
 */
export function draftRecipients(settings, tagId) {
  const tagList = tagId
    ? (settings?.mail?.tagRecipients || []).find((entry) => entry.tagId === tagId)?.recipients
    : null;
  if (tagList?.length) return { source: 'tag', recipients: [...tagList] };
  return { source: 'user', recipients: [...(settings?.mail?.recipients || [])] };
}

/**
 * Le dépôt suivra-t-il une règle du tag ? Même ordre que `resolveFolder`
 * (resolve.js) : destination propre au tag, sinon sous-dossier au nom du tag.
 *
 * @param {{storage?: {tagFolders?: {tagId: string, folder?: string,
 *   driveId?: string}[], tagSubfolders?: boolean}}|null} settings
 * @param {string|null} tagId
 * @returns {boolean}
 */
export function storageFollowsTag(settings, tagId) {
  if (!tagId) return false;
  const mapped = (settings?.storage?.tagFolders || []).find((entry) => entry.tagId === tagId);
  return !!(mapped?.folder || mapped?.driveId) || !!settings?.storage?.tagSubfolders;
}

/**
 * Objet du brouillon — même ordre que `resolveActionContext` (resolve.js) :
 * gabarit personnel, sinon celui de l'organisation, sinon l'objet intégré.
 * Le serveur ne voit jamais ce mail : le gabarit se développe donc ici.
 *
 * @param {{settings?: {mail?: {subjectTemplate?: string}},
 *   defaults?: {subjectTemplate?: string}}|null} state - stores/actionSettings.js
 * @param {{titre: string, date: string, type: string, compte: string}} vars
 * @param {string} builtin - objet intégré, dans la langue de l'écran
 * @returns {string}
 */
export function draftSubject(state, vars, builtin) {
  const template = state?.settings?.mail?.subjectTemplate || state?.defaults?.subjectTemplate;
  return renderSubjectTemplate(template, vars) || builtin;
}

/** Une adresse dans la partie « à » d'un mailto : l'arobase reste lisible. */
const encodeAddress = (address) => encodeURIComponent(address.trim()).replace(/%40/g, '@');

/**
 * @param {{to?: string[], subject: string, body: string, truncatedNote?: string,
 *   max?: number}} draft
 * @returns {{url: string, truncated: boolean}}
 */
export function buildMailto({ to = [], subject, body, truncatedNote = '', max = MAILTO_BODY_MAX }) {
  const text = String(body || '');
  const truncated = text.length > max;
  const kept = truncated ? `${text.slice(0, max).trimEnd()}\n\n${truncatedNote}` : text;
  // RFC 6068 : les fins de ligne d'un corps sont des CRLF.
  const crlf = kept.replace(/\r?\n/g, '\r\n');
  const recipients = to.filter(Boolean).map(encodeAddress).join(',');
  const query = `subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(crlf)}`;
  return { url: `mailto:${recipients}?${query}`, truncated };
}
