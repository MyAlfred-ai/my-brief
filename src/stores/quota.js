/**
 * Quota de minutes de réunion du compte — ce que disent l'anneau de l'avatar,
 * la capsule de compte et le bloc « Ce mois-ci » de son menu, et ce qui
 * retient « Démarrer » quand il n'y a plus de minutes.
 *
 * La règle vit côté serveur (services/api/lib/quota.js) : le plus généreux des
 * groupes du compte, par mois civil, réunions comptées à leur arrêt. Ce store
 * ne fait que porter l'état que le serveur a calculé : il arrive avec /init
 * (`applyQuota`) et se relit quand il change — après chaque fin de réunion
 * (`refreshQuota`), au renouvellement du 1er du mois (`watchRenewal`) — et
 * avant de retenir « Démarrer » (`confirmQuotaExhausted`), puisque
 * l'administration peut relever un quota à tout moment. Le serveur reste seul
 * juge : l'écran évite le refus, il ne le remplace pas.
 *
 * Un store ne parle pas à l'utilisateur : `{ ok, error }` avec le slug du
 * serveur ; les textes sont dans config/uiText.js (`quota`).
 *
 * Purgé à la déconnexion (stores/auth.js) : en mode mot de passe la page ne se
 * recharge pas, et le compteur du compte précédent resterait affiché sous le
 * suivant.
 */
import { writable, derived, get } from 'svelte/store';
import { fetchQuota } from '../services/quotaApi.js';
import { liveElapsedStore } from './recording.js';
import { creditTone } from '../utils/creditTone.js';

const EMPTY = {
  /** Vrai dès que le serveur a répondu une fois (via /init ou GET /quota). */
  loaded: false,
  /** Aucune limite : rien à afficher, rien à retenir. */
  unlimited: true,
  /** Minutes par mois du groupe le plus généreux, ou null. */
  limitMinutes: null,
  /** Consommé ce mois-ci, tel que le serveur l'a compté (réunions terminées). */
  usedSeconds: 0,
  usedMinutes: 0,
  remainingMinutes: null,
  /** Moins d'une minute pleine restante : le serveur refuse tout démarrage. */
  exhausted: false,
  /**
   * Le mois civil en cours à l'heure de Paris : `start` et `end` (le
   * renouvellement) en instants ISO UTC, `timeZone` pour nommer les mois
   * (utils/quotaFormat.js).
   */
  period: null,
  /** Le groupe qui donne le quota : {id, name, color}, ou null. */
  group: null,
};

export const quota = writable({ ...EMPTY });

/** Le serveur refuserait un démarrage : « Démarrer » le dit avant le clic. */
export const quotaExhausted = derived(quota, ($q) => $q.loaded && !$q.unlimited && $q.exhausted);

/**
 * Le crédit tel qu'il faut l'AFFICHER maintenant : l'état du serveur moins le
 * chronomètre de la réunion en cours (`liveElapsedStore`), que le serveur ne
 * comptera qu'à son arrêt. Un seul calcul pour l'anneau de l'avatar, la
 * capsule de compte et « Ce mois-ci » : ils disent le même reste, de la même
 * couleur (utils/creditTone.js). `limited` faux : aucune limite, ou le serveur
 * n'a pas encore répondu — rien à afficher.
 */
export const quotaNow = derived([quota, liveElapsedStore], ([$q, live]) => {
  const limited = $q.loaded && !$q.unlimited;
  const limitSeconds = limited ? ($q.limitMinutes || 0) * 60 : 0;
  const usedSeconds = $q.usedSeconds + (live || 0);
  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);
  return {
    limited,
    limitSeconds,
    usedSeconds,
    remainingSeconds,
    remainingMinutes: Math.floor(remainingSeconds / 60),
    /** Part qui RESTE, 0 à 1 : l'anneau et la barre se vident au fil du mois. */
    remainingRatio: limitSeconds > 0 ? Math.min(1, remainingSeconds / limitSeconds) : 0,
    tone: limited ? creditTone(remainingSeconds, limitSeconds) : null,
  };
});

/**
 * Le 1er du mois, rien ne bouge à l'écran : sans relecture, un onglet resté
 * ouvert — ou l'app native gardée en mémoire — afficherait le mois écoulé et
 * retiendrait « Démarrer » jusqu'au prochain rechargement. L'état se relit donc
 * une fois la borne `period.end` passée, et se relit encore chaque minute tant
 * que le serveur ne répond pas. Une comparaison d'horloge par minute plutôt
 * qu'un minuteur calé sur la borne : un minuteur ne compte pas la veille du
 * poste, et tomberait des heures trop tard au réveil.
 */
const RENEWAL_CHECK_MS = 60 * 1000;
/** Après la borne : l'horloge du poste peut avancer un peu sur celle du serveur. */
const RENEWAL_MARGIN_MS = 60 * 1000;
let renewalWatch = null;
let renewing = false;

function watchRenewal(state) {
  clearInterval(renewalWatch);
  renewalWatch = null;
  const end = Date.parse(state?.period?.end);
  // Sans limite, rien à renouveler. Borne déjà passée alors que le serveur
  // vient de la donner : l'horloge du poste avance — pas de relecture en
  // boucle, `confirmQuotaExhausted` relit de toute façon au clic.
  if (state?.unlimited !== false || !(Date.now() < end + RENEWAL_MARGIN_MS)) return;
  renewalWatch = setInterval(async () => {
    if (renewing || Date.now() < end + RENEWAL_MARGIN_MS) return;
    renewing = true;
    try {
      await refreshQuota();
    } finally {
      renewing = false;
    }
  }, RENEWAL_CHECK_MS);
}

/**
 * L'état tel que le serveur le renvoie (/init, GET /quota, ou le corps d'un
 * 409 quota_exhausted). Une charge illisible laisse l'état précédent.
 * @param {object|null|undefined} payload
 */
export function applyQuota(payload) {
  if (!payload || typeof payload !== 'object') return;
  quota.set({
    ...EMPTY,
    ...payload,
    unlimited: payload.unlimited !== false,
    usedSeconds: Number(payload.usedSeconds) || 0,
    usedMinutes: Number(payload.usedMinutes) || 0,
    exhausted: !!payload.exhausted,
    loaded: true,
  });
  watchRenewal(get(quota));
}

/**
 * Relit l'état depuis l'API — après une fin de réunion, quand la durée vient
 * d'être écrite. En échec, l'état précédent reste affiché : un compteur un
 * instant périmé vaut mieux qu'un compteur qui disparaît.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function refreshQuota() {
  const res = await fetchQuota();
  if (!res.ok) return { ok: false, error: res.data?.error || 'network' };
  applyQuota(res.data);
  return { ok: true };
}

/**
 * « Démarrer » est retenu : le serveur le confirme-t-il ? L'état affiché a pu
 * vieillir sans que rien ne bouge à l'écran — quota relevé ou groupe changé par
 * l'administration, mois écoulé —, et le démarrage ne se refuse pas sur sa
 * seule foi. Sans réponse du serveur, l'état affiché fait foi, sauf s'il porte
 * sur un mois déjà écoulé : /tempkey tranchera.
 * @returns {Promise<boolean>} vrai si le démarrage doit rester retenu
 */
export async function confirmQuotaExhausted() {
  const { ok } = await refreshQuota();
  const periodOver = Date.now() >= Date.parse(get(quota).period?.end);
  return get(quotaExhausted) && (ok || !periodOver);
}

export function resetQuota() {
  quota.set({ ...EMPTY });
  watchRenewal(null);
}
