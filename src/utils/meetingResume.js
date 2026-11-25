/**
 * Reprendre l'enregistrement d'une réunion TERMINÉE — ce qu'il faut poser
 * avant de relancer la capture. Fonctions pures ; les effets (micro, écran,
 * marqueur) restent dans App.svelte, plafonné, qui n'en garde que l'appel.
 *
 * ── Ce qui ne se reprenait pas ─────────────────────────────────────────────
 * Une réunion arrêtée — trop tôt, pour une pause déjeuner, ou qui continue le
 * lendemain — ne pouvait que rester telle quelle : enregistrer la suite
 * ouvrait une AUTRE réunion, et le compte rendu de l'une ignorait l'autre.
 * Seule la réunion INTERROMPUE (page fermée, application tuée) se reprenait,
 * par la fenêtre « Réunion interrompue » (utils/liveSession.js).
 *
 * La reprise d'une réunion terminée suit la même voie : la suite s'écrit dans
 * SON document (`startLiveMeeting({resumeId})`, /history/start qui la repasse
 * `recording`), à la suite de sa transcription, et son chronomètre repart de
 * sa durée — les horodatages et la durée totale continuent ceux de la réunion.
 *
 * ── D'où repart le chronomètre ─────────────────────────────────────────────
 * De la durée EN BASE de cette réunion : celle de la liste d'historique
 * (relue après chaque arrêt), à défaut celle lue à l'ouverture de l'archive.
 * Ni l'une ni l'autre ne suffit seule : « Enregistrer » sélectionne la réunion
 * sans recharger l'archive, et la durée lue à l'ouverture reste celle de la
 * DERNIÈRE archive ouverte. Le chronomètre du poste n'entre en compte que si
 * l'écran n'a pas quitté le direct (réunion tout juste arrêtée, ou retrouvée
 * au rechargement) : rouverte depuis l'historique, la réunion affichée n'est
 * pas forcément la dernière enregistrée ici. Il couvre aussi la seconde où
 * l'arrêt n'a pas encore atteint la base.
 *
 * ── Le quota ───────────────────────────────────────────────────────────────
 * La durée d'avant est déjà comptée par le serveur (écrite à l'arrêt). Le
 * crédit affiché en direct (`quotaNow`, stores/quota.js) ne doit donc déduire
 * que la SUITE : `countedS` est la part du chronomètre que le serveur compte
 * déjà — nulle si la réunion n'a jamais atteint la base (arrêt hors ligne).
 */

/**
 * @param {object} p
 * @param {Array<{text?: string, offlineGapId?: string}>} p.history - lignes affichées
 * @param {boolean} p.fromArchive - réunion sélectionnée dans l'historique
 * @param {number|null} [p.listedDuration] - durée de la réunion dans la liste (secondes)
 * @param {number} [p.archiveDuration] - durée lue à l'ouverture de l'archive
 * @param {number} [p.liveClockS] - chronomètre du poste (mémoire ou stockage)
 * @param {boolean} [p.inBase] - la réunion a un document en base
 * @returns {{history: Array, clockS: number, countedS: number}}
 */
export function planMeetingResume({
  history,
  fromArchive,
  listedDuration = null,
  archiveDuration = 0,
  liveClockS = 0,
  inBase = true,
}) {
  const seconds = (n) => Math.max(0, Math.floor(Number(n) || 0));
  const stored = seconds(listedDuration) || (fromArchive ? seconds(archiveDuration) : 0);
  const clockS = fromArchive ? stored : Math.max(stored, seconds(liveClockS));
  return {
    // Une archive sans transcription s'ouvre sur une ligne vide (cf.
    // utils/historySelection.js) : elle n'a rien à faire devant la suite.
    history: (Array.isArray(history) ? history : []).filter(
      (line) => (line?.text || '').trim() || line?.offlineGapId,
    ),
    clockS,
    countedS: inBase ? clockS : 0,
  };
}

/**
 * Date et heure de la reprise, pour le marqueur écrit dans la transcription :
 * le compte rendu sait que la réunion s'est arrêtée puis a repris, et quand.
 * @param {Date} [now]
 * @param {string} [lang] - langue de l'interface
 * @returns {{date: string, time: string}}
 */
export function resumeMarkerParts(now = new Date(), lang = 'fr') {
  const locale = lang === 'en' ? 'en' : 'fr';
  return {
    date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(now),
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now),
  };
}
