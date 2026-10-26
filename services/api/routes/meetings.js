/**
 * Routes réunions : génération de résumé, historique, versions, transcription,
 * notes et actions.
 *
 * Toutes les écritures/lectures sont scopées par l'email du header — fix vs
 * n8n, dont le /history/delete était un deleteMany SANS filtre et dont les
 * routes versions ne vérifiaient pas le propriétaire.
 */
import { randomUUID } from 'node:crypto';
import { identityFromHeaders, requireEmail } from '../lib/identity.js';
import { replyUpstreamError } from '../lib/openai.js';
import { ownerFilter, ownerFields } from '../lib/ownerScope.js';
import { fail } from '../lib/errors.js';
import { TITLE_RULES, titleUserMessage, sanitizeTitle, UNTITLED_MEETING } from '../lib/prompts.js';
import { sanitizeDuration, durationFromSummary } from '../lib/meetingDuration.js';
import { legacyVersionOf } from '../lib/legacyVersion.js';
import { generateAndSaveInfographic, INFOGRAPHICS_COLLECTION } from '../lib/infographic.js';
import { feedMeetingToMyBrain } from '../lib/myBrain/feed.js';
import {
  parsePagePlan,
  mainVerbosity,
  enforcePageTarget,
  SECOND_PASS_BUDGET_MS,
} from '../lib/pageTarget.js';
import {
  notesSchema,
  actionsSchema,
  notesActionsFields,
  hasNotesActionsContent,
  withoutLegacyPlaceholders,
} from '../lib/notesActions.js';

/**
 * Identifiant lu dans un corps sans schéma : la chaîne telle quelle, sinon ''.
 * Un objet passé tel quel dans un filtre Mongo y devient un OPÉRATEUR :
 * `{"meetingId": {"$ne": ""}}` sur /history/delete effaçait toutes les
 * réunions du demandeur d'un coup. '' retombe sur le refus « champ requis »
 * de chaque route, inchangé.
 * @param {unknown} value
 * @returns {string}
 */
const idOf = (value) => (typeof value === 'string' ? value : '');

/** Texte facultatif d'un corps sans schéma : absent, ou une chaîne. */
const isOptionalText = (value) => value == null || typeof value === 'string';

/**
 * Écriture Mongo du document `resume`, AVANT la réponse au client.
 *
 * Historiquement (parité n8n) l'écriture partait après le reply : un échec
 * Mongo laissait le client avec un 200 et un meetingId… et aucune réunion en
 * base — perte silencieuse de l'artefact central du produit. Désormais un 200
 * de /resume GARANTIT le document en base ; seul le TITRE (appel OpenAI de
 * plusieurs secondes) reste généré en tâche de fond, avec repli inoffensif.
 *
 * `meetingDuration` / `meetingStartTime` / `transcriptionChars` sont persistés
 * depuis 2026-08 : le frontend les envoyait déjà, mais ils ne servaient qu'à
 * composer le prompt et repartaient à la poubelle.
 *
 * Deux sources pour la durée, dans cet ordre : le CHRONOMÈTRE du client, et à
 * défaut le compte-rendu lui-même — les gabarits y impriment « Durée :
 * 01:23:45 ». Le repli n'est pas cosmétique : c'est lui qui a permis de
 * récupérer la durée des réunions antérieures (cf. lib/meetingDuration.js), et
 * il couvre aussi le cas d'un chronomètre revenu à zéro.
 */
