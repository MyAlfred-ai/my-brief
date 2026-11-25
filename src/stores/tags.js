/**
 * Tags de conversation — catalogue de l'utilisateur + pose sur une réunion.
 *
 * Un seul module pour les deux : poser un tag met à jour `historyItems`, et
 * supprimer un tag doit détaguer les conversations affichées. Séparer aurait
 * dispersé la même règle sur deux fichiers.
 *
 * DÉPENDANCE À SENS UNIQUE : ce module lit et écrit `stores/history.js`, jamais
 * l'inverse. history.js ignore l'existence des tags.
 *
 * Ce module ne parle pas à l'utilisateur : il renvoie `{ok, error}` avec le
 * slug du serveur, et l'appelant (panneau, sélecteur) décide du message et du
 * toast. Les slugs possibles : `duplicate_label`, `limit_reached`,
 * `label_required`, `label_too_long`, `color_invalid`, `shape_invalid`,
 * `context_too_long`, `logo_invalid`, `logo_too_big`, `tag_not_found`,
 * `meeting_not_found`.
 */
import { writable, derived, get as getStore } from 'svelte/store';
import {
  fetchTags,
  saveTag,
  saveTagContextRequest,
  fetchTagLogo,
  saveTagLogoRequest,
  deleteTagLogoRequest,
  deleteTag,
  setMeetingTag,
} from '../services/tagsApi.js';
import { historyItems, meetingIdOf } from './history.js';
import { liveMeetingIdStore } from './recording.js';

/** Repli quand un tag porte une couleur sans jeton CSS (palette élargie côté serveur seul). */
export const TAG_COLOR_FALLBACK = 'slate';
/** Repli pour une forme inconnue — et la forme des tags créés avant les formes (champ absent). */
export const TAG_SHAPE_FALLBACK = 'circle';

/**
 * Couleur libre : `hue-<angle>` ou `hue-<angle>-<clarté>` — même écriture que
 * le serveur (routes/tags.js). L'angle va de 0 à 359 ; la clarté, en pour
 * cent oklch, est bornée par `tagHueLightness`. Sans suffixe, la clarté est
 * celle du jeton `--tag-hue-l`. Le chroma n'est jamais dans le slug : il
 * vient du jeton `--tag-hue-c`, commun à toutes les couleurs libres.
 */
const TAG_HUE_RE = /^hue-(0|[1-9]\d{0,2})(?:-([1-9]\d))?$/;

/**
 * Bornes et défaut de la clarté d'une couleur libre — COPIE de
 * `TAG_HUE_LIGHTNESS` (services/api/routes/tags.js), qui fait foi : `GET /tags`
 * les sert (`hueLightness`) et le store les remplace au premier chargement.
 * La copie ne sert qu'avant — un formulaire ouvert trop tôt aurait un curseur
 * sans bornes. tags.test.js vérifie qu'elle est identique au serveur.
 */
export const TAG_HUE_LIGHTNESS = { min: 35, max: 68, default: 60 };

/**
 * Longueur maximale du contexte d'un tag — COPIE de `TAG_CONTEXT_MAX`
 * (services/api/lib/tagContext.js), qui fait foi et que `GET /tags` sert
 * (`contextMax`). Même régime que les bornes de clarté : tags.test.js vérifie
 * qu'elles sont égales.
 */
export const TAG_CONTEXT_MAX = 1500;

/**
 * Écriture canonique d'un contexte — MIROIR de `normalizeTagContext`
 * (services/api/lib/tagContext.js) : la fiche compare ce qu'on a tapé à ce que
 * le serveur a gardé, et ne réenregistre pas un texte qui ne diffère que par
 * ses espaces. Le serveur reste juge : c'est sa version que garde le store.
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeTagContext(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const tags = writable([]);
export const isLoadingTags = writable(false);

/**
 * Palette et plafond viennent du serveur (`GET /tags`) — pas de seconde source
 * de vérité ici. Les valeurs initiales ne servent qu'avant le premier
 * chargement, pour qu'un formulaire ouvert trop tôt ne soit pas vide.
 */
export const tagColors = writable([TAG_COLOR_FALLBACK]);
export const tagShapes = writable([TAG_SHAPE_FALLBACK]);
export const tagHueLightness = writable(TAG_HUE_LIGHTNESS);
export const tagsMax = writable(0);
export const tagContextMax = writable(TAG_CONTEXT_MAX);

/** Résolution d'un tag par son id — la sidebar en fait une par ligne affichée. */
export const tagsById = derived(tags, (list) => new Map(list.map((t) => [t.id, t])));

