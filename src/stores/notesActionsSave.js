/**
 * Notes et actions d'une réunion — écrites en base au fil des modifications.
 *
 * ── Ce que ce module change ────────────────────────────────────────────────
 * Elles n'atteignaient la base qu'avec un compte rendu (/resume). Une réunion
 * terminée par « Enregistrer » se rouvrait sans elles, et une note ou une
 * action modifiée sur une réunion rouverte se perdait si l'on ne régénérait pas
 * de résumé. Chaque modification programme maintenant une écriture différée
 * (/history/notes-actions). L'arrêt et le rangement portent en plus l'état dans
 * leur propre requête (stores/liveMeeting.js, services/meetingsApi.js) : ils
 * vident la file (`settle`), puis reprennent la main (`handOver`). /resume,
 * qui écrit l'état de sa requête, est encadré par `forget` et `resend`.
 *
 * ── Différée, et PAR RÉUNION ───────────────────────────────────────────────
 * Les notes se tapent au clavier : une écriture par frappe n'aurait pas de
 * sens. Le délai est tenu par réunion. Au départ, l'état est relu s'il s'agit
 * toujours de la réunion affichée — l'écriture porte alors la toute dernière
 * frappe, quel que soit l'ordre des écouteurs `input` —, sinon c'est
 * l'instantané pris au geste qui part : changer de réunion pendant l'attente
 * n'annule rien, et n'écrit jamais dans la mauvaise. Les écritures d'une même
 * réunion partent EN FILE : une version ancienne n'atterrit jamais après une
 * récente.
 *
 * ── Seulement ce qui a changé ──────────────────────────────────────────────
 * Chaque écriture n'emporte que les champs qui diffèrent de l'état CONFIRMÉ en
 * base — calculé au moment où elle part, pas quand elle est programmée : une
 * écriture précédente a pu échouer entre-temps. Quitter un champ intact
 * n'écrit donc rien, et une note modifiée n'emporte pas les actions. Sans cela,
 * une copie périmée — onglet ouvert depuis le matin — réécrivait par-dessus ce
 * qu'un autre appareil venait d'enregistrer, sur un simple clic dans un champ.
 * L'état confirmé vient de l'ouverture (`markClean`) et de chaque écriture
 * réussie ; il est oublié dès qu'un autre écrivain passe (arrêt, rangement,
 * /resume) ou qu'une écriture échoue — la suivante repart alors entière.
 *
 * ── Jamais d'écriture à l'ouverture ────────────────────────────────────────
 * Seul un geste (saisie, ajout, masquage, détection) programme une écriture.
 *
 * ── Copie locale de l'historique ───────────────────────────────────────────
 * Mise à jour à l'ENVOI : rouvrir la réunion aussitôt montre ce qui vient de
 * partir, sans relire /history. `flushAll()` avant chaque ouverture fait partir
 * ce qui attendait encore, et `reconcile()` empêche une relecture de /history
 * partie AVANT la fin d'une écriture d'y remettre l'ancienne version.
 */
import { historyItems } from './history.js';
import { persistNotesActions } from '../services/meetingsApi.js';
import { toStoredActions } from '../utils/liveActionsMerge.js';
import { NOTES_ACTIONS_SAVE_MS } from '../config/constants.js';

const hasFields = (fields) => 'notes' in fields || 'actions' in fields;

/**
 * @param {object} deps
 * @param {() => {meetingId: string|null, notes: string, actions: Array}} deps.read
 *   réunion AFFICHÉE et sa colonne de droite — relue à chaque appel, jamais
 *   capturée
 * @param {(outcome: 'saved'|'error'|'idle', meetingId: string) => void} [deps.onOutcome]
 *   issue de chaque écriture ; l'appelant seul sait parler à l'utilisateur
 * @param {Function} [deps.persist] - écriture réseau (injectable en test)
 * @param {number} [deps.delayMs]
 * @param {() => number} [deps.now] - horloge (injectable en test)
 */
