/**
 * Nourrir myBrain avec les réunions — l'envoi, son état, ses relances.
 *
 * ── Quand une réunion part ───────────────────────────────────────────────────
 * Au geste qui la TERMINE, et une seule fois : « Générer le résumé »
 * (`/resume`) ou « Enregistrer » (`/history/title`), APRÈS la génération du
 * titre — c'est lui qui nomme la source dans le cerveau. Pas à l'arrêt de
 * l'enregistrement : à cet instant la réunion n'a ni titre ni compte rendu, et
 * l'utilisateur n'a pas encore dit qu'il la gardait (un enregistrement lancé
 * par erreur est purgé à l'arrêt). Une réunion arrêtée puis abandonnée sans
 * l'un des deux gestes ne part donc pas.
 *
 * UNE fois : chaque dépôt devient une proposition dans la revue de myBrain,
 * qu'un humain tranche. Renvoyer la réunion à chaque régénération de résumé
 * remplirait sa revue de doublons. Une régénération, un renommage, un tag posé
 * après coup ne renvoient donc rien ; ce qui compte — ce qui a été dit — est
 * parti avec la transcription.
 *
 * JAMAIS le passé : seules partent les réunions COMMENCÉES après que l'envoi
 * est devenu actif — pour l'installation (`activeSince`) et, au choix de
 * chacun, pour le compte (`enabledSince`). Sans cette borne, régénérer le
 * résumé d'une réunion de mars, ou la « ranger » depuis l'historique, la
 * déposait dans le cerveau partagé, transcription comprise, alors que l'écran
 * promet le contraire.
 *
 * ── Qui envoie ───────────────────────────────────────────────────────────────
 * L'administration décide (`appSettings{key:'myBrain'}.policy`) : personne,
 * chacun selon son choix (`userActionSettings.myBrain.enabled`, faux par
 * défaut), ou tout le monde. Relu à CHAQUE envoi, sans cache : couper l'envoi
 * s'applique à la réunion suivante, sans redémarrage.
 *
 * ── L'état, sur la réunion ───────────────────────────────────────────────────
 * `resume.myBrain` : `sending` → `sent` | `error`. La réclamation est ATOMIQUE
 * (findOneAndUpdate sur l'état) : deux déclencheurs simultanés — le geste de
 * fin et une relance, deux onglets — n'envoient qu'une fois. Les jobs acceptés
 * sont notés au fil de l'eau, avec les positions de coupe de la transcription
 * (`cuts`) : une réunion en trois parties qui échoue à la deuxième reprend à la
 * deuxième, sur les MÊMES frontières, sans redéposer la première.
 *
 * ── Les relances ─────────────────────────────────────────────────────────────
 * Seulement quand rien n'a pu arriver chez myBrain (connexion jamais établie,
 * 429, 502/503/504) : cinq tentatives espacées, puis la main passe à
 * l'utilisateur (« Réessayer » dans Ma configuration → MyBrain). Une issue
 * AMBIGUË — la requête est partie, la réponse s'est perdue : délai dépassé,
 * connexion coupée en route, 500, processus arrêté — n'est jamais relancée
 * sans lui (`myBrain.ambiguous`) : une relance doublerait la proposition dans
 * la revue. Seul l'utilisateur, prévenu, peut réessayer.
 *
 * Aucune fonction d'ici ne rejette : un envoi myBrain qui échoue ne doit
 * jamais faire échouer ce qui l'a déclenché (un compte rendu, un rangement).
 */
import { ownerFilter } from '../ownerScope.js';
import { isMyBrainActive } from '../repositories/myBrainSettings.js';
import { MyBrainError } from './client.js';
import { buildMyBrainDeposits, meetingDateOf } from './document.js';

/** Tentatives automatiques au plus, la première comprise. */
export const MYBRAIN_MAX_ATTEMPTS = 5;
/** Attente avant la tentative suivante, selon le nombre déjà faites. */
const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 60 * 60_000];
/**
 * Un envoi resté `sending` au-delà a été interrompu (processus tué en route).
 * Large devant la durée d'un envoi réel (quelques appels de 15 s au plus).
 */
export const MYBRAIN_SENDING_STALE_MS = 15 * 60_000;
/** Rythme de la boucle de relance, et délai de son premier passage après le démarrage. */
export const MYBRAIN_RETRY_INTERVAL_MS = 10 * 60_000;
const RETRY_FIRST_DELAY_MS = 60_000;
/** Réunions relancées par passage : la clé myBrain en admet 60 par heure. */
const RETRY_BATCH = 10;