/**
 * Logos des tags déjà lus : id → `{ at, dataUrl }`. Un logo ne vient pas avec
 * GET /tags (il pèserait sur chaque ouverture) : le tag n'annonce que
 * `logoAt`, et `ensureTagLogo` le lit à la demande, une fois par version.
 */
export const tagLogos = writable(new Map());
const logoRequests = new Map();

/**
 * Le logo d'un tag, lu s'il ne l'est pas déjà dans sa version annoncée. Sans
 * effet pour un tag sans logo. Deux demandes simultanées n'en font qu'une.
 * Un échec laisse le tag sans logo affiché : jamais bloquant.
 * @param {{id: string, logoAt?: string}|null|undefined} tag
 */
export async function ensureTagLogo(tag) {
  if (!tag?.logoAt) return null;
  const known = getStore(tagLogos).get(tag.id);
  if (known?.at === tag.logoAt) return known.dataUrl;
  const key = `${tag.id}\n${tag.logoAt}`;
  if (!logoRequests.has(key)) {
    logoRequests.set(
      key,
      fetchTagLogo(tag.id)
        .then((res) => {
          const dataUrl = res.ok && typeof res.data?.dataUrl === 'string' ? res.data.dataUrl : '';
          if (dataUrl) {
            tagLogos.update((map) => new Map(map).set(tag.id, { at: tag.logoAt, dataUrl }));
          }
          return dataUrl || null;
        })
        .catch(() => null)
        .finally(() => logoRequests.delete(key)),
    );
  }
  return logoRequests.get(key);
}

/**
 * Pose ou remplace le logo d'un tag (data URL déjà préparé, utils/tagLogo.js).
 * Le catalogue et la copie locale prennent la date que rend le serveur.
 * @param {string} id
 * @param {string} dataUrl
 */
export async function saveTagLogo(id, dataUrl) {
  const res = await saveTagLogoRequest(id, dataUrl);
  if (!res.ok) return outcome(res);
  const at = res.data?.tag?.logoAt || new Date().toISOString();
  tags.update((list) => list.map((t) => (t.id === id ? { ...t, logoAt: at } : t)));
  tagLogos.update((map) => new Map(map).set(id, { at, dataUrl }));
  return { ok: true };
}

/**
 * Retire le logo d'un tag.
 * @param {string} id
 */
export async function removeTagLogo(id) {
  const res = await deleteTagLogoRequest(id);
  if (!res.ok) return outcome(res);
  tags.update((list) =>
    list.map((t) => {
      if (t.id !== id) return t;
      const { logoAt: _logoAt, ...rest } = t;
      return rest;
    }),
  );
  tagLogos.update((map) => {
    const next = new Map(map);
    next.delete(id);
    return next;
  });
  return { ok: true };
}

/**
 * Le logo à afficher pour un tag : celui de sa version annoncée, sinon rien
 * (une copie d'une autre version n'est plus le bon logo).
 * @param {Map<string, {at: string, dataUrl: string}>} logos
 * @param {{id: string, logoAt?: string}|null|undefined} tag
 * @returns {string}
 */
export function logoOf(logos, tag) {
  if (!tag?.logoAt) return '';
  const known = logos.get(tag.id);
  return known?.at === tag.logoAt ? known.dataUrl : '';
}

/**
 * Angle et clarté d'une couleur libre, ou `null` si le slug n'en est pas une
 * (angle ou clarté hors bornes compris : le slug retombe alors sur la couleur
 * de repli, jamais sur un oklch cassé). `lightness` vaut `null` pour un slug
 * sans suffixe — la clarté par défaut.
 * @param {string|undefined} color
 * @returns {{hue: number, lightness: number|null}|null}
 */
export function tagHue(color) {
  const m = TAG_HUE_RE.exec(color || '');
  if (!m) return null;
  const hue = Number(m[1]);
  if (hue >= 360) return null;
  if (m[2] === undefined) return { hue, lightness: null };
  const lightness = Number(m[2]);
  const { min, max } = getStore(tagHueLightness);
  return lightness >= min && lightness <= max ? { hue, lightness } : null;
}

