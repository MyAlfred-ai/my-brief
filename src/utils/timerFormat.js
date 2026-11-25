/**
 * Les durées du minuteur de l'Aide IA, telles qu'elles s'écrivent à l'écran.
 *
 *   timerClock  le compte à rebours : « 4:32 », « 0:07 », « 1:02:05 » — des
 *               chiffres seuls, lisibles de loin ;
 *   timerWords  une durée dite : « 5 min », « 1 min 30 s », « 1 h 05 min » —
 *               sous une réponse (« Minuteur lancé : 5 min ») et pour le
 *               lecteur d'écran.
 *
 * `h`, `min` et `s` sont des symboles d'unités : les mêmes en français et en
 * anglais, donc rien dans config/uiText.js.
 */

const parts = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
};
const two = (value) => String(value).padStart(2, '0');

/** @param {number} seconds */
export function timerClock(seconds) {
  const { h, m, s } = parts(seconds);
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** @param {number} seconds */
export function timerWords(seconds) {
  const { h, m, s } = parts(seconds);
  if (h) return m ? `${h} h ${two(m)} min` : `${h} h`;
  if (m) return s ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}
