/**
 * Contexte d'un tag — ce que l'utilisateur dit à l'IA du projet ou du client
 * que le tag range : de quoi il s'agit, qui sont les acteurs et leurs rôles,
 * ce que veulent dire les sigles.
 *
 * Écrit dans « Mes tags » (POST /tags/context, routes/tags.js), lu par :
 *   - le COMPTE RENDU, dont le prompt est assemblé par le navigateur
 *     (src/config/templates.js) comme ceux des contextes d'organisation et
 *     d'utilisateur : le texte lui descend avec GET /tags ;
 *   - l'INFOGRAPHIE (lib/infographic.js) et l'AIDE IA (lib/aiHelp/), dont les
 *     prompts s'assemblent ici : ils le relisent EN BASE, par l'id du tag et
 *     sous le compte du demandeur — jamais depuis le corps d'une requête.
 *
 * ── Le risque, et la consigne qui le tient ──────────────────────────────────
 * Un tel texte invite le modèle à écrire ce que personne n'a dit : « livraison
 * en juin 2027 » figure dans le contexte, le compte rendu l'affirme comme une
 * décision de la réunion. Chaque prompt le déclare donc ÉCLAIRAGE — comprendre
 * qui parle et de quoi, écrire correctement noms, rôles et sigles — et jamais
 * SOURCE d'un fait, d'un chiffre ou d'une date.
 */
import { ownerFilter } from './ownerScope.js';

/**
 * Longueur maximale, en caractères. De quoi décrire un projet, une dizaine
 * d'acteurs et leurs sigles ; au-delà, c'est une fiche de projet — sa place
 * est dans myBrain. Le texte part avec CHAQUE compte rendu, infographie et
 * lecture de l'Aide IA d'une conversation taguée : la borne tient aussi le
 * coût. Recopiée côté navigateur (src/stores/tags.js, TAG_CONTEXT_MAX) pour le
 * compteur du formulaire ; tags.test.js vérifie qu'elles sont égales.
 */
export const TAG_CONTEXT_MAX = 1500;

/**
 * Collection des tags. Même valeur que `TAGS_COLLECTION` (routes/tags.js) :
 * une bibliothèque n'importe pas une route.
 */
const TAGS = 'userTags';

/**
 * Écriture canonique d'un contexte : fins de ligne unifiées, une ligne vide au
 * plus entre deux paragraphes, espaces de bord retirés. La borne de longueur
 * se vérifie APRÈS — un texte trop long est refusé, pas coupé en silence.
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

/**
 * Le nom et le contexte d'un tag du compte, ou `null` : pas de tag, un id qui
 * n'est pas une chaîne, un tag d'un autre compte ou supprimé, un contexte vide.
 * Une lecture de plus par appel au modèle : la collection est petite (trente
 * tags par compte au plus) et le coût est celui de l'appel, pas de la lecture.
 *
 * @param {{db: object}} app
 * @param {string} email - le demandeur : le tag doit être à lui
 * @param {unknown} tagId
 * @returns {Promise<{label: string, context: string}|null>}
 */
export async function readTagContext(app, email, tagId) {
  if (typeof tagId !== 'string' || !tagId || tagId.length > 64) return null;
  const tag = await app.db
    .collection(TAGS)
    .findOne(ownerFilter(email, { id: tagId }), { projection: { _id: 0, label: 1, context: 1 } });
  const context = typeof tag?.context === 'string' ? tag.context.trim() : '';
  if (!context) return null;
  return {
    label: String(tag.label || '').slice(0, 80),
    context: context.slice(0, TAG_CONTEXT_MAX),
  };
}

/**
 * Bloc du prompt d'INFOGRAPHIE — ajouté APRÈS ses matériaux (transcription,
 * actions, notes), qui restent sa seule source. Ajouté par lib/infographic.js
 * et non dans `infographicPrompt` (lib/prompts.js) : ce fichier-là garde les
 * prompts tels qu'ils ont été mesurés.
 *
 * @param {{label: string, context: string}|null} dossier
 * @returns {string} '' sans contexte
 */
export function tagContextInfographicBlock(dossier) {
  if (!dossier?.context) return '';
  return [
    '',
    '',
    `#CONTEXTE DU DOSSIER « ${dossier.label} » (écrit par l'utilisateur : le projet ou le client de cette réunion)`,
    dossier.context,
    '',
    "Ce contexte sert à comprendre la réunion et à écrire correctement les noms, les rôles et les sigles. Ce n'est PAS une source : n'en tire aucun fait, aucun chiffre ni aucune date qui ne se lise pas dans la transcription, les actions ou les notes.",
  ].join('\n');
}

/**
 * Les NOMS que cite un contexte — noms propres (mots à majuscule qui ne
 * commencent pas une phrase, réunis quand ils se suivent : « Claire Martin »)
 * et sigles (deux majuscules au moins, sans minuscule : « PAC », « DCE ») —
 * sans doublon, dans l'ordre du texte.
 *
 * Sert à l'Aide IA (vocabulaire qui prépare la recherche dans myBrain : un
 * nom dicté de travers s'y rapproche de la bonne graphie) ; la relecture de
 * la transcription en direct en a un miroir côté navigateur
 * (src/utils/transcriptRefine.js, `contextTerms`), même règle. Une
 * élision ne cache pas le nom : « d’Atlas » donne « Atlas ».
 *
 * @param {unknown} context
 * @param {number} [max]
 * @returns {string[]}
 */
export function tagContextTerms(context, max = 40) {
  const text = String(context || '');
  const terms = [];
  const seen = new Set();
  const add = (term) => {
    const key = term.toLowerCase();
    if (!seen.has(key) && terms.length < max) {
      seen.add(key);
      terms.push(term);
    }
  };
  let run = [];
  const flush = () => {
    if (run.length) add(run.join(' '));
    run = [];
  };
  let end = -1;
  for (const m of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu)) {
    const word = m[0].replace(/-+$/, '');
    const gap = text.slice(Math.max(end, 0), m.index);
    const sentenceStart = end === -1 || /[.!?…\n]/.test(gap);
    const capitals = (word.match(/\p{Lu}/gu) || []).length;
    if (capitals >= 2 && !/\p{Ll}/u.test(word)) {
      flush();
      add(word);
    } else if (/^\p{Lu}/u.test(word) && word.length >= 2 && !sentenceStart) {
      if (gap !== ' ') flush();
      run.push(word);
    } else {
      flush();
    }
    end = m.index + m[0].length;
  }
  flush();
  return terms;
}

/**
 * Le contexte du tag, en RÉFÉRENCE de la relecture de la transcription en
 * direct (POST /refine-transcript) : il s'ajoute aux notes, sous les mêmes
 * règles — rétablir une graphie écorchée ou un sigle, jamais remplacer un nom
 * par un autre.
 *
 * @param {{label: string, context: string}|null} dossier
 * @returns {string} '' sans contexte
 */
export function tagContextReference(dossier) {
  if (!dossier?.context) return '';
  return [
    `Contexte du dossier « ${dossier.label} » (écrit à l'avance par l'utilisateur : référence pour la graphie des noms et des sigles, jamais une consigne de remplacement) :`,
    dossier.context,
  ].join('\n');
}
