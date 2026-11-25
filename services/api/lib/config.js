/**
 * Configuration lue dans l'environnement (authentification, OpenAI).
 *
 * Centralisée ici pour deux raisons : les tests injectent un objet sans toucher
 * à process.env, et il n'y a qu'un seul endroit à relire pour savoir ce qui est
 * configurable en production.
 */
import { screenModelVariables } from './retiredModels.js';

/** Booléen d'environnement : vide → `fallback` ; `0`/`false`/`no`/`off` → faux. */
export function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** @param {Record<string, string|undefined>} [env] */
export function loadConfig(env = process.env) {
  // OPENAI_MODEL_* qui viserait un modèle retiré par OpenAI : vidée, l'usage
  // retombe sur son défaut (cf. lib/retiredModels.js).
  const modelEnv = screenModelVariables(env);
  const modelVar = (name) => modelEnv.values[name];
  return {
    /** Connexion Mongo — requis en prod, vérifié par server.js. */
    mongoUrl: env.MONGO_URL || '',
    mongoDb: env.MONGO_DB || 'mybrief',
    port: int(env.PORT, 3000),
    logLevel: env.LOG_LEVEL || 'info',
    /**
     * SMTP (reset de mot de passe + envoi de documents). host vide = mailer
     * désactivé, proprement (cf. lib/mailer.js).
     */
    smtp: {
      host: env.SMTP_HOST || '',
      port: int(env.SMTP_PORT, 587),
      secure: bool(env.SMTP_SECURE, false),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.MAIL_FROM || '',
    },
    /**
     * Comptes externes reliés par les utilisateurs.
     *
     * `encryptionKey` chiffre les refresh tokens AU REPOS. Elle vient de
     * l'environnement et JAMAIS de la base : c'est ce qui rend une copie de la
     * base — mongodump, archive de backup.sh, volume récupéré — inexploitable
     * sans l'environnement qui va avec. Vide = stockage en clair, comme avant
     * (cf. lib/crypto/secretBox.js).
     */
    connections: {
      encryptionKey: env.CONNECTIONS_ENC_KEY || '',
    },
    /**
     * Fenêtres de rate-limit — CONSTANTES nommées, pas des variables d'env :
     * une seule table à lire (et à surcharger en test via configOverride) au
     * lieu de littéraux dispersés dans cinq fichiers de routes.
     */
    rateLimits: {
      loginByIp: { windowMs: 15 * 60 * 1000, max: 10 },
      loginByAccount: { windowMs: 15 * 60 * 1000, max: 5 },
      passwordChange: { windowMs: 60 * 60 * 1000, max: 10 },
      forgotByEmail: { windowMs: 60 * 60 * 1000, max: 3 },
      forgotByIp: { windowMs: 60 * 60 * 1000, max: 10 },
      resetByIp: { windowMs: 60 * 60 * 1000, max: 10 },
      ssoStartByIp: { windowMs: 15 * 60 * 1000, max: 20 },
      connectByIp: { windowMs: 15 * 60 * 1000, max: 20 },
      /**
       * Envoi de document, plafonné par COMPTE et non par IP : l'axe qui compte
       * est « ce compte a écrit 60 fois ce matin ». Derrière le NAT d'une
       * entreprise, tout le monde sort par la même adresse.
       *
       * Sans objet tant que la route ne pouvait écrire qu'au titulaire du
       * compte ; nécessaire depuis qu'elle atteint des tiers.
       */
      actionEmailByAccount: { windowMs: 60 * 60 * 1000, max: 60 },
      /**
       * Bouton « Tester » : un geste de diagnostic, pas un usage. La charge est
       * fixe (quelques centaines d'octets), donc seul le nombre compte. Par
       * compte ET par IP — la seconde clé attrape la création de comptes en
       * série.
       */
      actionTestByAccount: { windowMs: 60 * 60 * 1000, max: 10 },
      actionTestByIp: { windowMs: 60 * 60 * 1000, max: 30 },
      // Flux mobile. Généreux à dessein : plusieurs téléphones d'une même
      // entreprise sortent souvent par UNE seule IP publique (NAT), et un
      // plafond serré transformerait un jour de déploiement en panne.
      mobileStartByIp: { windowMs: 15 * 60 * 1000, max: 60 },
      mobileExchangeByIp: { windowMs: 15 * 60 * 1000, max: 60 },
      /**
       * Envoi d'action. Non optionnel depuis les destinataires paramétrables :
       * cette route ne pouvait écrire qu'au titulaire du compte, elle peut
       * désormais atteindre des tiers. Généreux — 60 comptes rendus par heure
       * est au-delà de tout usage réel, et bien en deçà d'un usage en relais.
       */
      actionEmailByAccount: { windowMs: 60 * 60 * 1000, max: 60 },
      /**
       * Bouton « Tester ». Bien plus serré : c'est un geste de diagnostic, pas
       * un usage. La charge est fixe (document factice de quelques centaines
       * d'octets), donc seul le NOMBRE compte.
       */
      actionTestByAccount: { windowMs: 60 * 60 * 1000, max: 10 },
      actionTestByIp: { windowMs: 60 * 60 * 1000, max: 30 },
      /**
       * « Réessayer » un envoi à myBrain. Chaque clic est un appel sortant, et
       * la clé myBrain — 60 dépôts par heure — est partagée par toute
       * l'installation : un compte qui s'acharne ne doit pas l'épuiser pour les
       * autres. Large pour un usage réel, où l'on réessaie une poignée de
       * réunions après une panne.
       */
      myBrainSendByAccount: { windowMs: 60 * 60 * 1000, max: 30 },
      /**
       * Aide IA d'une réunion (routes/aiHelp.js). Chaque appel est un appel au
       * modèle, payé par la clé de l'installation : plafonné par COMPTE.
       * `watch` suit la cadence de la réunion — une lecture toutes les
       * quelques phrases, soit bien moins de 240 par heure pour un débit de
       * parole réel ; au-delà, ce n'est plus une réunion. `ask` est un geste
       * humain : 60 questions par heure est déjà une réunion passée à
       * interroger l'IA. `projects` suit la frappe dans le champ de recherche.
       */
      aiHelpWatchByAccount: { windowMs: 60 * 60 * 1000, max: 240 },
      aiHelpAskByAccount: { windowMs: 60 * 60 * 1000, max: 60 },
      aiHelpProjectsByAccount: { windowMs: 60 * 60 * 1000, max: 120 },
      // « Tester la lecture » (Administration → Aide IA) : un diagnostic.
      aiHelpTestByAccount: { windowMs: 60 * 60 * 1000, max: 30 },
      /**
       * La voix de l'Aide IA (/ai-help/speech), payée par la clé de
       * l'installation quand le moteur est OpenAI ou Mistral : une
       * intervention lue = un appel. 240 par heure, c'est une intervention
       * lue toutes les quinze secondes pendant une heure — et les « Écouter »
       * des Réglages. `voices` relance les essais des moteurs (gardés six
       * heures) : il suit l'ouverture de la page.
       */
      aiHelpSpeechByAccount: { windowMs: 60 * 60 * 1000, max: 240 },
      aiHelpVoicesByAccount: { windowMs: 60 * 60 * 1000, max: 60 },
    },
    /**
     * Transcriptions de fichier (/record) traitées en même temps par le
     * process ; au-delà, 503 `record_busy` (cf. routes/ai.js). Constante, comme
     * les rate-limits : surchargeable en test via configOverride.
     */
    recordMaxInFlight: 2,
    /** Durée de vie d'une session native, glissante. */
    sessionTtlMs: int(env.SESSION_TTL_DAYS, 7) * 24 * 60 * 60 * 1000,
    /**
     * `false` uniquement pour le dev local en http — un cookie Secure n'est
     * jamais renvoyé sur une origine non chiffrée, la session serait perdue à
     * chaque requête sans le moindre message d'erreur.
     */
    cookieSecure: bool(env.COOKIE_SECURE, true),
    passwordResetTtlMs: int(env.PASSWORD_RESET_TTL_MIN, 30) * 60 * 1000,
    /** Base des liens de réinitialisation envoyés par mail. */
    appPublicUrl: (env.APP_PUBLIC_URL || '').replace(/\/+$/, ''),
    /**
     * Formulaire de remontées ouvert par « Déclarer un bug ou une idée ».
     * Propre à chaque installation ; vide, l'entrée disparaît du menu. Seules
     * les adresses http(s) passent : la valeur finit dans un lien cliquable.
     */
    feedbackUrl: /^https?:\/\//i.test(env.FEEDBACK_URL || '') ? env.FEEDBACK_URL : '',
    /** Documentation ouverte par « Aide » : la publique, sauf si l'installation a la sienne. */
    docsUrl: /^https?:\/\//i.test(env.DOCS_URL || '')
      ? env.DOCS_URL
      : 'https://docs.myalfred.ai/my-brief/',
    /**
     * Pilote l'affichage du bouton « Se connecter avec Google » : le plugin
     * OIDC vit dans les labels Traefik, l'API n'a aucun moyen de deviner s'il
     * est monté — d'où ce drapeau explicite.
     */
    oidcEnabled: bool(env.OIDC_ENABLED, true),
    passwordLoginEnabled: bool(env.PASSWORD_LOGIN_ENABLED, true),
    /**
     * Compte d'amorçage, créé seulement sur une base vierge. Aucune valeur par
     * défaut : un identifiant connu de tous ouvrirait l'administration de
     * toute installation faite à la main. Sur une base vierge, seedAdmin()
     * refuse de démarrer si l'email ou le mot de passe (12 caractères au
     * moins) manquent ; install/install.sh génère le mot de passe.
     */
    adminSeed: {
      enabled: bool(env.ADMIN_SEED_ENABLED, true),
      email: env.ADMIN_SEED_EMAIL || '',
      password: env.ADMIN_SEED_PASSWORD || '',
    },
    /**
     * Emails promus administrateurs à chaque démarrage. Prévu pour les
     * installations où l'authentification passe par un IdP : aucun compte
     * d'amorçage n'y est créé, c'est donc le seul moyen de désigner un
     * administrateur sans toucher à la base.
     */
    adminEmails: String(env.ADMIN_EMAILS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    /**
     * Domaine dont les comptes existants sont promus admin UNE SEULE FOIS au
     * premier boot, pour reproduire la règle historique `isInternalEmail`.
     * Vide (défaut) = migration désactivée. Seules les installations
     * antérieures au champ `role` le fixent dans leur .env. Ce n'est pas une
     * règle vivante : après la migration, seul un admin promeut.
     */
    legacyAdminDomain: env.LEGACY_ADMIN_DOMAIN || '',
    /**
     * Domaines dont TOUT compte est administrateur, réappliqué à chaque
     * démarrage. À distinguer de `legacyAdminDomain`, qui ne s'applique qu'une
     * fois, aux comptes créés avant l'introduction du champ `role` : un compte
     * créé APRÈS cette migration naît avec `role: 'user'` et n'est donc jamais
     * promu par elle — c'est ce trou qui laissait un exploitant sans accès à sa
     * propre administration, sans autre issue qu'un accès SSH.
     *
     * ⚠️ Règle VIVANTE et non une migration : toute personne disposant d'une
     * adresse dans l'un de ces domaines devient administrateur. À ne renseigner
     * que pour un domaine dont on maîtrise la création des comptes. Vide
     * partout par défaut, y compris chez les clients.
     */
    adminEmailDomains: String(env.ADMIN_EMAIL_DOMAINS || '')
      .split(',')
      .map((value) => value.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean),
    /**
     * Authentification de l'app mobile (OTT → JWT → ForwardAuth), rapatriée
     * du sidecar services/mobile-auth. Mêmes noms de variables : une
     * installation existante n'a rien à changer, et les jetons déjà émis
     * restent valides tant que le secret ne bouge pas.
     *
     * `jwtSecret` vide (ou < 32 caractères) = fonctionnalité DÉSACTIVÉE, pas
     * dégradée : /auth/mobile/* répond 503 et /auth/verify refuse tout jeton.
     * Le sidecar, lui, quittait le process — l'API doit continuer à servir le
     * web, elle ne peut pas prendre cette liberté.
     */
    mobile: {
      jwtSecret: env.MOBILE_AUTH_JWT_SECRET || '',
      jwtTtlDays: int(env.MOBILE_JWT_TTL_DAYS, 30),
      ottTtlMs: int(env.OTT_TTL_SECONDS, 60) * 1000,
      /** Scheme custom de l'app native — cible du deep link de fin de flux. */
      appCallback: env.APP_CALLBACK || 'mybrief://auth/callback',
    },
    /**
     * OpenAI. La clé de l'environnement n'est plus qu'un AMORÇAGE : celle
     * saisie dans Administration → IA la remplace (cf.
     * lib/repositories/settings.js `resolveOpenAiKey`). Elle peut donc être
     * absente — une installation neuve se configure entièrement depuis
     * l'interface.
     */
    openai: {
      apiKey: (env.OPENAI_API_KEY || '').trim(),
      /** Proxy, Azure ou mock de test. Vide = api.openai.com. */
      baseUrl: (env.OPENAI_BASE_URL || '').trim(),
      /**
       * Modèle par usage, surchargeable sans redéployer de code.
       *
       * Les trois étaient codés en dur dans les routes, et un modèle
       * indisponible sur le compte OpenAI ne se voyait pas de la même façon
       * selon l'usage : le résumé remonte une erreur à l'utilisateur, alors que
       * le TITRE est généré en tâche de fond et échoue en silence — la réunion
       * gardait « Réunion sans titre » sans que rien ne l'explique côté app.
       *
       * Le titre tourne sur `gpt-6-luna`, appelé SANS raisonnement
       * (`reasoningEffort: 'none'`, routes/meetings.js) : une sortie de 5 mots
       * ne gagne rien à un modèle raisonnant, et gpt-6-luna raisonne en
       * « medium » si on ne lui dit rien. Il remplace gpt-4o-mini, que OpenAI
       * retire le 2027-01-14 avec gpt-4o, gpt-4.1 et gpt-4.1-mini — gpt-6-luna
       * est le remplaçant qu'OpenAI désigne pour les quatre, et coûte moins
       * cher. ⚠️ `none` est refusé par la génération 5.0 (gpt-5-mini) : un
       * `OPENAI_MODEL_TITLE` pointé dessus ferait échouer le titre, en silence
       * — il est ignoré depuis le 2026-11-12, comme tout modèle dont OpenAI a
       * annoncé le retrait (`ignoredModelVariables` ci-dessous).
       *
       * La détection d'actions tourne aussi sur `gpt-6-luna`, mais AVEC
       * raisonnement « medium » (lib/actionDetection.js). Elle était sur
       * gpt-5-mini, que OpenAI retire le 2026-12-11 ; le remplaçant désigné,
       * gpt-5.6-terra (même palier « mini »), coûtait 6,5 fois plus cher sur
       * un poste qui tourne EN CONTINU pendant la réunion : ~3,3 $ de l'heure,
       * plus de trois fois la transcription (cf. lib/costs/assumptions.js).
       * gpt-6-luna revient à ~0,15 $ de l'heure, moins du tiers d'avant.
       * Palier plus léger, génération plus récente : l'effort « medium », celui
       * que gpt-5-mini appliquait sans qu'on le demande, garde le raisonnement
       * qu'exigent ses consignes (sensibilité, mise à jour d'une action par son
       * id, dates relatives à calculer). Choisi sur le papier, sans appel réel :
       * le bouton « Tester » de la détection est le banc pour en juger.
       *
       * ⚠️ LE RÉSUMÉ NE TOURNE PLUS SUR gpt-4o-mini (2026-09-01) — défaut
       * `gpt-5.4` depuis le 2026-09-02. C'était la cause NUMÉRO UN de l'écart
       * de qualité mesuré avec l'application ChatGPT à prompt identique : le
       * résumé — le cœur du produit — tournait sur gpt-4o-mini, quand la
       * détection d'actions et l'infographie étaient déjà sur gpt-5-mini.
       * Aucun prompt ne rattrape cet écart de modèle sur une transcription de
       * réunion entière.
       *
       * `summary` est SANS DÉFAUT ICI, comme `transcription` : le choix se fait
       * dans Administration → IA, et le défaut vit à un seul endroit
       * (`DEFAULT_SUMMARY_MODEL`, lib/summaryModels.js). Un défaut recopié ici
       * se serait mis à mentir au premier changement de l'écran, et l'écran ne
       * pourrait plus distinguer « imposé par le déploiement » de « défaut de
       * l'application ». Contrairement à la transcription, une valeur hors
       * liste est CONSERVÉE : cette variable est la porte de sortie de
       * l'administrateur système (un palier 5.6 non listé, une génération plus
       * récente, un déploiement Azure) — cf. `resolveSummaryModel`.
       */
      models: {
        summary: modelVar('OPENAI_MODEL_SUMMARY'),
        title: modelVar('OPENAI_MODEL_TITLE') || 'gpt-6-luna',
        actions: modelVar('OPENAI_MODEL_ACTIONS') || 'gpt-6-luna',
        /**
         * Aide IA d'une réunion (lib/aiHelp/) : lire le passage qui vient
         * d'être dit contre la fiche d'un projet, répondre à une question.
         * Même modèle que la détection d'actions, pour la même raison — un
         * appel court, répété pendant toute la réunion, qui doit revenir en
         * quelques secondes. NON MESURÉ sur de vraies réunions : la justesse
         * d'un garde-fou (repérer une contradiction, se taire le reste du
         * temps) est à éprouver en recette, et cette variable est la porte de
         * sortie si un palier supérieur s'avère nécessaire.
         */
        aiHelp: modelVar('OPENAI_MODEL_AI_HELP') || 'gpt-6-luna',
        /**
         * Relecture des dernières phrases transcrites à la lumière des notes
         * de réunion (POST /api/refine-transcript). Tâche courte et fréquente :
         * un petit modèle suffit, sans raisonnement — même choix et même
         * réserve sur `none` que le titre ci-dessus.
         */
        refine: modelVar('OPENAI_MODEL_REFINE') || 'gpt-6-luna',
        /**
         * Modèle qui écrit le CONTENU de l'infographie (cf. lib/infographic.js) :
         * un JSON court (~400 jetons) dans un format fixe, que six gabarits
         * mettent en page. `gpt-6-luna` depuis le 2026-11-17 — le palier
         * rapide, déjà celui du titre, des actions et de l'Aide IA —, à la
         * place de `gpt-5.4`, le modèle de l'ère « image » où il fallait
         * concevoir une maquette entière en prose : l'infographie était jugée
         * trop lente en recette, et trier une réunion dans des rubriques
         * bornées ne demande pas le modèle du compte rendu.
         * ⚠️ Non mesuré sur génération réelle depuis ce dépôt : si le choix du
         * gabarit ou la fidélité des chiffres déçoivent,
         * `OPENAI_MODEL_INFOGRAPHIC=gpt-5.4` rend l'ancien modèle sans
         * redéployer de code.
         * Il ne suit PAS le modèle choisi dans Administration → IA : celui-là
         * règle le compte rendu.
         */
        infographic: modelVar('OPENAI_MODEL_INFOGRAPHIC') || 'gpt-6-luna',
        /**
         * Modèle qui DESSINE l'infographie — à ne pas confondre avec le
         * précédent, qui écrit son prompt. SANS DÉFAUT ICI, comme `summary` et
         * `transcription` : le choix se fait dans Administration → IA, et le
         * défaut vit à un seul endroit (`DEFAULT_INFOGRAPHIC_IMAGE_MODEL`,
         * lib/infographicModels.js). Une valeur hors liste est CONSERVÉE —
         * c'est la porte de sortie vers un palier non listé
         * (`gpt-image-2.5-sunburst`) ou une génération plus récente que cette
         * version, cf. `resolveInfographicImageModel`.
         */
        infographicImage: modelVar('OPENAI_MODEL_INFOGRAPHIC_IMAGE'),
        /**
         * Transcription live (session Realtime). Contrairement aux trois
         * autres, ce n'est qu'un AMORÇAGE : le choix se fait dans
         * Administration → IA, et l'API n'accepte qu'une liste fermée
         * (lib/transcriptionModels.js). Une valeur inconnue ici est ignorée,
         * pas propagée — elle casserait toutes les transcriptions.
         */
        transcription: (env.OPENAI_MODEL_TRANSCRIPTION || '').trim(),
      },
      /**
       * Plafond de temps du SEUL appel de résumé. Le défaut de 120 s du client
       * (lib/openai.js) a été dimensionné pour des appels sans raisonnement :
       * un modèle raisonnant qui synthétise une réunion d'une heure le dépasse,
       * et le
       * timeout n'est pas relançable (cf. lib/retry.js) — l'utilisateur perdait
       * la génération. Les autres appels gardent 120 s : les allonger ne
       * masquerait qu'une panne.
       */
      summaryTimeoutMs: Number(env.OPENAI_SUMMARY_TIMEOUT_MS || '') || 300_000,
      /**
       * Variables OPENAI_MODEL_* ignorées parce qu'elles visent un modèle
       * qu'OpenAI retire (lib/retiredModels.js) : server.js les nomme au
       * démarrage, seule trace de ce que le `.env` demandait.
       */
      ignoredModelVariables: modelEnv.ignored,
    },
  };
}