/**
 * Variables CSS d'une couleur de tag. Passe par ce point unique : une couleur
 * inconnue (tag créé par une version plus récente du serveur) retombe sur le
 * repli au lieu de s'afficher transparente.
 *
 * `dot` est une teinte unie — texte, traits, liserés. `fill` est ce que peint
 * une pastille : le motif d'une couleur texturée, sinon la même teinte (une
 * couleur unie n'a pas de jeton `-fill`, d'où le repli dans le `var()`).
 *
 * Une couleur libre (`hue-<angle>[-<clarté>]`) n'a pas de jeton à elle : la
 * couleur est composée ici, avec le chroma du jeton `--tag-hue-c` — et la
 * clarté du jeton `--tag-hue-l` quand le slug n'en porte pas. Elle est
 * toujours unie : `fill` = `dot`.
 * @param {string} color slug de la palette, ou `hue-<angle>[-<clarté>]`
 * @returns {{dot: string, soft: string, fill: string}} valeurs CSS
 */
export function tagColorVars(color) {
  const custom = tagHue(color);
  if (custom) {
    const l = custom.lightness === null ? 'var(--tag-hue-l)' : `${custom.lightness}%`;
    const tint = `oklch(${l} var(--tag-hue-c) ${custom.hue})`;
    return {
      dot: tint,
      soft: `oklch(${l} var(--tag-hue-c) ${custom.hue} / var(--tag-hue-soft-alpha))`,
      fill: tint,
    };
  }
  const known = getStore(tagColors).includes(color) ? color : TAG_COLOR_FALLBACK;
  return {
    dot: `var(--tag-${known})`,
    soft: `var(--tag-${known}-soft)`,
    fill: `var(--tag-${known}-fill, var(--tag-${known}))`,
  };
}

/**
 * `clip-path` d'une forme de pastille — même point unique que la couleur : une
 * forme inconnue (ou absente, tag d'avant les formes) découpe un rond plutôt
 * que rien. Les pastilles n'ont pas de border-radius : c'est ce clip qui
 * arrondit le rond.
 * @param {string|undefined} shape slug de TAG_SHAPES
 * @returns {string} valeur `var(--tag-shape-…)`
 */
export function tagShapeClip(shape) {
  const known = getStore(tagShapes).includes(shape) ? shape : TAG_SHAPE_FALLBACK;
  return `var(--tag-shape-${known})`;
}

/** Réponse normalisée : le slug du serveur, ou `network` si la requête n'a pas abouti. */
function outcome(res) {
  if (res.ok) return { ok: true, data: res.data };
  return { ok: false, error: res.data?.error || 'network' };
}

/**
 * Charge le catalogue. Un échec laisse la liste précédente en place : perdre
 * ses tags à l'écran parce qu'un refresh a échoué serait pire que les afficher
 * un instant périmés.
 */
export async function loadTags() {
  isLoadingTags.set(true);
  try {
    const res = await fetchTags();
    if (!res.ok) return outcome(res);
    tags.set(res.data?.tags || []);
    if (Array.isArray(res.data?.colors) && res.data.colors.length) tagColors.set(res.data.colors);
    if (Array.isArray(res.data?.shapes) && res.data.shapes.length) tagShapes.set(res.data.shapes);
    const bounds = res.data?.hueLightness;
    if (bounds && [bounds.min, bounds.max, bounds.default].every(Number.isFinite)) {
      tagHueLightness.set({ min: bounds.min, max: bounds.max, default: bounds.default });
    }
    if (Number.isFinite(res.data?.max)) tagsMax.set(res.data.max);
    if (Number.isFinite(res.data?.contextMax)) tagContextMax.set(res.data.contextMax);
    return { ok: true };
  } finally {
    isLoadingTags.set(false);
  }
}

/**
 * Crée un tag (sans `id`) ou modifie un tag existant (avec `id`).
 * Pas d'optimisme ici : c'est le serveur qui attribue l'id, arbitre les
 * doublons et le plafond — afficher un tag avant sa réponse reviendrait à
 * afficher un tag qui peut être refusé.
 * @param {{id?: string, label: string, color: string, shape?: string}} tag
 */
export async function upsertTag(tag) {
  const res = await saveTag(tag);
  if (!res.ok) return outcome(res);
  const saved = res.data?.tag;
  if (!saved) return { ok: true };
  tags.update((list) => {
    const next = list.some((t) => t.id === saved.id)
      ? list.map((t) => (t.id === saved.id ? { ...t, ...saved } : t))
      : [...list, saved];
    // Même ordre que le serveur (`labelLower`), sinon un tag renommé sauterait
    // en fin de liste jusqu'au prochain chargement.
    return next.sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
  });
  return { ok: true, tag: saved };
}

/**
 * Enregistre ce que l'IA doit savoir du dossier. Pas d'optimisme non plus :
 * la fiche garde le texte saisi tant que le serveur ne l'a pas accepté, et le
 * catalogue ne prend que la version normalisée qu'il renvoie — celle que
 * liront le compte rendu, l'infographie et l'Aide IA.
 * @param {string} id
 * @param {string} context
 */