/** Champs lus pour composer les dépôts — ni `versions`, ni l'infographie. */
const MEETING_PROJECTION = {
  _id: 0,
  meetingId: 1,
  email: 1,
  name: 1,
  title: 1,
  transcription: 1,
  resume: 1,
  notes: 1,
  actions: 1,
  tagId: 1,
  meetingStartTime: 1,
  lastConnecion: 1,
  // Orthographe correcte, portée par quelques documents anciens : meetingDateOf
  // la lit, la projection doit donc la ramener.
  lastConnection: 1,
  now: 1,
  meetingDuration: 1,
  status: 1,
  myBrain: 1,
};

/** Préfixe des champs d'état : chaque écriture est un chemin pointé, jamais le sous-document entier. */
const state = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [`myBrain.${key}`, value]));

function retryDelay(attempts) {
  return RETRY_DELAYS_MS[Math.min(RETRY_DELAYS_MS.length - 1, Math.max(0, attempts - 1))];
}

/** Le plus tardif de plusieurs instants ISO (les absents ignorés), ou null. */
function latest(...values) {
  const times = values.map((v) => (v ? new Date(v).getTime() : NaN)).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * Où en est l'envoi pour ce compte : l'installation propose-t-elle myBrain, ce
 * compte envoie-t-il, et depuis quand (`since`) — seules partent les réunions
 * commencées après.
 *
 * @returns {Promise<{available: boolean, active: boolean, policy: string,
 *   enabled: boolean, since: string|null, settings: object}>}
 */
export async function myBrainEligibility(app, email) {
  const settings = await app.myBrainSettings.get();
  const available = isMyBrainActive(settings);
  const { enabled, enabledSince } = await app.userActions.getMyBrain(email);
  const forced = settings.policy === 'forced';
  const active = available && (forced || enabled);
  const since = forced ? latest(settings.activeSince) : latest(settings.activeSince, enabledSince);
  return { available, active, policy: settings.policy, enabled, since, settings };
}

/**
 * Réclame la réunion pour un envoi : la bascule en `sending` si elle n'est ni
 * envoyée, ni en cours d'envoi, ni en enregistrement.
 *
 * Un déclencheur AUTOMATIQUE (geste de fin, relance) reprend un échec, sauf un
 * échec ambigu. « Réessayer » reprend tout échec, et un envoi resté bloqué en
 * route : c'est l'utilisateur qui a décidé, prévenu du risque de doublon.
 *
 * @returns {Promise<object|null>} la réunion, ou null si elle n'est pas à envoyer
 */
async function claim(app, email, meetingId, { manual }) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - MYBRAIN_SENDING_STALE_MS).toISOString();
  const claimable = manual
    ? [
        { 'myBrain.status': 'error' },
        { 'myBrain.status': 'sending', 'myBrain.updatedAt': { $lt: staleBefore } },
      ]
    : [
        { 'myBrain.status': { $exists: false } },
        { 'myBrain.status': 'error', 'myBrain.ambiguous': { $ne: true } },
      ];
  return app.db.collection('resume').findOneAndUpdate(
    {
      $and: [
        ownerFilter(email, { meetingId }),
        // Une réunion qui s'enregistre encore n'a pas fini d'être dite.
        { status: { $ne: 'recording' } },
        { $or: claimable },
      ],
    },
    {
      $set: state({
        status: 'sending',
        updatedAt: now.toISOString(),
        // Un « Réessayer » repart d'un compteur neuf : c'est une décision de
        // l'utilisateur, pas une énième relance.
        ...(manual ? { attempts: 1 } : {}),
      }),
      ...(manual ? {} : { $inc: state({ attempts: 1 }) }),
      $unset: state({
        error: '',
        retryable: '',
        ambiguous: '',
        nextAttemptAt: '',
        upstreamStatus: '',
      }),
    },
    { returnDocument: 'after', projection: MEETING_PROJECTION },
  );
}

async function tagLabelOf(app, email, tagId) {
  if (!tagId) return '';
  const tag = await app.db
    .collection('userTags')
    .findOne(ownerFilter(email, { id: tagId }), { projection: { label: 1 } });
  return tag?.label || '';
}

async function authorNameOf(app, email, meeting) {
  if (meeting.name) return meeting.name;
  // Session native : les en-têtes d'identité sont effacés, la réunion est née
  // sans nom — le compte, lui, en a un.
  try {
    return (await app.users.findByEmail(email))?.name || '';
  } catch {
    return '';
  }
}

/**
 * Dépose la réunion réclamée, partie par partie, et inscrit l'issue.
 */