async function persistResume({ app, body, email, name, resumeHtml, meetingId, pageReport }) {
  const now = new Date().toISOString();
  const timed = sanitizeDuration(body.meetingDuration);
  const duration = timed ?? durationFromSummary(resumeHtml);
  const durationSource = timed ? 'timer' : duration ? 'resume' : 'unknown';
  // La branche se décide sur la BASE, et non plus sur le drapeau `isEdit` du
  // client. Depuis que la réunion naît au DÉMARRAGE de l'enregistrement
  // (/history/start), un PREMIER résumé arrive sur un document qui existe
  // déjà : se fier au client ferait insérer un second document portant le même
  // meetingId, et l'historique afficherait la réunion en double.
  const existing = await app.db.collection('resume').findOne(ownerFilter(email, { meetingId }), {
    projection: { versions: 1, resume: 1, template: 1, now: 1 },
  });
  // Compte rendu en base SANS version (réunion n8n, première version jamais
  // arrivée) : l'écran en montre pourtant un onglet. Sa version est inscrite
  // dans la MÊME écriture qui écrase `resume` — sinon le nouveau compte rendu
  // remplaçait l'ancien au lieu de s'y ajouter (cf. lib/legacyVersion.js).
  const legacyVersion = legacyVersionOf(existing);
  // Brouillon : le document existe (ouvert au démarrage) mais ne porte encore
  // aucun compte-rendu. C'est à cette génération-là qu'il devient une réunion
  // complète.
  const isDraft = !!existing && !existing.versions?.length && !legacyVersion;
  if (existing) {
    // Régénération d'un résumé existant : on écrase le contenu courant, le
    // titre existant reste (le fond le remplacera s'il se régénère bien).
    // La NOUVELLE version n'est pas écrite ici — le frontend la pousse via
    // /versions/add (le doc existe déjà, aucune course possible).
    await app.db.collection('resume').updateOne(ownerFilter(email, { meetingId }), {
      $set: {
        ...(legacyVersion ? { versions: [legacyVersion] } : {}),
        resume: resumeHtml,
        template: body.template,
        language: body.language,
        actions: body.actions,
        // Notes du panneau : rééditables après coup, la régénération renvoie
        // l'état courant — on suit, comme pour les actions.
        notes: typeof body.notes === 'string' ? body.notes : '',
        titlePending: true,
        now,
        // Régénération : le chronomètre du frontend est à zéro quand la réunion
        // vient de l'historique. Écrire `meetingDuration: 0` effacerait la durée
        // enregistrée à la première génération — on ne touche au champ que si
        // une durée réelle accompagne la requête.
        ...(duration ? { meetingDuration: duration, meetingDurationSource: durationSource } : {}),
        // Premier compte-rendu d'un brouillon : c'est ICI que la transcription
        // définitive s'inscrit. Une RÉGÉNÉRATION, elle, n'y touche pas — la
        // transcription a pu être corrigée à la main entre-temps, et le client
        // renvoie une version reconstruite ligne à ligne.
        ...(isDraft
          ? {
              transcription: body.transcription ?? '',
              transcriptionChars: (body.transcription || '').length,
              status: 'ended',
              ...(typeof body.meetingStartTime === 'string'
                ? { meetingStartTime: body.meetingStartTime }
                : {}),
            }
          : {}),
      },
    });
  } else {
    // Première génération : document complet, avec la V1 embarquée.
    // Champs et faute `lastConnecion` identiques aux insertions n8n.
    // Titre de repli — remplacé en tâche de fond par generateAndSaveTitle.
    await app.db.collection('resume').insertOne({
      title: UNTITLED_MEETING,
      // Le titre définitif arrive quelques secondes plus tard (tâche de fond) :
      // ce drapeau dit au frontend « continue de relire /history », sinon il
      // s'arrête sur le repli et la réunion reste « Réunion sans titre » à
      // l'écran jusqu'au prochain rechargement complet de l'app.
      titlePending: true,
      resume: resumeHtml,
      ...ownerFields(email),
      transcription: body.transcription,
      template: body.template,
      language: body.language,
      actions: body.actions,
      // Notes tapées pendant la réunion — relues par le frontend à l'ouverture
      // depuis l'historique (selectHistoryItem).
      notes: typeof body.notes === 'string' ? body.notes : '',
      name,
      lastConnecion: now,
      now,
      meetingId,
      // Mesures d'usage — `null` dit « inconnue », jamais 0 (cf. sanitizeDuration).
      meetingDuration: duration,
      // D'où vient la durée : `timer` (chronomètre), `resume` (relue dans le
      // compte-rendu) ou `unknown`. Ce champ est aussi le marqueur qui empêche
      // le backfill de démarrage de relire indéfiniment les mêmes documents.
      meetingDurationSource: durationSource,
      meetingStartTime: typeof body.meetingStartTime === 'string' ? body.meetingStartTime : null,
      // Longueur du texte transcrit : le volume se lit sans relire les
      // transcriptions elles-mêmes, qui pèsent plusieurs centaines de Ko.
      transcriptionChars: (body.transcription || '').length,
      versions: [
        {
          id: body.versionId,
          html: resumeHtml,
          template: body.template,
          ton: body.ton ?? null,
          longueur: body.longueur ?? null,
          customPrompt: body.customPrompt ?? null,
          // Pagimètre : la longueur demandée, et celle mesurée sur le résumé
          // rendu (cf. lib/pageTarget.js). Absents sans Pagimètre.
          ...(pageReport ? { pages: pageReport.requested, measuredPages: pageReport.final } : {}),
          generatedAt: now,
        },
      ],
    });
  }
}

/**
 * Titre de la réunion, généré en tâche de fond APRÈS la réponse (appel OpenAI
 * de plusieurs secondes — le frontend re-lit /history pour le voir).
 * En échec : on ne touche pas au document — il garde son titre de repli
 * (insertion) ou son titre existant (édition).
 *
 * `origin` n'est qu'une étiquette de log : deux routes nomment une réunion
 * (/resume avec le compte rendu, /history/title sans), et un échec doit se
 * lire dans les logs depuis la bonne.
 */
async function generateAndSaveTitle({
  app,
  log,
  body,
  email,
  resumeHtml,
  meetingId,
  origin = '/resume',
}) {
  const model = app.config.openai.models.title;
  // Le drapeau tombe dans TOUS les cas de sortie, succès comme échec : le
  // frontend attend ce signal pour cesser de relire /history. Le laisser posé
  // sur un échec le ferait sonder jusqu'à épuisement de ses tentatives.
  const clearPending = () =>
    app.db
      .collection('resume')
      .updateOne(ownerFilter(email, { meetingId }), { $unset: { titlePending: '' } });

  let title;
  try {
    const raw = await app.openai.chat({
      model,
      // Sans raisonnement : 5 mots n'y gagnent rien, et gpt-6-luna raisonne
      // en « medium » par défaut (cf. lib/config.js `models.title`).
      reasoningEffort: 'none',
      messages: [
        { role: 'system', content: TITLE_RULES },
        {
          role: 'user',
          content: titleUserMessage({ resume: resumeHtml, transcription: body.transcription }),
        },
      ],
    });
    title = sanitizeTitle(raw);
  } catch (err) {
    log.warn({ err: err.message, meetingId, model }, `${origin} : génération de titre en échec`);
    await clearPending();
    return;
  }
  // Sortie SILENCIEUSE sans cette trace : le modèle a répondu, mais vide ou par
  // le repli littéral. La réunion garde « Réunion sans titre » et rien, ni dans
  // l'app ni dans les logs, ne dit pourquoi — c'est ce qui a rendu l'incident du
  // 2026-08-08 difficile à cerner.
  if (!title || title === UNTITLED_MEETING) {
    log.info({ meetingId, model }, `${origin} : titre non exploitable, repli conservé`);
    await clearPending();
    return;
  }
  await app.db.collection('resume').updateOne(ownerFilter(email, { meetingId }), {
    $set: { title },
    $unset: { titlePending: '' },
  });
}

