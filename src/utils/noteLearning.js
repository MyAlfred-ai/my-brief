/**
 * Dire à l'utilisateur ce qui vient d'être retenu de ses notes.
 *
 * Le store verse les remplacements des notes dans les « Mots remplacés » du
 * compte et rend ce qu'il a retenu (stores/transcriptCorrections.js) ; ce
 * module n'est que la traduction de ce résultat en message — même partage que
 * utils/postActions.js. Un remplacement retenu se dit TOUJOURS : il réécrira
 * un mot dans toutes les réunions à venir, et l'utilisateur doit savoir où le
 * retirer s'il ne valait que pour celle-ci.
 *
 * Un échec ne se dit pas : la consigne garde tout son effet sur la réunion en
 * cours, et sera reproposée au prochain passage dans les notes.
 */
import { learnNoteReplacements } from '../stores/transcriptCorrections.js';
import { USER_CORRECTIONS_MAX } from './transcriptCorrections.js';

/** « Liste pleine » ne se dit qu'une fois par session : le dire à chaque note lasserait. */
let fullTold = false;

/**
 * @param {string} notes - les notes de la réunion, telles qu'on vient de les quitter
 * @param {(slug: string, type: string, duration: number, variables?: object) => void} showToast
 * @param {{learn?: Function}} [deps] - apprentissage (injectable en test)
 */
export async function learnFromNotes(notes, showToast, { learn = learnNoteReplacements } = {}) {
  const res = await learn(notes);
  if (!res.ok) return res;
  if (res.added.length === 1) {
    showToast('statuses.replacementLearned', 'success', 7000, res.added[0]);
  } else if (res.added.length > 1) {
    showToast('statuses.replacementsLearned', 'success', 7000, { n: res.added.length });
  }
  if (res.full && !fullTold) {
    fullTold = true;
    showToast('statuses.replacementsFull', 'warning', 10000, { max: USER_CORRECTIONS_MAX });
  }
  return res;
}

/** Pour les tests : une session neuve. */
export function resetNoteLearning() {
  fullTold = false;
}