export function createNotesActionsSaver({
  read,
  onOutcome = () => {},
  persist = persistNotesActions,
  delayMs = NOTES_ACTIONS_SAVE_MS,
  now = () => Date.now(),
}) {
  /** meetingId → { timer, payload } : écritures programmées, pas encore parties. */
  const waiting = new Map();
  /** meetingId → Promise : queue de la file d'écriture de la réunion. */
  const inflight = new Map();
  /** meetingId → { payload, fields, sentAt, doneAt } : dernière écriture confiée à la file. */
  const lastSent = new Map();
  /** meetingId → { notes, actions } (actions en JSON) : état confirmé en base. */
  const confirmed = new Map();
  /** Réunions dont une écriture a échoué : l'ouverture ne vaut plus confirmation. */
  const unsynced = new Set();
  /** meetingId → instant où un écrivain extérieur (/resume) est parti. */
  const externalAt = new Map();

  /** Instantané écrit — des copies, les cartes affichées continuent de bouger. */
  function snapshot(state) {
    return {
      notes: typeof state?.notes === 'string' ? state.notes : '',
      actions: toStoredActions(state?.actions),
    };
  }

  /** Au départ : l'état frais si la réunion est toujours affichée, sinon celui du geste. */
  function latest(meetingId, fallback) {
    const state = read();
    return state?.meetingId === meetingId ? snapshot(state) : fallback;
  }

  /** Les seuls champs à écrire : ceux qui diffèrent de l'état confirmé en base. */
  function changedFields(meetingId, payload, force) {
    const known = confirmed.get(meetingId);
    if (force || !known) return payload;
    const fields = {};
    if (payload.notes !== known.notes) fields.notes = payload.notes;
    if (JSON.stringify(payload.actions) !== known.actions) fields.actions = payload.actions;
    return fields;
  }

  function send(meetingId, payload, { force = false, keepalive = false } = {}) {
    historyItems.update((items) =>
      Array.isArray(items) && items.some((item) => item?.meetingId === meetingId)
        ? items.map((item) => (item?.meetingId === meetingId ? { ...item, ...payload } : item))
        : items,
    );
    const sent = { payload, fields: null, sentAt: now(), doneAt: null };
    lastSent.set(meetingId, sent);

    const write = () => {
      // Au départ, contre l'état CONFIRMÉ : une écriture précédente a pu échouer.
      const fields = changedFields(meetingId, payload, force);
      sent.fields = fields;
      if (!hasFields(fields)) return 'idle';
      return keepalive
        ? persist(meetingId, fields, { keepalive: true })
        : persist(meetingId, fields);
    };
    // Page qui se ferme : pas le temps d'attendre la file — une requête encore
    // en vol sans `keepalive` est de toute façon annulée par le navigateur.
    const previous = keepalive ? Promise.resolve() : inflight.get(meetingId) || Promise.resolve();
    const run = previous
      .then(write)
      .catch(() => 'error')
      .then((outcome) => {
        sent.doneAt = now();
        if (inflight.get(meetingId) === run) inflight.delete(meetingId);
        if (outcome === 'saved') {
          // Tout ce qui différait est parti : la base porte cet état entier.
          confirmed.set(meetingId, {
            notes: payload.notes,
            actions: JSON.stringify(payload.actions),
          });
          unsynced.delete(meetingId);
        } else if (outcome === 'error') {
          confirmed.delete(meetingId);
          unsynced.add(meetingId);
        }
        onOutcome(outcome, meetingId);
        return outcome;
      });
    if (!keepalive) inflight.set(meetingId, run);
    return run;
  }

  return {
    /**
     * L'appelant écrit lui-même l'état courant, hors de la file (arrêt,
     * rangement) : rend cet état s'il s'agit de la réunion affichée — sinon
     * null, l'écran montre une autre réunion dont les notes ne doivent pas
     * partir dans celle-ci. L'état confirmé est oublié : cette écriture-là
     * échappe au module, la suivante reprendra tout.
     *
     * @param {string|null} meetingId
     * @returns {{notes: string, actions: Array}|null}
     */
    handOver(meetingId) {
      const state = read();
      if (!meetingId || state?.meetingId !== meetingId) return null;
      confirmed.delete(meetingId);
      return snapshot(state);
    },

    /**
     * Un écrivain extérieur (/resume) part avec l'état affiché de `meetingId` :
     * l'état confirmé ne tient plus, et l'heure de départ borne `resend`.
     *
     * @param {string|null} meetingId
     */
    forget(meetingId) {
      if (!meetingId) return;
      confirmed.delete(meetingId);
      externalAt.set(meetingId, now());
    },

    /**
     * La réunion vient d'être ouverte avec cet état : c'est la référence des
     * prochaines écritures. Rien ne part. Sauf après un échec d'écriture : la
     * copie rouverte montre alors ce qui n'a PAS été enregistré, et la
     * prochaine écriture doit tout reprendre.
     *
     * @param {string|null} meetingId
     * @param {string} notes
     * @param {Array} actions
     */
    markClean(meetingId, notes, actions) {
      if (!meetingId || unsynced.has(meetingId)) return;
      const payload = snapshot({ notes, actions });
      confirmed.set(meetingId, { notes: payload.notes, actions: JSON.stringify(payload.actions) });
    },

    /** Une modification : l'écriture de la réunion affichée part après `delayMs` de calme. */
    schedule() {
      const state = read();
      const meetingId = state?.meetingId;
      // Réunion jamais arrivée en base (démarrage hors ligne) : la session
      // locale la garde, /resume l'écrira avec le compte rendu.
      if (!meetingId) return;
      clearTimeout(waiting.get(meetingId)?.timer);
      const payload = snapshot(state);
      const timer = setTimeout(() => {
        waiting.delete(meetingId);
        send(meetingId, latest(meetingId, payload));
      }, delayMs);
      waiting.set(meetingId, { timer, payload });
    },

    /**
     * Fait partir tout de suite ce qui attendait — avant d'ouvrir une réunion,
     * et quand la page se ferme (`keepalive` : la requête survit au départ).
     *
     * @param {{keepalive?: boolean}} [opts]
     */
    flushAll({ keepalive = false } = {}) {
      for (const [meetingId, { timer, payload }] of waiting) {
        clearTimeout(timer);
        waiting.delete(meetingId);
        send(meetingId, latest(meetingId, payload), { keepalive });
      }
    },

    /**
     * L'appelant va écrire lui-même (arrêt, rangement) : ce qui attendait — ou
     * ce qui a échoué — part TOUT DE SUITE, avant le premier `await` : rien
     * n'est jamais jeté, même si l'écran se vide juste après (« Nouvelle
     * réunion »). La promesse rendue attend la fin de la file, pour que
     * l'écriture de l'appelant arrive en dernier.
     *
     * @param {string|null} meetingId
     * @returns {Promise<void>}
     */
    async settle(meetingId) {
      if (!meetingId) return;
      const entry = waiting.get(meetingId);
      if (entry) {
        clearTimeout(entry.timer);
        waiting.delete(meetingId);
      }
      if (entry || unsynced.has(meetingId)) {
        const payload = latest(meetingId, entry?.payload ?? lastSent.get(meetingId)?.payload);
        if (payload) send(meetingId, payload);
      }
      await inflight.get(meetingId);
    },

    /**
     * Après /resume, qui a écrit l'état de SA requête — parti des secondes
     * plus tôt : réécrit en entier l'état le plus récent de la réunion. Frais
     * si elle est affichée ; sinon la dernière écriture de ce module, mais
     * seulement si elle est partie APRÈS /resume (`forget`) — plus ancienne,
     * /resume portait déjà mieux.
     *
     * @param {string|null} meetingId
     */
    resend(meetingId) {
      if (!meetingId) return;
      const entry = waiting.get(meetingId);
      if (entry) {
        clearTimeout(entry.timer);
        waiting.delete(meetingId);
      }
      const sent = lastSent.get(meetingId);
      const since = externalAt.get(meetingId) ?? Infinity;
      const fallback = entry?.payload ?? (sent && sent.sentAt >= since ? sent.payload : undefined);
      const payload = latest(meetingId, fallback);
      if (payload) send(meetingId, payload, { force: true });
    },

    /**
     * Liste relue de /history : une écriture encore en vol au départ de la
     * relecture — ou revenue depuis — peut y manquer. Les champs qu'elle a
     * écrits sont remis par-dessus ; le reste, et toute écriture revenue AVANT
     * le départ de la relecture, fait foi tel que la base le rend.
     *
     * @param {Array} items - réunions telles que /history les renvoie
     * @param {number} since - `now()` pris au départ de la relecture
     * @returns {Array}
     */
    reconcile(items, since) {
      if (!Array.isArray(items)) return items;
      const pending = new Map();
      for (const [meetingId, sent] of lastSent) {
        if (sent.doneAt === null || sent.doneAt >= since) {
          pending.set(meetingId, sent.fields || sent.payload);
        }
      }
      if (pending.size === 0) return items;
      return items.map((item) =>
        pending.has(item?.meetingId) ? { ...item, ...pending.get(item.meetingId) } : item,
      );
    },
  };
}
