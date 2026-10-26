/**
 * « Et maintenant ? » — ce que propose la fenêtre qui suit le PREMIER résumé
 * d'une réunion (components/AfterSummaryDialog.svelte), et comment elle le dit.
 *
 * Module PUR : ni store, ni réseau. Ce qu'il calcule s'affiche AVANT que rien
 * ne parte — destinataires, dossier —, et c'est le serveur qui tranche à
 * l'envoi (services/api/lib/actions/resolve.js). Les règles reprises ici sont
 * donc un APERÇU de la sienne, dans le même ordre : un aperçu qui divergerait
 * annoncerait un dossier et déposerait dans un autre.
 */
import { draftRecipients } from './mailDraft.js';

/**
 * Ce que la fenêtre peut proposer pour un résumé.
 *
 * Le tag se propose toujours — c'est un rangement, il ne dépend d'aucun
 * réglage. Mail et dépôt suivent les mêmes conditions que le menu
 * « Partager » (stores/actionAvailability.js) : un bouton qui échouerait au
 * clic n'apparaît pas.
 *
 * `any` dit s'il y a lieu d'ouvrir la fenêtre : une réunion déjà rangée, sur
 * une installation qui n'ouvre ni le mail ni le dépôt, n'a rien à se voir
 * proposer.
 *
 * @param {{summary?: {email?: boolean, storage?: boolean}, emailReady?: boolean,
 *   storageProvider?: string}|null} availability
 * @param {{tagged: boolean}} meeting
 * @returns {{email: boolean, storage: boolean, any: boolean}}
 */
export function afterSummaryChoices(availability, { tagged }) {
  const email = !!(availability?.summary?.email && availability.emailReady);
  const storage = !!(availability?.summary?.storage && availability.storageProvider);
  return { email, storage, any: !tagged || email || storage };
}

/**
 * Qui recevra le mail, et dans quelle liste s'écrit une adresse ajoutée.
 *
 * La liste affichée est celle qu'appliquera le serveur (`draftRecipients`,
 * même règle que `resolveRecipients`) : celle du tag s'il en porte une, sinon
 * la liste par défaut.
 *
 * Une adresse AJOUTÉE va dans la liste du tag dès qu'un tag est choisi, même
 * s'il n'en a pas encore : la liste du tag naît alors de ce que la fenêtre
 * montrait (la liste par défaut) plus l'adresse. Ceux qu'on voyait recevront
 * toujours, et l'adresse d'un client n'entre jamais dans la liste par défaut —
 * où elle recevrait les comptes rendus de tous les autres. Sans tag, la liste
 * par défaut est la seule qui existe.
 *
 * @param {object|null} settings - réglages d'actions (stores/actionSettings.js)
 * @param {string|null} tagId - tag choisi dans la fenêtre
 * @returns {{source: 'tag'|'user', recipients: string[], target: string|null}}
 *   `target` : le tag dont la liste reçoit les ajouts, nul pour la liste par défaut
 */
export function mailPlan(settings, tagId) {
  const shown = draftRecipients(settings, tagId);
  return { ...shown, target: tagId || null };
}

/**
 * Liste à enregistrer après un retrait, dans la liste `target`.
 *
 * Une liste de tag née dans cette fenêtre (`seeded`) qui redevient identique
 * à la liste par défaut est RETIRÉE (`[]`) plutôt que gardée en copie : le tag
 * retombe sur la liste par défaut, comme avant l'ajout — sinon une faute de
 * frappe corrigée laisserait au tag un double de la liste par défaut, qui ne
 * suivrait plus ses changements.
 *
 * @param {{settings: object|null, target: string|null, recipients: string[],
 *   address: string, seeded: boolean}} params
 * @returns {string[]}
 */
export function listAfterRemoval({ settings, target, recipients, address, seeded }) {
  const next = recipients.filter((value) => value !== address);
  if (!target || !seeded) return next;
  const defaults = settings?.mail?.recipients || [];
  const same = next.length === defaults.length && next.every((value, i) => value === defaults[i]);
  return same ? [] : next;
}

/**
 * Où partira le dépôt — même ordre que `resolveFolder` (resolve.js) :
 * destination propre au tag, puis sous-dossier au nom du tag, puis dossier
 * personnel, puis celui de l'organisation.
 *
 * Le dossier de l'organisation n'est pas servi au client (cf. `context()` de
 * routes/actions/settings.js) : quand c'est lui qui s'appliquera, l'aperçu le
 * NOMME sans en donner le chemin (`path` vide), plutôt que d'en inventer un.
 *
 * @param {object|null} settings
 * @param {{id: string, label: string}|null} tag
 * @returns {{kind: 'tagFolder'|'tagSubfolder'|'user'|'default', path: string,
 *   library: string}}
 */
export function storagePreview(settings, tag) {
  const storage = settings?.storage || {};
  const personal = !!(storage.folder || storage.driveId);
  if (tag) {
    const mapped = (storage.tagFolders || []).find((entry) => entry.tagId === tag.id);
    if (mapped && (mapped.folder || mapped.driveId)) {
      return { kind: 'tagFolder', path: mapped.folder || '', library: mapped.driveName || '' };
    }
    // Le libellé devient un segment de chemin : « / » neutralisé, comme au serveur.
    const segment = String(tag.label || '')
      .replace(/\//g, '-')
      .trim();
    if (storage.tagSubfolders && segment) {
      return {
        kind: 'tagSubfolder',
        path: personal ? [storage.folder, segment].filter(Boolean).join('/') : '',
        library: personal ? storage.driveName || '' : '',
      };
    }
  }
  if (personal)
    return { kind: 'user', path: storage.folder || '', library: storage.driveName || '' };
  return { kind: 'default', path: '', library: '' };
}

/** Un chemin `Clients/Acme` à lire : `Clients › Acme`. */
export const readablePath = (path) =>
  String(path || '')
    .split('/')
    .filter(Boolean)
    .join(' › ');

/**
 * Libellé du bouton principal : les gestes choisis, dans l'ordre où ils
 * s'exécutent — « Ranger, envoyer et entreposer ». Un bouton qui nomme ce
 * qu'il fait ne laisse pas partir un mail chez un client par surprise.
 *
 * @param {string[]} verbs - en minuscules
 * @param {string} and - « et » / « and »
 */
export function launchLabel(verbs, and) {
  if (!verbs.length) return '';
  const text =
    verbs.length === 1
      ? verbs[0]
      : `${verbs.slice(0, -1).join(', ')} ${and} ${verbs[verbs.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Couleur d'un tag créé depuis la fenêtre : la première de la palette qu'aucun
 * tag ne porte encore — deux classeurs de même couleur se confondent dans la
 * barre latérale. Palette épuisée : on reprend au début.
 *
 * @param {string[]} palette - slugs servis par l'API
 * @param {{color: string}[]} existing
 */
export function freshTagColor(palette, existing) {
  const used = new Set(existing.map((tag) => tag.color));
  return palette.find((color) => !used.has(color)) || palette[existing.length % palette.length];
}