async function deliver(app, log, { email, meeting, settings }) {
  const filter = ownerFilter(email, { meetingId: meeting.meetingId });
  const jobs = Array.isArray(meeting.myBrain?.jobs) ? meeting.myBrain.jobs.map(String) : [];
  // Découpage déjà ENGAGÉ (une partie au moins est arrivée) : on le rejoue.
  const cuts =
    jobs.length && Array.isArray(meeting.myBrain?.cuts) ? meeting.myBrain.cuts : undefined;
  let recipientUnknown = !!meeting.myBrain?.recipientUnknown;
  let posted = false;

  const fail = async (error, deposits = []) => {
    const attempts = Number(meeting.myBrain?.attempts) || 1;
    const retryable = !error.ambiguous && error.retryable && attempts < MYBRAIN_MAX_ATTEMPTS;
    const now = Date.now();
    await app.db.collection('resume').updateOne(filter, {
      $set: state({
        status: 'error',
        error: error.code,
        retryable,
        ambiguous: !!error.ambiguous,
        jobs,
        recipientUnknown,
        updatedAt: new Date(now).toISOString(),
        ...(deposits.length ? { parts: deposits.length } : {}),
        ...(deposits.length > 1 && jobs.length ? { cuts: deposits.map((d) => d.end) } : {}),
        ...(error.status ? { upstreamStatus: error.status } : {}),
        ...(retryable ? { nextAttemptAt: new Date(now + retryDelay(attempts)).toISOString() } : {}),
      }),
    });
    return { status: 'error', error: error.code, retryable, ambiguous: !!error.ambiguous };
  };

  try {
    const deposits = buildMyBrainDeposits(meeting, {
      authorName: await authorNameOf(app, email, meeting),
      authorEmail: meeting.email || email,
      tagLabel: await tagLabelOf(app, email, meeting.tagId),
      cuts,
    });
    if (!deposits.length) {
      // Rien à apprendre au cerveau. Aucune trace : si la réunion prend de la
      // matière plus tard (notes ajoutées, audio importé), le geste suivant la
      // réévaluera.
      await app.db.collection('resume').updateOne(filter, { $unset: { myBrain: '' } });
      return { status: 'empty' };
    }

    for (let index = jobs.length; index < deposits.length; index += 1) {
      const { titre, texte, pour } = deposits[index];
      let accepted;
      try {
        posted = true;
        accepted = await app.myBrain.feed({
          url: settings.url,
          apiKey: settings.apiKey,
          deposit: { titre, texte, ...(pour ? { pour } : {}) },
        });
      } catch (err) {
        const error =
          err instanceof MyBrainError
            ? err
            : new MyBrainError('mybrain_error', { ambiguous: true });
        log?.warn?.(
          {
            meetingId: meeting.meetingId,
            error: error.code,
            status: error.status,
            part: index + 1,
          },
          'myBrain : dépôt refusé ou impossible',
        );
        return await fail(error, deposits);
      }
      jobs.push(accepted.job);
      // `pour` rendu NUL par myBrain : l'adresse n'a pas de compte, la question
      // de la revue ira au responsable de la fiche ou aux curateurs. Absent
      // (réponse illisible), on n'en sait rien et on ne dit rien.
      if (pour && accepted.pour === null) recipientUnknown = true;
      // Partie acceptée, d'autres à suivre : inscrite AVANT la suivante, avec
      // les positions de coupe, pour qu'une reprise ne la redépose pas et
      // retombe sur les mêmes frontières — même si le processus s'arrête ici.
      if (index < deposits.length - 1) {
        await app.db.collection('resume').updateOne(filter, {
          $set: state({ jobs, parts: deposits.length, cuts: deposits.map((d) => d.end) }),
        });
      }
    }

    const sentAt = new Date().toISOString();
    await app.db.collection('resume').updateOne(filter, {
      $set: state({
        status: 'sent',
        sentAt,
        updatedAt: sentAt,
        jobs,
        parts: deposits.length,
        recipientUnknown,
      }),
    });
    log?.info?.(
      { meetingId: meeting.meetingId, parts: deposits.length },
      'myBrain : réunion déposée',
    );
    return { status: 'sent', parts: deposits.length, recipientUnknown };
  } catch (err) {
    // Panne de notre côté (base, composition du texte). Avant tout dépôt : rien
    // n'est parti, la relance est sûre. Après : un dépôt a pu arriver sans que
    // son inscription suive — ambigu.
    log?.error?.({ err: err.message, meetingId: meeting.meetingId }, 'myBrain : envoi interrompu');
    return fail(
      new MyBrainError('internal_error', { retryable: !posted, ambiguous: posted }),
    ).catch(() => ({ status: 'error', error: 'internal_error' }));
  }
}