export async function saveTagContext(id, context) {
  const res = await saveTagContextRequest(id, context);
  if (!res.ok) return outcome(res);
  const saved = typeof res.data?.tag?.context === 'string' ? res.data.tag.context : '';
  tags.update((list) => list.map((t) => (t.id === id ? { ...t, context: saved } : t)));
  return { ok: true, context: saved };
}

/**
 * La fiche de projet myBrain que le serveur vient de relier au tag (`null` :
 * déliée). Le lien s'écrit par l'Aide IA (stores/aiHelpTagLink.js), qui en
 * fait la requête ; la liste des tags, elle, se tient ici.
 *
 * @param {string} id
 * @param {{path: string, title: string}|null} project
 */
export function adoptTagProject(id, project) {
  tags.update((list) =>
    list.map((t) => {
      if (t.id !== id) return t;
      if (project) return { ...t, myBrainProject: project };
      const rest = { ...t };
      delete rest.myBrainProject;
      return rest;
    }),
  );
}

/**
 * Ce que le compte rendu doit savoir du tag d'une conversation : son id (pour
 * le serveur, qui relit le contexte pour l'infographie), son nom et son
 * contexte (pour le prompt du compte rendu, assemblé ici —
 * config/templates.js). Un tag sans contexte, inconnu ou absent rend des
 * champs vides : le prompt reste celui d'avant les contextes de tag.
 * @param {string|null|undefined} tagId
 * @returns {{tagId: string|null, tagLabel: string|null, tagContext: string|null}}
 */
export function summaryTag(tagId) {
  const tag = tagId ? getStore(tagsById).get(tagId) : null;
  const context = typeof tag?.context === 'string' ? tag.context.trim() : '';
  return {
    tagId: tag ? tag.id : null,
    tagLabel: context ? tag.label : null,
    tagContext: context || null,
  };
}

/**
 * Le tag de la réunion qui S'ENREGISTRE — pas celle affichée, qu'on peut
 * changer en consultant une archive — avec son contexte, ou `null` (pas de
 * réunion en direct, pas de tag, tag sans contexte). Lu par la relecture de
 * la transcription en direct (utils/transcriptRefine.js) : les noms et sigles
 * du tag y servent de référence de graphie, comme les notes.
 * @returns {{tagId: string, context: string}|null}
 */
export function liveTagContext() {
  const meetingId = getStore(liveMeetingIdStore);
  if (!meetingId) return null;
  const tagId = getStore(historyItems).find((it) => meetingIdOf(it) === meetingId)?.tagId;
  const tag = tagId ? getStore(tagsById).get(tagId) : null;
  const context = typeof tag?.context === 'string' ? tag.context.trim() : '';
  return context ? { tagId: tag.id, context } : null;
}

/**
 * Supprime un tag. Le serveur a déjà détagué les conversations en base : on
 * fait le même retrait sur la copie affichée, sinon les lignes garderaient une
 * pastille pointant vers un tag disparu jusqu'au prochain /history.
 * @param {string} id
 */
export async function removeTag(id) {
  const res = await deleteTag(id);
  if (!res.ok) return outcome(res);
  tags.update((list) => list.filter((t) => t.id !== id));
  historyItems.update((list) => list.map((it) => (it.tagId === id ? { ...it, tagId: null } : it)));
  return { ok: true, untagged: res.data?.untagged || 0 };
}

/**
 * Range une conversation dans un tag, ou l'en sort (`tagId: null`).
 *
 * Optimiste — le clic est un geste de rangement, l'attente d'un aller-retour
 * réseau y serait perceptible. En échec, la valeur précédente est restaurée :
 * une pastille qui reste posée alors que la base ne l'a pas enregistrée
 * ferait croire à un rangement qui n'existe pas.
 *
 * @param {string} meetingId
 * @param {string|null} tagId
 */
export async function tagMeeting(meetingId, tagId) {
  if (!meetingId) return { ok: false, error: 'meeting_not_found' };
  const before = getStore(historyItems).find((it) => meetingIdOf(it) === meetingId)?.tagId ?? null;
  const apply = (value) =>
    historyItems.update((list) =>
      list.map((it) => (meetingIdOf(it) === meetingId ? { ...it, tagId: value } : it)),
    );

  apply(tagId);
  const res = await setMeetingTag(meetingId, tagId);
  if (!res.ok) {
    apply(before);
    return outcome(res);
  }
  return { ok: true };
}
