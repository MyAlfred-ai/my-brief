/**
 * Relier le tag de la réunion au projet que l'Aide IA y a retenu.
 *
 * Un tag relié à une fiche de projet de myBrain (`tag.myBrainProject`) donne
 * son projet à toute réunion qui le porte, sans rien deviner. Sans ce lien,
 * le serveur demande à myBrain le NOM du tag, ou celui que le modèle entend :
 * un nom court ou partagé fait remonter des homonymes de tous types — client,
 * personne, projet — et la question « De quel projet parle cette réunion ? »
 * revient à chaque réunion (constat à l'usage, 2026-11-23).
 *
 * Le lien se propose donc au seul moment où les deux sont connus : la
 * réunion porte un tag, et son projet vient d'être reconnu ou choisi. La
 * scène (AiHelpStage) en fait une carte — « Relier » ou « Pas maintenant ».
 * Elle vaut aussi quand le tag est déjà relié à un AUTRE projet : c'est la
 * façon de corriger un lien devenu faux.
 *
 * « Pas maintenant » ne vaut que pour cette réunion, ce tag et ce projet :
 * un tag de client qui couvre plusieurs projets ne doit pas se retrouver
 * attaché au premier venu, mais un refus ne doit pas non plus fermer la porte
 * pour toujours — aucun autre écran ne relie un tag.
 *
 * Le chemin envoyé est celui que le serveur a déjà relu dans myBrain pour
 * cette réunion ; la route le relit encore avant de l'écrire (routes/aiHelp.js,
 * `POST /ai-help/tag-project`).
 *
 * Un store ne parle pas à l'utilisateur : l'échec est un slug
 * (`aiHelpTagLinkStatus.error`), le libellé vit dans config/uiText.js.
 */
import { derived, writable, get as read } from 'svelte/store';
import { aiHelp } from './aiHelp.js';
import { historyItems, meetingIdOf } from './history.js';
import { adoptTagProject, tagsById } from './tags.js';
import { saveAiHelpTagProject } from '../services/aiHelpApi.js';

/** Les propositions écartées ou déjà faites : réunion + tag + projet. */
const settled = writable(new Set());

/**
 * Le lien en cours d'écriture, et le dernier échec — rattachés à la
 * proposition (`key`) : une erreur ne passe pas d'un projet à l'autre.
 */
export const aiHelpTagLinkStatus = writable({ key: '', busy: false, error: '' });

const keyOf = (meetingId, tagId, path) => `${meetingId}\n${tagId}\n${path}`;

/**
 * La proposition en cours, ou null.
 * @type {import('svelte/store').Readable<null|{key: string, tagId: string,
 *   tag: string, path: string, project: string, linked: string}>}
 */
export const aiHelpTagLink = derived(
  [aiHelp, historyItems, tagsById, settled],
  ([$s, $items, $tags, $settled]) => {
    const path = $s.project?.path;
    if (!$s.meetingId || !$s.enabled || !$s.myBrain || !path) return null;
    const tagId = ($items || []).find((item) => meetingIdOf(item) === $s.meetingId)?.tagId;
    const tag = tagId ? $tags.get(tagId) : null;
    if (!tag) return null;
    const linked = tag.myBrainProject?.path || '';
    if (linked === path) return null;
    const key = keyOf($s.meetingId, tag.id, path);
    if ($settled.has(key)) return null;
    return {
      key,
      tagId: tag.id,
      tag: tag.label,
      path,
      project: $s.project.title || path,
      linked: linked ? tag.myBrainProject.title || linked : '',
    };
  },
);

const settle = (key) => settled.update((keys) => new Set(keys).add(key));

/** « Relier » : le tag mène désormais au projet de cette réunion. */
export async function linkAiHelpTag() {
  const offer = read(aiHelpTagLink);
  if (!offer) return { ok: false, error: 'stale' };
  if (read(aiHelpTagLinkStatus).busy) return { ok: false, error: 'busy' };
  aiHelpTagLinkStatus.set({ key: offer.key, busy: true, error: '' });
  const res = await saveAiHelpTagProject(offer.tagId, offer.path);
  if (!res.ok) {
    const error = res.data?.error || 'network';
    aiHelpTagLinkStatus.set({ key: offer.key, busy: false, error });
    return { ok: false, error };
  }
  // Le titre et le chemin que myBrain vient de rendre font foi ; la
  // proposition est close même s'ils diffèrent de ceux de la réunion.
  adoptTagProject(offer.tagId, res.data?.project || { path: offer.path, title: offer.project });
  settle(offer.key);
  aiHelpTagLinkStatus.set({ key: '', busy: false, error: '' });
  return { ok: true };
}

/** « Pas maintenant » : plus pour ce projet, dans cette réunion. */
export function skipAiHelpTagLink() {
  const offer = read(aiHelpTagLink);
  if (!offer) return;
  settle(offer.key);
  aiHelpTagLinkStatus.set({ key: '', busy: false, error: '' });
}
