/**
 * Corrections automatiques de la transcription — deux listes, un correcteur
 * (moteur : utils/transcriptCorrections.js) :
 *   - celle de l'ORGANISATION, réglée dans Administration → Configuration et
 *     appliquée aux réunions de tous les comptes ;
 *   - celle du COMPTE, « Mots remplacés » (Réglages → Pendant la réunion), qui ne
 *     vaut que pour ses réunions. Elle se règle à la main, et se remplit aussi
 *     toute seule : un remplacement écrit dans les notes d'une réunion y est
 *     versé (`learnNoteReplacements`) — c'est ce qui évite de réécrire
 *     « Remplace Alexe par Alex » à chaque réunion.
 *
 * Le direct ne passe jamais par le serveur (le navigateur parle à OpenAI) : les
 * listes doivent donc descendre jusqu'ici. Elles arrivent avec les templates
 * transverses (`GET /api/templates`), comme le vocabulaire de l'organisation
 * (stores/orgContext.js) et pour la même raison — un appel de plus serait un
 * moment d'échec de plus. Jamais par /api/auth/config, qui est publique.
 *
 * Les deux listes sont COMPILÉES ensemble, une fois par changement, pas à
 * chaque ligne : le correcteur tourne à chaque phrase bouclée de chaque
 * réunion. Celle du compte passe d'abord — sur une même écriture, c'est le mot
 * juste du compte qui gagne.
 *
 * Ce store ne parle pas à l'utilisateur : `learnNoteReplacements` rend ce qui
 * a été retenu, c'est utils/noteLearning.js qui le dit.
 */
import { get, writable } from 'svelte/store';
import {
  CORRECTIONS_MAX,
  USER_CORRECTIONS_MAX,
  compileCorrections,
  foldKey,
  normalizeRules,
} from '../utils/transcriptCorrections.js';
import { learnableReplacements } from '../utils/noteReplacements.js';
import {
  fetchUserCorrections,
  learnUserCorrections,
  saveUserCorrections as postUserCorrections,
} from '../services/transcriptApi.js';

/** Liste de l'organisation : `[{ from: string[], to: string }]`. */
export const transcriptCorrections = writable([]);

/**
 * « Mots remplacés » du compte : sa liste, et son choix de la laisser se
 * remplir depuis les notes (allumé tant qu'il n'a pas dit non).
 */
export const userCorrections = writable({ rules: [], learn: true });

let compiled = compileCorrections([]);
function recompile() {
  compiled = compileCorrections([...get(userCorrections).rules, ...get(transcriptCorrections)], {
    max: USER_CORRECTIONS_MAX + CORRECTIONS_MAX,
  });
}
transcriptCorrections.subscribe(recompile);
userCorrections.subscribe(recompile);

/** @param {unknown} value - `{ rules, learn }` tel que le serveur le rend */
export function setUserCorrections(value) {
  userCorrections.set({
    rules: normalizeRules(value?.rules, USER_CORRECTIONS_MAX),
    learn: value?.learn !== false,
  });
}

/** @param {unknown} value - la liste de l'organisation, telle que le serveur la rend */
export function setTranscriptCorrections(value) {
  transcriptCorrections.set(normalizeRules(value));
}

/**
 * Les deux listes d'un coup, au démarrage.
 * @param {{transcriptCorrections?: unknown, userTranscriptCorrections?: unknown}} [data] -
 *   la réponse de `GET /api/templates`
 */
export function adoptCorrections(data) {
  setTranscriptCorrections(data?.transcriptCorrections);
  setUserCorrections(data?.userTranscriptCorrections);
}

/**
 * Texte définitif → texte corrigé. Lu à CHAQUE appel : une liste enregistrée
 * pendant sa propre réunion — ou un remplacement tout juste écrit dans les
 * notes — s'applique à la phrase suivante, sans redémarrer.
 *
 * @param {string} text
 * @returns {string}
 */
export function correctTranscript(text) {
  return compiled.apply(text);
}

// ── Réglages → Pendant la réunion → Mots remplacés ───────────────────────────

/** Relit la liste du compte (l'écran de réglages montre ce qui est en base). */
export async function refreshUserCorrections() {
  const res = await fetchUserCorrections();
  if (!res.ok) return { ok: false, error: res.data?.error || 'network' };
  setUserCorrections(res.data?.settings);
  return { ok: true };
}

/**
 * Enregistre la liste et/ou le choix d'apprendre. Champ absent = inchangé.
 * @param {{rules?: Array<{from: string[], to: string}>, learn?: boolean}} patch
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function saveUserCorrections(patch) {
  const res = await postUserCorrections(patch);
  if (!res.ok) return { ok: false, error: res.data?.error || 'network' };
  setUserCorrections(res.data?.settings);
  return { ok: true };
}

// ── Apprendre des notes ──────────────────────────────────────────────────

const pairKey = ({ from, to }) => `${foldKey(from)}\u0000${to}`;

/**
 * Remplacements déjà proposés au serveur pendant cette session — retenus,
 * déjà présents, ou refusés faute de place. Les notes sont relues à chaque
 * fois qu'on quitte leur champ : sans cette mémoire, la même consigne
 * repartirait à chaque clic, et un remplacement que l'utilisateur vient de
 * retirer de ses réglages reviendrait aussitôt.
 */
const offered = new Set();

/** La même écriture mène déjà au même mot juste — chez le compte ou pour tous. */
function alreadyCorrected({ from, to }) {
  const key = foldKey(from);
  const holds = (rule) => rule.to === to && rule.from.some((term) => foldKey(term) === key);
  return get(userCorrections).rules.some(holds) || get(transcriptCorrections).some(holds);
}

/**
 * Verse dans les « Mots remplacés » du compte les remplacements écrits dans
 * ses notes (ceux qui valent d'être retenus : utils/noteReplacements.js), sauf
 * ceux qui y sont déjà. Rien ne part si rien n'est nouveau, ni si le compte a
 * coupé l'apprentissage.
 *
 * @param {string} notes
 * @param {{learn?: Function}} [deps] - transport (injectable en test)
 * @returns {Promise<{ok: boolean, error?: string,
 *   added: Array<{from: string, to: string}>, full: boolean}>}
 */
export async function learnNoteReplacements(notes, { learn = learnUserCorrections } = {}) {
  const nothing = { ok: true, added: [], full: false };
  if (!get(userCorrections).learn) return nothing;
  // Jamais plus que la liste n'a de place : le serveur refuserait la requête
  // entière, et rien ne serait retenu. Le reste partira au passage suivant.
  const fresh = learnableReplacements(notes)
    .filter((pair) => !offered.has(pairKey(pair)) && !alreadyCorrected(pair))
    .slice(0, USER_CORRECTIONS_MAX);
  if (!fresh.length) return nothing;

  for (const pair of fresh) offered.add(pairKey(pair));
  const res = await learn(fresh);
  if (!res.ok) {
    // Pas parti (hors ligne, session perdue) : à retenter au prochain passage.
    for (const pair of fresh) offered.delete(pairKey(pair));
    return { ok: false, error: res.data?.error || 'network', added: [], full: false };
  }
  setUserCorrections(res.data?.settings);
  return {
    ok: true,
    added: Array.isArray(res.data?.added) ? res.data.added : [],
    full: res.data?.full === true,
  };
}

/**
 * Remet tout à zéro. Appelé à la déconnexion : en mode mot de passe la page
 * ne se recharge pas, et les mots remplacés du compte précédent ne doivent pas
 * réécrire la réunion du suivant.
 */
export function resetUserCorrections() {
  userCorrections.set({ rules: [], learn: true });
  offered.clear();
}