/**
 * Envoie une réunion à myBrain si l'installation et le compte le prévoient.
 *
 * @param {{app: object, log?: object, email: string, meetingId: string, manual?: boolean}} params
 *   `manual` : « Réessayer », demandé par l'utilisateur, sur une réunion dont
 *   l'envoi a déjà été tenté.
 * @returns {Promise<{status: 'inactive'|'skipped'|'empty'|'sent'|'error', error?: string}>}
 *   ne rejette jamais
 */
export async function feedMeetingToMyBrain({ app, log, email, meetingId, manual = false }) {
  try {
    if (!email || !meetingId) return { status: 'skipped' };
    const eligibility = await myBrainEligibility(app, email);
    if (!eligibility.active) return { status: 'inactive' };

    if (!manual) {
      // Première tentative : la réunion doit avoir COMMENCÉ après l'activation.
      // Une réunion déjà tentée (état d'envoi) a passé cette borne à sa
      // première tentative : ses reprises n'y reviennent pas.
      const found = await app.db.collection('resume').findOne(ownerFilter(email, { meetingId }), {
        projection: {
          _id: 0,
          meetingStartTime: 1,
          lastConnecion: 1,
          lastConnection: 1,
          now: 1,
          'myBrain.status': 1,
        },
      });
      if (!found) return { status: 'skipped' };
      if (!found.myBrain?.status) {
        const startedAt = meetingDateOf(found);
        const since = eligibility.since ? new Date(eligibility.since) : null;
        if (!startedAt || !since || startedAt < since) return { status: 'skipped' };
      }
    }

    const meeting = await claim(app, email, meetingId, { manual });
    // Déjà envoyée, en cours d'envoi, en enregistrement, ou inconnue.
    if (!meeting) return { status: 'skipped' };
    return await deliver(app, log, { email, meeting, settings: eligibility.settings });
  } catch (err) {
    log?.error?.({ err: err.message, meetingId }, 'myBrain : envoi interrompu');
    return { status: 'error', error: 'internal_error' };
  }
}

/**
 * Un passage de relance, en deux temps :
 *   1. les envois restés `sending` (processus interrompu en route) passent en
 *      échec AMBIGU — sans renvoi : une partie a pu arriver ;
 *   2. les échecs transitoires dont l'heure est venue sont relancés, en série :
 *      la clé est plafonnée à 60 dépôts par heure, une rafale n'y gagnerait rien.
 *
 * @returns {Promise<number>} réunions relancées
 */
export async function retryMyBrainFeeds({ app, log, now = new Date(), limit = RETRY_BATCH }) {
  try {
    const staleBefore = new Date(now.getTime() - MYBRAIN_SENDING_STALE_MS).toISOString();
    await app.db.collection('resume').updateMany(
      { 'myBrain.status': 'sending', 'myBrain.updatedAt': { $lt: staleBefore } },
      {
        $set: state({
          status: 'error',
          error: 'mybrain_interrupted',
          retryable: false,
          ambiguous: true,
          updatedAt: now.toISOString(),
        }),
      },
    );

    if (!isMyBrainActive(await app.myBrainSettings.get())) return 0;
    const due = await app.db
      .collection('resume')
      .find({
        'myBrain.status': 'error',
        'myBrain.retryable': true,
        'myBrain.nextAttemptAt': { $lte: now.toISOString() },
      })
      .project({ _id: 0, email: 1, meetingId: 1 })
      .limit(limit)
      .toArray();
    for (const { email, meetingId } of due) {
      const result = await feedMeetingToMyBrain({ app, log, email, meetingId });
      if (result.status === 'inactive') {
        // Le compte n'envoie plus (préférence retirée) : la réunion sort de la
        // file, sinon elle y reviendrait à chaque passage et en boucherait la tête.
        await app.db
          .collection('resume')
          .updateOne(ownerFilter(email, { meetingId }), { $set: state({ retryable: false }) });
      }
    }
    return due.length;
  } catch (err) {
    log?.error?.({ err: err.message }, 'myBrain : passage de relance en échec');
    return 0;
  }
}

/**
 * Boucle de relance, lancée par server.js (jamais par buildApp : les tests
 * n'ont pas d'horloge qui tourne). Un passage à la fois : un passage lent ne
 * se superpose pas au suivant.
 *
 * @returns {{stop: () => void}}
 */
export function startMyBrainRetryLoop(app, { intervalMs = MYBRAIN_RETRY_INTERVAL_MS } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await app.background.track(retryMyBrainFeeds({ app, log: app.log }));
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, RETRY_FIRST_DELAY_MS);
  const timer = setInterval(tick, intervalMs);
  first.unref?.();
  timer.unref?.();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}
