/**
 * Durée d'une réunion : validation à l'écriture, et récupération sur
 * l'historique.
 *
 * La durée n'est persistée que depuis le 2026-08-18 (cf. routes/meetings.js).
 * Les réunions antérieures semblaient donc perdues pour les statistiques —
 * jusqu'à ce constat : le chronomètre était déjà passé dans le PROMPT, et les
 * gabarits de compte-rendu l'impriment en toutes lettres
 * (`*Auteur : … — Durée : 01:23:45*`, cf. src/config/templates.js). La mesure
 * est donc dans le HTML du résumé, et `durationFromSummary` va la rechercher.
 *
 * Ce n'est PAS une estimation : c'est le chronomètre du jour de la réunion,
 * relu là où il avait été écrit. Une durée déduite du volume de transcription,
 * elle, aurait été une invention — et n'a pas sa place ici.
 */

/** Plafond : au-delà, c'est un chronomètre laissé tourner, pas une réunion. */
const MAX_SECONDS = 86400;

/**
 * Durée exploitable en secondes, ou `null`.
 *
 * `null` et non 0 : les moyennes doivent pouvoir distinguer « réunion de 0 s »
 * de « durée inconnue ». Une valeur absente, nulle ou aberrante ne rentre pas.
 */
export function sanitizeDuration(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) return null;
  return seconds;
}

/**
 * Motif « Durée … HH:MM:SS », cherché dans le TEXTE, balises retirées.
 *
 * Le mot est EXIGÉ devant le nombre : sans lui, « rendez-vous à 14:30:00 » dans
 * le corps du texte serait pris pour une durée, et l'erreur se propagerait en
 * silence dans toutes les moyennes. Entre les deux, on tolère jusqu'à 60
 * caractères SANS AUCUN CHIFFRE — assez pour la ponctuation et les mots
 * (« Durée de la réunion : »), trop peu pour sauter jusqu'à un nombre sans
 * rapport.
 *
 * D'où le retrait préalable des balises : `<h2>` et `<h3>` contiennent des
 * chiffres, qui bloquaient net la traversée (bug vu au premier test).
 *
 * `Dur[ée]e` couvre la faute d'accent ; `Duration` couvre les gabarits anglais.
 */
const SUMMARY_DURATION = /(?:dur[ée]e|duration)[^0-9]{0,60}?(\d{1,2}):([0-5]\d):([0-5]\d)/i;

/**
 * Durée lue dans le HTML d'un compte-rendu, en secondes, ou `null`.
 * @param {string} html - champ `resume` du document
 */
export function durationFromSummary(html) {
  if (typeof html !== 'string' || !html) return null;
  const text = html.replace(/<[^>]*>/g, ' ');
  const found = SUMMARY_DURATION.exec(text);
  if (!found) return null;
  const [, hours, minutes, seconds] = found;
  return sanitizeDuration(Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds));
}