/**
 * Qui peut générer une infographie : l'installation la propose (interrupteur
 * « Proposer l'infographie », onglet IA) ET un des groupes du compte en donne le
 * droit, les droits étant cumulatifs (cf. `rightsOf`, lib/repositories/groups.js).
 * Relu à chaque demande, sans cache : un droit retiré vaut pour la suivante.
 * @returns {Promise<'allowed'|'infographic_disabled'|'infographic_not_allowed'>}
 */
async function infographicVerdict(app, req, email) {
  if (!(await app.settings.infographicEnabled())) return 'infographic_disabled';
  const doc = req.user?.doc || (await app.users.findByEmail(email));
  const { infographic } = await app.groups.rightsForUser(doc);
  return infographic ? 'allowed' : 'infographic_not_allowed';
}

export default function meetingsRoutes(app) {
  /**
   * Génération du compte-rendu — le cœur de l'app.
   * Le prompt système est construit côté CLIENT (src/config/templates.js) et
   * passé tel quel : ce service est un passe-plat vers OpenAI, comme n8n.
   * Modèle : choisi dans Administration → IA, sinon `OPENAI_MODEL_SUMMARY`,
   * sinon gpt-5.4 (cf. lib/summaryModels.js pour le pourquoi de chaque choix).
   * Relu à CHAQUE génération, sans cache : même parti pris que la clé OpenAI
   * et le modèle de transcription — un modèle changé s'applique au compte rendu
   * suivant, sans redémarrage.
   * Le document est écrit AVANT la réponse (un 200 = réunion en base) ; seul
   * le titre suit en tâche de fond, tracé par app.background.
   * Pagimètre (`body.length`) : le résumé principal est mesuré, et repris —
   * deux fois au plus — s'il s'écarte de la longueur demandée (cf.
   * lib/pageTarget.js).
   */
  app.post('/resume', async (req, reply) => {
    const startedAt = Date.now();
    const email = requireEmail(req, reply);
    if (!email) return;
    const { name } = identityFromHeaders(req.headers);
    const body = req.body || {};

    // Blocs IA à consigne fixe (résumé 20/100 mots, points clés) : un appel
    // LLM ISOLÉ par bloc, en parallèle du principal. Dans un appel unique, la
    // seule présence d'une consigne « 20 mots » tirait le résumé principal
    // vers le bas (mesuré sur CR réel le 27/08) — le prompt principal ne voit
    // donc que des emplacements opaques [[AI_SLOT_n]], remplacés ici par les
    // fragments générés. Marqueur validé strictement : c'est la cible d'un
    // remplacement dans le HTML final.
    const blocks = (Array.isArray(body.blocks) ? body.blocks : [])
      .filter(
        (b) =>
          b &&
          typeof b.marker === 'string' &&
          /^\[\[AI_[A-Z0-9_]{1,40}\]\]$/.test(b.marker) &&
          typeof b.systemPrompt === 'string',
      )
      .slice(0, 8);
    // Longueur en pages demandée par le Pagimètre — null sans lui : tout se
    // passe alors exactement comme avant.
    const pagePlan = parsePagePlan(body.length, body.transcription);

    let resumeHtml;
    let pageReport = null;
    try {
      const summaryModel = await app.settings.resolveSummaryModel(app.config.openai.models.summary);
      // La transcription est ÉTIQUETÉE dans le message user au lieu d'y être
      // versée nue : le modèle n'avait aucun signal sur ce qu'il reçoit ni sur
      // le fait que c'est l'intégralité de la réunion. Même parti pris que le
      // prompt d'infographie (lib/prompts.js), où l'étiquetage des matériaux
      // avait été mesuré déterminant.
      const chatFor = (systemPrompt, tuning) =>
        app.openai.chat({
          model: summaryModel,
          messages: [
            { role: 'system', content: systemPrompt ?? '' },
            {
              role: 'user',
              content: `#TRANSCRIPTION DE LA RÉUNION (intégralité de ce qui a été dit — matière première du compte rendu)\n\n${body.transcription ?? ''}`,
            },
          ],
          ...tuning,
        });
      // Budget de sortie OPPOSÉ entre les deux familles d'appels, et c'est
      // voulu : le compte rendu principal doit être DÉVELOPPÉ (`verbosity:
      // 'high'` — le seul levier d'API sur le volume, cf. lib/openai.js), les
      // blocs à consigne fixe ont au contraire un plafond de mots dur (20 mots,
      // 100 mots) qu'une consigne de verbosité haute ferait exploser. Sans ces
      // réglages, la famille gpt-5 répond en « medium » : plus court que
      // l'application ChatGPT à prompt identique — le symptôme rapporté.
      const [main, ...fragments] = await Promise.all([
        chatFor(body.systemPrompt, {
          verbosity: pagePlan ? mainVerbosity(pagePlan.target) : 'high',
          reasoningEffort: 'medium',
          timeoutMs: app.config.openai.summaryTimeoutMs,
        }),
        ...blocks.map((b) => chatFor(b.systemPrompt, { verbosity: 'low', reasoningEffort: 'low' })),
      ]);
      resumeHtml = main;
      // Vérification de longueur AVANT l'assemblage des blocs fixes : leurs
      // jetons encadrent encore le résumé principal, qu'on découpe seul.
      if (pagePlan) {
        const checked = await enforcePageTarget({
          html: main,
          plan: pagePlan,
          transcription: body.transcription ?? '',
          chat: ({ system, user, verbosity }) =>
            app.openai.chat({
              model: summaryModel,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              verbosity,
              reasoningEffort: 'medium',
              timeoutMs: app.config.openai.summaryTimeoutMs,
            }),
          log: req.log,
          maxPasses: 2,
          canRetry: () => Date.now() - startedAt < SECOND_PASS_BUDGET_MS,
        });
        resumeHtml = checked.html;
        pageReport = checked.report;
      }
      blocks.forEach((b, i) => {
        const fragment = (fragments[i] ?? '').trim();
        if (resumeHtml.includes(b.marker)) {
          resumeHtml = resumeHtml.split(b.marker).join(fragment);
          return;
        }
        // Jeton mangé par le modèle principal : repli sur l'ancre (la ligne
        // statique qui précédait le slot — son titre de section, recopié bien
        // plus fidèlement que le jeton), sinon fin de compte rendu. Jamais de
        // perte silencieuse.
        const anchor = typeof b.anchor === 'string' && b.anchor.length <= 500 ? b.anchor : '';
        const at = anchor ? resumeHtml.indexOf(anchor) : -1;
        if (at !== -1) {
          const cut = at + anchor.length;
          resumeHtml = `${resumeHtml.slice(0, cut)}\n${fragment}${resumeHtml.slice(cut)}`;
        } else {
          resumeHtml = `${resumeHtml}\n${fragment}`;
        }
      });
    } catch (err) {
      req.log.warn({ err: err.message }, '/resume : échec amont OpenAI');
      return replyUpstreamError(reply, err);
    }

    const meetingId = idOf(body.meetingId) || randomUUID();
    try {
      await persistResume({ app, body, email, name, resumeHtml, meetingId, pageReport });
    } catch (err) {
      // Pas de 200 mensonger avec un meetingId introuvable en base (l'ancien
      // comportement) : le frontend garde son état local et peut re-tenter.
      req.log.error({ err: err.message, meetingId }, '/resume : persistance en échec');
      return fail(reply, 500, 'persist_failed');
    }

    app.background.track(
      generateAndSaveTitle({ app, log: req.log, body, email, resumeHtml, meetingId })
        .catch((err) =>
          req.log.error({ err: err.message, meetingId }, '/resume : titre non sauvegardé'),
        )
        // myBrain APRÈS le titre, qui nomme la source dans le cerveau. Une fois
        // par réunion : une régénération ne renvoie rien (cf. lib/myBrain/feed.js).
        .then(() => feedMeetingToMyBrain({ app, log: req.log, email, meetingId })),
    );

    // Infographie : demandée par la case cochée ET permise (proposée par
    // l'administration, et accordée par un groupe du compte). Sans le droit, le
    // compte rendu part sans image, sans erreur : l'écran ne montre pas la case
    // à qui ne l'a pas, une demande qui arrive quand même est un reliquat. Le
    // drapeau `pending` est posé AVANT la réponse — le premier rechargement
    // d'historique du client le voit — puis l'image part en tâche de fond, comme
    // le titre. Case décochée : l'infographie existante de la réunion reste
    // telle quelle.
    let infographicPending = false;
    if (body.infographic === true && (await infographicVerdict(app, req, email)) === 'allowed') {
      infographicPending = true;
      await app.db.collection('resume').updateOne(ownerFilter(email, { meetingId }), {
        $set: { infographic: { status: 'pending', updatedAt: new Date().toISOString() } },
      });
      app.background.track(
        generateAndSaveInfographic({ app, log: req.log, email, meetingId, body }).catch((err) =>
          req.log.error({ err: err.message, meetingId }, '/resume : infographie non sauvegardée'),
        ),
      );
    }

    return {
      resume: resumeHtml,
      meetingId,
      versionId: body.versionId,
      ...(pageReport ? { pages: pageReport.requested, measuredPages: pageReport.final } : {}),
      ...(infographicPending ? { infographic: 'pending' } : {}),
    };
  });

  /**
   * Image d'infographie d'une réunion — servie À PART de /history, qui renvoie
   * les documents `resume` entiers : plusieurs Mo de base64 n'ont rien à faire
   * dans un listing. Le document `resume` porte l'état (`infographic.status`),
   * cette route sert l'état frais ET l'image quand elle est prête — c'est elle
   * que le frontend interroge pendant la génération.
   */
  app.get('/infographic', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = String(req.query?.meetingId || '').slice(0, 64);
    if (!meetingId) return fail(reply, 400, 'meeting_id_required');
    const doc = await app.db
      .collection('resume')
      .findOne(ownerFilter(email, { meetingId }), { projection: { infographic: 1 } });
    if (!doc) return fail(reply, 404, 'meeting_not_found');
    const status = doc.infographic?.status || 'none';
    const updatedAt = doc.infographic?.updatedAt || null;
    if (status !== 'ready') return { status, updatedAt };
    const img = await app.db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(email, { meetingId }));
    // `ready` sans image = état incohérent (purge partielle, base restaurée) :
    // on répond `none` plutôt que de faire boucler le client sur un fantôme.
    if (!img?.image) return { status: 'none', updatedAt };
    return {
      status: 'ready',
      updatedAt,
      dataUrl: `data:${img.mime || 'image/png'};base64,${img.image}`,
    };
  });

  /**
   * Régénère l'infographie SEULE, sans régénérer le compte rendu : les
   * matériaux (transcription, actions, notes) sont relus du document en base —
   * ceux de la dernière génération, ou de la dernière modification des notes et
   * des actions (/history/notes-actions). Une réunion ancienne peut y porter
   * les textes de remplacement d'autrefois (« À définir ») : ils sont retirés.
   * Même contrat que la génération initiale : `pending` posé avant la réponse,
   * image en tâche de fond, `ready`/`error` dans tous les cas.
   */
  app.post('/infographic/regenerate', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = String(req.body?.meetingId || '').slice(0, 64);
    if (!meetingId) return fail(reply, 400, 'meeting_id_required');
    // Fonctionnalité coupée par l'administration, ou droit que les groupes du
    // compte ne donnent pas : la porte se ferme aussi ici, pas seulement sur la
    // case de /resume. 409 et jamais 403 : le client lit un 403 comme une
    // session perdue et déconnecterait l'utilisateur (cf.
    // src/utils/httpErrorHandler.js).
    const verdict = await infographicVerdict(app, req, email);
    if (verdict !== 'allowed') return fail(reply, 409, verdict);
    const doc = await app.db.collection('resume').findOne(ownerFilter(email, { meetingId }), {
      projection: { transcription: 1, actions: 1, notes: 1, infographic: 1, language: 1 },
    });
    if (!doc) return fail(reply, 404, 'meeting_not_found');
    if (!String(doc.transcription || '').trim()) return fail(reply, 400, 'no_transcription');
    // Déjà en cours : on ne lance pas un second travail (double facturation,
    // et deux écritures concurrentes de la même image). Le client repart sur
    // le polling existant.
    if (doc.infographic?.status === 'pending') {
      return { status: 'pending', updatedAt: doc.infographic.updatedAt || null };
    }
    const updatedAt = new Date().toISOString();
    await app.db.collection('resume').updateOne(ownerFilter(email, { meetingId }), {
      $set: { infographic: { status: 'pending', updatedAt } },
    });
    app.background.track(
      generateAndSaveInfographic({
        app,
        log: req.log,
        email,
        meetingId,
        body: {
          transcription: doc.transcription,
          actions: withoutLegacyPlaceholders(doc.actions),
          notes: doc.notes,
          // La langue SÉLECTIONNÉE au clic, pas celle du résumé : régénérer
          // sous l'interface anglaise rend une image anglaise. Celle de la
          // réunion pour un client qui ne l'envoie pas (normalisée en aval).
          language: req.body?.language || doc.language,
        },
      }).catch((err) =>
        req.log.error({ err: err.message, meetingId }, '/infographic/regenerate : non sauvegardée'),
      ),
    );
    return { status: 'pending', updatedAt };
  });

  /**
   * Supprime l'infographie SEULE — la réunion reste. L'image part de sa
   * collection ET le drapeau du document tombe : sans le `$unset`, /history
   * annoncerait `ready` pour une image disparue.
   */
  app.post('/infographic/delete', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = String(req.body?.meetingId || '').slice(0, 64);
    if (!meetingId) return fail(reply, 400, 'meeting_id_required');
    await app.db.collection(INFOGRAPHICS_COLLECTION).deleteMany(ownerFilter(email, { meetingId }));
    await app.db
      .collection('resume')
      .updateOne(ownerFilter(email, { meetingId }), { $unset: { infographic: '' } });
    return { ok: true };
  });

  /**
   * Historique des réunions de l'utilisateur. Reprend le post-traitement du
   * node n8n « Code in JavaScript1 » : titre replié DATÉ (jamais `name`, qui
   * est le nom du COMPTE — cf. src/utils/historyTitle.js), date dd/MM,
   * weekLabel. Sans reproduire son écrasement accidentel de `now`.
   *
   * ORDRE — la liste est ordonnée par la date qu'elle AFFICHE.
   *
   * Deux dates cohabitent sur un document `resume` : `lastConnecion` (faute
   * héritée de n8n) porte la date de la RÉUNION — c'est elle qu'on affiche et
   * qui décide du groupe de la sidebar ; `now` porte la date de dernière
   * ÉCRITURE, réécrite à chaque régénération de résumé.
   *
   * Trier sur `now` en affichant `lastConnecion` faisait remonter EN TÊTE une
   * réunion ancienne dès qu'on régénérait son résumé. Comme la sidebar groupe
   * dans l'ordre d'arrivée, le bloc du mois ancien passait alors devant
   * « Cette semaine » : les réunions récentes étaient bien là, mais reléguées
   * sous un bloc daté d'un autre mois — d'où « je ne vois plus que certaines de
   * mes réunions ». Le tri Mongo reste sur `now` (il est servi par un index et
   * départage les dates absentes) ; l'ordre rendu, lui, suit la date affichée.
   */
  app.get('/history', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const docs = await app.db
      .collection('resume')
      .find(ownerFilter(email))
      .sort({ now: -1 })
      .project({ _id: 0 })
      .toArray();

    const nowDate = new Date();
    return (
      docs
        .map((d) => {
          const date = new Date(d.lastConnecion || d.lastConnection || d.now);
          const time = date.getTime();
          const diffDays = Math.floor((nowDate - date) / 86400000);
          let weekLabel;
          if (diffDays < 7) weekLabel = 'Cette semaine';
          else if (diffDays < 14) weekLabel = 'Semaine dernière';
          else weekLabel = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
          return {
            item: {
              ...d,
              // Aucun titre FABRIQUÉ ici. Le repli daté est un choix d'AFFICHAGE
              // — il dépend du fuseau et de la langue du lecteur — et vit côté
              // client (src/utils/historyTitle.js). Un repli composé ici
              // passerait pour un vrai titre et court-circuiterait le sien : les
              // réunions non résumées s'afficheraient dans le fuseau du serveur.
              title: d.title || '',
              date: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
              weekLabel,
            },
            // NaN si le document ne porte aucune date lisible (entrées n8n
            // anciennes) : ces réunions passent en fin de liste plutôt que de
            // désordonner les autres — jamais elles n'en sortent.
            time: Number.isNaN(time) ? -Infinity : time,
          };
        })
        // Comparaison sans soustraction : deux documents sans date lisible
        // donneraient `-Infinity - -Infinity` = NaN, comparateur que la
        // spécification laisse indéfini. Tri stable (ES2019) : à date égale,
        // l'ordre `now` de Mongo est conservé.
        .sort((a, b) => (a.time === b.time ? 0 : b.time > a.time ? 1 : -1))
        .map(({ item }) => item)
    );
  });

  /**
   * Ouverture d'une réunion — appelée au DÉMARRAGE de l'enregistrement.
   *
   * Avant, un document `resume` ne naissait qu'à la première génération de
   * compte-rendu. Une réunion en cours, ou terminée sans résumé, n'existait
   * alors NULLE PART : ni dans l'historique, ni après un rechargement de page.
   * Tout ce qui avait été dit disparaissait avec l'onglet.
   *
   * Le document créé ici est un BROUILLON : sans titre (le frontend affiche
   * « Réunion JJ-MM-AAAA HH:MM » — cf. src/utils/historyTitle.js), sans résumé
   * et sans version. `/transcription/update` y déverse la transcription au fil
   * de l'eau, `/history/notes-actions` les notes et les actions, `/resume` le
   * complète, `/history/stop` le clôt.
   *
   * `$setOnInsert` + upsert : rejouer l'appel (retry réseau, reprise de
   * session, double clic) ne réécrit RIEN d'un document déjà là — surtout pas
   * sa transcription ni son titre.
   */
  app.post(
    '/history/start',
    {
      schema: {
        body: {
          type: 'object',
          required: ['meetingId'],
          additionalProperties: false,
          properties: {
            meetingId: { type: 'string', minLength: 1, maxLength: 64 },
            startedAt: { type: 'string', maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = requireEmail(req, reply);
      if (!email) return;
      const { name } = identityFromHeaders(req.headers);
      const { meetingId } = req.body;
      // Horodatage du client (heure locale de la réunion) ; illisible ou
      // absent, l'heure serveur fait foi plutôt qu'une date invalide en base.
      const parsed = req.body.startedAt ? new Date(req.body.startedAt) : null;
      const startedAt =
        parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();

      await app.db.collection('resume').updateOne(
        ownerFilter(email, { meetingId }),
        {
          $setOnInsert: {
            ...ownerFields(email),
            meetingId,
            name,
            // PAS de titre : c'est l'absence de titre qui fait afficher
            // « Réunion JJ-MM-AAAA HH:MM » tant qu'aucun résumé n'a été généré.
            resume: '',
            transcription: '',
            transcriptionChars: 0,
            actions: [],
            notes: '',
            versions: [],
            template: null,
            language: null,
            // `lastConnecion` (faute héritée de n8n) porte la date AFFICHÉE et
            // décide du groupe de la sidebar — cf. /history.
            lastConnecion: startedAt,
            now: startedAt,
            meetingStartTime: startedAt,
            meetingDuration: null,
            meetingDurationSource: 'unknown',
            status: 'recording',
          },
        },
        { upsert: true },
      );
      return { ok: true, meetingId };
    },
  );

  /**
   * Clôture d'une réunion — appelée à l'ARRÊT de l'enregistrement.
   *
   * Pose la durée mesurée au chronomètre (jusqu'ici elle n'était enregistrée
   * qu'à la génération d'un résumé : une réunion jamais résumée n'en avait
   * aucune) et sort le document de l'état `recording`.
   *
   * `discardIfEmpty` : un enregistrement lancé par erreur puis arrêté sans une
   * seule phrase transcrite ne laisse pas de ligne vide dans l'historique. La
   * purge est faite ICI et non par le client — un onglet fermé juste après
   * l'arrêt abandonnerait le déchet en base.
   *
   * `notes` / `actions` : l'état de la colonne de droite au moment de l'arrêt,
   * écrit dans la MÊME opération que la clôture. Sans eux, une réunion
   * terminée par « Enregistrer » se rouvrait sans ses notes ni ses actions —
   * elles n'étaient écrites qu'avec un compte rendu.
   *
   * Réunion déjà supprimée — « Supprimer la réunion » en fin de réunion envoie
   * la suppression avant la clôture : sa durée va à la trace que la suppression
   * a laissée (cf. lib/quota.js), puis 404 comme avant. Sans ce rattrapage, ses
   * minutes ne comptaient jamais.
   */
  app.post(
    '/history/stop',
    {
      schema: {
        body: {
          type: 'object',
          required: ['meetingId'],
          additionalProperties: false,
          properties: {
            meetingId: { type: 'string', minLength: 1, maxLength: 64 },
            duration: { type: ['number', 'null'] },
            discardIfEmpty: { type: 'boolean' },
            notes: notesSchema,
            actions: actionsSchema,
          },
        },
      },
    },
    async (req, reply) => {
      const email = requireEmail(req, reply);
      if (!email) return;
      const { meetingId, duration = null, discardIfEmpty = false } = req.body;
      const side = notesActionsFields(req.body);
      // `sanitizeDuration` renvoie null pour 0 : une durée inconnue ne doit
      // pas écraser celle déjà inscrite (cf. lib/meetingDuration.js).
      const timed = sanitizeDuration(duration);
      const gone = async () => {
        await app.quota.recordLateStop(email, meetingId, timed);
        return fail(reply, 404, 'meeting_not_found');
      };

      const doc = await app.db.collection('resume').findOne(ownerFilter(email, { meetingId }), {
        projection: { versions: 1, transcription: 1, resume: 1, notes: 1, actions: 1 },
      });
      if (!doc) return gone();

      // Vide au sens STRICT : rien de dit, rien de rédigé, aucune version. Un
      // résumé déjà généré (ou une transcription importée) protège toujours la
      // réunion, quel que soit le drapeau du client. Des notes ou une action
      // écrites aussi — celles de la requête, sinon celles déjà en base : les
      // purger effacerait ce que l'utilisateur a tapé.
      const isEmpty =
        !(doc.transcription || '').trim() &&
        !(doc.resume || '').trim() &&
        !(doc.versions || []).length &&
        !hasNotesActionsContent({ notes: doc.notes, actions: doc.actions, ...side });
      if (discardIfEmpty && isEmpty) {
        await app.db.collection('resume').deleteOne(ownerFilter(email, { meetingId }));
        return { ok: true, discarded: true };
      }

      const res = await app.db.collection('resume').updateOne(ownerFilter(email, { meetingId }), {
        $set: {
          status: 'ended',
          ...(timed ? { meetingDuration: timed, meetingDurationSource: 'timer' } : {}),
          ...side,
        },
      });
      // Supprimée entre la lecture et l'écriture : même rattrapage.
      if (!res.matchedCount) return gone();
      return { ok: true, discarded: false };
    },
  );

  /**
   * Notes et actions modifiées — sans compte rendu à générer.
   *
   * Appelée par le frontend en différé (stores/notesActionsSave.js), à chaque
   * modification de la colonne de droite d'une réunion déjà en base : pendant
   * l'enregistrement comme sur une réunion rouverte depuis l'historique. Avant
   * elle, une note ou une action modifiée après coup ne survivait qu'en local,
   * jusqu'au prochain résumé.
   *
   * Jamais d'upsert : `ownerFilter` renvoie un `$or`, le document créé n'aurait
   * pas d'appartenance (règle dure n°2). Une réunion inconnue — supprimée
   * pendant le délai d'écriture, ou depuis un autre onglet — répond 404 : il
   * n'y a plus rien où écrire, et le client n'en fait pas une erreur.
   */
  app.post(
    '/history/notes-actions',
    {
      schema: {
        body: {
          type: 'object',
          required: ['meetingId'],
          anyOf: [{ required: ['notes'] }, { required: ['actions'] }],
          additionalProperties: false,
          properties: {
            meetingId: { type: 'string', minLength: 1, maxLength: 64 },
            notes: notesSchema,
            actions: actionsSchema,
          },
        },
      },
    },
    async (req, reply) => {
      const email = requireEmail(req, reply);
      if (!email) return;
      const { meetingId } = req.body;
      const res = await app.db
        .collection('resume')
        .updateOne(ownerFilter(email, { meetingId }), { $set: notesActionsFields(req.body) });
      if (!res.matchedCount) return fail(reply, 404, 'meeting_not_found');
      return { ok: true };
    },
  );

  /**
   * Suppression d'une réunion — scopée meetingId + email (fix sécurité).
   *
   * Ses minutes restent au quota : la trace part AVANT la réunion (cf.
   * lib/quota.js, « Une réunion supprimée compte encore »). Sans elle,
   * supprimer une réunion rendait ses minutes, déjà payées chez OpenAI.
   */
  app.post('/history/delete', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = idOf(req.body?.meetingId);
    if (!meetingId) return reply.code(400).send({ ok: false, error: 'meetingId_required' });
    await app.quota.keepDeletedUsage(email, meetingId);
    await app.db.collection('resume').deleteMany(ownerFilter(email, { meetingId }));
    // L'infographie suit sa réunion : sans cette ligne, l'image (plusieurs Mo)
    // resterait orpheline en base, invisible et impossible à purger depuis l'app.
    await app.db.collection(INFOGRAPHICS_COLLECTION).deleteMany(ownerFilter(email, { meetingId }));
    return { ok: true };
  });

  /**
   * Nommage IA d'une réunion SANS compte rendu — le bouton « Enregistrer » de
   * la fin de réunion.
   *
   * Jusqu'ici le titre n'était généré qu'avec le résumé (/resume) : une
   * réunion arrêtée sans résumé restait « Réunion JJ-MM-AAAA HH:MM » dans
   * l'historique, et il fallait rédiger un compte rendu pour la nommer. Ici le
   * titre se tire de la transcription seule (le prompt le prévoit : le résumé
   * vide, la transcription fait foi).
   *
   * Même contrat que /resume : `titlePending` posé AVANT la réponse — le
   * premier rechargement d'historique du client le voit et relit jusqu'à la
   * chute du drapeau —, titre en tâche de fond, drapeau retiré dans tous les
   * cas.
   *
   * N'écrase JAMAIS un titre déjà là : posé à la main pendant la réunion
   * (/history/rename) ou généré plus tôt. Seul le repli littéral du serveur
   * (« Réunion sans titre », génération passée en échec) se retente. Sans
   * matière (rien de transcrit ni de rédigé), aucun appel modèle : il rendrait
   * le repli.
   *
   * `notes` / `actions` : l'état de la colonne de droite au rangement, écrit
   * avant tout le reste — y compris quand aucun titre n'est à générer. La
   * réunion rangée se rouvre avec, comme après un compte rendu.
   */
  app.post(
    '/history/title',
    {
      schema: {
        body: {
          type: 'object',
          required: ['meetingId'],
          additionalProperties: false,
          properties: {
            meetingId: { type: 'string', minLength: 1, maxLength: 64 },
            notes: notesSchema,
            actions: actionsSchema,
          },
        },
      },
    },
    async (req, reply) => {
      const email = requireEmail(req, reply);
      if (!email) return;
      const { meetingId } = req.body;
      const doc = await app.db.collection('resume').findOne(ownerFilter(email, { meetingId }), {
        projection: { title: 1, transcription: 1, resume: 1 },
      });
      if (!doc) return fail(reply, 404, 'meeting_not_found');

      const side = notesActionsFields(req.body);
      if (Object.keys(side).length) {
        await app.db
          .collection('resume')
          .updateOne(ownerFilter(email, { meetingId }), { $set: side });
      }

      const transcription = String(doc.transcription || '');
      const resumeHtml = String(doc.resume || '');
      const hasTitle = !!doc.title && doc.title !== UNTITLED_MEETING;
      if (hasTitle || !(transcription.trim() || resumeHtml.trim())) {
        // Rien à nommer, mais la réunion est RANGÉE : myBrain la reçoit
        // maintenant (sans matière, l'envoi le constate et ne dépose rien).
        app.background.track(feedMeetingToMyBrain({ app, log: req.log, email, meetingId }));
        return { ok: true, meetingId, titlePending: false };
      }

      await app.db
        .collection('resume')
        .updateOne(ownerFilter(email, { meetingId }), { $set: { titlePending: true } });
      app.background.track(
        generateAndSaveTitle({
          app,
          log: req.log,
          body: { transcription },
          email,
          resumeHtml,
          meetingId,
          origin: '/history/title',
        })
          .catch((err) =>
            req.log.error({ err: err.message, meetingId }, '/history/title : titre non sauvegardé'),
          )
          // myBrain APRÈS le titre, comme pour /resume.
          .then(() => feedMeetingToMyBrain({ app, log: req.log, email, meetingId })),
      );
      return { ok: true, meetingId, titlePending: true };
    },
  );

  /**
   * Renommage d'une réunion — NOUVEAU : le frontend l'appelait déjà en
   * best-effort mais l'endpoint n'existait pas côté n8n ; les titres ne
   * survivaient que dans le localStorage du navigateur.
   */
  app.post('/history/rename', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = idOf(req.body?.meetingId);
    const trimmed = (req.body?.title || '').toString().trim();
    if (!meetingId || !trimmed)
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    await app.db
      .collection('resume')
      .updateOne(ownerFilter(email, { meetingId }), { $set: { title: trimmed.slice(0, 80) } });
    return { ok: true };
  });

  /**
   * Range une conversation dans un tag, ou l'en sort (`tagId: null`).
   *
   * Un seul tag par conversation : `$set` écrase, il n'y a rien à cumuler.
   *
   * Le tag est REVÉRIFIÉ comme appartenant au demandeur. Sans ce contrôle, un
   * client pourrait écrire l'identifiant d'un tag d'autrui dans sa propre
   * conversation ; inoffensif aujourd'hui (il ne saurait pas l'afficher), mais
   * ces mêmes tags porteront des règles d'envoi et d'entreposage — une
   * référence croisée deviendrait alors un routage vers la mauvaise
   * destination.
   *
   * Contrat d'erreur : vrais codes HTTP (cf. lib/errors.js). Les routes
   * voisines de ce fichier répondent encore en `{ok:false}` par héritage n8n —
   * on n'étend pas cette forme aux nouvelles.
   */
  app.post(
    '/history/tag',
    {
      schema: {
        body: {
          type: 'object',
          required: ['meetingId'],
          additionalProperties: false,
          properties: {
            meetingId: { type: 'string', maxLength: 64 },
            tagId: { type: ['string', 'null'], maxLength: 64 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = requireEmail(req, reply);
      if (!email) return;
      const { meetingId, tagId = null } = req.body;

      if (tagId) {
        const tag = await app.db.collection('userTags').findOne(ownerFilter(email, { id: tagId }));
        if (!tag) return fail(reply, 404, 'tag_not_found');
      }

      const res = await app.db
        .collection('resume')
        .updateOne(
          ownerFilter(email, { meetingId }),
          tagId ? { $set: { tagId } } : { $unset: { tagId: '' } },
        );
      if (!res.matchedCount) return fail(reply, 404, 'meeting_not_found');

      return { ok: true, meetingId, tagId };
    },
  );

  /**
   * Ajout d'une version de résumé (vrai $push — n8n bricolait en $merge).
   *
   * IDEMPOTENT par identifiant de version. Le client ne pousse la version que
   * lorsqu'il croit le document déjà en base, tandis que /resume l'insère avec
   * sa V1 quand il ne l'y trouve pas : si /history/start a échoué en silence,
   * les deux chemins se croisent et la même version serait empilée deux fois —
   * l'écran afficherait deux onglets « Résumé 1 » identiques.
   */
  app.post('/versions/add', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = idOf(req.body?.meetingId);
    const version = req.body?.version;
    if (!meetingId || !version || typeof version !== 'object' || Array.isArray(version))
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    const doc = await app.db
      .collection('resume')
      .findOne(ownerFilter(email, { meetingId }), { projection: { versions: 1 } });
    if (version.id && (doc?.versions || []).some((v) => v?.id === version.id)) {
      return { ok: true, duplicate: true };
    }
    await app.db
      .collection('resume')
      .updateOne(ownerFilter(email, { meetingId }), { $push: { versions: version } });
    return { ok: true };
  });

  /** Suppression d'une version. */
  app.post('/versions/delete', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = idOf(req.body?.meetingId);
    const versionId = idOf(req.body?.versionId);
    if (!meetingId || !versionId)
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    await app.db
      .collection('resume')
      .updateOne(ownerFilter(email, { meetingId }), { $pull: { versions: { id: versionId } } });
    return { ok: true };
  });

  /**
   * Autosave du HTML d'une version éditée. Met aussi à jour le `resume`
   * top-level (le texte affiché par défaut), comme le pipeline n8n.
   */
  app.post('/versions/update', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = idOf(req.body?.meetingId);
    const versionId = idOf(req.body?.versionId);
    const html = req.body?.html;
    if (!meetingId || !versionId || !isOptionalText(html))
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    await app.db
      .collection('resume')
      .updateOne(
        ownerFilter(email, { meetingId }),
        { $set: { 'versions.$[v].html': html, resume: html } },
        { arrayFilters: [{ 'v.id': versionId }] },
      );
    return { ok: true };
  });

  /** Persistance de la transcription éditée d'une réunion sauvegardée. */
  app.post('/transcription/update', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const meetingId = idOf(req.body?.meetingId);
    const transcription = req.body?.transcription;
    if (!meetingId || !isOptionalText(transcription))
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    await app.db.collection('resume').updateOne(ownerFilter(email, { meetingId }), {
      $set: { transcription, transcriptionChars: (transcription || '').length },
    });
    return { ok: true };
  });
}
