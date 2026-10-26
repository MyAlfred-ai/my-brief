/**
 * « Et maintenant ? » — la demande d'ouverture de la fenêtre qui suit le
 * PREMIER résumé d'une réunion (components/AfterSummaryDialog.svelte).
 *
 * Un store et non une prop : la demande naît au bout de la génération, dans
 * App.svelte (plafonné par `max-lines`), et la fenêtre est montée à la racine.
 * App n'y gagne qu'une ligne ; tout ce qui décide d'ouvrir vit ici.
 *
 * ── Quand la fenêtre s'ouvre ────────────────────────────────────────────────
 * Pas à la réponse de /resume, mais quand la réunion est dans l'historique
 * AVEC son titre définitif (`ready`, la relecture lancée par App) : le titre
 * fait l'objet du mail et le nom du fichier, et le tag posé pendant
 * l'enregistrement n'est visible qu'une fois la réunion relue. Ouvrir plus tôt,
 * c'était proposer de ranger une réunion déjà rangée — puis envoyer un mail
 * intitulé « Résumé de votre réunion myBrief ». L'attente est bornée par
 * `pollHistoryUntilMeetingReady` (quelques secondes), et l'utilisateur lit son
 * résumé pendant ce temps.
 *
 * Elle ne s'ouvre pas si l'utilisateur a coché « Ne plus me proposer », ni
 * s'il n'y a rien à proposer (cf. `afterSummaryChoices`).
 *
 * Ce module ne parle pas à l'utilisateur : la fenêtre décide de ses messages.
 */
import { writable, get } from 'svelte/store';
import { historyItems, meetingIdOf } from './history.js';
import { actionSettings, refreshActionSettings } from './actionSettings.js';
import { actionAvailability } from './actionAvailability.js';
import { afterSummaryChoices } from '../utils/afterSummary.js';

/** `{ meetingId }` tant que la fenêtre est demandée, `null` sinon. */
export const afterSummaryRequest = writable(null);

/**
 * Propose les actions de la réunion `meetingId`, dont le premier résumé vient
 * d'être généré.
 *
 * @param {string|null} meetingId
 * @param {Promise<unknown>} [ready] - relecture de l'historique en cours
 * @returns {Promise<boolean>} la fenêtre est demandée
 */
export async function offerAfterSummary(meetingId, ready) {
  if (!meetingId) return false;
  // Réglages RELUS, pas seulement chargés une fois : la fenêtre annonce des
  // destinataires et un dossier, qui ont pu changer sur un autre poste.
  await Promise.all([refreshActionSettings(), Promise.resolve(ready).catch(() => {})]);
  if (get(actionSettings).settings?.afterSummary?.offer === false) return false;
  const item = get(historyItems).find((it) => meetingIdOf(it) === meetingId);
  if (!afterSummaryChoices(get(actionAvailability), { tagged: !!item?.tagId }).any) return false;
  afterSummaryRequest.set({ meetingId });
  return true;
}

/** Referme la fenêtre — choix fait, « Plus tard », ou réunion quittée. */
export function dismissAfterSummary() {
  afterSummaryRequest.set(null);
}
