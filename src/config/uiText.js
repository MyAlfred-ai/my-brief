/**
 * Textes d'interface utilisateur pour MyBrief
 * Support FR/EN
 */

export const uiTextData = {
  fr: {
    app: {
      // Titre de l'onglet du navigateur : index.html n'en connaît qu'un, en français.
      documentTitle: 'MyBrief - Transcription & Résumé de Réunions',
      languageToggleLabel: 'Changer de langue',
      languageNames: {
        fr: 'Français',
        en: 'Anglais',
      },
    },
    orientation: {
      title: 'Tournez votre appareil',
      message: 'MyBrief est conçu pour le mode portrait.',
    },
    /**
     * Popup « Quoi de neuf ? », ouverte par le numéro de version en bas à
     * droite. Seule la CHROME est ici : le texte des nouveautés s'écrit dans
     * NOUVEAUTES.md, publié dans src/whats-new.json (cf. scripts/).
     * `new` / `improvement` / `fix` suivent le genre publié de chaque entrée.
     */
    whatsNew: {
      badgeLabel: 'Voir les nouveautés (version {version})',
      title: 'Quoi de neuf ?',
      subtitle: 'Les dernières nouveautés de MyBrief.',
      version: 'Version {version}',
      new: 'Nouveau',
      improvement: 'Amélioré',
      fix: 'Corrigé',
      admins: 'Administration',
      empty: 'Aucune nouveauté à afficher pour le moment.',
      close: 'Fermer',
    },
    nativeLogin: {
      title: 'Bienvenue sur MyBrief',
      message: 'Connectez-vous pour enregistrer et résumer vos réunions.',
      button: 'Se connecter',
      waiting: 'Connexion en cours dans votre navigateur…',
      cancel: 'Annuler',
      error: 'La connexion a échoué. Réessayez.',
    },
    signIn: {
      title: 'Bienvenue sur MyBrief',
      subtitle: 'Connectez-vous pour enregistrer et résumer vos réunions.',
      emailLabel: 'Adresse email',
      passwordLabel: 'Mot de passe',
      submit: 'Se connecter',
      submitting: 'Connexion…',
      ssoDivider: 'ou',
      ssoButton: 'Se connecter avec le SSO',
      googleButton: 'Continuer avec Google',
      entraButton: 'Continuer avec Microsoft',
      forgot: 'Mot de passe oublié ?',
      showPassword: 'Afficher le mot de passe',
      hidePassword: 'Masquer le mot de passe',
      backToSignIn: '← Retour à la connexion',
      forgotTitle: 'Mot de passe oublié',
      forgotMessage:
        'Saisissez votre adresse email : si un compte existe, vous recevrez un lien de réinitialisation.',
      forgotSubmit: 'Envoyer le lien',
      forgotSent:
        "Si un compte existe pour cette adresse, un lien vient d'être envoyé. Il est valable 30 minutes.",
      resetTitle: 'Choisissez un nouveau mot de passe',
      resetSubmit: 'Enregistrer le mot de passe',
      resetDone: 'Mot de passe enregistré. Vous pouvez vous connecter.',
      errors: {
        invalid_credentials: 'Adresse email ou mot de passe incorrect.',
        too_many_attempts: 'Trop de tentatives. Réessayez dans {minutes} minute(s).',
        invalid_body: 'Vérifiez votre adresse email et votre mot de passe.',
        password_login_disabled: 'La connexion par mot de passe est désactivée sur ce serveur.',
        password_reset_disabled:
          "La réinitialisation par email n'est pas configurée sur ce serveur.",
        invalid_or_expired_token: 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.',
        // Contrôle d'origine du serveur : la requête ne vient pas de cette page.
        forbidden: 'Requête refusée. Rechargez la page et réessayez.',
        network: 'Serveur injoignable. Vérifiez votre connexion.',
        unknown: 'Une erreur est survenue. Réessayez.',
        // Retours du flux Google (slugs renvoyés en ?error= par le callback)
        google_disabled: "La connexion Google n'est pas configurée sur ce serveur.",
        google_cancelled: 'Connexion Google annulée.',
        google_failed: 'La connexion Google a échoué. Réessayez.',
        google_state_mismatch: 'Session de connexion expirée. Réessayez.',
        google_email_unverified: "Cette adresse Google n'est pas vérifiée.",
        // Retours des autres fournisseurs OIDC natifs (Entra) — mêmes causes,
        // libellés sans marque puisque le fournisseur peut varier.
        sso_disabled: "La connexion SSO n'est pas configurée sur ce serveur.",
        sso_cancelled: 'Connexion annulée.',
        sso_failed: 'La connexion a échoué. Réessayez.',
        sso_state_mismatch: 'Session de connexion expirée. Réessayez.',
        sso_email_missing:
          'Votre compte ne publie aucune adresse email exploitable. Contactez un administrateur.',
        domain_not_allowed:
          "Votre domaine email n'est pas autorisé sur cette application. Contactez un administrateur.",
        account_disabled: 'Ce compte est désactivé. Contactez un administrateur.',
      },
    },
    // Pastilles de configuration (components/ui/ConfigAlertDot.svelte) : une
    // phrase par code du diagnostic (services/api/lib/configChecks.js). Dire ce
    // qui ne marche pas ET ce que ça coûte, en une ligne : c'est tout ce que la
    // bulle a pour convaincre d'aller corriger.
    configChecks: {
      adminTitle: "À régler dans l'administration",
      configTitle: 'À régler dans vos réglages',
      more: '+ {count} autre(s) point(s)',
      unknown: 'Un réglage est à revoir ici.',
      issues: {
        ai_key_missing:
          "Aucune clé OpenAI : les réunions sont enregistrées, mais rien n'est transcrit ni résumé.",
        ai_key_rejected:
          "OpenAI refuse la clé enregistrée : transcription et comptes rendus sont à l'arrêt.",
        ai_provider_key_missing:
          "{provider} est choisi pour la transcription, mais sa clé n'est pas enregistrée : rien n'est transcrit.",
        ai_provider_key_rejected:
          "{provider} refuse la clé enregistrée : la transcription est à l'arrêt.",
        ai_summary_provider_key_missing:
          "{provider} est choisi pour les comptes rendus, mais sa clé n'est pas enregistrée : aucun compte rendu n'est rédigé.",
        ai_summary_provider_key_rejected:
          "{provider} refuse la clé enregistrée : les comptes rendus sont à l'arrêt.",
        storage_provider_missing:
          "« Entreposer » est proposé, mais aucun fournisseur (Google ou Microsoft) n'est choisi : le bouton n'apparaît pas.",
        mail_unavailable:
          "« Envoyer par mail » est proposé, mais le serveur n'a pas de relais SMTP et aucun compte ne peut être relié : le bouton n'apparaît pas.",
        connect_credentials_missing:
          'Identifiants {provider} absents : personne ne peut relier son compte pour le mail et le dépôt.',
        mybrain_key_unreadable:
          'La clé MyBrain enregistrée ne peut plus être lue : collez-la de nouveau.',
        mybrain_key_rejected: "MyBrain refuse la clé enregistrée : les réunions n'y arrivent plus.",
        mybrain_right_missing:
          "La clé MyBrain n'a plus le droit « nourrir » : les réunions y sont refusées.",
        mybrain_unreachable:
          "MyBrain ne répond pas à l'adresse enregistrée : les réunions n'y arrivent plus.",
        prices_stale:
          "Tarifs d'IA relevés il y a {days} jours : actualisez-les pour des estimations justes.",
        branding_default: "Logo, phrase d'accueil et couleurs sont encore ceux d'origine.",
        company_logo_missing:
          "Logo de l'entreprise non renseigné : les infographies portent celui de l'application à sa place.",
        org_context_empty:
          "Aucun vocabulaire d'organisation : noms de clients, de projets et sigles risquent d'être mal écrits dans les comptes rendus.",
        connection_missing:
          "Des dossiers de dépôt sont réglés, mais aucun compte {provider} n'est relié : les dépôts échoueront.",
        connection_scope_missing:
          "Votre compte {provider} n'autorise pas le dépôt : reconnectez-le.",
        connection_revoked:
          'Votre compte {provider} ne répond plus (accès retiré ou expiré) : reconnectez-le.',
        storage_folder_missing:
          'Le dossier « {folder} » est introuvable : le prochain dépôt le recréera à cet emplacement.',
        storage_drive_missing:
          "La bibliothèque « {drive} » n'est plus accessible : les dépôts y échoueront.",
        tag_folder_missing:
          'Tag « {tag} » : le dossier « {folder} » est introuvable, le prochain dépôt le recréera.',
        tag_drive_missing:
          "Tag « {tag} » : la bibliothèque « {drive} » n'est plus accessible, les dépôts y échoueront.",
      },
    },
    adminAuth: {
      tabLabel: 'Authentification',
      // ── Carte « Page de connexion » : une pastille par mode, son détail au clic ──
      loginModesTitle: 'Page de connexion',
      loginModesIntro:
        'Les modes de connexion proposés à vos utilisateurs, tels qu’ils apparaissent sur la page de connexion. Un point vert : le mode est affiché. Cliquez une pastille pour régler son mode.',
      modesCount: '{count} sur {total} affichés',
      // Noms courts des pastilles ; le détail déplié reprend le nom complet.
      modeNames: {
        password: 'Email et mot de passe',
        google: 'Google',
        entra: 'Microsoft',
        legacy: 'SSO historique',
      },
      modeShown: 'Affiché',
      modeHidden: 'Masqué',
      modeChanged: 'Modifié',
      modeOffer: 'Proposer sur la page de connexion',
      modePassword: 'Email et mot de passe',
      modePasswordUsage: 'Pour les comptes qui ont un mot de passe myBrief.',
      modePasswordEnvOff:
        'Désactivé par la configuration du déploiement (PASSWORD_LOGIN_ENABLED) : ce mode reste masqué quel que soit ce réglage.',
      modeLegacy: 'SSO historique (plugin Traefik)',
      modeLegacyHint:
        'Bouton servi par le plugin du déploiement, en parallèle de la connexion native. Masquez-le une fois la bascule native faite pour clarifier la page.',
      modeTest: 'Tester',
      modeTestInfoLabel: 'Ce que fait le test',
      modeTestHint:
        '« Tester » joue le vrai flux de connexion dans un nouvel onglet — le seul test qui prouve la configuration de bout en bout (secret, URI de redirection, annuaire). Terminer le flux avec un autre compte bascule votre session sur ce compte.',
      noModeLeft:
        'Au moins un mode de connexion doit rester affiché, sinon plus personne ne peut se connecter — vous compris.',
      googleTitle: 'Connexion avec Google',
      googleIntro:
        "Créez un identifiant OAuth « Application Web » dans Google Cloud Console, puis reportez ici l'ID client et le secret.",
      // ── Entra ID (fournisseur natif, joué par l'API) ──
      entraTitle: 'Connexion avec Microsoft Entra ID',
      entraIntro:
        "SSO d'entreprise. Les identifiants proviennent de l'app registration de votre annuaire.",
      entraDiscovery: 'Annuaire (URL de découverte)',
      entraFromEnv:
        'Repris de la configuration du déploiement. Modifiable uniquement côté serveur.',
      entraRedirectLocked:
        "Cette URI est DÉJÀ enregistrée dans votre app registration Entra : l'application la reprend telle quelle et ne doit pas en changer. Elle sert aussi au retour de connexion des comptes Microsoft.",
      graphPermissionsHint:
        "Pour que vos utilisateurs relient leur compte, l'app registration doit porter les permissions déléguées Microsoft Graph « Mail.Send » (envoyer les comptes rendus) et « Files.ReadWrite » (déposer dans le OneDrive), plus « Sites.ReadWrite.All » (bibliothèques SharePoint) tant que « Proposer les bibliothèques SharePoint » reste activé dans Administration → Actions. myBrief les demande ENSEMBLE et Entra ne consent pas à moitié : une seule refusée, et aucun compte ne se relie. Le réglage de consentement par défaut de Microsoft exige de toute façon le consentement administrateur.",
      entraDisabledHint: "Aucun identifiant Entra n'est configuré sur ce serveur.",
      entraLegacyPlugin:
        'Le SSO historique (plugin Traefik) est encore actif en parallèle sur ce serveur.',
      clientId: 'ID client',
      clientSecret: 'Secret client',
      secretSet: '•••••••• (déjà enregistré)',
      secretEmpty: 'Collez le secret client',
      secretKeepHint: 'Laissez vide pour conserver le secret actuel.',
      secretRequiredHint: 'Le secret est requis pour activer la connexion Google.',
      entraSecretRequiredHint: 'Le secret est requis pour activer la connexion Microsoft.',
      redirectUri: 'URI de redirection autorisée',
      redirectHint:
        'À copier telle quelle dans « URI de redirection autorisés » de votre identifiant Google Cloud.',
      redirectUriMail: 'URI de redirection (envoi par mail)',
      redirectMailHint:
        "Deuxième URI du même identifiant Google Cloud : elle sert au flux « Envoyer par mail » (connexion Gmail des utilisateurs). Sans elle, la connexion échoue en redirect_uri_mismatch. L'API Gmail doit aussi être activée dans le projet.",
      credentialsRequired:
        "Renseignez l'ID client et le secret avant d'activer la connexion Google.",
      entraCredentialsRequired:
        'Il manque un identifiant Entra — secret, ID client ou annuaire : la connexion Microsoft ne peut pas être activée.',
      domainsTitle: 'Domaines autorisés',
      domainsNone: 'Aucun',
      domainsOne: '1 domaine',
      domainsMany: '{count} domaines',
      domainsIntro:
        "Un utilisateur qui se connecte avec Google ou Microsoft depuis l'un de ces domaines obtient automatiquement un compte. Les autres sont refusés.",
      domainPlaceholder: 'exemple.fr',
      domainAdd: 'Ajouter',
      domainRemove: 'Retirer le domaine',
      domainEmpty:
        'Aucun domaine autorisé : personne ne peut créer de compte via Google ou Microsoft. Les comptes déjà créés par un administrateur continuent de fonctionner.',
      unsavedHint: 'Modifications non enregistrées',
      discardChanges: 'Annuler',
      saved: 'Enregistré',
    },
    adminAi: {
      tabLabel: 'Clés API',
      // Seconde page de la rubrique « Modèles IA » (AiTab, vue `models`).
      modelsTabLabel: 'Modèles',
      // Carte « Fournisseurs d'IA » : une pastille par fournisseur, sa clé au clic.
      providersTitle: "Fournisseurs d'IA",
      providersCount: '{count} sur {total} connectés',
      // Tuiles : ce qui tourne, un réglage déplié au clic.
      tileSummary: 'Comptes rendus',
      tileTranscription: 'Transcription',
      tileInfographic: 'Infographie',
      tileChanged: 'Modifié',
      tileKeyNeeded: 'Clé requise',
      // Liste des modèles de transcription.
      filterLabel: 'Fournisseur',
      filterAll: 'Tous',
      pricesInfoLabel: 'Comment lire les prix',
      lockedModel: 'Verrouillé : la clé de son fournisseur manque',
      openaiUsage: 'Comptes rendus, actions, titres, infographie et transcription',
      // Rôle de chaque fournisseur tiers, sous son nom (ProviderKey).
      providerUsage: {
        mistral:
          'Transcription du direct et des fichiers importés (Voxtral), et rédaction des comptes rendus',
        speechmatics: 'Transcription du direct et des fichiers importés, traitée en Europe',
        assemblyai: 'Transcription du direct et des fichiers importés',
      },
      // Où créer la clé, cité par l'aide du champ.
      providerConsoles: {
        mistral: 'console.mistral.ai',
        speechmatics: 'portal.speechmatics.com',
        assemblyai: 'assemblyai.com/dashboard',
      },
      keyTitle: 'Clé API OpenAI',
      keyIntro:
        "Créez une clé sur platform.openai.com, puis collez-la ici : elle est vérifiée auprès d'OpenAI avant d'être enregistrée, et ne quitte jamais le serveur.",
      keyReplace: 'Remplacer',
      keyAdd: 'Ajouter une clé',
      statusOn: 'Configurée',
      statusOff: 'Absente',
      statusRequired: 'Requise',
      statusOptional: 'Facultative',
      sourceSettings: 'Clé enregistrée depuis cet écran :',
      sourceEnv: 'Clé fournie par la configuration du serveur :',
      sourceNone: 'Aucune clé configurée : la transcription et les résumés sont indisponibles.',
      updatedBy: 'Enregistrée par',
      keyPlaceholderNew: 'sk-…',
      keyPlaceholderReplace: 'sk-… (remplace la clé actuelle)',
      overrideEnvWarning: 'Cette clé remplacera celle du fichier de configuration du serveur.',
      test: 'Tester la clé',
      testing: 'Test en cours…',
      testOk: 'Clé valide',
      clear: 'Retirer la clé',
      clearConfirm:
        "Retirer la clé enregistrée ? L'application reviendra à celle du fichier de configuration du serveur, s'il y en a une.",
      saved: 'Clé OpenAI enregistrée',
      modelTitle: 'Modèle de transcription',
      modelIntro:
        "Modèle qui transcrit la parole en direct pendant l'enregistrement. Il ne change ni les résumés ni la détection d'actions.",
      modelLabel: 'Modèle utilisé en direct',
      modelSourceEnv: 'Modèle fourni par la configuration du serveur.',
      modelSourceDefault: "Modèle par défaut de l'application.",
      // `transcriptionModelRetired` (lib/transcriptionModels.js) : le choix
      // enregistré nomme un modèle qu'OpenAI retire, déjà remplacé en service.
      modelRetired:
        '{from}, choisi pour cette installation, est retiré par OpenAI le {date}. {model}, qui transcrit de la même façon, le remplace déjà.',
      modelRetiredKeep: 'Garder {model}',
      modelHelp:
        "Testez avant d'enregistrer : le test ouvre une vraie session de transcription et révèle un modèle indisponible pour votre organisation.",
      modelTest: 'Tester ce modèle',
      modelTesting: 'Test en cours…',
      modelTestOk: 'Modèle opérationnel',
      modelSaved: 'Modèle enregistré',
      // Prix de chaque modèle de transcription (ModelPicker) : un niveau en
      // « € », relatif aux modèles proposés (utils/modelPrices.js), et le coût
      // d'une heure en euros, aux tarifs de la page Consommation.
      modelInService: 'En service',
      pricePerHour: '/h',
      priceLevel: 'Niveau de prix : {tier} sur {levels}',
      priceUnknown: 'Tarif inconnu',
      priceDeltaLess: '{amount} de moins par heure que le modèle en service.',
      priceDeltaMore: '{amount} de plus par heure que le modèle en service.',
      priceDeltaSame: 'Même prix par heure que le modèle en service.',
      pricesBasis:
        "Coût d'une heure de transcription, au tarif public de son fournisseur converti en euros. Chaque € de plus : un prix environ deux fois plus élevé. En visio, le son de vos interlocuteurs est transcrit à part : jusqu'à deux fois ce coût.",
      pricesRefreshLink: 'Actualiser les tarifs dans Consommation',
      // Prix de chaque modèle de rédaction : le coût ESTIMÉ d'un compte rendu,
      // sur les hypothèses de la page Consommation (lib/costs/assumptions.js).
      pricePerSummary: '/résumé',
      summaryPriceCaption: "Coût estimé d'un résumé · réunion d'une heure",
      summaryPricesBasis:
        "Le coût indiqué est celui d'un compte rendu d'une réunion d'une heure, estimé avec les hypothèses de la page Consommation et le tarif public du fournisseur converti en euros. Il est approximatif : il suit la durée de la réunion et la longueur de ce que le modèle écrit. Chaque € de plus : un prix environ quatre fois plus élevé.",
      summaryDeltaLess: '{amount} de moins par compte rendu que le modèle en service.',
      summaryDeltaMore: '{amount} de plus par compte rendu que le modèle en service.',
      summaryDeltaSame: 'Même prix par compte rendu que le modèle en service.',
      summaryTitle: 'Modèle de rédaction du compte rendu',
      summaryIntro:
        "Modèle qui rédige le compte rendu à partir de la transcription. C'est lui qui décide de la longueur, de la clarté et de la structure du résultat — le réglage le plus visible de cet écran.",
      summaryLabel: 'Modèle utilisé pour les comptes rendus',
      summarySourceEnv: 'Modèle imposé par la configuration du serveur.',
      summarySourceDefault: "Modèle par défaut de l'application.",
      summaryOffList:
        'Ce modèle vient de la configuration du serveur et ne fait pas partie des choix proposés ici. Le sélectionner dans cette liste le remplacerait, sans retour possible depuis cet écran.',
      summaryHelp:
        "Testez avant d'enregistrer : le test vérifie que votre organisation a accès à ce modèle (il ne juge pas la qualité du compte rendu, et ne coûte qu'une fraction de centime).",
      // PAS « Tester ce modèle » : la carte Transcription porte déjà ce libellé,
      // et deux boutons de même nom sur un écran s'annoncent à l'identique.
      // Celui-ci dit aussi ce qu'il teste vraiment — l'accès, pas la qualité.
      summaryTest: "Tester l'accès au modèle",
      summaryTesting: 'Test en cours…',
      summaryTestOk: 'Modèle accessible',
      summarySaved: 'Modèle de rédaction enregistré',
      infographicTitle: 'Infographie de compte rendu',
      infographicIntro:
        "Propose, à la génération d'un résumé, de créer l'infographie de la réunion : l'IA en écrit le contenu à partir de la transcription, des actions et des notes, et choisit l'un des six gabarits — Synthèse, Décision, Feuille de route, Tableau de bord, Atelier, Bilan.",
      infographicToggleLabel: "Proposer l'infographie",
      infographicHelp:
        'Désactivée, l’option « Infographie » disparaît de la carte de génération pour tous les comptes. Activée, chaque groupe décide qui peut s’en servir, dans Personnes → Groupes. Chaque infographie demandée est un appel au modèle de texte, facturé sur la clé OpenAI (page Clés API).',
      infographicOn: 'Proposée',
      infographicTileSub: 'Six gabarits',
      infographicLookHelp:
        "Le logo et les couleurs des infographies sont ceux d'Organisation → Marque & apparence : les modifier change aussi l'allure des infographies existantes.",
      infographicOff: 'Masquée',
      infographicSaved: 'Réglage infographie enregistré',
      unsavedHint: 'Modifications non enregistrées',
      discardChanges: 'Annuler',
      // Repère de coût/qualité, pas une fiche technique : ce qui aide à choisir.
      models: {
        'gpt-realtime-whisper': 'Défaut historique — mot à mot, éprouvé sur les longues réunions',
        'gpt-live-transcribe': 'Conçu pour le direct — mot à mot, même famille que le défaut',
        'gpt-transcribe': 'Le plus récent — mot à mot, texte final reponctué par segment',
        'voxtral-mini-transcribe-realtime-2602':
          'Mot à mot, ponctué au fil de la parole. Version stable',
        'voxtral-mini-transcribe-realtime-3-0':
          'Le plus récent de Mistral, plus de langues. En aperçu public',
        'speechmatics-melia-1': 'Le plus récent de Speechmatics, passe seul d’une langue à l’autre',
        'speechmatics-enhanced': 'Le plus éprouvé de Speechmatics, très juste en français',
        'universal-3-6-pro':
          'Le plus juste d’AssemblyAI, 32 langues. Facturé à la durée de la réunion, pauses comprises',
        'universal-streaming-multilingual':
          'Le moins cher d’AssemblyAI, 6 langues dont le français. Facturé à la durée de la réunion',
      },
      // Nom lisible de chaque modèle, de transcription comme de rédaction ;
      // l'identifiant passe dans l'infobulle de sa ligne.
      modelNames: {
        'gpt-6-astra': 'GPT-6 Astra',
        'gpt-6.1-sol': 'GPT-6.1 Sol',
        'gpt-6-luna': 'GPT-6 Luna',
        'gpt-5.6-sol': 'GPT-5.6 Sol',
        'gpt-5.4': 'GPT-5.4',
        'gpt-5.4-mini': 'GPT-5.4 mini',
        'mistral-large-4': 'Mistral Large 4',
        'mistral-medium-3-5': 'Mistral Medium 3.5',
        'mistral-large-2512': 'Mistral Large 3',
        'mistral-small-2603': 'Mistral Small 4',
        'gpt-realtime-whisper': 'GPT Realtime Whisper',
        'gpt-live-transcribe': 'GPT Live Transcribe',
        'gpt-transcribe': 'GPT Transcribe',
        'voxtral-mini-transcribe-realtime-2602': 'Voxtral Realtime',
        'voxtral-mini-transcribe-realtime-3-0': 'Voxtral Realtime 3',
        'speechmatics-melia-1': 'Melia 1',
        'speechmatics-enhanced': 'Enhanced',
        'universal-3-6-pro': 'Universal-3.6 Pro',
        'universal-streaming-multilingual': 'Universal-Streaming Multilingual',
      },
      // En-têtes des groupes de modèles, et noms des lignes de fournisseurs.
      providers: {
        openai: 'OpenAI',
        mistral: 'Mistral',
        speechmatics: 'Speechmatics',
        assemblyai: 'AssemblyAI',
      },
      // Clés tierces : un gabarit pour tous, `{provider}` = nom du fournisseur.
      providerLocked: 'Ajoutez une clé {provider} pour choisir ces modèles.',
      providerUnlock: 'Ajouter la clé {provider}',
      providerKeyLabel: 'Clé API {provider}',
      providerKeyHelp:
        'Créez une clé sur {console}, puis collez-la ici : elle est vérifiée auprès de {provider} avant d’être enregistrée, et ne quitte jamais le serveur.',
      providerKeyPlaceholderNew: 'Collez votre clé {provider}',
      providerKeyPlaceholderReplace: 'Remplacer par une nouvelle clé',
      providerKeyNeeded: 'Ce modèle a besoin d’une clé {provider}.',
      providerKeyClearConfirm:
        'Retirer la clé {provider} ? Ses modèles ne pourront plus être choisis sans en recoller une.',
      providerKeyStored: 'Clé {provider} enregistrée',
      // Repère de coût/qualité, comme pour la transcription : ce qui aide à
      // choisir, pas une fiche technique.
      summaryModels: {
        'gpt-6-astra':
          'Le plus capable d’OpenAI, raisonnement le plus poussé — et de loin le plus cher',
        'gpt-6.1-sol': 'Proche d’Astra sur les réunions complexes, pour cinq fois moins cher',
        'gpt-5.6-sol': 'Génération précédente, son palier le plus capable',
        'gpt-5.4':
          'Recommandé — éprouvé sur nos comptes rendus : la meilleure structure pour le prix',
        'gpt-5.4-mini': 'Économique et rapide — compte rendu plus ramassé, moins de nuances',
        'gpt-6-luna': 'Le plus léger et le moins cher d’OpenAI — pour des réunions simples',
        'mistral-large-4': 'Le plus capable de Mistral. En aperçu public',
        'mistral-medium-3-5': 'Le plus récent de Mistral en version stable, polyvalent',
        'mistral-large-2512': 'Grand modèle éprouvé de Mistral, à petit prix',
        'mistral-small-2603': 'Le plus léger et le moins cher de Mistral',
      },
      errors: {
        openai_key_doubled_prefix:
          'Cette clé commence par « sk-sk- » : elle a probablement été collée par-dessus un « sk- » déjà présent. Collez la clé entière dans un champ vide.',
        openai_key_malformed:
          'Cette clé ne ressemble pas à une clé OpenAI (elle doit commencer par « sk- »).',
        openai_key_rejected: 'OpenAI a refusé cette clé.',
        openai_key_missing: "Aucune clé n'est configurée sur ce serveur.",
        transcription_model_rejected: 'OpenAI a refusé ce modèle de transcription.',
        summary_model_rejected:
          "OpenAI a refusé ce modèle de rédaction — votre organisation n'y a probablement pas accès.",
        provider_key_missing:
          'Ce modèle a besoin d’une clé {provider} : enregistrez-la sur la page Clés API, puis choisissez-le.',
        provider_key_in_use:
          'Un modèle {provider} est encore en service avec cette clé (transcription ou comptes rendus) : choisissez d’abord un modèle d’un autre fournisseur, puis retirez-la.',
        provider_key_rejected: '{provider} a refusé cette clé.',
        provider_key_malformed: 'Cette clé ne ressemble pas à une clé {provider}.',
        provider_key_looks_openai:
          'C’est une clé OpenAI (« sk-… ») : collez ici la clé créée chez {provider}.',
        provider_model_rejected:
          '{provider} a refusé ce modèle — votre compte n’y a probablement pas accès.',
      },
    },
    adminBranding: {
      tabLabel: 'Marque & apparence',
      // Première page de la rubrique « Organisation » (BrandingTab, vue `company`).
      companyTabLabel: 'Entreprise',
      // ── Tableau de bord replié : deux groupes de tuiles, un réglage déplié au clic ──
      groupWords: "Les mots de l'organisation",
      groupLook: 'Apparence',
      tileContext: 'Vocabulaire',
      tileContextEmpty: 'Joint à chaque compte rendu',
      tileCorrections: 'Corrections',
      tileCorrectionsEmpty: 'Mots remplacés pendant les réunions',
      tileCompanyLogo: "Logo de l'entreprise",
      tileCompanyLogoSub: 'En tête des infographies',
      tileCompanyLogoMissing: 'À renseigner',
      tileLogo: "Logo de l'application",
      tileLogoSub: 'Barre latérale, connexion, accueil, pied des infographies',
      tileTagline: "Phrase d'accueil",
      tileTaglineDefault: 'Phrase par défaut',
      tileTaglineSub: 'Sous le nom, dans la barre latérale',
      tileTaglineEn: 'En anglais : {text}',
      tileColors: 'Couleurs',
      tileColorsCustom: 'Personnalisées',
      tileColorsDefault: "Couleurs d'origine",
      tileChanged: 'Modifié',
      tileInvalid: 'À corriger',
      companyLogoTitle: "Logo de l'entreprise",
      companyLogoIntro:
        "Ouvre chaque infographie et chaque compte rendu en PDF, en haut à gauche. Un logo en longueur y tient mieux qu'un logo carré.",
      companyLogoSetBadge: 'Renseigné',
      companyLogoMissingBadge: 'Manquant',
      companyLogoFallback:
        "En attendant, les infographies portent le logo de l'application à sa place.",
      companyLogoPreviewAlt: "Aperçu du logo de l'entreprise",
      companyLogoReset: "Retirer le logo de l'entreprise",
      companyLogoHint: 'PNG, JPEG, WebP ou SVG, {max} Ko maximum. Format en longueur recommandé.',
      logoTitle: "Logo de l'application",
      logoIntro:
        "Affiché dans la barre latérale, sur l'écran de connexion, sur l'écran d'accueil, et en pied de chaque infographie.",
      logoCustomBadge: 'Personnalisé',
      logoDefaultBadge: 'Logo intégré',
      logoPreviewAlt: 'Aperçu du logo',
      logoChoose: 'Choisir une image…',
      logoHint: 'PNG, JPEG, WebP ou SVG, {max} Ko maximum. Format carré recommandé.',
      logoTooLarge: 'Image trop lourde : {max} Ko maximum.',
      logoBadType: 'Choisissez une image (PNG, JPEG, WebP ou SVG).',
      logoReadError: 'Impossible de lire ce fichier. Réessayez avec une autre image.',
      logoReset: 'Revenir au logo intégré',
      taglineTitle: "Phrase d'accueil",
      taglineIntro: "Affichée sous le nom de l'application, dans la barre latérale.",
      taglineLabel: 'En français',
      taglinePlaceholder: 'Assistant au quotidien',
      taglineHint: 'Laissée vide, la phrase par défaut est utilisée.',
      taglineEnLabel: 'En anglais',
      taglineEnPlaceholder: 'Everyday assistant',
      taglineEnHint:
        "Affichée quand l'interface est en anglais. Laissée vide, la phrase en français s'affiche, ou à défaut la phrase par défaut.",
      colorTitle: "Couleurs de l'interface",
      colorIntro:
        "Colorent les boutons, liens et accents de toute l'application, pour tous les comptes.",
      colorLabel: 'Couleur primaire',
      colorHexLabel: 'Code hexadécimal',
      colorInvalid: 'Couleur invalide : format #rrggbb attendu.',
      colorReset: "Revenir à l'orange d'origine",
      colorSecondaryLabel: 'Couleur secondaire',
      colorSecondaryHint:
        "L'orange clair : second ton des dégradés et de quelques accents. Elle accompagne la couleur primaire, elle ne la remplace pas.",
      colorSecondaryReset: "Revenir à l'orange clair d'origine",
      updatedBy: 'Enregistré par',
      unsavedHint: 'Modifications non enregistrées',
      discardChanges: 'Annuler',
      saved: 'Enregistré',
    },
    // Carte en tête de l'onglet Configuration (BrandingTab) ; l'enregistrement
    // passe par le bouton unique de la page, d'où l'absence de libellés d'action.
    adminOrgContext: {
      title: 'Vocabulaire et contexte de votre organisation',
      intro:
        "Joint à CHAQUE compte rendu, pour tous les comptes : les noms de clients, de projets et les sigles maison que le modèle n'a aucun moyen de deviner.",
      badgeSet: 'Renseigné',
      badgeEmpty: 'Non renseigné',
      label: 'Texte joint aux comptes rendus',
      placeholder:
        "Ex. : nous fabriquons des pompes hydrauliques. « ADV » désigne l'administration des ventes, « INITECH » et « Globex » sont des clients.",
      help: "Sert à écrire correctement ces termes et à comprendre les allusions. Laissé vide, rien n'est joint — c'est le comportement d'origine.",
      counter: '{n} / {max} caractères',
      updatedBy: 'Enregistré par',
    },
    // Carte « Corrections automatiques » de l'onglet Configuration
    // (TranscriptCorrectionsCard), juste sous le vocabulaire ; enregistrée par
    // le bouton unique de la page. {term} = le terme en cause, {max} = plafond.
    adminTranscriptCorrections: {
      title: 'Corrections automatiques de la transcription',
      intro:
        "Les mots que la transcription écrit mal à chaque fois, remplacés d'office pendant les réunions.",
      badgeOne: '1 correction',
      badgeMany: '{n} corrections',
      badgeEmpty: 'Aucune',
      scopeTitle: 'Valable pour toutes les réunions, de tous les comptes.',
      scopeText:
        'Soyez modéré : réservez-les aux noms propres et aux sigles que la transcription écorche à chaque fois. Un mot courant serait remplacé partout — même là où il était juste.',
      fromHeader: 'La transcription écrit…',
      toHeader: 'Écrire à la place',
      fromPlaceholder: 'Ex. : Klobex, Clobex',
      toPlaceholder: 'Ex. : Globex',
      rowLabel: 'Correction {n}',
      remove: 'Retirer cette correction',
      add: 'Ajouter une correction',
      counter: '{n} / {max}',
      limitReached:
        'Limite de {max} corrections atteinte : retirez-en une pour en ajouter une autre.',
      emptyTitle: "Aucune correction pour l'instant.",
      emptyText:
        'Ajoutez-en une quand un nom revient mal écrit de réunion en réunion. Par exemple :',
      emptyFrom: 'Klobex',
      emptyTo: 'Globex',
      rules:
        'Plusieurs écritures fautives ? Séparez-les par des virgules. Majuscules et accents ne comptent pas, et seuls les mots entiers sont remplacés : « Paul » ne touche pas « Paulette ».',
      tryTitle: 'Essayer',
      tryHint: "Tapez une phrase pour voir le résultat, avant même d'enregistrer.",
      tryLabel: "Phrase d'essai",
      tryPlaceholder: 'Ex. : On a revu Klobex hier avec la dévé.',
      tryResult: 'Résultat',
      tryNoChange: 'Rien à corriger dans cette phrase.',
      futureOnly:
        "S'appliquent aux transcriptions qui suivent l'enregistrement : les réunions passées ne changent pas.",
      updatedBy: 'Enregistré par',
      errors: {
        missingFrom: 'Indiquez ce que la transcription écrit.',
        missingTo: "Indiquez ce qu'il faut écrire à la place.",
        tooShort: '« {term} » est trop court : une lettre seule ne se corrige pas.',
        termTooLong: '« {term} » est trop long : 60 caractères au plus.',
        tooManyVariants: '{term} écritures au plus par correction.',
        sameAsTarget: '« {term} » est déjà écrit ainsi : rien à corriger.',
        duplicate: '« {term} » apparaît deux fois dans la liste.',
      },
      warnings: {
        common:
          '« {term} » est un mot courant : il serait remplacé dans toutes les phrases, même là où il est juste.',
        short:
          '« {term} » est très court : un vrai mot pourrait s’écrire pareil, accents et majuscules confondus.',
      },
    },
    // Onglet « Templates » de l'administration : les templates transverses,
    // proposés à tous les comptes. L'éditeur est le même que « Mes templates »
    // (TemplateEditor) ; le libellé FR reste la langue d'édition principale,
    // quelle que soit la langue de l'interface.
    adminTemplates: {
      tabLabel: 'Templates',
      intro:
        'Les templates de compte rendu proposés à tous les comptes : les templates par défaut de l’application — modifiables ci-dessous — et ceux que vous créez. Chacun peut aussi ajouter les siens dans « Réglages → Mes templates ».',
      loading: 'Chargement…',
      empty: 'Aucun template personnalisé. Les templates par défaut du code sont utilisés.',
      defaultBadge: 'défaut',
      modifiedBadge: 'défaut modifié',
      resetToDefault: 'Rétablir le défaut',
      confirmReset:
        'Rétablir la version par défaut de "{name}" ? Vos modifications seront supprimées.',
      defaultEditHint:
        'Template par défaut de l’application : sauvegarder vos modifications remplace la version d’origine pour tous les comptes. « Rétablir le défaut » y revient à tout moment.',
      add: 'Ajouter un template',
      pickTitle: 'Aucun template sélectionné',
      pickHint: 'Choisissez un template dans la liste pour le modifier, ou créez-en un nouveau.',
      pickHintEmpty: 'Créez le premier template : il apparaîtra ensuite dans la liste.',
      delete: 'Supprimer',
      cancel: 'Annuler',
      save: 'Sauvegarder',
      backToList: 'Retour à la liste',
      confirmDelete: 'Supprimer le template "{name}" ?',
      saveSuccess: '"{name}" sauvegardé.',
      saveError: 'Erreur {status} lors de la sauvegarde.',
      deleteError: 'Erreur {status} lors de la suppression.',
      networkError: 'Impossible de contacter le serveur : {message}',
      fetchError: 'Erreur {status} au chargement des templates.',
      sessionExpired:
        'Session expirée : reconnectez-vous, la modification n’a pas été enregistrée.',
      errorNameRequired: 'Le nom du template (FR) est requis.',
      errorValueInvalid: 'La clé du template est invalide.',
      errorValueRequired: 'La clé du template est requise.',
      limitReached: '',
      limitReachedServer: 'Limite de templates atteinte.',
      sectionIdentity: 'Identité',
      fieldIcon: 'Icône',
      nameLabel: 'Nom (FR)',
      namePlaceholder: 'Ex : Réunion standard',
      slugHint: 'Identifiant unique du template : {slug}',
      addEnVersion: '+ Ajouter nom EN',
      hideEnVersion: '− Masquer nom EN',
      fieldLabelEn: 'Nom (EN)',
      fieldLabelEnPlaceholder: 'Ex : Standard meeting',
      sectionDirectives: "Directives à l'IA",
      directivesHint:
        "Ce que l'IA doit produire dans le bloc ✨ Résumé IA — le résumé principal du compte rendu (contenu, style, priorités).",
      directivesPlaceholder:
        'Ex : Rédige un compte-rendu structuré en 3 parties : décisions, actions, contexte…',
      sectionScaffold: 'Mise en forme du résumé',
      scaffoldHint:
        'La structure du compte rendu final : un ou plusieurs résumés, plus les titres, textes et infos de la réunion.',
      scaffoldHelp:
        'Définissez la structure visuelle du compte rendu. ' +
        'Le bloc ✨ Résumé IA (défini par les Directives ci-dessus) est toujours présent : déplacez-le, il ne peut pas être retiré. ' +
        'Ajoutez si besoin des résumés complémentaires — ⚡ 20 mots, 📃 100 mots, 🎯 Points clés — et les infos de la réunion.',
      scaffoldPlaceholder:
        'Ex :\n# Compte-rendu\n**Date :** {{date}}\n\n{{résumé}}\n\n## Actions\n{{actions}}',
      varGroupAi: 'Blocs IA',
      varGroupMeta: 'Infos réunion',
      varAlreadyInserted:
        'Déjà dans la mise en forme — un seul exemplaire possible. Déplacez la pastille directement dans le texte.',
      helpAria: 'Aide sur la mise en forme',
      formatHint: 'Mise en forme',
      formatBold: 'Gras',
      formatItalic: 'Italique',
      formatUnderline: 'Souligné',
      formatH1: 'Titre 1',
      formatH2: 'Titre 2',
      formatDragBlock: 'Déplacer le bloc',
      insertVariableHint: 'Insérer une variable',
      starterPickerTitle: 'Choisir un point de départ',
      starterPickerSubtitle: 'Commencez depuis zéro ou basez-vous sur un template existant.',
      starterFromScratch: 'Depuis zéro',
      starterFromTemplate: 'Basé sur : {name}',
      starterPickerCancel: 'Annuler',
      copySuffix: '(copie)',
      copySuffixEn: '(copy)',
    },
    // Réglages → Pendant la réunion → Mots remplacés (settings/CorrectionsSection) :
    // la liste de corrections du COMPTE. `card` surcharge les textes de la carte
    // partagée avec l'administration (adminTranscriptCorrections) : ce qui n'y
    // est pas redit vaut pour les deux.
    configCorrections: {
      intro:
        'Les mots que la transcription écrit mal dans VOS réunions, remplacés d’office dès la fin de chaque phrase. Ils s’ajoutent à ceux que votre administrateur a réglés pour tout le monde.',
      learnTitle: 'Retenir les remplacements de mes notes',
      learnHint:
        'Écrire « Remplace Durend par Durand » dans les notes d’une réunion ajoute le remplacement à votre liste : inutile de le réécrire à la réunion suivante.',
      learnLabel: 'Ajouter à ma liste les remplacements écrits dans mes notes',
      learnScope:
        'Sont retenus les remplacements dont les deux mots se prononcent presque pareil — la marque d’un mot mal transcrit. Un remplacement comme « Remplace Bob par Robert » ne vaut que pour sa réunion : ajoutez-le ci-dessous si vous le voulez partout.',
      learnOff: 'Désactivé : un remplacement écrit dans vos notes ne vaut que pour sa réunion.',
      card: {
        title: 'Mes mots remplacés',
        intro:
          'Ce que la transcription écrit mal dans vos réunions, et ce qu’il faut écrire à la place.',
        scopeTitle: 'Valable pour vos réunions seulement.',
        scopeText:
          'Retirez un remplacement qui ne valait que pour une réunion : il s’applique à toutes les suivantes, même là où le mot était juste.',
        fromPlaceholder: 'Ex. : Durend, Durant',
        toPlaceholder: 'Ex. : Durand',
        rowLabel: 'Remplacement {n}',
        remove: 'Retirer ce remplacement',
        add: 'Ajouter un remplacement',
        limitReached:
          'Limite de {max} remplacements atteinte : retirez-en un pour en ajouter un autre. D’ici là, ceux de vos notes ne sont plus retenus.',
        emptyTitle: 'Aucun mot remplacé pour l’instant.',
        emptyText:
          'Ajoutez-en un quand un nom revient mal écrit de réunion en réunion — ou écrivez le remplacement dans vos notes. Par exemple :',
        emptyFrom: 'Durend',
        emptyTo: 'Durand',
        tryPlaceholder: 'Ex. : On a revu M. Durend hier.',
      },
      discardChanges: 'Annuler',
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      saved: 'Enregistré',
      errors: {
        network: 'Connexion impossible. Vérifiez votre réseau, puis réessayez.',
        unknown: 'L’enregistrement a échoué. Réessayez.',
      },
    },
    configActionDetection: {
      tabLabel: "Détection d'actions",
      intro:
        "Ce que l'assistant repère pendant VOS réunions, et à quel rythme. Ces réglages n'appartiennent qu'à vous ; le banc d'essai en bas de page permet de juger un changement avant de l'adopter.",
      stateTitle: 'Détection en réunion',
      stateHint:
        'Quand elle est active, les actions apparaissent dans le panneau latéral au fil de la conversation, sans que personne ait à les saisir.',
      enabledLabel: 'Détecter les actions pendant la réunion',
      disabledWarning:
        'Détection coupée : aucune action ne sera proposée pendant les réunions. Les participants peuvent toujours en ajouter à la main.',
      whatTitle: "Ce que l'assistant cherche",
      whatHint: 'Ces réglages composent la consigne envoyée au modèle à chaque analyse.',
      sensitivityLabel: 'Sensibilité',
      sensitivity: {
        explicit: {
          label: 'Stricte (par défaut)',
          hint: "Seulement ce qui est annoncé comme une action. Peu de bruit, mais un engagement pris au détour d'une phrase passe inaperçu.",
        },
        balanced: {
          label: 'Équilibrée',
          hint: 'Les actions annoncées, et celles que quelqu’un prend en charge ou se voit confier — « je m’en occupe », « tu peux relancer le client ? ». Un besoin lancé en l’air, que personne ne reprend, est ignoré.',
        },
        wide: {
          label: 'Large',
          hint: 'Tout ce qui ressemble à une tâche, même sans personne pour la porter — « il faut envoyer le devis », « il faudrait », « penser à ». Pour les ateliers : mieux vaut supprimer une action en trop qu’en oublier une.',
        },
      },
      triggerWordsLabel: 'Mots déclencheurs',
      triggerWordsPlaceholder: 'action, à faire, chantier',
      triggerWordsHint:
        'Séparés par des virgules, {max} au maximum. Une phrase qui en contient un annonce une action. Laissés vides, seul le sens des phrases compte.',
      allowUpdatesLabel: 'Corriger les actions au fil de la réunion',
      allowUpdatesHint:
        'Une action déjà détectée se complète quand la suite de la conversation précise son porteur, son échéance ou ce qu’il faut livrer. Désactivé, chaque action reste figée telle qu’elle a été détectée.',
      paceTitle: 'Rythme',
      paceHint:
        'Appliqué par le navigateur pendant la réunion. Analyser plus souvent fait apparaître les actions plus vite, et consomme davantage.',
      windowLabel: "Profondeur d'écoute",
      windowValue: '{n} dernières phrases',
      windowHint:
        'Ce que le modèle relit à chaque analyse. Plus large, il comprend mieux une action énoncée en plusieurs temps ; plus étroit, il va au plus court.',
      intervalLabel: 'Espacement des analyses',
      intervalEverySentence: 'À chaque phrase',
      intervalValue: 'Toutes les {n} phrases',
      intervalHint:
        'Une action apparaît environ {seconds} secondes après avoir été énoncée. Espacer réduit le nombre d’appels au modèle.',
      testTitle: "Banc d'essai",
      testHint:
        'Collez un extrait de réunion et voyez ce que la détection en tire, avec les réglages affichés ci-dessus.',
      sampleLabel: 'Extrait de conversation',
      samplePlaceholder:
        'Marc : il faut relancer INITECH avant vendredi.\nSophie : je m’en occupe, je les appelle demain.\nMarc : action pour Julie, préparer le devis de reconduction.',
      testRun: 'Tester la détection',
      testRunning: 'Analyse en cours…',
      testScopeHint:
        'Teste les réglages affichés, enregistrés ou non. Aucun effet sur les réunions en cours.',
      testFound: '{n} action(s) détectée(s)',
      testNoAction: 'Aucune action détectée dans cet extrait.',
      testUntitled: 'Action sans titre',
      testNoOwner: 'Porteur à définir',
      testStale: 'Les réglages ont changé depuis cet essai.',
      showPrompt: 'Voir la consigne envoyée au modèle',
      hidePrompt: 'Masquer la consigne',
      unsavedHint: 'Modifications non enregistrées',
      discardChanges: 'Annuler',
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      saved: 'Enregistré',
      errors: {
        detection_test_content_missing: 'Collez un extrait de conversation avant de tester.',
        detection_test_failed: "Le test n'a pas abouti.",
        detection_settings_invalid: 'Un réglage affiché est invalide.',
        too_many_requests: 'Trop d’essais en peu de temps. Réessayez dans quelques minutes.',
        bad_origin: 'Requête refusée par sécurité. Rechargez la page et réessayez.',
        unauthorized: 'Session expirée. Reconnectez-vous.',
        unknown: 'Une erreur est survenue.',
      },
    },
    adminStats: {
      tabLabel: 'Consommation',
      intro:
        "L'usage de myBrief sur la période choisie : réunions, temps enregistré, comptes actifs. Des chiffres d'ensemble, jamais le contenu des réunions.",
      rangeLabel: 'Période observée',
      ranges: {
        7: '7 jours',
        30: '30 jours',
        90: '90 jours',
        365: '12 mois',
        0: 'Tout',
      },
      refresh: 'Actualiser',
      refreshing: 'Actualisation…',
      periodHint: 'Réunions enregistrées, {range}.',
      kpiMeetings: 'Réunions',
      kpiMeetingsHint: 'Sur {range} · {total} depuis le début',
      kpiTotalTime: 'Temps enregistré',
      kpiAverage: 'Durée moyenne',
      kpiAverageHint: 'Médiane {median}',
      kpiNoDuration: 'Aucune durée mesurée sur la période',
      kpiNewUsers: '{count} nouveaux comptes sur la période',
      // Une moyenne calculée sur une partie des réunions doit le DIRE : les
      // durées ne sont enregistrées que depuis août 2026.
      durationBasis: 'Sur {counted} réunions sur {total}',
      partialDurations:
        "Certaines réunions n'ont pas de durée enregistrée : la mesure a été ajoutée en août 2026. Elles comptent dans le nombre de réunions, mais sont exclues des durées et des moyennes.",
      // Cas de bascule : AUCUNE réunion de la période n'est mesurée. Le dire,
      // plutôt que d'afficher « 0 min » — qui se lirait « personne n'a
      // enregistré » alors que les réunions sont bien là.
      noDurationNotice:
        "Aucune réunion de cette période n'a de durée enregistrée : la mesure a été ajoutée en août 2026 et ne vaut que pour les réunions postérieures. Les durées apparaîtront au fil des prochains enregistrements.",
      noDurationEmpty: 'Aucune durée enregistrée sur cette période.',
      chartMeetings: 'Réunions dans le temps',
      chartTime: 'Temps enregistré',
      chartTimeHint: 'Heures cumulées par période.',
      chartDurations: 'Répartition des durées',
      chartDurationsHint: 'Combien de réunions par tranche de durée.',
      chartWeekdays: 'Activité par jour',
      chartWeekdaysHint: 'Jours de la semaine où les réunions sont enregistrées.',
      chartTopUsers: 'Utilisateurs les plus actifs',
      chartTopUsersHint: 'Réunions enregistrées sur la période.',
      chartTemplates: 'Templates utilisés',
      chartTemplatesHint: 'Templates choisis pour générer les résumés.',
      buckets: {
        lt15: 'Moins de 15 min',
        lt30: '15 à 30 min',
        lt60: '30 à 60 min',
        lt120: '1 à 2 h',
        gte120: 'Plus de 2 h',
      },
      weekdaysShort: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
      weekdaysLong: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
      colPeriod: 'Période',
      colMeetings: 'Réunions',
      colTime: 'Temps',
      colBucket: 'Tranche',
      colDay: 'Jour',
      colUser: 'Utilisateur',
      colTemplate: 'Template',
      colLastMeeting: 'Dernière réunion',
      showTable: 'Données',
      showChart: 'Graphique',
      empty: 'Aucune réunion sur la période.',
      emptyUsers: 'Aucun utilisateur actif sur la période.',
      never: 'Jamais',
      daysAgo: 'il y a {days} j',
      today: "aujourd'hui",
      hours: '{value} h',
      footnote: 'Première réunion enregistrée le {first} · {total} réunions en base.',
      templateUnknown: 'Sans template',
      // Filtres (stats/StatsFilters.svelte) : ils cadrent TOUTE la page, et le
      // rapport PDF les reprend en en-tête.
      filtersLabel: 'Filtres des statistiques',
      customRange: 'Dates…',
      customFrom: 'Du',
      customTo: 'Au',
      customApply: 'Appliquer',
      customRangeLabel: 'du {from} au {to}',
      filterGroup: 'Groupe',
      filterUser: 'Utilisateur',
      filterTemplate: 'Template',
      allGroups: 'Tous les groupes',
      allUsers: 'Tous les utilisateurs',
      allTemplates: 'Tous les templates',
      disabledOption: '{name} (désactivé)',
      resetFilters: 'Effacer les filtres',
      everyone: "Toute l'organisation",
      scopeGroup: 'Groupe {name}',
      scopeTemplate: 'Template {name}',
      // Écart à la période précédente, de même durée, juste avant.
      deltaNew: 'Nouveau',
      deltaPoints: '{value} pt',
      deltaTitle: 'Par rapport au {from} – {to} : {value}',
      vsPrevious: 'vs période précédente',
      kpiAdoption: "Taux d'adoption",
      kpiAdoptionHint: '{active} comptes actifs sur {enabled}',
      kpiAdoptionNone: 'Aucun compte ouvert dans ce périmètre',
      kpiNewUser: '1 nouveau',
      kpiNewUsersShort: '{count} nouveaux',
      kpiSummaries: 'Comptes rendus',
      kpiSummariesHint: '{count} réunions sur {total} en ont un',
      kpiSummariesNone: 'Aucune réunion sur la période',
      kpiPerActive: 'Réunions par compte actif',
      kpiPerActiveHint: 'Moyenne sur {count} comptes actifs',
      // Santé de l'adoption (stats/AdoptionCard.svelte).
      adoptionTitle: "Santé de l'adoption",
      adoptionHint: 'Les comptes ouverts, selon leur usage de myBrief sur la période.',
      adoptionLead: '{share} des comptes utilisent myBrief au moins une semaine sur deux.',
      adoptionEmpty: 'Aucun compte ouvert dans ce périmètre.',
      adoptionStatuses: {
        regular: 'Réguliers',
        occasional: 'Occasionnels',
        dormant: 'En sommeil',
        never: 'Jamais démarré',
      },
      adoptionDefinitions: {
        regular: 'Au moins une semaine sur deux',
        occasional: "Moins d'une semaine sur deux",
        dormant: 'Rien sur la période, déjà utilisé avant',
        never: 'Aucune réunion enregistrée',
      },
      adoptionSee: 'Voir ces comptes',
      statusLabels: {
        regular: 'Régulier',
        occasional: 'Occasionnel',
        dormant: 'En sommeil',
        never: 'Jamais démarré',
      },
      // Utilisation par utilisateur (stats/UsageTable.svelte).
      usersTitle: 'Utilisation par utilisateur',
      usersHint: 'Chaque compte sur la période. Cliquez un nom pour centrer toute la page sur lui.',
      usersHintPdf:
        'Chaque compte sur la période, du plus au moins actif. Semaines actives : semaines avec au moins une réunion. ▲ ▼ : plus ou moins de réunions que sur la période précédente.',
      usersSearch: 'Rechercher un nom, une adresse, un groupe',
      usersFilterAll: 'Tous',
      usersStatusFilter: 'Filtrer par statut',
      usersShown: '{shown} comptes sur {total}',
      usersNoMatch: 'Aucun compte ne correspond.',
      usersEmpty: 'Aucun compte dans ce périmètre.',
      exportCsv: 'Exporter en CSV',
      csvFilename: 'mybrief_utilisation',
      colGroups: 'Groupes',
      colStatus: 'Statut',
      colAverage: 'Durée moy.',
      colRegularity: 'Régularité',
      colSummaries: 'Comptes rendus',
      regularity: '{active}/{weeks} sem.',
      regularityTitle: 'Au moins une réunion {active} semaines sur {weeks}',
      trendTitle: '{count} réunions sur la période précédente',
      disabledBadge: 'Désactivé',
      focusAction: 'Voir les statistiques de {name}',
      sortedAsc: 'tri croissant',
      sortedDesc: 'tri décroissant',
      csv: {
        name: 'Nom',
        email: 'Adresse',
        groups: 'Groupes',
        status: 'Statut',
        meetings: 'Réunions',
        previous: 'Réunions (période précédente)',
        minutes: 'Temps enregistré (min)',
        avgMinutes: 'Durée moyenne (min)',
        activeWeeks: 'Semaines actives',
        weeks: 'Semaines de la période',
        summaries: 'Comptes rendus',
        lastMeeting: 'Dernière réunion',
        lastSeen: 'Dernière connexion',
        total: 'Réunions au total',
      },
      // Page centrée sur un compte (stats/UserFocus.svelte).
      focusKicker: 'Statistiques de',
      focusBack: "Toute l'équipe",
      focusCreated: 'Compte créé le {date}',
      focusLastSeen: 'Dernière connexion le {date}',
      focusNeverSeen: 'Jamais connecté',
      // Rapport PDF (stats/ExportDialog.svelte, stats/pdfReport.js).
      exportPdf: 'Exporter en PDF',
      pdf: {
        title: 'Exporter les statistiques en PDF',
        intro:
          'Choisissez ce que contient le rapport. Il reprend la période et les filtres affichés :',
        sectionsLabel: 'Sections du rapport',
        sections: {
          overview: 'Indicateurs clés',
          adoption: "Santé de l'adoption",
          meetings: 'Réunions dans le temps',
          time: 'Temps enregistré',
          durations: 'Répartition des durées',
          weekdays: 'Activité par jour',
          topUsers: 'Utilisateurs les plus actifs',
          templates: 'Templates utilisés',
          users: 'Utilisation par utilisateur',
          costs: "Dépenses d'IA estimées",
        },
        all: 'Tout cocher',
        none: 'Tout décocher',
        cancel: 'Annuler',
        generate: 'Générer le PDF',
        generating: 'Génération…',
        empty: 'Cochez au moins une section.',
        failed: "Le PDF n'a pas pu être généré. Réessayez.",
        done: 'Rapport PDF téléchargé.',
        privacy: 'Le rapport nomme des personnes : partagez-le avec discernement.',
        reportKicker: 'myBrief · Statistiques',
        reportTitle: "Rapport d'utilisation",
        period: 'Période',
        scope: 'Périmètre',
        issued: 'Édité le',
        issuedBy: '{date} par {author}',
        previousNote:
          'Évolutions comparées à la période précédente de même durée, du {from} au {to}.',
        durationNote:
          "Durées mesurées sur {counted} réunions sur {total} : la mesure n'existe que depuis août 2026.",
        footer: 'Document généré par MyBrief - développé par MyAlfred.ai',
        filename: 'mybrief_statistiques',
      },
      errors: {
        range_invalid:
          'Période invalide : la date de début doit précéder la date de fin et ne pas être dans le futur.',
      },
      // Carte « Dépenses d'IA estimées » (stats/CostCard.svelte). Les montants
      // sont des ESTIMATIONS : chaque libellé le dit, la section « Hypothèses »
      // dit comment.
      costs: {
        title: "Dépenses d'IA estimées",
        hint: 'Transcription, comptes rendus, infographies et assistants, au rythme observé sur {days} jours, avec les modèles en service et les derniers tarifs publics relevés.',
        unavailable:
          "L'estimation des dépenses n'a pas pu être calculée. Les autres statistiques restent justes.",
        monthly: 'Dépenses par mois',
        monthlyHint: 'Estimation au rythme de la période',
        perHour: 'Une heure de myBrief',
        perHourMeasured: 'Moyenne sur {duration} enregistrées',
        perHourMeasuredInferred: 'Moyenne sur {duration} de réunion, dont {count} à durée déduite',
        perHourReference: "Réunion type d'une heure, sans infographie",
        period: 'Sur la période',
        periodHint: '{meetings} réunions · {perMeeting} par réunion',
        periodHintEmpty: 'Aucune réunion sur la période',
        breakdownLabel: 'Répartition des dépenses par poste',
        perMonthValue: '{value} / mois',
        lines: {
          transcription: 'Transcription',
          summary: 'Comptes rendus',
          infographic: 'Infographies',
          assistants: 'Assistants en réunion',
        },
        // Ce que fait chaque poste, sous son nom : la ligne « Assistants » ne
        // dit rien sans cette précision.
        linesHint: {
          transcription: 'Transcription en direct',
          summary: 'Rédaction et régénérations',
          infographic: 'Maquette puis image',
          assistants: "Détection d'actions et titres",
        },
        units: {
          hour: "{value} l'heure",
          summary: '{value} le compte rendu',
          infographic: "{value} l'infographie",
        },
        share: '{value} des dépenses',
        unknownTariff: 'Tarif inconnu',
        unpricedLine: 'Tarif inconnu pour {models}',
        unpricedNotice:
          'Aucun tarif connu pour {models} : ces dépenses ne sont pas comptées. « Actualiser les tarifs » va les chercher en ligne.',
        colLine: 'Poste',
        colModels: 'Modèles',
        colVolume: 'Volume',
        colUnit: 'Coût unitaire',
        colPeriod: 'Sur la période',
        colMonthly: 'Par mois',
        colShare: 'Part',
        compareTitle: 'Comparer les modèles',
        compareIntro:
          "Ce que la même activité aurait coûté avec chacun des modèles proposés dans l'administration (Modèles IA). Seul le prix change : la qualité, elle, se juge à l'essai.",
        colModel: 'Modèle',
        colTariff: 'Tarif public',
        colDelta: 'Écart par mois',
        current: 'En service',
        tariffAudio: '{price} / min',
        tariffText: '{input} entrée · {output} sortie, par million de jetons',
        tariffImage: '{price} / image',
        assumptionsTitle: 'Hypothèses de calcul',
        assumptions: {
          prices:
            'Tarifs publics du fournisseur, hors taxes, sans remise ni crédit gratuit : une estimation, pas une facture.',
          audio:
            "Transcription facturée à la minute d'audio. Une réunion en visio transcrit deux flux (micro et son de la visio) : l'estimation n'en compte qu'un.",
          tokens:
            'Environ {chars} caractères par jeton. Chaque compte rendu relit la transcription entière et produit environ {output} jetons, raisonnement compris.',
          speechMeasured: 'Débit de parole de vos réunions : {rate} caractères par seconde.',
          speechDefault:
            'Débit de parole type : {rate} caractères par seconde (pas encore assez de réunions mesurées).',
          inferred:
            'Réunions sans durée enregistrée (antérieures à août 2026) : {count}. Leur durée est déduite de la longueur du texte transcrit.',
          detection:
            "Détection d'actions : environ {calls} analyses par heure d'enregistrement, pour les comptes qui l'ont activée.",
          image:
            "Infographie : un appel au modèle de texte, soit environ {tokens} jetons écrits — sa mise en page ne coûte rien. Seule la dernière infographie d'une réunion est comptée.",
          excluded:
            "Non comptés : l'import de fichiers audio, la relecture de la transcription par les notes et les essais de Modèles IA.",
        },
        sources: {
          builtin: 'relevé intégré à myBrief',
          litellm: 'grilles publiques, via LiteLLM',
        },
        fxSources: {
          builtin: 'taux intégré',
          ecb: 'taux de référence de la BCE',
          'currency-api': 'cours du marché',
        },
        pricesAsOf: 'Tarifs du {date} ({source})',
        fxAsOf: '1 $ = {rate} € ({source}, {date})',
        pricesRefresh: 'Actualiser les tarifs',
        pricesRefreshing: 'Relevé en cours…',
        refreshedAll: 'Tarifs et taux de change actualisés.',
        refreshedNoFx:
          "Tarifs actualisés. Le taux de change n'a pas pu être relevé : le dernier connu reste appliqué.",
        refreshedFxOnly:
          "Taux de change actualisé. Les tarifs n'ont pas pu être relevés : les derniers connus restent appliqués.",
        refreshedMissing:
          'Modèles introuvables en ligne ({count}) : leur dernier tarif connu reste appliqué.',
        errors: {
          prices_unreachable:
            'Les sources de tarifs sont injoignables depuis le serveur : les derniers tarifs relevés restent appliqués.',
        },
      },
    },
    adminActions: {
      tabLabel: 'Actions',
      meetingTitle: 'Après chaque réunion',
      summaryTitle: 'Après chaque résumé',
      summaryIntro: 'Boutons proposés sur chaque résumé généré.',
      actionEmail: 'Envoyer par mail',
      actionStorage: 'Entreposer',
      actionDownload: 'Télécharger',
      previewLabel: 'Aperçu :',
      previewEmpty: 'Aucun bouton ne sera affiché.',
      providerLabel: 'Fournisseur',
      providerNone: 'Aucun',
      providerGdrive: 'Google (Gmail + Drive)',
      providerSharepoint: 'Microsoft (Outlook + OneDrive)',
      folderLabel: 'Dossier cible',
      folderPlaceholder: 'Ex : myBrief/Comptes-rendus',
      folderHint:
        'Chemin dans le Google Drive ou le OneDrive de chaque utilisateur. Laissé vide, les documents vont dans un dossier « myBrief ».',
      storageNotConfigured:
        'Choisissez un fournisseur pour faire apparaître le bouton « Entreposer ».',
      storageNotConnected:
        "myBrief n'accède qu'aux dossiers qu'il a lui-même créés. Si vos utilisateurs possèdent déjà un dossier de ce nom, un dossier homonyme sera créé à côté : c'est celui-là qui recevra les documents.",
      emailUnavailable:
        "Aucun relais SMTP n'est configuré sur ce serveur : le bouton « Envoyer par mail » n'apparaîtra pas.",
      saved: 'Enregistré',

      maxRecipientsLabel: 'Destinataires maximum',
      maxRecipientsHint:
        'Nombre d’adresses qu’un utilisateur peut ajouter en plus de la sienne — pour sa liste par défaut comme pour chacune de ses listes par tag. Son compte reste toujours en copie.',
      tagRecipientsRuleTitle: 'Destinataires par tag',
      tagRecipientsRuleBody:
        'Vos utilisateurs peuvent donner à chaque tag sa propre liste de destinataires (« Mes tags »). Elle remplace leur liste par défaut pour les conversations qui portent ce tag — elle ne s’y ajoute pas. Le plafond ci-dessus s’applique à chaque liste.',
      allowSmtpExternalLabel: 'Autoriser le relais du serveur à écrire à des tiers',
      allowSmtpExternalHint:
        'Sans compte relié, les mails partent du relais SMTP de ce serveur. Écrire à des destinataires externes engage la réputation de votre domaine (SPF/DMARC) — n’activez ceci que si votre relais sort et que votre domaine le couvre.',
      allowSmtpExternalOff:
        'Désactivé : sans compte relié, le document part au seul auteur, et l’interface le lui dit.',

      subjectTemplateLabel: 'Objet du mail',
      subjectTemplatePlaceholder: 'Ex : CR {{titre}} — {{date}}',
      filenameTemplateLabel: 'Nom du fichier',
      filenameTemplatePlaceholder: 'Ex : {{date}}-{{titre}}',
      templateHint: 'Laissé vide, myBrief garde son format habituel.',
      variablesLabel: 'Variables disponibles',

      testEmail: 'Tester l’envoi',
      testStorage: 'Tester le dépôt',
      testRunning: 'Test en cours…',
      testScopeHint: 'Testé avec les valeurs de l’organisation, sans vos réglages personnels.',

      // ── Refonte par action ────────────────────────────────────────────────
      previewTitle: 'Ce que verront vos utilisateurs',
      previewIntro:
        'La barre de boutons telle qu’elle apparaîtra, garde-fous compris : un bouton activé mais inopérant n’y figure pas.',
      previewMeeting: 'Après chaque réunion :',
      previewSummary: 'Après chaque résumé :',
      providerCardTitle: 'Compte relié',
      providerCardIntro:
        'Fournisseur des comptes que vos utilisateurs relient. Le même compte sert à l’envoi des mails ET au dépôt des fichiers.',
      sharePointScopeLabel: 'Proposer les bibliothèques SharePoint',
      sharePointScopeOnHint:
        'La liaison demande « Sites.ReadWrite.All » — lire et écrire dans tous les sites SharePoint auxquels la personne a accès. Entra ne consent pas à moitié : si votre annuaire refuse ce droit, AUCUN compte ne se relie, pas même pour le seul OneDrive.',
      sharePointScopeOffHint:
        'La liaison ne demande plus « Sites.ReadWrite.All » : votre annuaire n’a plus que « Mail.Send » et « Files.ReadWrite » à accorder, et le dépôt se fait dans le OneDrive. Le consentement administrateur reste requis si votre annuaire l’exige pour ces deux droits. Les comptes déjà reliés gardent leurs bibliothèques jusqu’à leur prochaine reconnexion.',
      mailCardTitle: 'Envoyer par mail',
      mailCardIntro:
        'Où le bouton apparaît, et jusqu’où vos utilisateurs peuvent régler leurs envois.',
      storageCardTitle: 'Entreposer',
      storageCardIntro: 'Où le bouton apparaît, et dans quel dossier les documents se déposent.',
      downloadCardTitle: 'Télécharger',
      downloadCardIntro:
        'Enregistre le document sur l’appareil. Ne dépend d’aucun compte ni d’aucun relais.',
      filenameCardTitle: 'Nom des fichiers par défaut',
      filenameCardIntro:
        'Nom des fichiers quand l’utilisateur n’a rien réglé de son côté. Cliquez sur une variable pour l’insérer.',
      testEmailDisabled: 'Aucun relais SMTP configuré sur ce serveur.',
      testStorageDisabled: 'Choisissez d’abord un fournisseur.',
      chooseAccount: 'Choisir le compte relié',
      // ── Tableau de bord replié : l'aperçu, une tuile par bouton et par réglage commun ──
      groupButtons: 'Les boutons proposés',
      groupShared: 'Réglages communs',
      tileScopeBoth: 'Réunion et résumé',
      tileScopeMeeting: 'Après la réunion',
      tileScopeSummary: 'Après le résumé',
      tileScopeNone: 'Désactivé',
      tileMailSub: '{max} destinataires au plus',
      tileMailBlocked: 'Aucun relais',
      tileStorageBlocked: 'Compte requis',
      tileFolder: 'Dossier : {folder}',
      tileFolderDefault: 'Dossier « myBrief »',
      tileNoAccount: 'Aucun compte relié',
      tileDownloadSub: 'Sans compte ni relais',
      tileAccountSub: 'Envoi des mails et dépôt',
      tileAccountNone: 'Mails par le relais du serveur, pas de dépôt',
      tileSharePointOn: 'Bibliothèques SharePoint proposées',
      tileSharePointOff: 'OneDrive seulement',
      tileNaming: 'Nom des fichiers',
      tileNamingDefault: 'Format habituel',
      tileNamingSub: 'Quand l’utilisateur n’a rien réglé',
      tileChanged: 'Modifié',
      unsavedHint: 'Modifications non enregistrées',
      discardChanges: 'Annuler',
    },
    // Administration → MyBrain (components/admin/MyBrainTab.svelte) : brancher
    // MyBrief sur le cerveau partagé de l'organisation, et décider qui y envoie
    // ses réunions.
    adminMyBrain: {
      tabLabel: 'MyBrain',
      intro:
        'MyBrain est le cerveau partagé de votre organisation. Une fois branché, il reçoit les réunions terminées et en tire des fiches, après validation dans sa revue.',
      connectionTitle: 'Connexion à MyBrain',
      connectionIntro:
        'L’adresse de votre MyBrain, et une clé d’API créée pour MyBrief dans MyBrain → Administration → Clés d’API, avec le droit « Nourrir le cerveau ».',
      statusOn: 'Connecté',
      statusOff: 'À configurer',
      connectedAs: 'Connecté en tant que « {application} » — droits : {rights}.',
      rightNames: { lire: 'lire', nourrir: 'nourrir' },
      updatedBy: 'Réglé par',
      keyUnreadable:
        'La clé enregistrée ne peut plus être lue par ce serveur : sa clé de chiffrement a changé. Collez la clé de nouveau.',
      urlLabel: 'Adresse de MyBrain',
      urlPlaceholder: 'https://mybrain.exemple.fr',
      urlHelp: 'L’« URL de l’API » que MyBrain affiche à la création de la clé convient aussi.',
      keyLabel: 'Clé d’API',
      keyPlaceholderNew: 'mbk_…',
      keyPlaceholderReplace: 'mbk_… (remplace la clé actuelle)',
      keyCurrent: 'Clé enregistrée :',
      keyRequiredHint:
        'Nouvelle adresse : collez de nouveau la clé. La clé enregistrée ne part jamais vers une autre adresse.',
      keyHelp:
        'L’adresse et la clé sont vérifiées auprès de MyBrain avant d’être enregistrées. La clé ne quitte jamais le serveur.',
      test: 'Tester la connexion',
      testing: 'Test en cours…',
      testOk: 'Connexion opérationnelle',
      testOkDraft:
        'Connexion opérationnelle : « {application} », droits : {rights}. Enregistrez pour l’appliquer.',
      testNeeds: {
        both: 'Pour tester : l’adresse de MyBrain et une clé d’API.',
        url: 'Pour tester : l’adresse de MyBrain.',
        key: 'Pour tester : une clé d’API.',
      },
      clear: 'Retirer la clé',
      clearConfirm:
        'Retirer la clé ? Plus aucune réunion ne sera envoyée à MyBrain tant qu’une nouvelle clé n’aura pas été enregistrée.',
      policyTitle: 'Envoi des réunions',
      policyIntro:
        'Qui envoie ses réunions à MyBrain. Une réunion part quand elle se termine — « Générer le résumé » ou « Enregistrer » —, une seule fois.',
      policies: {
        off: { label: 'Désactivé', hint: 'Aucune réunion n’est envoyée à MyBrain.' },
        optin: {
          label: 'Au choix de chaque utilisateur',
          hint: 'Chacun active l’envoi dans Réglages → Après la réunion → MyBrain. Rien ne part tant qu’il ne l’a pas activé.',
        },
        forced: {
          label: 'Imposé à tous',
          hint: 'Les réunions de tous les comptes sont envoyées. Chacun le voit dans Réglages → Après la réunion → MyBrain, sans pouvoir le désactiver.',
        },
      },
      policyNotConfigured: 'Rien ne part tant que la connexion à MyBrain n’est pas configurée.',
      contentTitle: 'Ce qui est envoyé',
      contentIntro: 'Pour chaque réunion, un texte que MyBrain lit comme une source :',
      contentItems: [
        'le titre, la date et l’heure, la durée',
        'l’auteur — la personne qui a enregistré — et le tag',
        'les notes, les actions et le compte rendu',
        'la transcription intégrale',
      ],
      contentReview:
        'Tout arrive en proposition dans la revue de MyBrain : rien n’entre dans le cerveau sans avoir été validé. La question est posée à l’auteur de la réunion s’il a un compte MyBrain, sinon au responsable de la fiche ou aux curateurs.',
      saved: 'Réglages MyBrain enregistrés',
      unsavedHint: 'Modifications non enregistrées',
      discardChanges: 'Annuler',
      errors: {
        mybrain_url_invalid:
          'Cette adresse n’est pas valide : saisissez l’adresse web de votre MyBrain, par exemple https://mybrain.exemple.fr.',
        mybrain_key_malformed:
          'Cette clé ne ressemble pas à une clé MyBrain : elle commence par « mbk_ ».',
        mybrain_key_rejected: 'MyBrain a refusé cette clé : elle est inconnue, ou a été supprimée.',
        mybrain_right_missing:
          'Cette clé n’a pas le droit « Nourrir le cerveau ». Créez-en une qui l’a, dans MyBrain → Administration → Clés d’API.',
        mybrain_not_found: 'Aucun MyBrain ne répond à cette adresse. Vérifiez-la.',
        mybrain_invalid_response: 'Cette adresse ne répond pas comme un MyBrain. Vérifiez-la.',
        mybrain_redirected: 'Cette adresse renvoie vers une autre : saisissez l’adresse finale.',
        mybrain_unreachable: 'MyBrain est injoignable depuis le serveur de MyBrief.',
        mybrain_timeout: 'MyBrain n’a pas répondu à temps.',
        mybrain_unavailable: 'MyBrain n’accepte pas de dépôt pour le moment.',
        mybrain_rate_limited:
          'MyBrain limite le nombre d’appels : réessayez dans quelques minutes.',
        mybrain_error: 'MyBrain a rencontré une erreur.',
        mybrain_not_configured: 'Renseignez l’adresse de MyBrain et une clé d’API.',
        mybrain_key_required:
          'Nouvelle adresse : collez de nouveau la clé. La clé enregistrée ne part jamais vers une autre adresse.',
        mybrain_connection_lost: 'La connexion à MyBrain a été coupée en route. Réessayez.',
      },
    },
    // Réglages → Après la réunion → MyBrain (components/settings/MyBrainSection.svelte).
    configMyBrain: {
      sectionLabel: 'MyBrain',
      intro:
        'MyBrain est le cerveau partagé de votre organisation : il garde ce que l’équipe sait, fiche par fiche. Vos réunions peuvent l’alimenter.',
      toggleTitle: 'Envoyer mes réunions à MyBrain',
      toggleHint:
        'Chaque réunion part une fois, quand vous la terminez par « Générer le résumé » ou « Enregistrer ».',
      toggleLabel: 'Envoyer mes réunions à MyBrain',
      statusOn: 'Activé',
      statusOff: 'Désactivé',
      statusForced: 'Imposé',
      forcedNote:
        'Votre administration envoie les réunions de tous les comptes à MyBrain : cet envoi ne se désactive pas ici.',
      contentTitle: 'Ce qui part',
      contentItems: [
        'le titre, la date et l’heure, la durée',
        'votre nom, votre adresse et le tag de la réunion',
        'les notes, les actions et le compte rendu',
        'la transcription intégrale',
      ],
      reviewNote:
        'Tout arrive dans la revue de MyBrain : rien n’entre dans le cerveau sans avoir été validé, et c’est à vous que la question est posée si vous avez un compte MyBrain.',
      notRetroactive: 'Seules partent les réunions commencées après l’activation de l’envoi.',
      openReview: 'Ouvrir la revue de MyBrain',
      recentTitle: 'Derniers envois',
      recentHint: 'Vos dernières réunions transmises à MyBrain, et leur état.',
      recentEmpty: 'Aucune réunion envoyée pour l’instant.',
      statusSent: 'Envoyée',
      statusSending: 'En cours',
      statusError: 'Échec',
      sentOn: 'Envoyée le {date}',
      triedOn: 'Essai du {date}',
      parts: 'en {n} parties',
      recipientUnknown:
        'Votre adresse n’a pas de compte MyBrain : la validation ira au responsable de la fiche, ou aux curateurs.',
      autoRetry: 'Un nouvel essai est prévu automatiquement.',
      ambiguous:
        'Elle est peut-être arrivée : vérifiez dans la revue de MyBrain avant de réessayer.',
      retry: 'Réessayer',
      retrying: 'Envoi…',
      retried: 'Réunion envoyée à MyBrain.',
      errors: {
        mybrain_disabled: 'MyBrain n’est plus proposé sur cette installation.',
        mybrain_policy_forced: 'L’envoi est imposé par votre administration.',
        mybrain_not_enabled: 'Activez d’abord l’envoi de vos réunions.',
        mybrain_already_sent: 'Cette réunion est déjà arrivée dans MyBrain.',
        mybrain_sending: 'Cette réunion est en cours d’envoi.',
        mybrain_nothing_to_send:
          'Cette réunion n’a rien à transmettre : ni transcription, ni compte rendu, ni note.',
        meeting_not_found: 'Cette réunion n’existe plus.',
        meeting_recording: 'Cette réunion est encore en cours d’enregistrement.',
        mybrain_unreachable: 'MyBrain était injoignable.',
        mybrain_timeout: 'MyBrain n’a pas répondu à temps.',
        mybrain_interrupted: 'L’envoi a été interrompu en route.',
        mybrain_connection_lost: 'La connexion à MyBrain a été coupée en route.',
        mybrain_not_retryable: 'Cette réunion n’a jamais été envoyée : il n’y a rien à réessayer.',
        internal_error: 'L’envoi a échoué de notre côté.',
        mybrain_rate_limited: 'MyBrain recevait trop de réunions à la fois.',
        mybrain_error: 'MyBrain a rencontré une erreur.',
        mybrain_unavailable: 'MyBrain n’accepte pas de dépôt pour le moment.',
        mybrain_rejected: 'MyBrain a refusé le contenu de cette réunion.',
        mybrain_too_long: 'Cette réunion dépasse ce que MyBrain accepte.',
        mybrain_key_rejected:
          'La connexion à MyBrain est à revoir : prévenez votre administration.',
        mybrain_right_missing:
          'La connexion à MyBrain est à revoir : prévenez votre administration.',
        mybrain_not_found: 'La connexion à MyBrain est à revoir : prévenez votre administration.',
        mybrain_redirected: 'La connexion à MyBrain est à revoir : prévenez votre administration.',
        mybrain_invalid_response:
          'La connexion à MyBrain est à revoir : prévenez votre administration.',
        too_many_requests: 'Trop d’essais en peu de temps. Réessayez dans un moment.',
        bad_origin: 'Requête refusée par sécurité. Rechargez la page et réessayez.',
        network: 'Serveur injoignable. Vérifiez votre connexion.',
        unknown: 'Une erreur est survenue.',
      },
    },
    passwordPolicy: {
      hint: '{min} caractères minimum.',
      required: 'Saisissez un mot de passe.',
      too_short: 'Le mot de passe doit faire au moins {min} caractères.',
      too_long: 'Le mot de passe est trop long.',
      too_common: 'Ce mot de passe est trop courant.',
      contains_email: 'Le mot de passe ne doit pas contenir votre adresse email.',
      mismatch: 'Les deux mots de passe ne correspondent pas.',
    },
    account: {
      // Infobulle de l'avatar — dit par quoi la session a été ouverte. Les clés
      // sont les valeurs d'`authProvider` renvoyées par le serveur.
      signedInWith: {
        google: 'Connecté avec Google',
        entra: 'Connecté avec Microsoft',
        password: 'Connecté par mot de passe',
        oidc: 'Connecté par SSO',
        sso: 'Connecté par SSO',
      },
      // Avatar de la barre d'app (téléphone) : ouvre la carte du compte.
      menuLabel: 'Mon compte',
      // Nom affiché quand le compte n'en porte aucun.
      guest: 'Invité',
      changePasswordTitle: 'Changer de mot de passe',
      // Groupe du compte (« Mon profil ») : attribué par l'administration,
      // l'utilisateur le lit, il ne le change pas.
      groupsLabel: 'Votre groupe',
      groupsHint: 'Attribué par votre administrateur.',
      // Capsule du bas de la colonne de gauche : sous le nom, ce qu'il reste
      // du crédit de temps (sans quota, l'adresse).
      capsuleRemaining: '{remaining} restantes',
      // Bloc « Ce mois-ci » de la carte du compte (téléphone) : le crédit et trois chiffres du
      // mois, le détail restant dans « Usage & crédits ».
      thisMonth: 'Ce mois-ci',
      monthMeetings: 'Réunions',
      monthRecorded: 'Enregistrées',
      monthSummaries: 'Comptes rendus',
      seeStats: 'Voir le détail',
      language: 'Langue',
      forcedTitle: 'Choisissez votre mot de passe',
      forcedMessage:
        'Votre compte utilise encore son mot de passe initial. Choisissez-en un nouveau pour continuer.',
      currentLabel: 'Mot de passe actuel',
      newLabel: 'Nouveau mot de passe',
      confirmLabel: 'Confirmer le nouveau mot de passe',
      submit: 'Enregistrer',
      submitting: 'Enregistrement…',
      saved: 'Mot de passe modifié. Vos autres appareils ont été déconnectés.',
      cancel: 'Annuler',
      errors: {
        invalid_current_password: 'Mot de passe actuel incorrect.',
        password_not_set: "Ce compte n'a pas de mot de passe. Passez par « mot de passe oublié ».",
        too_many_attempts: 'Trop de tentatives. Réessayez plus tard.',
        network: 'Serveur injoignable. Vérifiez votre connexion.',
        unknown: 'Une erreur est survenue. Réessayez.',
      },
    },
    // Coquille du panneau d'administration (AdminPanel).
    // Tableau de bord de l'administration (admin/DashboardTab.svelte) : les
    // constats du diagnostic en phrases, puis l'activité récente.
    adminDashboard: {
      tabLabel: 'Tableau de bord',
      intro: "Ce qui reste à régler dans l'organisation, et la page où le corriger.",
      issuesTitle: 'Points à régler',
      issuesEmpty: "Rien à régler : l'installation est en ordre.",
      // La gravité en toutes lettres : la couleur n'est jamais seule à la dire.
      levels: { error: 'Panne', warning: 'Réglage sans effet', tip: 'Conseil' },
      activityTitle: 'Activité des 30 derniers jours',
      activityLink: 'Voir la consommation',
      meetings: 'Réunions',
      recorded: 'Temps enregistré',
      activeAccounts: 'Comptes actifs',
      activeOf: '{active} sur {total}',
      activityError: 'Les chiffres ne sont pas disponibles pour le moment.',
    },
    adminPanel: {
      sectionsLabel: "Sections d'administration",
      // Rubriques repliables de la colonne — les noms qu'elles portent dans MIA.
      groupPeople: 'Personnes',
      groupModels: 'Modèles IA',
      groupCapabilities: 'Capacités',
      groupCosts: 'Coûts',
      groupOrganization: 'Organisation',
      restricted: 'Accès réservé aux administrateurs.',
      noAccess: "Le compte {email} n'a pas accès à l'administration.",
      signInRequired: "Connectez-vous pour accéder à l'administration.",
    },
    adminUsers: {
      tabLabel: 'Comptes',
      intro:
        'Les comptes qui accèdent à myBrief sur cette installation. Cliquez sur un compte pour le modifier.',
      searchPlaceholder: 'Rechercher un utilisateur…',
      createButton: 'Nouvel utilisateur',
      empty: 'Aucun utilisateur.',
      // En-têtes de la liste : ils portent le libellé une fois, au lieu de le
      // répéter sur chaque ligne.
      colName: 'Nom',
      colEmail: 'Email',
      colLastConnection: 'Dernière connexion',
      neverConnected: 'Jamais',
      countOne: '1 utilisateur',
      countMany: '{count} utilisateurs',
      countPartial: '{shown} utilisateurs affichés sur {total}',
      showMore: 'Afficher la suite',
      roleAdmin: 'Administrateur',
      roleUser: 'Utilisateur',
      // Pastille de la liste : seul le rôle d'exception s'affiche.
      adminBadge: 'Admin',
      you: 'vous',
      disabledBadge: 'Désactivé',
      noPasswordBadge: 'SSO uniquement',
      activeLabel: 'Actif',
      activeToggle: 'Compte actif',
      activeHintOn: 'Désactiver ce compte : ses sessions en cours seront fermées.',
      activeHintOff: 'Réactiver ce compte.',
      activeSelfHint: 'Vous ne pouvez pas désactiver votre propre compte.',
      lastConnection: 'Dernière connexion :',
      never: 'jamais',
      createTitle: 'Nouvel utilisateur',
      editTitle: "Modifier l'utilisateur",
      emailLabel: 'Adresse email',
      nameLabel: 'Nom affiché',
      roleLabel: 'Rôle',
      passwordLabel: 'Mot de passe initial',
      passwordAuto: 'Laisser vide pour générer un mot de passe automatiquement.',
      mustChangeLabel: 'Demander le changement de mot de passe à la première connexion',
      disabledLabel: 'Compte désactivé',
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      cancel: 'Annuler',
      back: 'Retour à la liste',
      resetPassword: 'Réinitialiser le mot de passe',
      resetConfirm:
        'Réinitialiser le mot de passe de {email} ? Ses sessions en cours seront fermées.',
      generatedTitle: 'Mot de passe à transmettre',
      generatedMessage: 'Notez-le maintenant : il ne sera plus affiché.',
      copy: 'Copier',
      copied: 'Copié',
      close: 'Fermer',
      deleteButton: 'Supprimer',
      deleteAccount: 'Supprimer le compte',
      deleteTitle: 'Supprimer définitivement ce compte',
      deleteMessage:
        'Cette action supprime le compte {email} ainsi que toutes ses réunions, ses templates personnels et sa configuration. Elle est irréversible.',
      deleteConfirmLabel: 'Saisissez {email} pour confirmer',
      deleteConfirm: 'Supprimer définitivement',
      // Groupe du compte (cf. adminGroups) : un choix unique dans la fiche,
      // une puce sur la ligne, filtre de la liste.
      groupsLabel: 'Groupe',
      groupsHint:
        'Un seul groupe par compte. Passé administrateur, le compte rejoint le groupe des administrateurs ; redevenu utilisateur, il en sort pour le groupe par défaut.',
      groupFilterLabel: 'Filtrer par groupe',
      groupFilterAll: 'Tous les groupes',
      emptyForGroup: 'Aucun utilisateur dans ce groupe.',
      errors: {
        email_taken: 'Un compte existe déjà avec cette adresse.',
        group_not_found: "Le groupe choisi n'existe plus. Rechargez la page.",
        no_login_mode_left:
          "Impossible d'enregistrer : plus aucun mode de connexion ne serait affiché sur la page de connexion.",
        last_admin: "Impossible : c'est le dernier administrateur actif.",
        self_target: 'Vous ne pouvez pas appliquer cette action à votre propre compte.',
        user_not_found: "Ce compte n'existe plus.",
        invalid_body: 'Vérifiez les champs saisis.',
        forbidden: "Vous n'avez pas les droits nécessaires.",
        network: 'Serveur injoignable. Vérifiez votre connexion.',
        unknown: 'Une erreur est survenue. Réessayez.',
      },
    },
    // Onglet « Groupes » de l'administration (components/admin/GroupsTab.svelte).
    // Le groupe par défaut y est nommé par son nom EN BASE (« Défaut » à la
    // naissance, renommable) : les libellés ci-dessous le désignent par
    // {default}, jamais en dur. Même chose pour celui des administrateurs
    // (« Admin » à la naissance) : « le groupe des administrateurs ».
    adminGroups: {
      tabLabel: 'Groupes',
      intro:
        "Des ensembles d'utilisateurs : services, équipes, profils. Chaque compte est dans un seul groupe : celui par défaut accueille tout nouveau compte, celui des administrateurs tout compte qui le devient. Un groupe peut limiter les minutes de réunion de ses membres.",
      counter: '{count} / {max}',
      createButton: '+ Nouveau groupe',
      loading: 'Chargement…',
      empty: 'Aucun groupe.',
      defaultBadge: 'Par défaut',
      defaultHint:
        'Tout nouveau compte y entre, et un compte retiré de son groupe y revient. Il se renomme, mais ne se supprime pas.',
      adminBadge: 'Administrateurs',
      adminHint:
        "Tout administrateur promu y entre, et en sort s'il est rétrogradé. Il se renomme, mais ne se supprime pas.",
      membersNone: 'Aucun membre',
      membersOne: '1 membre',
      membersMany: '{n} membres',
      noDescription: 'Sans description',
      openMembers: 'Voir les membres de {name}',
      editTitle: 'Modifier le groupe',
      createTitle: 'Nouveau groupe',
      deleteButton: 'Supprimer',
      nameLabel: 'Nom du groupe',
      namePlaceholder: 'Commerciaux, Direction, Stagiaires…',
      descriptionLabel: 'Description',
      descriptionPlaceholder: 'Facultative : à quoi sert ce groupe, qui doit y être.',
      colorLabel: 'Couleur',
      previewLabel: 'Aperçu',
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      cancel: 'Annuler',
      back: 'Retour aux groupes',
      membersTitle: 'Membres',
      addMemberLabel: 'Ajouter un membre',
      addMemberPlaceholder: 'Nom ou adresse…',
      addMemberHint: 'Tapez pour chercher parmi les comptes de cette installation.',
      addMemberNone: 'Aucun compte ne correspond.',
      addMemberAllIn: 'Tous les comptes trouvés sont déjà dans ce groupe.',
      adding: 'Ajout…',
      remove: 'Retirer',
      removeLastHint: "Retiré d'ici, il revient dans « {default} ».",
      removeOnlyDefaultHint: "On ne sort du groupe par défaut qu'en rejoignant un autre groupe.",
      // Compte trouvé pour l'ajout : le groupe qu'il quittera en entrant ici.
      currentGroup: 'Actuellement dans',
      noMembers:
        "Personne dans ce groupe pour l'instant. Ajoutez des membres ci-dessus, ou depuis la fiche de chaque compte.",
      deleteTitle: 'Supprimer ce groupe',
      deleteMessage:
        "Supprimer « {name} » ? Ses membres reviennent dans « {default} ». Aucun compte n'est supprimé.",
      deleteConfirm: 'Supprimer le groupe',
      // Quota de minutes de réunion (cf. services/api/lib/quota.js) : par
      // personne et par mois civil, celui du groupe du compte.
      quotaLabel: 'Minutes de réunion par mois',
      quotaUnlimited: 'Illimité',
      quotaLimited: 'Limité à',
      quotaUnit: 'min par mois et par personne',
      quotaMinutesLabel: 'Minutes par mois',
      quotaHint:
        "Chaque membre a ce quota pour lui : changer quelqu'un de groupe change son quota. Chacun voit son compteur en bas de la colonne de gauche.",
      quotaPill: '{minutes} min / mois',
      quotaPillUnlimited: 'Illimité',
      // Droits du groupe (cf. services/api/lib/repositories/groups.js) : ceux
      // de chacun de ses membres.
      rightsLabel: 'Droits',
      infographicLabel: 'Générer des infographies',
      infographicHint: "Les membres peuvent créer l'infographie d'un compte rendu.",
      infographicPill: 'Infographies',
      aiHelpLabel: 'Aide IA en réunion',
      aiHelpHint: 'Les membres peuvent activer l’Aide IA pendant leurs réunions.',
      aiHelpPill: 'Aide IA',
      aiHelpMyBrainLabel: 'Aide IA avec myBrain',
      aiHelpMyBrainHint:
        'L’Aide IA de ces membres lit le wiki partagé de myBrain — le même accès pour tout le groupe.',
      aiHelpMyBrainPill: 'Aide IA + myBrain',
      infographicGlobalOff:
        "Modèles IA ne propose pas l'infographie en ce moment : ce droit s'appliquera quand elle y sera activée.",
      // Colonne « Utilisateurs » et ajout par glisser-déposer (GroupPeople,
      // GroupCard). Au clavier et au doigt, le même ajout se fait en deux
      // temps : sélectionner le compte, puis choisir la carte.
      peopleTitle: 'Utilisateurs',
      peopleHint: 'Glissez un compte sur un groupe, ou sélectionnez-le puis choisissez le groupe.',
      peopleSearch: 'Chercher un compte…',
      peopleEmpty: 'Aucun compte.',
      peopleTruncated: '{shown} comptes affichés sur {total} : cherchez pour trouver les autres.',
      pickedHint: 'Choisissez un groupe pour {name}.',
      dropHere: 'Déposer ici',
      dropRelease: 'Relâchez pour placer',
      dropAdd: 'Placer {name} ici',
      dropAddTo: 'Placer {name} dans {group}',
      dropAlready: 'Déjà dans ce groupe',
      addedTo: '{name} est maintenant dans {group}.',
      errors: {
        quota_required: 'Indiquez un nombre de minutes, ou choisissez « Illimité ».',
        name_required: 'Donnez un nom au groupe.',
        name_too_long: 'Nom trop long : {max} caractères au plus.',
        description_too_long: 'Description trop longue : {max} caractères au plus.',
        color_invalid: 'Choisissez une couleur de la palette.',
        duplicate_name: 'Un groupe porte déjà ce nom.',
        limit_reached: 'Nombre maximal de groupes atteint ({max}).',
        group_not_found: "Ce groupe n'existe plus.",
        default_group: 'Le groupe par défaut ne se supprime pas.',
        admin_group: 'Le groupe des administrateurs ne se supprime pas.',
        user_not_found: "Un des comptes n'existe plus. Rechargez la page.",
        invalid_body: 'Vérifiez les champs saisis.',
        forbidden: "Vous n'avez pas les droits nécessaires.",
        network: 'Serveur injoignable. Vérifiez votre connexion.',
        unknown: 'Une erreur est survenue. Réessayez.',
      },
    },
    nativeRecording: {
      notifBody: 'Enregistrement en cours…',
      // Media Session : la carte « lecture en cours » du système (écran
      // verrouillé, centre de contrôle) pendant l'enregistrement.
      mediaTitle: 'MyBrief - Enregistrement',
      mediaAlbum: 'Transcription de réunion',
    },
    offlineCapture: {
      startedOffline:
        "📡 Hors ligne — l'audio est enregistré, la transcription rattrapera au retour du réseau",
      gapMarker: '⟨ Passage hors ligne — transcription différée dès le retour du réseau ⟩',
      markerAuthor: 'MyBrief',
      gapResolved: '✅ Passage hors ligne transcrit et réinséré',
      // Trou de capture (appel téléphonique, application en arrière-plan,
      // fermeture puis reprise) : rien n'a été capté, la ligne reste.
      interruptionMarker: '⟨ Enregistrement interrompu pendant {duration} ⟩',
      lostMarker: '⟨ Passage hors ligne non transcrit — l’application s’est fermée avant ⟩',
      pendingAtStop:
        "⏳ {count} passage(s) hors ligne en attente de transcription — envoi automatique au retour du réseau, gardez l'app ouverte",
    },
    buttons: {
      record: ' Enregistrer',
      stop: ' Pause',
      resume: '▶️ Reprendre',
      downloadAudio: "Télécharger l'audio",
      generateSummary: '✨ Générer et envoyer le résumé',
      summaryGenerating: '⏳ Génération...',
      export: '📥 Exporter',
      downloadPDF: '📄 Télécharger PDF',
      addAction: 'Ajouter une action manuellement',
      // Masquer, pas supprimer : l'action se rétablit depuis « Actions masquées ».
      hideAction: 'Masquer l’action',
      newMeeting: '🔄 Nouveau',
      hideTranscription: 'Masquer la transcription',
      showTranscription: 'Afficher la transcription',
      help: 'Aide',
      feedback: 'Déclarer un bug ou une idée',
      logout: 'Se déconnecter',
      close: 'Fermer',
      open: 'Ouvrir',
      start: 'Démarrer',
      summarize: 'Résumer',
      // Fin de réunion sans compte rendu : la réunion est nommée par IA et
      // rangée dans l'historique — le résumé pourra se générer plus tard.
      saveMeeting: 'Enregistrer',
      generateArrow: 'Générer →',
      administration: 'Administration',
      myTemplates: 'Mes templates',
      myTags: 'Mes tags',
      configuration: 'Réglages',
      // Bouton « Admin » de la carte du compte : le nom court tient à côté de
      // « Réglages » ; le nom accessible reste `administration`.
      adminShort: 'Admin',
    },
    sections: {
      summaryTitle: '📝 Résumé',
      transcriptionTitle: "💬 Transcription de l'audio",
      transcriptionSubtitle: 'Mise à jour toutes les 8 secondes',
      actionsTitle: '✅ Actions détectées',
      actionsSubtitle: 'Éditables',
      actionsHint: "Parlez explictement d'<b>actions</b> pour qu'elles s'affichent ici",
    },
    transcription: {
      defaultAuthor: 'Intervenant',
      waiting: 'En attente de la transcription…',
      backToLive: 'Revenir à la transcription en cours',
      empty: 'Aucune transcription pour le moment.',
      editHint: 'Double-cliquer pour éditer',
      // Nommer les participants de la visio (pastille « Visio »).
      speakers: {
        nameBadge: 'Nommer ce participant',
        splitHere: 'Autre participant à partir d’ici',
        title: 'Qui parle ici ?',
        unidentified: 'non identifié',
        placeholder: 'Nom du participant…',
        apply: 'Nommer',
        everywhere: 'Partout où « {name} » parle',
        scopeHint: 'Sinon, d’ici jusqu’au prochain changement de voix.',
      },
    },
    statuses: {
      ready: 'Prêt',
      requestingMicrophone: "🎤 Demande d'accès au microphone...",
      requestingSystemAudio: "🖥️ Demande d'accès à l'audio système (optionnel)...",
      connectingToServer: '🌐 Connexion au serveur...',
      recordingError: "❌ Erreur lors de l'enregistrement",
      noSystemAudio: 'Aucun son système détecté, capture micro uniquement',
      // Son de l'ordinateur par un périphérique virtuel (Firefox, Safari) :
      // lib/audio/systemAudio.js.
      systemDeviceMissing: "Son de l'ordinateur introuvable, capture micro uniquement",
      systemDeviceIsMic: "Le son de l'ordinateur est réglé sur le micro, capture micro uniquement",
      systemDeviceFailed: "Son de l'ordinateur indisponible, capture micro uniquement",
      systemDenied: 'Capture son système refusée, utilisation du micro seul',
      systemUnsupported: 'Capture du son système non supportée par ce navigateur',
      recordingUnavailable: 'Enregistrement local indisponible sur ce navigateur',
      mixedStreamUnavailable: 'Flux audio combiné indisponible',
      recorderPrepError: "Erreur lors de la préparation de l'enregistrement local",
      recordingInProgress: 'Enregistrement en cours',
      recordingFinished: 'Enregistrement terminé',
      connectionLost: '⚠️ Connexion perdue, reconnexion...',
      connectionRestored: '✅ Connexion rétablie',
      transcriptionInterrupted: '⚠️ Transcription interrompue, reconnexion...',
      transcriptionCreditExhausted: "❌ Crédit d'IA épuisé — transcription suspendue",
      transcriptionLimited: '⚠️ Service de transcription momentanément limité',
      captureResumed: '✅ Enregistrement repris après {duration} d’interruption',
      // Remplacement écrit dans les notes, versé dans les « Mots remplacés » du
      // compte (utils/noteLearning.js). {from} → {to} : la consigne ; {n}, {max}.
      replacementLearned:
        '✅ « {from} » sera remplacé par « {to} » dans vos prochaines réunions (Réglages → Pendant la réunion → Mots remplacés)',
      replacementsLearned:
        '✅ {n} remplacements de vos notes retenus pour vos prochaines réunions (Réglages → Pendant la réunion → Mots remplacés)',
      replacementsFull:
        '⚠️ Vos mots remplacés sont au complet ({max}) : retirez-en dans Réglages → Pendant la réunion → Mots remplacés pour que les suivants soient retenus',
      recordingInterrupted:
        '⚠️ Enregistrement interrompu (appel, autre application) — touchez l’écran pour le reprendre',
      summaryGenerating: 'Génération du résumé...',
      summaryReady: 'Résumé généré',
      summaryError: 'Erreur lors de la génération du résumé',
      transcriptionSaved: '✅ Transcription sauvegardée',
      processingAudio: 'Traitement du fichier audio...',
      importingAudio: 'Import audio en cours',
      exported: 'Données exportées',
      templateStatus: 'Modèle : {name}',
    },
    /** Barre d'outils de l'éditeur de résumé + indicateur d'autosave. */
    editor: {
      toolbarLabel: 'Mise en forme du résumé',
      bold: 'Gras',
      italic: 'Italique',
      underline: 'Souligné',
      title: 'Titre',
      subtitle: 'Sous-titre',
      bulletList: 'Liste à puces',
      orderedList: 'Liste numérotée',
      link: 'Lien hypertexte',
      linkHint: 'Sélectionnez du texte pour créer un lien',
      linkUrlPlaceholder: 'Adresse du lien (https://…)',
      linkApply: 'Appliquer',
      linkRemove: 'Retirer',
      clearFormatting: 'Effacer la mise en forme',
      saving: 'Enregistrement…',
      saved: 'Enregistré',
      saveFailed: 'Non enregistré',
    },
    alerts: {
      incompatibleBrowser:
        "⚠️ Votre navigateur ne supporte pas l'enregistrement audio. Utilisez Chrome, Firefox ou Edge récent.",
      noTranscription: 'Aucune transcription disponible pour générer un résumé',
      invalidAudioFile: 'Veuillez sélectionner un fichier audio valide.',
      fileTooLarge: 'Le fichier est trop volumineux. La taille maximale est de 25MB.',
      audioImportError: "Erreur lors de l'import du fichier audio: {error}",
      // 503 `record_busy` (services/api/routes/ai.js) : refus passager, pas une panne.
      recordBusy:
        "Le serveur transcrit déjà d'autres fichiers. Réessayez l'import dans une minute.",
      // 413 `audio_too_long` : OpenAI refuse l'audio pour sa DURÉE, pas son poids.
      audioTooLong:
        "Cet enregistrement est trop long pour être transcrit d'un seul tenant. Coupez-le en morceaux de moins de 5 minutes et importez-les l'un après l'autre.",
      audioImportEmpty:
        'Le serveur a retourné une réponse vide. Vérifiez le service API et la clé OpenAI.',
      audioImportNoSpeech:
        'Aucune transcription trouvée dans la réponse du serveur. Vérifiez que le fichier audio contient bien de la parole.',
      audioImportServer: 'Erreur serveur : {status} - {detail}',
      pdfGenerationError: 'Erreur lors de la génération du PDF: {error}',
      summarySaveError:
        "L'enregistrement du résumé a échoué — vos dernières modifications ne sont pas sauvegardées.",
      transcriptionSaveError:
        "L'enregistrement de la transcription a échoué — vos dernières modifications ne sont pas sauvegardées.",
      historyLoadError: "Impossible de charger l'historique : {error}",
      meetingTitleError:
        'La réunion est enregistrée, mais son titre n’a pas pu être généré — renommez-la depuis l’historique.',
      // Démarrage refusé (utils/recordingErrors.js) : ce qu'il faut FAIRE,
      // sur ordinateur comme sur téléphone.
      micDenied:
        'Micro refusé : autorisez-le pour MyBrief dans les réglages du navigateur ou du téléphone, puis relancez l’enregistrement.',
      micNotFound:
        'Aucun micro détecté. Branchez-en un, ou choisissez-en un autre dans Réglages → Pendant la réunion → Micro et son, puis réessayez.',
      micBusy: 'Le micro est déjà utilisé par une autre application. Fermez-la, puis réessayez.',
      recordingStartFailed: 'L’enregistrement n’a pas pu démarrer. Réessayez dans un instant.',
      notesActionsSaveError:
        "L'enregistrement des notes et des actions a échoué — vos dernières modifications ne sont pas sauvegardées.",
    },
    actions: {
      ownerLabel: '👤 Porteur:',
      deadlineLabel: '📅 Échéance:',
      descriptionLabel: '📝 Description:',
      ownerPlaceholder: 'À définir',
      manualEditHint: 'Cliquez pour éditer la description...',
      newBadge: 'NEW',
      countsLabel: 'Actions : {visible} visibles · {hidden} masquées',
      actionPlaceholder: 'Action…',
      emptyMessage: 'Les actions détectées apparaîtront ici.',
      detectedTitle: 'Actions détectées',
      listeningMessage: 'À l’écoute des actions…',
      analysisLabel: 'Analyse en cours…',
      collapsePanel: 'Réduire les actions',
      expandPanel: 'Afficher les actions',
      hintLabel: 'Comment les actions sont détectées',
      hint: 'Détectées automatiquement à mesure que la réunion avance, puis affinées au fil des phrases. Modifiez-les ou ajoutez-en librement : elles accompagnent le compte rendu. Une action masquée le quitte, et se rétablit depuis « Actions masquées ».',
      // Liste repliée des actions masquées, sous les cartes.
      hiddenToggle: 'Actions masquées ({count})',
      restoreAction: 'Rétablir',
      restoreActionLabel: 'Rétablir l’action « {title} »',
      untitledAction: 'Action sans titre',
    },
    notes: {
      title: 'Notes de réunion',
      placeholder:
        'Vos notes : points clés, chiffres, décisions… intégrés au résumé.\nPour corriger un nom : « Remplace Alexe par Alex », ou « SAL : système d’aide pour les lentilles ».',
      expandPanel: 'Agrandir les notes',
      shrinkPanel: 'Réduire les notes',
      hintLabel: 'Comment les notes sont utilisées',
      hint: 'Vos notes enrichissent le résumé : points clés, décisions et chiffres y sont intégrés, même s’ils n’ont pas été dits à voix haute. Pour corriger un nom mal transcrit, soyez explicite — « Remplace Alexe par Alex » — ou définissez le sigle (« SAL : système d’aide pour les lentilles »). Un nom simplement mentionné ne remplace jamais les autres noms : seuls les mots manifestement écorchés (« Fabrican » → « Fabrikam ») se corrigent d’eux-mêmes.',
    },
    ariaLabels: {
      // Suffixe des liens qui quittent l'app : « Aide (nouvel onglet) ».
      newTab: 'nouvel onglet',
      resizeSummary: 'Ajuster la largeur du résumé',
      resizeColumns: 'Ajuster la largeur des colonnes',
      openMenu: 'Ouvrir le menu',
      searchMeeting: 'Rechercher une réunion',
      goToLiveTranscription: 'Revenir à la transcription en cours',
      deleteThisMeeting: 'Supprimer cette réunion',
      generateSummary: 'Générer le résumé',
      saveMeeting: 'Enregistrer la réunion sans résumé',
      recordingInProgress: 'Enregistrement en cours',
      close: 'Fermer',
      closeModal: 'Fermer la modal',
    },
    sidebar: {
      historyTitle: 'Historique',
      backHome: "Retour à l'accueil",
      // Lien court au-dessus des sections d'un panneau (« ‹ Accueil ») ; son
      // nom accessible reste `backHome`.
      home: 'Accueil',
      newMeeting: 'Nouvelle réunion',
      searchPlaceholder: 'Rechercher…',
      noMeetings: 'Aucune réunion',
      defaultMeetingTitle: 'Réunion',
      titlePending: 'Titre en cours de rédaction…',
      // Compte rendu en cours : le titre de la ligne s'anime, ce libellé le dit (hors écran).
      summaryWriting: 'Résumé en cours de rédaction…',
      meetingOf: 'Réunion de {name}',
      liveLabel: 'Réunion en cours',
      tagMenu: 'Tag',
      // Sélecteur du tag de la réunion ouverte (TagSelect) — pas le filtre.
      tagSelectLabel: 'Tag de la réunion',
      tagBack: 'Retour',
      tagNone: 'Aucun tag',
      tagManage: 'Gérer les tags…',
      tagNoneYet: 'Aucun tag créé',
      // Recherche du sélecteur de tag — dans le nom ET le contexte des tags.
      tagSearch: 'Rechercher un tag',
      tagSearchCreate: 'Rechercher ou créer un tag…',
      tagRecent: 'Récents',
      tagAll: 'Tous les tags',
      tagNoMatch: 'Aucun tag ne correspond.',
      tagCreate: 'Créer « {label} »',
      filterAll: 'Tous',
      filterUntagged: 'Sans tag',
      filterLabel: 'Filtrer par tag',
      noMeetingsForTag: 'Aucune réunion avec ce tag',
      // Bandeau de filtre actif : la barre de puces défile horizontalement,
      // scrollbar masquée — sur un écran étroit la puce active sort du champ
      // et le filtre devient invisible. Ce bandeau, lui, ne défile pas.
      filterHiddenOne: '1 réunion masquée par le filtre',
      filterHiddenMany: '{n} réunions masquées par le filtre',
      filterReset: 'Tout afficher',
      // Sous le nom de l'application, quand l'administration n'a pas posé
      // sa propre phrase d'accueil (Administration → Configuration).
      tagline: 'Assistant au quotidien',
      // Groupes de l'historique ; au-delà de deux semaines, le mois (Intl).
      groupThisWeek: 'Cette semaine',
      groupLastWeek: 'Semaine dernière',
      loading: 'Chargement…',
      profile: 'Profil',
      rename: 'Renommer',
      delete: 'Supprimer',
      resizeLabel: "Redimensionner l'historique",
      resizeHint: 'Glisser pour redimensionner • Double-clic pour réinitialiser',
    },
    dock: {
      requestingMicShort: 'Accès micro…',
    },
    // Compteur de minutes de réunion (components/QuotaMeter.svelte, bas de la
    // colonne de gauche) et refus au démarrage. Le mois vient d'Intl, dans la
    // langue de l'interface ; les durées passent par les trois gabarits.
    quota: {
      title: 'Temps de réunion',
      renewal: 'Renouvelé le 1er {month}.',
      groupHint: 'Quota du groupe {group} : {limit} par mois et par personne.',
      blockedShort: 'Quota atteint',
      exhaustedToast:
        'Vos minutes de réunion du mois sont épuisées : elles se renouvellent le 1er {month}. Votre administrateur peut relever le quota de votre groupe.',
      // Atteint EN COURS de réunion (QuotaLiveAlert) : la réunion continue.
      exhaustedLiveToast:
        "Vos minutes de réunion du mois sont épuisées. L'enregistrement continue jusqu'à ce que vous l'arrêtiez, mais vous ne pourrez pas démarrer d'autre réunion avant le 1er {month}.",
      minutesOnly: '{m} min',
      hoursOnly: '{h} h',
      hoursMinutes: '{h} h {m}',
    },
    // « Usage & crédits » (stats/PersonalStats.svelte) : l'usage du compte et son crédit de
    // temps du mois — la jauge réutilise les mots du compteur (`quota`) ; et
    // Administration → Crédit de temps, qui réutilise la page pour un compte.
    myStats: {
      // Administration : le crédit de chaque compte (admin/CreditsTab).
      creditsTabLabel: 'Crédit de temps',
      intro:
        'Votre usage de MyBrief : vos réunions, le temps enregistré et votre crédit de temps du mois. Des chiffres, jamais le contenu de vos réunions.',
      rangeLabel: 'Période observée',
      ranges: { month: 'Ce mois', 90: '3 mois', 365: '12 mois', all: 'Depuis toujours' },
      refresh: 'Actualiser',
      refreshing: 'Actualisation…',
      remainingOf: 'restantes sur {limit}',
      exhaustedBig: 'Épuisé',
      exhaustedOn: 'Crédit épuisé le {date}.',
      gaugeLabel: 'Il reste {remaining} sur {limit}',
      legendLeft: 'Ce qui reste',
      legendPace: 'Rythme régulier : {value}',
      paceAlert: 'Plus rapide que le mois : à ce rythme, votre crédit sera épuisé vers le {date}.',
      liveHint: 'Réunion en cours comprise.',
      unlimitedTitle: 'Temps illimité',
      unlimitedLine: '{time} enregistrées en {month}.',
      unlimitedHint: "Aucune limite de temps ne s'applique à votre compte.",
      kpiMeetings: 'Réunions',
      kpiMeetingsHint: '{total} depuis le début',
      kpiTime: 'Temps enregistré',
      kpiDeleted: '+ {time} de réunions supprimées, comptées dans le crédit',
      kpiAverage: 'Durée moyenne',
      kpiAverageHint: 'Médiane {median} · la plus longue {longest}',
      kpiSummaries: 'Comptes rendus',
      kpiRegenerated: 'Dont {count} régénérés',
      kpiRegeneratedOne: 'Dont 1 régénéré',
      kpiNoRegeneration: 'Aucune régénération',
      kpiNoDuration: 'Aucune durée mesurée sur la période',
      chartCredit: 'Au fil du mois',
      chartCreditHint: "Ce qu'il reste de votre crédit, jour après jour.",
      legendRemaining: 'Crédit restant',
      legendPaceLine: 'Rythme régulier',
      legendProjection: 'Projection',
      legendWeekend: 'Week-end',
      today: "aujourd'hui",
      projectionLabel: 'épuisé vers le {date}',
      colDay: 'Jour',
      colUsedDay: 'Consommé ce jour',
      colRemaining: 'Reste',
      chartTime: 'Temps enregistré',
      chartTimeHint: 'Heures enregistrées par période.',
      chartTemplates: 'Modèles utilisés',
      chartTemplatesHint: 'Le modèle choisi pour chaque compte rendu.',
      chartWeekdays: 'Jours de la semaine',
      chartWeekdaysHint: 'Les jours où vous enregistrez.',
      chartDurations: 'Durée des réunions',
      chartDurationsHint: 'Combien de réunions par tranche de durée.',
      templateUnknown: 'Sans modèle',
      colPeriod: 'Période',
      colTime: 'Temps',
      colTemplate: 'Modèle',
      colMeetings: 'Réunions',
      empty: 'Aucune réunion sur la période.',
      partialDurations:
        "Certaines réunions n'ont pas de durée enregistrée : la mesure a été ajoutée en août 2026. Elles comptent dans le nombre de réunions, pas dans les durées.",
      teamIntro:
        'Le crédit de temps de chaque compte ce mois-ci, du plus urgent au moins urgent. Un clic ouvre ses statistiques : des volumes, jamais le contenu de ses réunions.',
      allGroups: 'Tous les groupes',
      groupFilter: 'Filtrer par groupe',
      sumLimited: 'Comptes avec un crédit',
      sumLimitedValue: '{limited} sur {accounts}',
      sumExhausted: 'Crédit épuisé',
      sumAtRisk: 'Épuisé avant le 1er {month} à ce rythme',
      colAccount: 'Compte',
      colCredit: 'Crédit restant',
      colPace: 'Rythme',
      colLast: 'Dernière réunion',
      creditLine: '{remaining} sur {limit}',
      unlimitedCell: 'Illimité · {time} ce mois',
      paceExhausted: 'Épuisé le {date}',
      paceAlertShort: 'Épuisé vers le {date}',
      paceOk: 'Dans le rythme',
      paceNone: 'Pas de limite',
      noMeeting: 'Aucune réunion',
      never: 'Jamais',
      teamEmpty: 'Aucun compte dans ce groupe.',
      back: 'Tous les comptes',
      viewingTitle: 'Statistiques de {name}',
      viewingHint: 'Ce que {name} voit dans « Usage & crédits ».',
      openAccount: 'Voir les statistiques de {name}',
      errors: {
        user_not_found: "Ce compte n'existe plus.",
        forbidden: 'Réservé aux administrateurs.',
        unknown: "Les statistiques n'ont pas pu être chargées. Réessayez dans un instant.",
      },
    },
    // Les commandes de la réunion en cours, sur ordinateur (Dock) comme sur
    // téléphone (MobileMeetingBar, boutons flottants nommés hors réunion), et
    // la feuille « Terminer la réunion ? » (EndMeetingSheet). Des noms courts :
    // sous les icônes du téléphone, quatre tiennent en 360 px.
    // Aide IA d'une réunion (components/aiHelp/, stores/aiHelp.js). `{name}` est
    // le mot d'appel réglé par l'administration (« Alfred »).
    aiHelp: {
      name: 'Aide IA',
      setupSwitch: 'Aide IA pour cette réunion',
      setupOn:
        '{name} suit la réunion et intervient par écrit ; un son annonce ses alertes, ses idées et ce qu’elle fait pour vous.',
      setupOff: 'Éteinte pour cette réunion.',
      setupNote:
        'Réglages repris de votre dernière réunion. Le projet est reconnu d’après le tag ou ce qui se dit. Tout se change en un clic pendant la réunion.',
      setupNoteNoBrain:
        'Réglages repris de votre dernière réunion. {name} s’appuie sur la réunion, vos notes et l’ordre du jour. Tout se change en un clic pendant la réunion.',
      domainsLabel: 'Domaines d’intervention',
      domains: {
        project: {
          title: 'Garde-fou du projet',
          hint: 'Alerte si une décision contredit le projet.',
        },
        qa: {
          title: 'Questions-réponses',
          hint: 'Répond à vos questions. Sans elles, {name} fait encore ce que vous lui demandez.',
        },
        agenda: { title: 'Ordre du jour', hint: 'Retient les points, rappelle les oubliés.' },
        ideas: { title: 'Boîte à idées', hint: 'Propose une piste de temps à autre.' },
      },
      agendaLabel: 'Points à traiter',
      agendaHint: 'un par ligne',
      agendaPlaceholder: 'Avancement du lot 2\nRisques\nBudget',
      agendaVoiceHint:
        'Ou annoncez-les en réunion — « à l’ordre du jour : … » — : {name} les retient.',
      agendaEmpty:
        'Aucun point pour l’instant. Annoncez-les à voix haute — « à l’ordre du jour : … » — ou ajoutez-en un.',
      agendaAddLabel: 'Ajouter un point à l’ordre du jour',
      agendaAddPlaceholder: 'Ajouter un point…',
      agendaAdd: 'Ajouter ce point',
      agendaRemove: 'Retirer « {point} » de l’ordre du jour',
      agendaHeard: 'Retenu d’après ce qui s’est dit en réunion',
      agendaEdit: 'Corriger',
      agendaEvents: {
        noted: 'J’ai noté l’ordre du jour',
        closing: 'La réunion se termine : des points n’ont pas été abordés',
      },
      pillOn: 'Aide IA activée — cliquer pour l’éteindre',
      pillOff: 'Aide IA éteinte — cliquer pour l’activer',
      turnedOn: 'Aide IA activée',
      turnedOff: 'Aide IA éteinte',
      // Le mot d'appel, dit à côté de l'orbe : ce qu'on lit (`wakeSay`), et ce
      // que disent l'infobulle et le lecteur d'écran (`wakeHint`).
      wakeSay: '« {name}, … »',
      wakeLabel: '« {name} »',
      wakeHint: 'Pour lui parler, commencez votre phrase par « {name} »',
      // Les domaines, rangés derrière un bouton de la pastille du dock.
      domainsOpen: 'Choisir ce que suit l’Aide IA',
      domainsSome: 'Choisir ce que suit l’Aide IA — {on} domaines sur {total} activés',
      ask: 'Demander',
      askTitle: 'Demander à {name}',
      askLabel: 'Votre question à {name}',
      askPlaceholder: 'Votre question…',
      // Questions-réponses coupées : on lui demande encore des gestes.
      askLabelCommands: 'Votre demande à {name}',
      askPlaceholderCommands: 'Une demande : un tag, une note, un minuteur, une pause…',
      commandsOnly:
        'Questions-réponses coupées : {name} ne répond pas aux questions, mais fait ce que vous lui demandez.',
      askSend: 'Envoyer la question',
      // Quelques questions d'exemple, sous le fil du pupitre — de quoi montrer
      // ce qu'on peut lui demander, pas un menu.
      suggestions: [
        'Fais une synthèse',
        'Où en est l’ordre du jour ?',
        'Quelles actions ont été décidées ?',
        'Qu’a-t-on oublié ?',
        'D’autres idées ?',
      ],
      chatEmpty:
        'Demandez à {name} une synthèse, l’ordre du jour, les actions, des idées — ou de lancer un minuteur, de mettre en pause, de corriger la transcription, de rédiger le compte rendu. Ici, ou à voix haute : « {name}, … ».',
      chatEmptyCommands:
        'Demandez à {name} de poser un tag, de prendre une note, de lancer un minuteur, de mettre en pause, de corriger la transcription ou de rédiger le compte rendu. Ici, ou à voix haute : « {name}, … ».',
      settings: 'Réglages de l’Aide IA',
      // Le bouton du son, pendant la réunion (AiHelpSoundButton).
      soundMute: 'Couper le son de l’Aide IA pour cette réunion',
      soundUnmute: 'Rétablir le son de l’Aide IA',
      soundLocked: 'Le navigateur bloque le son — cliquez pour l’activer',
      soundMuted: 'Son coupé',
      soundBack: 'Son rétabli',
      soundUnlocked: 'Son activé',
      openPreferences: 'Démarrage, sons et voix pour toutes vos réunions →',
      // Lu à voix haute après « La réunion se termine… ».
      voicePointsLeft: 'Points restants : {points}',
      // Réglages → Aide IA (settings/AiHelpSection) : ce qui vaut pour TOUTES
      // les réunions. Les mots du bouton de la pastille sont `sound…`.
      prefs: {
        intro:
          'Ce que fait l’Aide IA de vos réunions, avant même qu’elles commencent. Pendant une réunion, tout se change pour elle seule : la cloche de sa pastille coupe le son.',
        startTitle: 'Au démarrage d’une réunion',
        startHint: 'L’Aide IA et ses domaines tels qu’ils sont à l’ouverture de chaque réunion.',
        startSwitch: 'Aide IA allumée',
        startOff:
          'Vos réunions démarrent sans elle : son orbe, dans la barre du bas, l’allume en un clic.',
        soundsTitle: 'Sons',
        soundsHint: 'Un son par sens, pour savoir ce qui arrive sans regarder l’écran.',
        sounds: {
          alerts: {
            label: 'Alertes',
            hint: 'Trois notes montantes : contradiction, rappel, points oubliés en fin de réunion.',
          },
          ideas: { label: 'Idées', hint: 'Un coup de sonnette de comptoir.' },
          actions: {
            label: 'Gestes faits',
            hint: 'Deux notes brèves : elle a compris, c’est fait.',
          },
          timer: {
            label: 'Fin du minuteur',
            hint: 'Une courte mélodie quand le décompte arrive à zéro.',
          },
        },
        listen: 'Écouter',
        listenTo: 'Écouter le son « {label} »',
        voiceTitle: 'Voix',
        voiceHint:
          'Lire à voix haute ce qu’elle écrit. Couper le son pendant une réunion la fait taire aussi.',
        voiceSwitch: 'Lire à voix haute',
        readLabel: 'Ce qu’elle lit',
        read: { answers: 'Ses réponses', alerts: 'Ses alertes et rappels', ideas: 'Ses idées' },
        engineLabel: 'Moteur',
        engines: {
          browser: {
            label: 'Votre navigateur',
            hint: 'Gratuit, sur votre appareil : rien ne sort. Les voix sont celles de votre système.',
          },
          openai: {
            label: 'OpenAI',
            hint: 'Voix naturelles, facturées sur la clé de votre organisation.',
          },
          mistral: {
            label: 'Mistral',
            hint: 'Voxtral, facturé sur la clé Mistral de votre organisation.',
          },
        },
        engineRetires: 'OpenAI arrête ces modèles le {date}.',
        enginesChecking: 'Vérification des voix proposées…',
        enginesNote:
          'Les voix d’OpenAI et de Mistral apparaissent quand votre administrateur a renseigné leur clé, et seulement après un essai réussi.',
        engineGone: 'Ce moteur n’est plus proposé : choisissez-en un autre.',
        noBrowserVoice: 'Ce navigateur ne sait pas lire à voix haute.',
        modelLabel: 'Modèle',
        voiceLabel: 'Voix',
        voiceDefault: 'Voix par défaut du système',
        otherLanguages: 'Autres langues',
        sample:
          'Bonjour, je suis {name}. Voici comment je lirai ce que j’écris pendant vos réunions.',
        sampleSpeaking: 'Lecture en cours…',
        sampleDone: 'Voix essayée.',
        save: 'Enregistrer',
        saving: 'Enregistrement…',
        saved: 'Enregistré',
        discard: 'Annuler les changements',
        errors: {
          voice_blocked: 'Le navigateur bloque le son : cliquez dans la page, puis réessayez.',
          voice_unavailable: 'Cette voix n’est pas disponible sur cet appareil.',
          voice_failed: 'La voix n’a pas pu être lue.',
          voice_unknown: 'Cette voix n’existe pas pour ce modèle.',
          voice_model_unknown: 'Ce modèle de voix n’est pas proposé.',
          too_many_requests: 'Trop d’essais en peu de temps : réessayez dans un moment.',
          ai_help_not_allowed: 'Votre groupe n’a plus accès à l’Aide IA.',
          default: 'L’opération a échoué. Réessayez.',
        },
      },
      close: 'Fermer',
      kinds: {
        alert: 'Contradiction',
        agenda: 'Ordre du jour',
        idea: 'Idée',
        answer: 'Réponse',
        project: 'Question',
        reminder: 'Rappel',
      },
      // Ce que l'IA a fait à la demande — dit par myBrief, pas par le modèle.
      acts: {
        tag: 'Tag « {label} » posé sur la réunion.',
        tagMissing: 'Aucun de vos tags ne s’appelle « {label} » : créez-le dans Mes tags.',
        note: 'Note ajoutée : {text}',
        reminder: 'Rappel dans {minutes} min : {label}',
        reminderBare: 'Rappel dans {minutes} min.',
        // Le minuteur. `timerNone` : on lui demande de le changer, aucun ne tourne.
        timerStart: 'Minuteur lancé : {time}.',
        timerStartLabel: 'Minuteur lancé : {time} — {label}',
        timerAdd: 'Minuteur rallongé de {time} : il reste {left}.',
        timerCut: 'Minuteur raccourci de {time} : il reste {left}.',
        timerStop: 'Minuteur arrêté.',
        timerNone: 'Aucun minuteur ne tourne.',
        // Sur la réunion elle-même. `…Noop` : rien n'était à faire, et on le dit.
        pause:
          'Réunion mise en pause. {name} n’entend plus rien : reprenez par « Reprendre », ou demandez-le-lui par écrit.',
        pauseNoop: 'La réunion est déjà en pause.',
        resume: 'Réunion reprise.',
        resumeNoop: 'La réunion n’est pas en pause.',
        end: 'Réunion terminée.',
        summaryNow: 'Réunion terminée : compte rendu rédigé avec le template « {template} ».',
        summaryNowDefault: 'Réunion terminée : compte rendu rédigé.',
        summaryLater:
          'Compte rendu commandé pour la fin de la réunion, avec le template « {template} ».',
        summaryLaterDefault: 'Compte rendu commandé pour la fin de la réunion.',
        templateMissing: 'Aucun template ne s’appelle « {template} » : rien n’a été lancé.',
        replace: 'Transcription corrigée : « {find} » remplacé par « {with} ».',
        replaceAll: 'Transcription corrigée : « {find} » remplacé partout par « {with} ».',
        remove: 'Transcription corrigée : « {find} » retiré.',
        replaceMissing: '« {find} » ne figure pas dans la transcription : rien n’a été changé.',
      },
      reminderTitle: 'C’est l’heure du rappel',
      // Le minuteur demandé à l'IA (AiHelpTimer) : `left…` est lu par le
      // lecteur d'écran, les chiffres seuls s'affichent.
      timer: {
        left: 'Minuteur : il reste {time}',
        leftLabel: 'Minuteur « {label} » : il reste {time}',
        done: 'Temps écoulé',
        stop: 'Arrêter le minuteur',
        close: 'Fermer le minuteur',
      },
      askedByVoice: 'Demandé à voix haute',
      askedInWriting: 'Demandé par écrit',
      thinking: '{name} cherche…',
      wakeMark: 'Question à {name}',
      acknowledge: 'Compris',
      acknowledged: 'Vu',
      dismiss: 'Ranger',
      dismissLabel: 'Ranger cette intervention',
      // D'autres interventions attendent derrière la carte : elles se lisent
      // dans la conversation — une seule fenêtre, une seule fermeture.
      othersOpenOne: '1 autre intervention — tout voir',
      othersOpenMany: '{count} autres interventions — tout voir',
      sizeUp: 'Agrandir la fenêtre et son texte',
      sizeDown: 'Réduire la fenêtre et son texte',
      agendaStates: { done: 'Traité', now: 'En cours', todo: 'Pas encore abordé' },
      projectLabel: 'Projet de la réunion',
      projectLinked: '{project} · myBrain',
      projectUnknown: 'Projet à préciser',
      projectNone: 'Sans projet',
      projectChange: 'Changer',
      projectAskTitle: 'De quel projet parle cette réunion ?',
      projectAskBody: 'Je ne le reconnais ni au tag ni à ce qui se dit. Un clic suffit.',
      projectNoneChoice: 'Aucun de ceux-là',
      projectSearch: 'Chercher un projet dans myBrain',
      projectEmpty: 'Aucune fiche de projet ne porte ce nom.',
      // Le tag de la réunion ne mène pas à ce projet : le relier (stores/aiHelpTagLink.js).
      tagLinkTitle: 'Relier le tag « {tag} » à ce projet ?',
      tagLinkBody:
        'Les prochaines réunions avec ce tag partiront directement sur « {project} », sans rien vous demander.',
      tagRelinkBody:
        'Ce tag mène aujourd’hui à « {linked} ». Le relier plutôt à « {project} » ? Les prochaines réunions avec ce tag partiront sur lui.',
      tagLinkYes: 'Relier',
      tagLinkNo: 'Pas maintenant',
      tagLinkFailed: 'Le tag n’a pas pu être relié. Réessayez.',
      openSheet: 'Ouvrir « {title} » dans myBrain',
      stageLabel: 'Intervention de l’Aide IA',
      notice: 'myBrain ne répond pas : {name} continue avec la réunion seule.',
      // Sous une réponse tirée de la seule réunion : pourquoi myBrain n'y est pas
      // (clé = `knowledge` de l'intervention, lib/aiHelp/session.js).
      knowledgeNotes: {
        empty: 'myBrain n’a rien sur cette question : réponse tirée de la réunion.',
        down: 'myBrain n’a pas répondu : réponse tirée de la réunion.',
        no_right:
          'Votre groupe n’a pas le droit « Aide IA avec myBrain » : réponse tirée de la réunion.',
        no_key_right: 'La clé de myBrain n’a pas le droit « lire » : réponse tirée de la réunion.',
      },
      noBrain:
        'Votre compte ne lit pas myBrain : {name} répond d’après la réunion, vos notes et votre contexte.',
      // Au pupitre, la même chose avec sa raison (clé = `myBrainReason` du serveur).
      noBrainReasons: {
        no_group_right:
          'Votre groupe n’a pas le droit « Aide IA avec myBrain » : {name} répond d’après la réunion, vos notes et votre contexte.',
        no_read_right:
          'La clé de myBrain n’a pas le droit « lire » : {name} répond d’après la réunion, vos notes et votre contexte.',
        not_connected:
          'myBrain n’est pas relié à myBrief : {name} répond d’après la réunion, vos notes et votre contexte.',
      },
      // Bandeau d'une panne de myBrain en cours de réunion (clé = slug de la panne).
      notices: {
        mybrain_right_missing:
          'myBrain refuse la lecture à la clé de myBrief : {name} continue avec la réunion seule.',
        mybrain_key_rejected:
          'myBrain ne reconnaît plus la clé de myBrief : {name} continue avec la réunion seule.',
        mybrain_timeout:
          'myBrain met trop de temps à répondre : {name} continue avec la réunion seule.',
        // Une question à voix haute, alors que les réponses sont coupées.
        questions_off:
          'Questions-réponses coupées : {name} ne répond pas, mais fait ce que vous lui demandez — un tag, une note, une pause…',
      },
      errors: {
        default: '{name} n’a pas pu répondre. Réessayez.',
        network: 'Connexion perdue : la question n’est pas partie.',
        too_many_requests: 'Trop de questions en peu de temps. Réessayez dans un instant.',
        ai_help_no_answer: '{name} n’a pas trouvé de réponse.',
        // Au pupitre, sous la règle (`commandsOnly`) : ce qu'il est advenu de CE message.
        ai_help_domain_off:
          'C’est une question : {name} n’y répond pas, les questions-réponses sont coupées.',
        ai_help_mybrain_not_allowed: 'La lecture de myBrain n’est pas ouverte à votre compte.',
        mybrain_unreachable: 'myBrain ne répond pas. Réessayez plus tard.',
        mybrain_not_found: 'Cette fiche n’existe plus dans myBrain.',
      },
      tag: {
        title: 'Projet dans myBrain',
        hint: 'Quand une réunion porte ce tag, l’Aide IA sait de quel projet elle parle.',
        suggested: 'Proposé d’après le nom du tag',
        linked: 'Relié à ce tag',
        none: 'Aucun projet relié. L’IA le reconnaîtra d’après ce qui se dit, ou le demandera.',
        link: 'Relier',
        unlink: 'Délier',
      },
    },
    adminAiHelp: {
      tabLabel: 'Aide IA',
      intro:
        'Pendant une réunion, l’IA suit ce qui se dit et intervient par écrit : réponses, alertes, idées. Réglez ici ce que l’installation propose. Qui s’en sert se décide dans Groupes.',
      domainsTitle: 'Domaines d’intervention proposés',
      domainsHint:
        'Un domaine coupé ici n’apparaît chez personne. Les autres sont allumés d’office au début de chaque réunion.',
      domains: {
        project:
          'Alerte si une décision contredit l’objectif, le périmètre ou une échéance du projet de la réunion.',
        qa: 'Répond aux questions, à voix haute ou par écrit. Avec myBrain : les fiches. Sans : la réunion en cours. Coupé, on peut encore lui demander un geste : tag, note, pause…',
        agenda:
          'Retient les points à traiter, annoncés en réunion ou ajoutés au pupitre. Dit s’ils ont été tenus, signale ceux qu’on oublie et, à la fin, ceux qu’on n’a pas abordés.',
        ideas: 'Propose de temps à autre une piste ou une question à se poser.',
      },
      needsMyBrain: 'myBrain',
      domainLocked: 'Indisponible : la clé de myBrain n’a pas le droit « lire ».',
      wakeTitle: 'Mot d’appel',
      wakeHint:
        'Le prénom que les participants donnent à l’IA pour lui parler à voix haute : une question, ou un geste à faire.',
      wakeExample: 'En réunion : « {name}, rappelle-moi la date de livraison ? »',
      paceTitle: 'Interventions spontanées',
      paceHint: 'Ce que l’IA signale d’elle-même, sans qu’on l’appelle.',
      paces: {
        quiet: { label: 'Discrètes', hint: 'Seulement les contradictions nettes, aucune idée.' },
        normal: {
          label: 'Normales',
          hint: 'Les contradictions, les points qu’on oublie, une idée toutes les dix minutes au plus et, en fin de réunion, les points qu’on n’a pas abordés.',
        },
        busy: {
          label: 'Soutenues',
          hint: 'Aussi les dérives légères, et une idée toutes les cinq minutes au plus — l’IA se manifeste plus souvent.',
        },
      },
      brainTitle: 'Lecture de myBrain',
      brainOk: 'Connexion vérifiée. La clé a le droit « lire ».',
      brainNoRead:
        'La clé de myBrain n’a pas le droit « lire » : l’Aide IA fonctionne sans myBrain. Si la clé vient de le recevoir, « Tester la connexion » dans l’onglet MyBrain le relit ; sinon, un administrateur de myBrain peut émettre une clé qui l’a.',
      brainOff: 'myBrain n’est pas branché : l’Aide IA fonctionne sans lui (onglet MyBrain).',
      brainScope:
        'L’Aide IA lit le wiki partagé au nom de l’application, pas de la personne : tout compte autorisé y a le même accès. Les zones restreintes de myBrain lui restent fermées.',
      accessTitle: 'Qui y a droit',
      accessNoneBadge: 'Personne pour l’instant',
      accessBadgeOne: '1 groupe',
      accessBadgeMany: '{count} groupes',
      accessNone:
        'Aucun groupe n’a encore le droit « Aide IA en réunion » : personne ne la voit, vous compris. Donnez-le à un groupe dans l’onglet Groupes, sous Droits.',
      accessSome: 'L’Aide IA apparaît aux membres de ces groupes. Les autres ne voient rien.',
      accessNotYou:
        'Votre compte n’est dans aucun de ces groupes : vous ne la verrez pas dans vos propres réunions.',
      // Ce que le compte de l'administrateur obtient, lui (clé = `me.reason`).
      meOk: 'Votre compte : l’Aide IA lit myBrain dans vos réunions.',
      meReasons: {
        no_group_right:
          'Votre compte a l’Aide IA, mais son groupe n’a pas le droit « Aide IA avec myBrain » : dans vos réunions, elle ne consultera pas myBrain.',
        no_read_right:
          'Votre compte a l’Aide IA, mais la clé de myBrain n’a pas le droit « lire » : dans vos réunions, elle ne consultera pas myBrain.',
        not_connected:
          'Votre compte a l’Aide IA, mais myBrain n’est pas relié à myBrief : elle s’en tient à la réunion.',
      },
      accessWithBrain: 'avec myBrain',
      accessOpenGroups: 'Ouvrir Groupes',
      testTitle: 'Tester la lecture',
      testHint:
        'Posez une question comme en réunion : vous voyez ce que myBrain rend à myBrief pour y répondre.',
      testPlaceholder: 'C’est quoi le projet … ?',
      testButton: 'Tester',
      testing: 'Lecture…',
      testContextOne: 'myBrain a rendu 1 fiche en {ms} ms :',
      testContextMany: 'myBrain a rendu {count} fiches en {ms} ms :',
      testContextNone:
        'myBrain n’a rendu aucune fiche pour cette question ({ms} ms). L’Aide IA se rabat alors sur la recherche par mots-clés ci-dessous.',
      testSearch: 'Recherche par mots-clés « {keywords} » :',
      testSearchNone: 'aucune fiche trouvée.',
      testNoKeywords: 'Cette question ne contient aucun mot-clé à chercher.',
      testFailed: 'myBrain a refusé cette lecture : {reason}',
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      saved: 'Enregistré',
      errors: {
        default: 'Les réglages n’ont pas pu être enregistrés.',
        network: 'Connexion perdue. Réessayez.',
        too_many_requests: 'Trop d’essais en peu de temps. Réessayez dans un instant.',
        mybrain_not_connected: 'myBrain n’est pas relié : faites-le dans l’onglet MyBrain.',
        mybrain_right_missing: 'la clé n’a pas le droit « lire ».',
        mybrain_key_rejected: 'myBrain refuse la clé.',
        mybrain_unreachable: 'myBrain est injoignable depuis le serveur de myBrief.',
        mybrain_timeout: 'myBrain n’a pas répondu à temps.',
        mybrain_unavailable: 'ce myBrain n’offre pas cette lecture.',
      },
    },
    meetingBar: {
      title: 'Commandes de la réunion',
      notes: 'Notes',
      actions: 'Actions',
      pause: 'Pause',
      resume: 'Reprendre',
      end: 'Terminer',
      // Le contresens à lever : une pause n'est pas une fin. La forme courte
      // sert au dock quand la fenêtre est trop étroite pour la phrase.
      pausedStatus: 'En pause — la réunion n’est pas terminée',
      pausedShort: 'En pause',
      endTitle: 'Terminer la réunion ?',
      endSubtitle: 'Choisissez ce que vous gardez.',
      endSummarize: 'Résumer maintenant',
      endSummarizeHint: 'L’enregistrement s’arrête et le compte rendu se rédige.',
      endSave: 'Enregistrer sans résumé',
      endSaveHint:
        'La réunion est rangée dans l’historique, avec ses notes et ses actions. Le compte rendu pourra attendre.',
      endDelete: 'Supprimer la réunion',
      endDeleteHint: 'Rien n’est gardé.',
      endCancel: 'Annuler',
    },
    // Reprendre l’enregistrement d’une réunion TERMINÉE (utils/meetingResume.js) :
    // « Reprendre » dans le dock juste après l’arrêt, le bouton en fin de
    // transcription ailleurs (réunion rouverte, ou déjà résumée).
    meetingResume: {
      dock: 'Reprendre',
      dockTitle: 'Reprendre l’enregistrement : la suite s’ajoute à cette réunion',
      cta: 'Reprendre l’enregistrement',
      ctaTitle: 'La suite s’ajoutera à la fin de cette transcription',
      marker: '⟨ Enregistrement repris le {date} à {time} ⟩',
    },
    dockCard: {
      templateUsed: 'Template utilisé',
      groupUserTemplates: 'Mes templates',
      templatesSection: 'Templates',
      instructionsLabel: 'Instructions supplémentaires',
      instructionsPlaceholder:
        'Dans cette zone, vous pouvez fournir des informations supplémentaires...',
      // Options de CETTE génération : deux tuiles à interrupteur, sous le
      // Pagimètre. Le nombre d'actions s'affiche à côté du titre.
      optionsSection: 'Ajouter au compte rendu',
      actionsOption: 'Actions détectées',
      actionsOptionHint: 'Listées dans leur propre section',
      actionsOptionNone: 'Aucune action détectée',
      infographicOption: 'Infographie',
      infographicOptionHint: 'Image de la réunion, en plus',
      cancel: 'Annuler',
      optional: 'facultatif',
    },
    // Pagimètre : la longueur du ✨ Résumé IA, réglée en pages — curseur de la
    // carte de génération (PageMeterSlider), section de l'éditeur de template,
    // longueur rappelée sur l'étiquette du résumé. Cf. src/lib/pageMeter.js.
    pageMeter: {
      name: 'Pagimètre',
      subtitle: 'Longueur du ✨ Résumé IA, une fois mis en page',
      sliderAria: 'Longueur du résumé, en pages',
      words: '≈ {n} mots',
      reading: '{n} min de lecture',
      extras: 'Titre, infos et actions de la mise en forme s’y ajoutent.',
      capNote:
        'Réunion courte : au-delà de {max}, il n’y aurait plus rien de vrai à écrire. Le résumé s’arrêtera vers {max}.',
      capZone: 'Au-delà : pas assez de matière dans cette réunion',
      badgeTitle: 'Longueur réglable (Pagimètre) — {value}',
      pickerOff:
        'Ce template ne propose pas le Pagimètre : la longueur du résumé suit ses directives.',
      tagTitle: 'Pagimètre — demandé : {requested} · obtenu : ≈ {measured}',
      editorToggle: 'Proposer le Pagimètre',
      editorHint:
        'Au moment de générer, chacun règle la longueur du ✨ Résumé IA, de ¼ de page à 10 pages. Choisissez ici la position de départ.',
      editorOff: 'Désactivé : la longueur du résumé suit seulement vos directives.',
      editorDefault: 'Position par défaut',
      editorPriority: 'Le Pagimètre prime sur toute longueur écrite dans les directives.',
    },
    // Infographie de la réunion : miniature flottante de l'onglet Résumé,
    // animation pendant la génération, visionneuse plein écran (ResumeOverlays).
    infographic: {
      pendingLabel: 'Infographie en cours…',
      errorLabel: 'Infographie en échec',
      errorHint:
        "La génération de l'infographie n'a pas abouti. Régénérez un résumé avec l'option Infographie activée pour réessayer.",
      thumbAlt: 'Infographie de la réunion',
      openAria: "Voir l'infographie en grand",
      title: 'Infographie de la réunion',
      download: "Télécharger l'infographie",
      close: 'Fermer',
      regenerate: "Régénérer l'infographie",
      remove: "Supprimer l'infographie",
      // Pastille de la miniature sur téléphone, et boutons de l'affichage en grand.
      shortLabel: 'Infographie',
      regenerateShort: 'Régénérer',
      removeShort: 'Supprimer',
      createInvite: 'Créer une infographie',
      createInviteHint:
        "Générer l'infographie de cette réunion — pictogrammes, graphiques, logo de l'organisation —, à partir de la transcription, des actions et des notes.",
      removeConfirm:
        "Supprimer l'infographie de cette réunion ? La réunion et son compte rendu ne bougent pas — vous pourrez en générer une nouvelle.",
      actionFailed: "L'action sur l'infographie a échoué. Réessayez.",
      disabledError: "L'infographie est désactivée par l'administration.",
      notAllowedError: "Votre groupe ne vous permet pas de créer d'infographie.",
      downloadPreparing: "Préparation de l'image…",
      zoomIn: 'Agrandir',
      zoomOut: "Ajuster à l'écran",
      downloadFailed: "L'image de l'infographie n'a pas pu être préparée. Réessayez.",
      // Libellés imprimés SUR l'infographie (gabarits). Choisis selon la langue
      // de l'infographie — celle de sa génération —, pas celle de l'écran :
      // ils doivent parler la même langue que les textes écrits par l'IA.
      sheet: {
        templates: {
          synthese: 'Synthèse',
          decision: 'Décision',
          feuille_de_route: 'Feuille de route',
          tableau_de_bord: 'Tableau de bord',
          atelier: 'Atelier',
          bilan: 'Bilan',
        },
        logoAlt: "Logo de l'organisation",
        untitled: 'Réunion',
        essential: "L'essentiel",
        topics: 'Les sujets',
        ideas: 'Les idées',
        decision: 'Décision prise',
        decisions: 'Décisions',
        otherDecisions: 'Autres décisions',
        vigilance: 'Points de vigilance',
        options: 'Options étudiées',
        retained: 'Retenue',
        pros: 'Pour',
        cons: 'Contre',
        goal: 'Objectif',
        milestones: 'Étapes',
        done: 'Fait',
        upcoming: 'À venir',
        target: 'Objectif',
        indicators: 'Indicateurs',
        breakdown: 'Répartition',
        ofTarget: '{pct} de {target}',
        targetLabel: 'objectif {value}',
        before: 'avant',
        now: 'maintenant',
        question: 'La question',
        ideaOne: 'idée',
        ideaMany: 'idées',
        themeOne: 'thème',
        themeMany: 'thèmes',
        retainedOne: 'retenue',
        retainedMany: 'retenues',
        retainedIdeas: 'Idées retenues',
        voteOne: '{count} vote',
        voteMany: '{count} votes',
        nextSteps: 'Suites décidées',
        verdict: 'En bref',
        worked: 'Ce qui a marché',
        struggled: 'Ce qui a coincé',
        tryNext: 'À essayer',
        actions: 'Actions',
        moreActionOne: '+ 1 autre action dans le compte rendu',
        moreActionMany: '+ {count} autres actions dans le compte rendu',
        participants: 'Participants',
        morePeopleOne: 'et 1 autre',
        morePeopleMany: 'et {count} autres',
        nextStep: 'Prochaine étape',
        // À côté du logo de l'application, en pied de chaque infographie.
        madeWith: 'myBrief',
        appLogoAlt: "Logo de l'application",
        tagLogoAlt: 'Logo du client ou du projet',
      },
    },
    tagsPanel: {
      title: 'Mes tags',
      close: 'Fermer',
      intro:
        'Un tag range vos conversations par client, projet ou sujet. Il peut aussi dire à l’IA de quoi il s’agit, où classer leurs comptes rendus et à qui les envoyer.',
      loading: 'Chargement…',
      empty: 'Aucun tag pour le moment. Créez-en un pour commencer à ranger vos conversations.',
      add: 'Nouveau tag',
      labelField: 'Nom',
      labelPlaceholder: 'Client Dupont',
      colorField: 'Couleur',
      // Nom de chaque pastille, lu par les lecteurs d'écran. Une clé par slug de
      // TAG_COLORS (services/api/routes/tags.js) — services/api/test/tags.test.js
      // le vérifie, en français comme en anglais.
      colorNames: {
        slate: 'Gris ardoise',
        brown: 'Marron',
        red: 'Rouge',
        orange: 'Orange',
        amber: 'Ambre',
        lime: 'Vert anis',
        green: 'Vert',
        teal: 'Bleu canard',
        sky: 'Bleu ciel',
        blue: 'Bleu',
        navy: 'Bleu marine',
        violet: 'Violet',
        fuchsia: 'Fuchsia',
        pink: 'Rose',
        'blue-stripes': 'Bleu rayé',
        'red-stripes': 'Rouge rayé',
        'green-spots': 'Vert tacheté',
        'amber-spots': 'Ambre tacheté',
        'violet-ring': 'Anneau violet',
        'teal-ring': 'Anneau bleu canard',
        'navy-orange': 'Moitié marine, moitié orange',
      },
      // Couleur libre : la pastille arc-en-ciel (un choix de couleur de plus,
      // dans le même groupe que la palette) et ses deux curseurs — l'angle de
      // teinte, puis la clarté.
      hueField: 'Couleur libre',
      hueSlider: 'Angle de la teinte',
      lightnessSlider: 'Clarté',
      shapeField: 'Forme',
      // Nom de chaque forme, lu par les lecteurs d'écran. Une clé par slug de
      // TAG_SHAPES (services/api/routes/tags.js) — même vérification que les
      // couleurs.
      shapeNames: {
        circle: 'Rond',
        square: 'Carré',
        diamond: 'Losange',
        triangle: 'Triangle',
        hexagon: 'Hexagone',
        star: 'Étoile',
        heart: 'Cœur',
      },
      save: 'Enregistrer',
      cancel: 'Annuler',
      deleteTitle: 'Supprimer ce tag ?',
      deleteBody:
        'Le tag « {label} » sera supprimé. Les conversations qui le portent ne seront pas supprimées, elles perdront simplement leur tag.',
      deleteBodyCount:
        'Le tag « {label} » sera supprimé et {count} conversation(s) perdront leur rangement. Aucune conversation n’est supprimée.',
      confirmDelete: 'Supprimer',
      // ── La page : une liste à gauche, la fiche du tag choisi à droite ──
      counterOne: '{n} tag sur {max}',
      counterMany: '{n} tags sur {max}',
      searchLabel: 'Rechercher un tag',
      searchPlaceholder: 'Nom, personne, sigle…',
      searchEmpty: 'Aucun tag ne correspond.',
      taggedOne: '1 conversation',
      taggedMany: '{n} conversations',
      taggedNone: 'Aucune conversation',
      // Légende des deux icônes d'une ligne : la règle PROPRE au tag.
      legendFolder: 'a son propre dossier',
      legendMail: 'a ses propres destinataires',
      commonTitle: 'Réglages communs',
      commonHint: 'Pour les tags sans règle propre',
      // Fiche d'un tag.
      ficheCountOne: '1 conversation porte ce tag',
      ficheCountMany: '{n} conversations portent ce tag',
      ficheCountNone: 'Aucune conversation ne porte encore ce tag',
      inHistory: 'Dans l’historique',
      appearance: 'Nom et apparence',
      removeTag: 'Supprimer le tag',
      back: 'Mes tags',
      savedHint: 'Chaque choix est enregistré aussitôt.',
      // ── Nom sur place, pastille rapide ──
      rename: 'Renommer',
      pastille: 'Couleur et forme',
      pastilleMore: 'Motifs et couleur libre…',
      // ── Logo du client ou du projet ──
      logoQuestion: 'Quel logo sur ses documents ?',
      logoWhen:
        'Celui du client ou du projet : en médaillon sur l’infographie, en tête du compte rendu PDF, et dans cette liste.',
      logoDrop: 'Déposer un logo',
      logoBrowse: 'ou cliquer pour le choisir · PNG, JPG, SVG',
      logoReplace: 'Remplacer…',
      logoRemove: 'Retirer',
      logoAlt: 'Logo du tag « {tag} »',
      logoSaving: 'Envoi du logo…',
      logoSaveError: 'Impossible d’enregistrer le logo. Réessayez.',
      // ── Rangement et envoi, repliés ──
      ruleEdit: 'Modifier',
      ruleClose: 'Fermer',
      peopleMore: '+ {n}',
      // ── Contexte — ce que l'IA doit savoir du dossier (lib/tagContext.js) ──
      contextQuestion: 'Que doit savoir l’IA ?',
      contextWhen:
        'Le projet, ses acteurs et leurs rôles, les sigles : de quoi comprendre une conversation taguée « {tag} ».',
      contextPlaceholder:
        'Ex. : rénovation du siège, livraison en juin. Acteurs : Claire Martin, cliente ; Hugo Bernard, bureau d’études. Sigles : PAC = pompe à chaleur.',
      contextReadBy: 'Lu par',
      contextReaders: {
        summary: 'Compte rendu',
        transcript: 'Transcription',
        infographic: 'Infographie',
        aiHelp: 'Aide IA',
      },
      contextCount: '{n} / {max}',
      contextSaving: 'Enregistrement…',
      contextSaved: 'Enregistré',
      contextGuard:
        'L’IA s’en sert pour comprendre qui est qui et ce que veulent dire les sigles. Elle ne le recopie pas dans le compte rendu comme s’il avait été dit en réunion.',
      contextSaveError: 'Impossible d’enregistrer ce texte. Réessayez.',
      // ── Rangement — le lien tag → action « Entreposer » ──
      folderQuestion: 'Où ranger ses comptes rendus ?',
      folderWhen: 'Quand vous choisissez « Entreposer » après une conversation taguée « {tag} ».',
      folderDefaultTitle: 'Avec les autres comptes rendus',
      folderDefaultAuto: 'Dans un dossier à son nom, créé au premier dépôt :',
      folderDefaultRoot: 'Directement dans votre dossier principal :',
      folderCustomTitle: 'Dans un dossier que je choisis',
      folderNone: 'Aucun dossier choisi pour l’instant.',
      folderChoose: 'Choisir un dossier…',
      folderChange: 'Changer de dossier',
      rootAdmin: 'Dossier défini par votre administrateur',
      storageClosed:
        'Le dépôt de fichiers est désactivé par votre organisation. Les destinations restent enregistrées et s’appliqueront s’il rouvre.',
      storageNotConnected:
        'Reliez votre compte Google ou Microsoft (Réglages → Comptes connectés) pour choisir des dossiers.',
      storageDriveMissing:
        'Votre compte est relié sans l’accès aux fichiers. Reliez-le à nouveau depuis Réglages → Comptes connectés pour autoriser le dépôt.',
      storageSaveError: 'Impossible d’enregistrer la destination. Réessayez.',
      // ── Envoi — le lien tag → action « Envoyer par mail » ──
      mailQuestion: 'À qui envoyer ses comptes rendus ?',
      mailWhen:
        'Quand vous choisissez « Envoyer par mail » après une conversation taguée « {tag} ».',
      mailDefaultTitle: 'Aux destinataires habituels',
      mailDefaultNow: 'Aujourd’hui : {who}.',
      mailCustomTitle: 'À des personnes précises',
      mailCustomHint:
        'Elles reçoivent le compte rendu à la place de vos destinataires habituels. Vous restez en copie.',
      mailNone: 'Personne pour l’instant.',
      mailChoose: 'Choisir les personnes…',
      mailEdit: 'Modifier la liste…',
      mailClosed:
        'L’envoi par mail est désactivé par votre organisation. Les listes restent enregistrées et s’appliqueront s’il rouvre.',
      recipientsSelfOnly: 'vous seul',
      recipientsDefaultOne: 'vous + 1 adresse',
      recipientsDefaultMany: 'vous + {n} adresses',
      // ── Réglages communs : ce que « avec les autres » et « habituels » désignent ──
      commonIntro:
        'Ils s’appliquent à chaque tag réglé sur « Avec les autres comptes rendus » ou « Aux destinataires habituels ».',
      rootTitle: 'Dossier principal',
      rootEdit: 'Modifier dans Entreposer',
      defaultRecipientsTitle: 'Destinataires habituels',
      defaultRecipientsEdit: 'Modifier dans Envoi d’email',
      // ── Création et modification (TagForm) ──
      newHint:
        'Un nom et une pastille suffisent. Le rangement et l’envoi se règlent ensuite, dans sa fiche.',
      creating: 'En cours de création',
      create: 'Créer le tag',
      moreColors: 'Plus de choix : motifs et couleur libre',
      preview: 'Aperçu',
      previewHistory: 'Dans l’historique',
      previewHeader: 'En tête de conversation',
      previewMeeting: 'Votre réunion',
      editableHint: 'Nom, couleur et forme restent modifiables à tout moment.',
      // Messages d'erreur, indexés par le slug renvoyé par l'API.
      errors: {
        duplicate_label: 'Vous avez déjà un tag portant ce nom.',
        limit_reached: 'Limite atteinte : {max} tags au maximum.',
        label_required: 'Donnez un nom au tag.',
        label_too_long: 'Nom trop long ({max} caractères maximum).',
        color_invalid: 'Couleur inconnue.',
        shape_invalid: 'Forme inconnue.',
        context_too_long: 'Texte trop long ({max} caractères maximum).',
        logo_invalid: 'Ce fichier n’est pas une image : choisissez un PNG, un JPG ou un SVG.',
        logo_too_big: 'Image trop lourde pour un logo : choisissez-en une plus simple.',
        logo_unreadable: 'Image illisible : essayez un autre fichier.',
        tag_not_found: 'Ce tag n’existe plus. Rechargez la page.',
        meeting_not_found: 'Cette conversation est introuvable.',
        network: 'Opération impossible pour le moment. Réessayez.',
      },
    },
    userTemplatesPanel: {
      // Les icônes (titre, sections, boutons) sont des SVG portés par le
      // composant, comme dans l'administration : plus d'emoji dans les textes.
      title: 'Mes templates',
      close: 'Fermer',
      loading: 'Chargement…',
      empty: 'Aucun template personnel pour le moment. Cliquez sur « Ajouter » pour en créer un.',
      sectionIdentity: 'Identité',
      sectionDirectives: "Directives à l'IA",
      sectionScaffold: 'Mise en forme du résumé',
      directivesHint:
        "Décrivez ce que l'IA doit produire dans le bloc ✨ Résumé IA — le résumé principal de votre compte rendu (style, contenu, longueur).",
      directivesPlaceholder:
        "Ex : Résume l'échange en 50 mots maximum, mets l'accent sur les décisions prises et les actions à mener.",
      scaffoldHint:
        'Le squelette de votre compte rendu. Il contient toujours le ✨ Résumé IA (défini par vos Directives) — déplacez-le où vous voulez, ajoutez des résumés complémentaires (20 mots, 100 mots, points clés) et les infos de la réunion. Tout le reste apparaît tel quel.',
      scaffoldHelp:
        'Votre compte rendu peut contenir un ou plusieurs résumés. Le ✨ Résumé IA est le résumé principal : toujours présent, il suit vos Directives ci-dessus — déplacez-le, il ne peut pas être retiré. Les pastilles ⚡ Résumé en 20 mots, 📃 Résumé en 100 mots et 🎯 Points clés ajoutent des résumés complémentaires, indépendants des Directives. Insérez aussi les infos de la réunion (date, auteur, actions…) où vous voulez. Le reste du texte (titres, lignes, mise en forme) reste tel quel.',
      scaffoldPlaceholder:
        '# Compte rendu — {{date}}\n*Auteur : {{author}} — Durée : {{duration}}*\n\n## Synthèse\n\n{{résumé}}\n\n## Actions à mener\n\n{{actions}}',
      fieldIcon: 'Icône',
      nameLabel: 'Nom du template',
      namePlaceholder: 'ex: Synthèse commerciale',
      addEnVersion: '+ ajouter version anglaise',
      hideEnVersion: '− retirer version anglaise',
      fieldLabelEn: 'Nom (anglais)',
      fieldLabelEnPlaceholder: 'e.g. Sales summary',
      slugHint: 'Identifiant : {slug}',
      insertVariableHint:
        'Cliquez pour insérer une info que MyBrief remplacera automatiquement dans le résumé.',
      varGroupAi: 'Blocs IA',
      varGroupMeta: 'Infos réunion',
      varAlreadyInserted:
        'Déjà dans la mise en forme — un seul exemplaire possible. Déplacez la pastille directement dans le texte.',
      formatBold: 'Gras',
      formatItalic: 'Italique',
      formatUnderline: 'Souligné',
      formatH1: 'Titre 1',
      formatH2: 'Titre 2',
      formatDragBlock: 'Déplacer le bloc',
      formatHint: 'Sélectionnez du texte puis cliquez pour le mettre en forme.',
      helpAria: "Afficher l'aide",
      previewLabel: "Aperçu (avec des données d'exemple)",
      starterPickerTitle: "Partez d'un modèle",
      starterPickerSubtitle: 'Choisissez un point de départ — vous pourrez tout modifier ensuite.',
      starterFromScratch: 'Partir de zéro',
      starterFromTemplate: 'Inspiré de {name}',
      starterPickerCancel: 'Annuler',
      copySuffix: '(copie)',
      save: 'Sauvegarder',
      cancel: 'Annuler',
      backToList: 'Retour à la liste',
      delete: 'Supprimer',
      add: 'Ajouter un template',
      // Écran de droite quand rien n'est sélectionné : il dit quoi faire.
      pickTitle: 'Aucun template sélectionné',
      pickHint: 'Choisissez un template dans la liste pour le modifier, ou créez-en un nouveau.',
      pickHintEmpty: 'Créez votre premier template : il apparaîtra ensuite dans la liste.',
      limitReached: 'Limite de 5 templates atteinte. Supprimez-en un pour en créer un nouveau.',
      limitReachedServer: 'Limite de 5 templates atteinte côté serveur.',
      confirmDelete: 'Supprimer le template "{name}" ?',
      saveSuccess: '"{name}" sauvegardé.',
      saveError: 'Erreur {status} lors de la sauvegarde.',
      fetchError: 'Erreur {status} au chargement des templates.',
      networkError: 'Erreur réseau : {message}',
      errorNameRequired: 'Le nom du template est requis.',
      errorValueRequired: 'Le nom du template est requis.',
      errorValueInvalid:
        'Le nom ne peut pas être vide ou composé uniquement de caractères spéciaux.',
    },
    modals: {
      deleteMeetingTitle: 'Supprimer la réunion ?',
      deleteFromHistoryBody: "Cette réunion sera définitivement supprimée de l'historique.",
      deleteCurrentBody:
        "L'enregistrement et la transcription en cours seront définitivement supprimés.",
      cancel: 'Annuler',
      confirmDelete: 'Supprimer',
      // {label} : le nom de la version (« Résumé 2 »), à défaut deleteVersionFallback.
      deleteVersionTitle: 'Supprimer {label} ?',
      deleteVersionFallback: 'cette version',
      deleteVersionBody:
        'Cette version du résumé sera supprimée. Les autres versions sont conservées.',
      resumeInterruptedTitle: 'Réunion interrompue',
      resumeInterruptedBody:
        'L’enregistrement s’est arrêté avant la fin de la réunion. La transcription, les notes, les actions et le chronomètre sont conservés. Reprendre là où elle s’est arrêtée ?',
      endInterrupted: 'Terminer la réunion',
      resume: 'Reprendre',
    },
    // Onglet « Actions » de « Réglages ». Section à part de `config` :
    // le composant est autonome et lit ses libellés directement.
    configActions: {
      tabLabel: 'Actions',
      afterSummaryTitle: 'Après le premier résumé',
      afterSummaryHint:
        'Une fenêtre propose de ranger la réunion, d’envoyer le résumé par mail et de l’entreposer, en un geste.',
      afterSummaryToggle: 'Proposer ces actions après le premier résumé',
      intro:
        'Ce que deviennent vos comptes rendus : à qui ils partent, où ils se déposent, sous quel nom.',
      recipientsTitle: 'Destinataires',
      recipientPlaceholder: 'nom@exemple.fr',
      recipientAdd: 'Ajouter',
      remove: 'Retirer',
      recipientInvalid: 'Cette adresse ne semble pas valide.',
      recipientRejected: 'Adresses refusées : {list}',
      recipientsTooMany: '{max} destinataires maximum.',
      alwaysCopied:
        'Vous êtes toujours en copie, quoi qu’il arrive. Laissez la liste vide pour ne recevoir que vous-même.',
      alwaysCopiedShort: 'Vous restez en copie, quoi qu’il arrive.',
      // Destinataires par tag — la liste d'un tag REMPLACE la liste par défaut.
      tagRecipientsTitle: 'Destinataires par tag',
      tagRecipientsIntro:
        'Un tag peut avoir ses propres destinataires. Ils remplacent la liste ci-dessus pour les conversations qui le portent.',
      tagRecipientsDefault: 'Liste par défaut',
      tagRecipientsEdit: 'Modifier…',
      tagRecipientsDialogTitle: 'Destinataires du tag',
      tagRecipientsDialogHint:
        'Ces adresses remplacent votre liste par défaut pour les conversations qui portent ce tag — elles ne s’y ajoutent pas.',
      tagRecipientsEmptyNote: 'Sans adresse, ce tag suit votre liste par défaut.',
      tagRecipientsCancel: 'Annuler',
      tagRecipientsApply: 'Valider',
      forTag: '{message} (tag « {tag} »)',

      folderTitle: 'Dossier de dépôt',
      folderPlaceholder: 'Ex : Clients/Acme/Comptes-rendus',
      folderHint: 'Laissé vide, myBrief utilise le dossier défini par votre administrateur.',
      browse: 'Parcourir…',
      libraryLabel: 'Bibliothèque :',
      approvalLabel: 'Me demander confirmation avant chaque dépôt',
      approvalHint:
        'Une fenêtre récapitule le dossier visé et le nom du fichier avant qu’il ne parte.',
      tagSubfoldersLabel: 'Un sous-dossier par tag',
      tagSubfoldersHint:
        'Une conversation taguée se dépose dans « dossier de dépôt / nom du tag », créé au besoin.',
      tagFoldersTitle: 'Destinations par tag',
      tagFoldersIntro:
        'Un tag peut viser son propre dossier — y compris dans une autre bibliothèque.',
      tagFoldersEmpty: 'Aucun tag pour l’instant. Créez-en depuis le panneau « Mes tags ».',
      tagFolderAuto: 'Sous-dossier « {tag} »',
      tagFolderDefault: 'Dossier de dépôt',
      tagFolderReset: 'Réinitialiser',
      folderDriveRoot: 'Racine de la bibliothèque',

      pickerTitle: 'Choisir un dossier',
      pickerClose: 'Fermer',
      pickerLibrary: 'Bibliothèque',
      pickerRoot: 'Racine',
      pickerUp: 'Remonter',
      pickerSearch: 'Rechercher un dossier…',
      pickerSearchGo: 'Chercher',
      pickerSearchResults: 'Résultats de recherche',
      pickerNoResult: 'Aucun dossier trouvé.',
      pickerEmpty: 'Aucun sous-dossier ici.',
      pickerLoading: 'Chargement…',
      pickerNewFolder: 'Nouveau dossier…',
      pickerCreate: 'Créer',
      pickerSelection: 'Sélection :',
      pickerConfirm: 'Choisir ce dossier',
      pickerSharedDrivesMissing:
        'Vos Drive partagés n’apparaissent pas ici : votre compte a été relié avant que myBrief sache les lister. Reconnectez-le depuis « Réglages → Comptes connectés » pour les voir. Mon Drive et le dépôt fonctionnent normalement.',
      // Même drapeau serveur, côté Microsoft : ce sont les sites SharePoint qui
      // manquent, faute de la permission « Sites.ReadWrite.All ». Un annuaire
      // qui la REFUSE n'arrive jamais ici — Entra lui refuse la liaison entière
      // (cf. lib/connections/providers.js). Seules les connexions nouées avant
      // son ajout voient ce message.
      pickerSharedSitesMissing:
        'Vos bibliothèques SharePoint n’apparaissent pas ici : votre compte a été relié avant que myBrief ne demande la permission « Sites.ReadWrite.All ». Reconnectez-le depuis « Réglages → Comptes connectés » pour les voir. Votre OneDrive et le dépôt fonctionnent normalement.',
      pickerMore: 'Afficher plus',
      browseErrors: {
        browse_scope_missing:
          'Votre compte a été relié avant l’arrivée de cette fenêtre : reconnectez-le pour parcourir vos dossiers. Le dépôt, lui, fonctionne toujours.',
        storage_not_connected: 'Reliez votre compte pour parcourir vos dossiers.',
        storage_scope_missing: 'Reconnectez votre compte pour autoriser le dépôt.',
        storage_not_configured: 'Aucun fournisseur de stockage configuré par votre administrateur.',
        storage_auth_revoked: 'L’accès a été retiré. Reconnectez votre compte.',
        folder_name_invalid: 'Un nom de dossier ne peut pas contenir « / ».',
        browse_failed: 'Impossible de lire vos dossiers pour l’instant.',
      },

      approvalTitle: 'Déposer ce document ?',
      approvalFolder: 'Dossier',
      approvalDefaultFolder: 'Dossier par défaut',
      approvalTag: 'Tag',
      approvalAccount: 'Compte',
      approvalFile: 'Fichier',
      approvalCancel: 'Annuler',
      approvalConfirm: 'Déposer',

      subjectLabel: 'Objet du mail',
      subjectPlaceholder: 'Ex : CR {{titre}} — {{date}}',
      filenameLabel: 'Nom du fichier',
      filenamePlaceholder: 'Ex : {{date}}-{{titre}}',
      templateHint:
        'L’extension est ajoutée automatiquement. Laissé vide, myBrief nomme comme d’habitude.',
      variablesLabel: 'Insérer :',
      previewLabel: 'Aperçu :',
      templateUnknown: 'Variables inconnues : {list}',
      sampleTitle: 'Point client',
      sampleDate: '2026-08-09',
      sampleType: 'Résumé',
      sampleAccount: 'vous@exemple.fr',

      testEmail: 'Tester l’envoi',
      testStorage: 'Tester le dépôt',
      testRunning: 'Test en cours…',

      save: 'Enregistrer',
      saving: 'Enregistrement…',
      saved: 'Enregistré',
      loadError: 'Impossible de charger vos réglages.',
      saveError: 'Enregistrement impossible. Réessayez dans quelques instants.',

      // ── Compte relié (bandeau de tête) ───────────────────────────────────
      connectTitle: 'Compte {provider}',
      connectedHint: 'Vos envois partent de {account}, et vos dépôts y atterrissent.',
      // `{drive}` : « Google Drive » ou « OneDrive » selon le fournisseur retenu
      // (cf. utils/storageVocabulary.js).
      notConnectedHint:
        'Reliez votre compte pour envoyer depuis votre propre boîte et déposer dans votre {drive}.',
      connectCta: 'Relier mon compte {provider}',
      reconnectCta: 'Reconnecter mon compte',
      reconnectWhy:
        'Votre compte est relié mais n’autorise pas le dépôt de fichiers : il a été relié avant que cet accès existe. Reconnectez-le pour l’accorder.',
      connectDesktopOnly:
        'La connexion d’un compte se fait depuis le navigateur. Ouvrez myBrief sur votre ordinateur.',
      connectUnavailable:
        'Aucun compte {provider} n’est configuré sur cette installation. Contactez votre administrateur.',
      connectSmtpFallback:
        'Sans compte relié, vos envois partent du relais du serveur — et vous en êtes alors le seul destinataire.',
      connectedBadge: 'Connecté',
      notConnectedBadge: 'Non connecté',
      driveMissingBadge: 'Dépôt non autorisé',

      // ── Cartes par action ────────────────────────────────────────────────
      mailCardTitle: 'Envoyer par mail',
      mailCardHint: 'À qui partent vos comptes rendus, et sous quel objet.',
      mailViaAccount: 'via votre compte',
      mailViaServer: 'via le relais du serveur',
      storageCardTitle: 'Entreposer',
      storageCardHint: 'Où vos documents se déposent dans votre {drive}.',
      filenameCardTitle: 'Nom des fichiers',
      filenameCardHint:
        'Vaut pour les documents envoyés, déposés et téléchargés. Cliquez sur une variable pour l’insérer.',
      ceilingClosedTitle: 'Aucune action à configurer',
      // Chaque action a désormais son écran : le message ne parle que de la
      // sienne, dire « ni l'un ni l'autre » sur une page qui n'en montre qu'un
      // laisserait croire que l'autre est fermé aussi.
      mailClosedBody:
        'Votre administrateur n’a pas activé l’envoi par mail. Le nom des fichiers reste réglable ci-dessous.',
      storageClosedBody:
        'Votre administrateur n’a pas activé le dépôt de documents. Le nom des fichiers reste réglable ci-dessous.',

      // ── Enregistrement ───────────────────────────────────────────────────
      unsavedHint: 'Modifications non enregistrées',
      discardChanges: 'Annuler',
      // Un libellé par cible : deux boutons « Enregistrer et tester » côte à côte
      // ne diraient pas lequel envoie un mail et lequel dépose un fichier.
      saveAndTestEmail: 'Enregistrer et tester l’envoi',
      saveAndTestStorage: 'Enregistrer et tester le dépôt',

      // ── Diagnostic de test ───────────────────────────────────────────────
      testStale:
        'Ce résultat est antérieur à vos modifications. Enregistrez, puis relancez le test.',
      testVia: 'Transport',
      testFrom: 'Expéditeur',
      testTo: 'Destinataires',
      testSubject: 'Objet',
      testProvider: 'Fournisseur',
      testFolder: 'Dossier',
      testFilename: 'Fichier',
      testCacheUsed: 'Dossier retrouvé sans nouvelle recherche',
      sourceUser: 'vos réglages',
      sourceAdmin: 'réglage de l’organisation',
      sourceBuiltin: 'valeur intégrée',
      sourceAccount: 'votre compte',
      sourceDefault: 'dossier par défaut',
      sourceTag: 'réglage du tag',

      // ── Slugs d'erreur du serveur ────────────────────────────────────────
      // Chaque message dit le GESTE : « reconnectez » et « contactez votre
      // administrateur » ne se règlent pas au même endroit, et un message
      // unique obligerait à ouvrir les journaux pour savoir lequel s'applique.
      errors: {
        action_disabled: 'cette action est désactivée par votre administrateur.',
        mailer_disabled:
          'aucun moyen d’envoi n’est disponible. Reliez votre compte, ou contactez votre administrateur.',
        mail_send_failed: 'l’envoi a été refusé. Réessayez dans quelques instants.',
        gmail_disconnected:
          'votre compte n’autorise plus l’envoi. Reconnectez-le depuis le bandeau ci-dessus.',
        storage_not_configured:
          'aucun fournisseur de dépôt n’est choisi. Contactez votre administrateur.',
        storage_not_connected:
          'votre compte n’est pas relié. Reliez-le depuis le bandeau ci-dessus.',
        storage_scope_missing:
          'votre compte n’autorise pas le dépôt de fichiers. Reconnectez-le depuis le bandeau ci-dessus.',
        storage_auth_revoked:
          'l’accès à votre espace de dépôt a été retiré. Reconnectez votre compte depuis le bandeau ci-dessus.',
        storage_upload_failed: 'le dépôt a été refusé. Réessayez dans quelques instants.',
        attachment_too_large: 'le document est trop volumineux pour être joint.',
        bad_origin: 'requête refusée. Rechargez la page et réessayez.',
        forbidden: 'vous n’avez pas accès à cette action.',
        invalid_body: 'réglages refusés par le serveur.',
        network: 'le serveur est injoignable. Vérifiez votre connexion.',
        unknown: 'erreur inattendue.',
      },
    },
    // « Mon profil » (settings/ProfileSection.svelte) : la page d'accueil des
    // réglages — ce que portait le menu déroulant du nom. Le groupe et le mot
    // de passe gardent leurs libellés de `account`.
    profile: {
      intro: 'Votre identité dans myBrief, et votre langue.',
      identityTitle: 'Identité',
      nameLabel: 'Nom',
      emailLabel: 'Adresse e-mail',
      languageTitle: 'Langue',
      languageHint:
        "Celle de l'interface, et aussi de la transcription, des actions détectées et du compte rendu.",
      securityTitle: 'Mot de passe',
      securityHint: 'Votre compte se connecte par mot de passe : changez-le ici.',
    },
    config: {
      title: 'Réglages',
      audioSection: 'Microphone',
      audioIntro:
        "Le micro choisi ici ne vaut que pour cet appareil : un identifiant de périphérique n'a pas de sens d'une machine à l'autre.",
      audioLabel: "Canal d'entrée sonore.",
      audioDeviceLabel: 'Périphérique',
      audioDeviceHint:
        "Le choix est enregistré immédiatement. Si le micro est indisponible au moment d'enregistrer, celui du système prend le relais.",
      audioDefault: 'Microphone par défaut du système',
      audioPermissionHint: "Autorisez l'accès au micro pour voir le nom des périphériques.",
      audioPermissionBtn: 'Autoriser le microphone',
      audioNoDevice: 'Aucun microphone détecté.',
      // « Son de l'ordinateur » : Firefox et Safari seulement, dont le partage
      // d'écran est muet (lib/audio/systemAudio.js). Chrome et Edge partagent
      // le son eux-mêmes, la carte n'y apparaît pas.
      systemAudioSection: "Son de l'ordinateur",
      systemAudioLabel: 'Second canal : la visio, une vidéo, une application',
      systemAudioIntro:
        "Firefox et Safari ne partagent pas le son de l'écran : sans réglage, myBrief n'y enregistre que votre micro. Pour enregistrer aussi vos interlocuteurs en visio ou le son d'une application, installez un périphérique audio virtuel (BlackHole sur Mac, VB-CABLE ou « Mixage stéréo » sur Windows), puis choisissez-le ici.",
      systemAudioDeviceLabel: 'Périphérique',
      systemAudioNone: 'Aucun : micro seul',
      systemAudioHint:
        "Il s'ouvre en plus du micro quand vous démarrez une « Réunion avec visio ». Le choix est enregistré pour cet appareil.",
      systemAudioMissing:
        '« {device} » est introuvable sur cet ordinateur : rebranchez-le, réinstallez-le, ou choisissez-en un autre.',
      systemAudioIsMic:
        "Ce périphérique est aussi votre micro : myBrief ne l'ouvrira pas une seconde fois. Choisissez-en un autre ici, ou un autre micro au-dessus.",
      systemAudioTest: 'Tester le son',
      systemAudioTesting: 'Écoute en cours…',
      systemAudioTestHint:
        "Lancez une vidéo ou une musique sur l'ordinateur : la jauge doit bouger.",
      systemAudioHeard: 'Son reçu : myBrief entendra la visio et les applications.',
      systemAudioSilent:
        "Aucun son reçu. Vérifiez que l'ordinateur jouait un son, et que sa sortie audio passe bien par ce périphérique.",
      systemAudioFailed:
        "Ce périphérique n'a pas pu être ouvert. Autorisez l'accès au micro, ou choisissez-en un autre.",
      // « Mon contexte » et non « Réglages » : le panneau porte déjà
      // ce nom — une section homonyme juste sous le titre disait deux choses
      // avec les mêmes mots.
      contextSection: 'Mon contexte',
      detectionSection: "Détection d'actions",
      correctionsSection: 'Mots remplacés',
      contextHint: 'Envoyé avant chaque génération de compte-rendu.',
      contextIntro:
        'Ce texte est envoyé avant chaque génération de compte-rendu pour donner votre contexte (travail, entreprise, poste, informations utiles…).',
      contextPlaceholder:
        'Ex : Je suis Responsable Commercial chez Acme. Mes réunions portent souvent sur des opportunités B2B. Mon manager est…',
      // Colonne de gauche (config/configSections.js). « Mon compte » : ce qu'on
      // règle sur soi, sous les noms que ces pages portent dans MIA.
      // `audioNav` et non `audioSection` : ce dernier titre la carte du micro.
      groupAccount: 'Mon compte',
      profileSection: 'Mon profil',
      aiSection: 'Préférences IA',
      aiHelpSection: 'Aide IA',
      audioNav: 'Micro et son',
      // « Mes réunions » : ce qui joue pendant, puis ce qu'elle devient après.
      // « Après la réunion » s'appelait « Actions », comme la « Détection
      // d'actions » qui n'a rien à voir.
      groupMeetings: 'Mes réunions',
      meetingSection: 'Pendant la réunion',
      actionsSection: 'Après la réunion',
      // Sous « Mon contexte » : ce que l'IA fait EN réunion se règle ailleurs.
      aiElsewhere:
        'La détection d’actions et les mots remplacés se règlent avec ce qui joue en réunion.',
      aiElsewhereLink: 'Ouvrir « Pendant la réunion »',
      usageSection: 'Usage & crédits',
      // Onglets de la page « Actions » : une action = un onglet.
      actionMailSection: "Envoi d'email",
      actionStorageSection: 'Entreposer',
      groupLibrary: 'Ma bibliothèque',
      // Pied de colonne : « Importer un audio » et « Extension Chrome », une page.
      toolsSection: 'Outils',
      importSection: 'Importer un audio',
      importIntro:
        'Transformez un enregistrement existant en compte rendu : choisissez un fichier audio, MyBrief le transcrit puis le résume comme une réunion.',
      importCta: 'Choisir un fichier audio',
      importFormats:
        'Tous les formats audio courants (mp3, m4a, wav, webm…). Le traitement démarre dès le fichier choisi.',
      // Extension Chrome (extension/) : la page explique, installe et lie.
      // Les étapes sont des tableaux : HelpSteps les numérote.
      extensionSection: 'Extension Chrome',
      extIntro:
        "Une icône dans la barre de Chrome : un clic ouvre MyBrief, un autre démarre une réunion — d'où que vous soyez sur le web. Rien ne change dans MyBrief lui-même.",
      extStateInstalled: 'Extension installée et liée à ce site',
      extStateVersion: 'version {version}',
      extStateOutdated: 'Une nouvelle version de l’extension est disponible',
      extStateOutdatedHint:
        'Version {version} installée, {latest} disponible. Chargée depuis un dossier, l’extension ne se met pas à jour seule.',
      extUpdateZip: 'Télécharger la nouvelle version (.zip)',
      extUpdateHint:
        'Décompressez-la dans le dossier « mybrief-extension » déjà installé, en remplaçant ses fichiers — son emplacement figure sur la carte MyBrief de chrome://extensions. Cliquez ensuite ↻ sur cette carte. Décompressée ailleurs, elle deviendrait une seconde extension, à lier de nouveau.',
      extStateMissing: 'Extension non détectée dans ce navigateur',
      extStateMissingHint:
        "Suivez les étapes ci-dessous. Une fois l'extension liée, cette ligne passe au vert d'elle-même.",
      extBrowserNote:
        "L'extension existe pour Chrome et les navigateurs qui en dérivent (Edge, Brave…). Sur Firefox ou Safari, MyBrief s'ouvre comme d'habitude, sans extension.",
      extFigure: {
        alt: 'Le menu de l’extension : logo, état, bouton Nouvelle réunion, bouton Ouvrir MyBrief.',
        status: 'Connecté',
        primary: 'Nouvelle réunion',
        secondary: 'Ouvrir MyBrief',
        links: ['Historique', 'Réglages'],
      },
      extInstallTitle: '1. Installer',
      extInstallStore: 'Ajouter à Chrome',
      extInstallStoreHint:
        "S'ouvre dans le Chrome Web Store. Cliquez « Ajouter à Chrome », confirmez, puis épinglez l'icône : pièce de puzzle à droite de la barre d'adresse, punaise à côté de MyBrief.",
      extInstallZip: "Télécharger l'extension (.zip)",
      extInstallZipHint:
        'Pas encore sur le Chrome Web Store : Chrome la charge depuis un dossier, en quatre étapes.',
      extInstallZipSteps: [
        {
          label: 'Téléchargez le fichier et décompressez-le',
          hint: 'Un dossier « mybrief-extension » apparaît. Gardez-le : Chrome lit l’extension dedans, la supprimer la désinstalle.',
        },
        {
          label: 'Ouvrez chrome://extensions',
          hint: 'Collez cette adresse dans la barre de Chrome. En haut à droite, activez « Mode développeur ».',
        },
        {
          label: 'Cliquez « Charger l’extension non empaquetée »',
          hint: 'Choisissez le dossier « mybrief-extension », celui qui contient le fichier manifest.json. L’icône MyBrief apparaît dans la barre.',
        },
        {
          label: 'Épinglez l’icône',
          hint: 'Pièce de puzzle à droite de la barre d’adresse, puis la punaise à côté de MyBrief.',
        },
      ],
      extLinkTitle: '2. Lier à ce site',
      extLinkIntro:
        "L'extension doit savoir où est votre MyBrief. Elle le lit dans l'onglet ouvert : rien à saisir.",
      extLinkSteps: [
        { label: 'Restez sur cet onglet' },
        { label: "Cliquez l'icône MyBrief dans la barre de Chrome" },
        {
          label: 'Cliquez « Utiliser ce site comme mon MyBrief »',
          hint: 'Chrome demande l’autorisation d’accéder à ce site : acceptez. C’est ce qui permet à l’extension de retrouver votre onglet au lieu d’en ouvrir un second.',
        },
      ],
      extUseTitle: '3. Utiliser',
      extUseItems: [
        {
          label: 'Nouvelle réunion',
          desc: "Ouvre MyBrief et démarre l'enregistrement — ou revient sur l'onglet déjà ouvert. Une réunion en cours n'est jamais interrompue.",
        },
        { label: 'Ouvrir MyBrief', desc: 'Retrouve votre onglet, ou en ouvre un.' },
        {
          label: 'Raccourci clavier',
          desc: 'Alt + Maj + M (Option + Maj + M sur Mac) démarre une réunion sans ouvrir le menu. Modifiable dans chrome://extensions/shortcuts.',
        },
        {
          label: 'Badge REC',
          desc: "Pendant une réunion, l'icône porte « REC » et le menu affiche la durée. Le bouton devient « Revenir à la réunion ».",
        },
        {
          label: 'Rappel visio',
          desc: "Dans le menu, cochez « Me rappeler quand une visio est ouverte » : un point bleu apparaît sur l'icône dès qu'un onglet Meet, Teams, Zoom ou Webex est ouvert sans réunion MyBrief. Chrome demande alors l'autorisation de lire l'adresse des onglets de ces seuls sites.",
        },
      ],
      extAdminNote:
        "Pour toute l'entreprise : votre service informatique peut installer l'extension sur chaque poste par stratégie Chrome (ExtensionInstallForcelist), sans geste des utilisateurs.",
      // Libellé de l'entrée de menu uniquement (cf. SettingsPanel) : la section
      // relie un compte externe — l'envoi de mail n'est qu'un de ses usages, le
      // dépôt Drive en est un autre.
      mailSection: 'Comptes connectés',
      mailIntro:
        'Choisissez le compte qui envoie vos documents quand vous cliquez sur « Envoyer par mail ».',
      // `{provider}` est remplacé par le nom du fournisseur retenu par
      // l'installation (Google ou Microsoft) — cf. SettingsPanel.svelte.
      mailGoogleTitle: 'Compte {provider}',
      mailGoogleHint:
        'Autorisez myBrief à envoyer des emails depuis votre adresse et à déposer vos documents — jamais de lecture de votre boîte.',
      mailConnected: 'Connecté',
      mailNotConnected: 'Non connecté',
      mailAccountLabel: 'Compte autorisé',
      mailConnect: 'Connecter mon compte {provider}',
      mailConnectDesktopOnly:
        "La connexion d'un compte se fait depuis un navigateur. Ouvrez myBrief sur ordinateur pour l'autoriser : le compte restera connecté ici.",
      mailDisconnect: 'Déconnecter',
      mailDisconnecting: 'Déconnexion…',
      mailSmtpNote: 'Sans compte connecté, vos envois partent du serveur myBrief.',
      mailSmtpNone:
        "Aucun relais mail n'est configuré sur ce serveur : connectez un compte {provider} pour activer « Envoyer par mail ».",
      mailGoogleUnavailable:
        "La connexion {provider} n'est pas configurée sur ce serveur. Rapprochez-vous de votre administrateur.",
      mailErrors: {
        connect_cancelled: "Autorisation annulée : le compte n'a pas été connecté.",
        connect_failed: 'La connexion a échoué. Réessayez.',
        connect_state_mismatch:
          'La vérification de sécurité a échoué. Réessayez depuis cette page.',
        connect_session_mismatch:
          "Le flux a été terminé par un autre compte que celui qui l'a démarré.",
        connect_no_refresh_token:
          "Le fournisseur n'a pas accordé d'autorisation durable. Réessayez : retirez d'abord myBrief des accès de votre compte si l'erreur persiste.",
        connect_not_configured: "La connexion n'est pas configurée sur ce serveur.",
        too_many_attempts: 'Trop de tentatives. Réessayez dans quelques minutes.',
      },
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      saved: 'Enregistré',
      error: "Erreur lors de l'enregistrement",
      close: 'Fermer',
    },
    // Recherche dans les réglages (components/SettingsSearch.svelte), en tête
    // de la colonne de « Réglages » et de l'administration. `keywords` : les
    // mots qu'on tape sans qu'ils soient à l'écran, séparés par des virgules,
    // sous la clé de l'entrée du catalogue (config/settingsSearch.js).
    settingsSearch: {
      placeholder: 'Rechercher un réglage…',
      label: 'Rechercher dans les réglages',
      open: 'Rechercher un réglage',
      shortcut: 'Raccourci : {keys}',
      clear: 'Effacer la recherche',
      results: 'Réglages trouvés',
      countOne: '1 réglage trouvé',
      countMany: '{n} réglages trouvés',
      empty: 'Aucun réglage ne correspond à « {query} ».',
      emptyHint: 'Essayez un autre mot, par exemple « micro », « langue » ou « dossier ».',
      keywords: {
        'config.profile': 'compte, identité, nom, adresse, email, avatar, groupe',
        'config.profile.identity': 'nom, prénom, adresse, email, avatar, groupe, équipe',
        'config.profile.language': 'langue, language, anglais, english, français, traduction',
        'config.profile.password': 'mot de passe, password, mdp, sécurité, identifiants',
        'config.ai': 'intelligence artificielle, ia, assistant, consigne, prompt',
        'config.ai.context':
          'contexte, métier, poste, fonction, entreprise, présentation, consigne, prompt',
        'config.meeting.detection': 'actions, tâches, todo, à faire, engagements, repérer',
        'config.meeting.detection.state': 'activer, désactiver, couper, détection en direct',
        'config.meeting.detection.what': 'sensibilité, mots-clés, déclencheurs, stricte, large',
        'config.meeting.detection.pace': 'fréquence, rythme, vitesse, intervalle, profondeur, coût',
        'config.meeting.detection.test': 'essai, tester, banc, extrait, simulation',
        'config.meeting.corrections':
          'corrections, remplacer, remplacement, orthographe, mots mal transcrits, noms propres, dictionnaire',
        'config.meeting.corrections.learn': 'notes, apprendre, retenir, mémoriser, automatique',
        'config.meeting.corrections.list': 'liste, graphie, écriture, nom écorché, sigle, corriger',
        'config.ai.aiHelp':
          'assistant en réunion, orbe, sonnette, sons, voix, démarrage, par défaut',
        'config.meeting':
          'en réunion, pendant la réunion, en direct, enregistrement, transcription, live',
        'config.meeting.aiHelp':
          'assistant en réunion, orbe, sonnette, sons, voix, démarrage, par défaut',
        'config.meeting.aiHelp.start': 'allumer, éteindre, démarrage, domaines, par défaut',
        'config.meeting.aiHelp.sounds':
          'son, sonnette, cloche, bip, notifications, muet, couper le son, silence, minuteur, décompte, mélodie',
        'config.meeting.aiHelp.voice':
          'voix, lire à voix haute, synthèse vocale, parler, lecture, tts, openai, mistral',
        'config.meeting.audio': 'audio, son, micro, microphone, casque, entrée audio, périphérique',
        'config.meeting.audio.mic': 'micro, microphone, casque, entrée, périphérique, headset',
        'config.meeting.audio.system':
          'visio, son de l’ordinateur, haut-parleur, blackhole, vb-cable, mixage stéréo, firefox, safari, teams, zoom, meet',
        'config.actions': 'actions, après réunion, envoi, partage, export, compte rendu',
        'config.actions.mail': 'mail, email, e-mail, courriel, envoi, destinataires, objet',
        'config.actions.mail.send': 'mail, email, courriel, destinataires, objet, copie',
        'config.actions.mail.tagRecipients': 'tags, destinataires par tag, liste de diffusion',
        'config.actions.mail.filename':
          'nom de fichier, nommage, renommer, pièce jointe, pdf, docx, téléchargement',
        'config.actions.mail.afterSummary':
          'fenêtre, et maintenant, proposition, popup, après le résumé',
        'config.actions.storage':
          'dépôt, déposer, drive, onedrive, sharepoint, dossier, classer, sauvegarder, archiver',
        'config.actions.storage.folder':
          'dossier, drive, onedrive, sharepoint, bibliothèque, confirmation, sous-dossier',
        'config.actions.storage.tagFolders': 'dossier par tag, tags, sous-dossier, rangement',
        'config.actions.mybrain': 'mybrain, cerveau, base de connaissances, équipe',
        'config.actions.mybrain.send': 'mybrain, cerveau, partager, envoyer mes réunions',
        'config.actions.mybrain.recent': 'mybrain, historique des envois, échec, réessayer',
        'config.mail':
          'google, microsoft, gmail, outlook, office 365, compte relié, connexion, autorisation, oauth',
        'config.usage': 'statistiques, stats, consommation, quota, crédit, minutes, temps restant',
        'config.templates': 'modèles, format, gabarit, compte rendu, résumé, structure',
        'config.tags': 'étiquettes, classeurs, catégories, couleurs, ranger, clients, projets',
        'config.tools': 'outils, utilitaires, importer, extension',
        'config.tools.import':
          'fichier audio, mp3, m4a, wav, téléverser, upload, enregistrement existant, dictaphone',
        'config.tools.extension': 'chrome, navigateur, extension, raccourci clavier, edge, brave',
        'config.help': 'aide, documentation, guide, mode d’emploi, tutoriel, faq',
        'config.feedback': 'bug, problème, idée, suggestion, signaler, retour, support',
        'admin.dashboard': 'accueil, tableau de bord, diagnostic, alertes, activité',
        'admin.users':
          'utilisateurs, comptes, personnes, rôle, administrateur, créer un compte, désactiver, supprimer, réinitialiser le mot de passe',
        'admin.groups':
          'groupes, équipes, membres, quota, minutes par mois, droits, infographies, aide ia',
        'admin.ai': 'clés api, api key, token, fournisseurs, openai, mistral, speechmatics',
        'admin.ai.openai': 'clé api, api key, gpt, chatgpt',
        'admin.ai-models': 'modèles, llm, gpt, transcription, rédaction, résumé, prix, coût',
        'admin.ai-models.summary': 'modèle de résumé, compte rendu, rédaction, gpt, llm',
        'admin.ai-models.transcription':
          'modèle de transcription, reconnaissance vocale, speech to text, temps réel',
        'admin.ai-models.infographic': 'image, dessin, visuel, illustration, style graphique',
        'admin.templates':
          'modèles, gabarits, formats de compte rendu, templates par défaut, organisation',
        'admin.actions': 'boutons, envoi, dépôt, téléchargement, après réunion, smtp, relais',
        'admin.actions.email': 'mail, smtp, relais, destinataires maximum, objet, tiers',
        'admin.actions.storage': 'drive, onedrive, sharepoint, dossier cible, dépôt',
        'admin.actions.download': 'télécharger, pdf, docx, fichier',
        'admin.actions.account':
          'google, microsoft, gmail, outlook, sharepoint, fournisseur, compte relié',
        'admin.actions.naming': 'nom de fichier, nommage, format',
        'admin.aihelp': 'assistant, réunion, mot d’appel, domaines, interventions',
        'admin.aihelp.access': 'groupes, droits, accès, qui',
        'admin.aihelp.wake': 'prénom, nom, mot d’appel, déclencheur, wake word',
        'admin.aihelp.pace': 'interventions, spontané, signalements, fréquence',
        'admin.mybrain': 'mybrain, cerveau, base de connaissances, clé, connexion',
        'admin.mybrain.connection': 'adresse, url, clé api, tester la connexion',
        'admin.mybrain.policy': 'envoi des réunions, obligatoire, imposé, facultatif',
        'admin.credits': 'crédit, quota, minutes, temps, épuisé, par compte',
        'admin.stats':
          'statistiques, consommation, coûts, dépenses, budget, rapport pdf, export, tarifs, usage',
        'admin.company': 'entreprise, vocabulaire, glossaire, jargon, sigles, corrections',
        'admin.company.context':
          'vocabulaire, glossaire, jargon, sigles, acronymes, noms propres, contexte',
        'admin.company.corrections':
          'corrections, remplacer, orthographe, mots mal transcrits, dictionnaire',
        'admin.branding': 'marque, apparence, logo, couleurs, thème, charte graphique',
        'admin.branding.logo': 'logo, image, icône, marque',
        'admin.branding.tagline': 'slogan, sous-titre, phrase d’accueil, tagline',
        'admin.branding.colors': 'couleur, thème, charte, primaire, secondaire',
        'admin.auth': 'connexion, login, sso, authentification, page de connexion',
        'admin.auth.password': 'mot de passe, email, identifiants',
        'admin.auth.google': 'google, workspace, sso, oauth, client id, secret',
        'admin.auth.entra': 'microsoft, entra, azure ad, office 365, sso, oauth',
        'admin.auth.domains': 'domaines autorisés, restriction, adresses, entreprise',
      },
    },
    // Modale de bienvenue (WelcomeContent), seule lectrice de ce bloc. Courte
    // exprès : une phrase, trois gestes, un rappel pour la visio. Le mode
    // d'emploi complet est la documentation en ligne, qu'ouvre « Aide ».
    // Écran d'accueil, aucune réunion ouverte (WelcomeScreen).
    home: {
      greeting: 'Bienvenue',
      greetingNamed: 'Bienvenue {name}',
      subtitle: 'Démarrez une nouvelle réunion ou consultez votre historique.',
    },
    welcome: {
      title: 'Bienvenue sur MyBrief',
      betaTag: 'Version Beta',
      tagline: 'Parlez. MyBrief écrit le compte rendu.',
      // {start} : le libellé du bouton du dock (buttons.start).
      steps: [
        { title: 'Démarrez', text: '« {start} », en bas de l’écran' },
        { title: 'Parlez', text: 'Le texte s’écrit en direct' },
        { title: 'Résumez', text: 'Un compte rendu prêt à partager' },
      ],
      // {visio} : le bouton de « Quel type de réunion ? » (meetingType.visio).
      visio: 'En visio ? Choisissez « {visio} » au démarrage.',
      createdBy: 'Créé par',
      getStarted: 'C’est parti',
    },
    // « Quel type de réunion ? », au démarrage sur ordinateur (MeetingTypeModal).
    meetingType: {
      title: 'Quel type de réunion ?',
      // Sous le titre : dernier écran avant que l'enregistrement démarre.
      consentTitle: 'Consentement obligatoire :',
      consent: 'tous les participants doivent accepter l’enregistrement qui va démarrer.',
      inPerson: 'Réunion en présentiel',
      visio: 'Réunion avec visio',
      visioHint:
        'En visio : partagez l’onglet de la réunion — ou « Tout l’écran » pour l’application Teams ou Zoom — en cochant la case de l’audio.',
      // Firefox, Safari : pas de fenêtre de partage, le périphérique choisi
      // dans Réglages → Pendant la réunion → Micro et son s'ouvre directement.
      visioHintDevice:
        'En visio : myBrief enregistre aussi le son de l’ordinateur, par « {device} ».',
      cancel: 'Annuler',
    },
    // « Navigateur partiellement compatible » (BrowserAudioNotice) : Firefox et
    // Safari sur ordinateur, tant qu'aucun son de l'ordinateur n'y est réglé.
    browserAudioNotice: {
      title: 'Navigateur partiellement compatible',
      lead: "Firefox et Safari ne savent pas partager le son d'une visio ou d'une application : ici, myBrief n'enregistre que votre micro.",
      detail:
        'Pour enregistrer aussi vos interlocuteurs, ouvrez myBrief dans Google Chrome ou Microsoft Edge, ou installez un périphérique audio virtuel et choisissez-le dans Réglages → Pendant la réunion → Micro et son.',
      note: 'Le micro fonctionne normalement.',
      configure: "Régler le son de l'ordinateur",
      ack: "J'ai compris",
    },
    history: {
      title: 'Historique',
      loading: "Chargement de l'historique...",
      empty: 'Aucun élément historique disponible.',
      invalidFormat: "Format de données inattendu pour l'historique.",
      retry: 'Réessayer',
      close: 'Fermer',
      selection: 'Sélection',
      itemLabel: 'Élément',
      sessionExpired: 'Session expirée. Veuillez vous reconnecter.',
      genericError: "Erreur lors du chargement de l'historique.",
    },
    resumeLoading: 'Résumé en cours...',
    messages: {
      summaryError: "Une erreur s'est produite.",
      summaryErrorExpired: "Une erreur s'est produite. (Session expirée)",
      // Rédaction terminée alors que l'écran montre une autre réunion : la nommer.
      summaryReadyFor: 'Le résumé de « {title} » est prêt',
      summaryFailedFor: 'Le résumé de « {title} » n’a pas pu être rédigé',
      aiServiceError:
        'Le service de transcription IA est momentanément indisponible. Réessayez dans quelques instants ou contactez le support si le problème persiste.',
      aiNetworkError: 'Connexion impossible. Vérifiez votre connexion internet puis réessayez.',
      aiCreditExhausted:
        "Le crédit du service d'IA{provider} est épuisé. La génération est suspendue le temps de recharger le compte — contactez votre administrateur pour rétablir le service.",
      actionStored: 'Document déposé dans « {folder} ».',
      actionStoredIn: 'Document déposé dans « {folder} » ({library}).',
      actionEmailSent: 'Document envoyé à {email}.',
      actionEmailSentNoFile:
        "Document envoyé à {email}, mais le fichier joint n'a pas pu être généré. Le contenu est dans le corps du message.",
      actionEmailTooLarge:
        'Le document est trop volumineux pour être envoyé en pièce jointe. Téléchargez-le puis envoyez-le manuellement.',
      actionEmailError: "L'envoi par mail a échoué. Réessayez dans quelques instants.",
      actionStorageNotConnected:
        "Le dépôt vers {provider} n'est pas configuré. Connectez votre compte dans « Réglages → Comptes connectés », ou contactez votre administrateur.",
      actionStorageReconnect:
        "Votre compte n'autorise pas (ou plus) le dépôt de fichiers. Reconnectez-le dans « Réglages → Comptes connectés » pour accorder cet accès.",
      actionStorageError: 'Le dépôt a échoué. Réessayez dans quelques instants.',
      actionEmailDropped:
        "Document envoyé à vous seul : ce serveur n'est pas autorisé à écrire à des destinataires externes. Reliez votre compte dans « Réglages → Comptes connectés » pour que vos envois partent de votre boîte.",
      actionTestEmailOk: 'Mail de test envoyé à {recipients} (via {via}).',
      actionTestStorageOk: 'Fichier de test « {filename} » déposé dans « {folder} ».',
      actionTestTooMany: 'Trop de tests en peu de temps. Réessayez dans quelques minutes.',
      actionTestTooManyMinutes: 'Trop de tests en peu de temps. Réessayez dans {minutes} min.',
      actionTestTooManySeconds: 'Trop de tests en peu de temps. Réessayez dans {seconds} s.',
      actionTestError: 'Le test a échoué : {reason}',
      meetingSaved: 'Réunion enregistrée dans l’historique.',
    },
    // Actions post-réunion sur téléphone (components/PostActions.svelte) : un
    // bouton nommé et sa feuille, là où l'ordinateur montre trois icônes.
    // Barre des documents d'une réunion terminée (components/DocumentBar.svelte) :
    // sélecteur Transcription / Résumé n, et le bouton « Résumer » / « Nouveau résumé ».
    documentBar: {
      tabsLabel: 'Documents de la réunion',
      transcription: 'Transcription',
      summaryTab: 'Résumé {n}',
      summaryPending: 'Résumé {n} — génération en cours…',
      deleteSummary: 'Supprimer Résumé {n}',
      summarize: 'Résumer',
      summarizeHint: 'Générer le compte rendu de cette réunion',
      newSummary: 'Nouveau résumé',
      newSummaryHint: 'Générer une nouvelle version du résumé',
      closePicker: 'Refermer le choix du template',
    },
    postActions: {
      share: 'Partager',
      titleSummary: 'Partager le résumé',
      titleTranscription: 'Partager la transcription',
      email: 'Envoyer par mail',
      emailTag: 'Envoyer via le tag',
      emailUserHint: 'Vos destinataires habituels',
      emailSelfHint: 'À vous seul — aucun destinataire enregistré',
      recipientOne: '1 destinataire',
      recipientsMany: '{count} destinataires',
      storage: 'Entreposer dans {provider}',
      storageTag: 'Entreposer via le tag',
      storageUserHint: 'Votre dossier de dépôt',
      // Brouillon ouvert dans la messagerie du téléphone (utils/mailDraft.js).
      compose: 'Rédiger dans ma messagerie',
      composeHintPrefilled: 'Destinataires pré-remplis : relisez, ajoutez-en si besoin',
      composeHint: 'Le mail s’ouvre prêt à relire : ajoutez les destinataires',
      // Objets intégrés de l'envoi automatique (services/api/lib/mailer.js),
      // quand aucun gabarit d'objet ne s'applique (utils/mailDraft.js).
      subjectSummary: 'Résumé — {title}',
      subjectSummaryUntitled: 'Résumé de votre réunion myBrief',
      subjectTranscription: 'Transcription — {title}',
      subjectTranscriptionUntitled: 'Transcription de votre réunion myBrief',
      bodyTruncated:
        '[… texte coupé : trop long pour un mail. Le document complet se télécharge depuis MyBrief.]',
      composeTruncated:
        'Trop long pour un mail : le texte a été coupé. Pour l’envoyer en entier, utilisez l’envoi par mail ou le téléchargement.',
      downloadSummary: 'Télécharger le PDF',
      downloadTranscription: 'Télécharger la transcription',
      busyEmail: 'Envoi…',
      busyStorage: 'Dépôt…',
      busyDownload: 'Préparation…',
    },
    // Fenêtre « Et maintenant ? » qui suit le PREMIER résumé d'une réunion
    // (components/AfterSummaryDialog.svelte) : tag, mail, dépôt, en un geste.
    afterSummary: {
      title: 'Votre résumé est prêt',
      subtitle: 'Rangez-le et partagez-le en un geste.',
      close: 'Fermer',
      tagTitle: 'Ranger la réunion',
      tagPrompt: 'Son tag choisit les destinataires et le dossier.',
      tagCurrent: 'Rangée dans',
      tagChange: 'Changer',
      tagKeep: 'Garder',
      tagNew: 'Nouveau tag',
      tagNewPlaceholder: 'Nom du tag',
      tagCreate: 'Créer',
      tagCancel: 'Annuler',
      tagNoneYet: 'Aucun tag pour l’instant : créez le premier.',
      emailTitle: 'Envoyer par mail',
      emailTagHint: 'Destinataires du tag {tag}',
      emailUserHint: 'Vos destinataires habituels',
      emailSelfHint: 'À vous seul pour l’instant',
      emailCopy: 'Vous êtes en copie.',
      recipientPlaceholder: 'Ajouter une adresse',
      recipientAdd: 'Ajouter',
      recipientRemove: 'Retirer {address}',
      recipientSavedTag: 'Les adresses ajoutées rejoignent les destinataires du tag {tag}.',
      recipientSavedUser:
        'Les adresses ajoutées rejoignent votre liste par défaut : elles recevront aussi vos prochains comptes rendus sans tag.',
      recipientsFull: '{max} destinataires au maximum.',
      storageTitle: 'Entreposer dans {provider}',
      storageTagFolder: 'Dossier du tag {tag}',
      storageTagSubfolder: 'Sous-dossier « {tag} » de votre dossier de dépôt',
      storageUserFolder: 'Votre dossier de dépôt',
      storageDefaultFolder: 'Le dossier par défaut de votre organisation',
      storageApproval: 'Vous relirez la destination avant le dépôt.',
      selected: 'Choisi',
      dontOffer: 'Ne plus me proposer',
      later: 'Plus tard',
      pickOne: 'Choisissez une action',
      verbTag: 'ranger',
      verbEmail: 'envoyer',
      verbStorage: 'entreposer',
      and: 'et',
      stepEmail: 'envoi par mail',
      stepStorage: 'dépôt dans {provider}',
      running: 'En cours : {steps}…',
      tagApplied: 'Réunion rangée dans « {tag} ».',
      tagFailed: 'Le tag n’a pas pu être posé : rien n’est parti, réessayez depuis « Partager ».',
      offerOff: 'Cette fenêtre ne s’ouvrira plus. Réactivez-la dans Réglages → Après la réunion.',
    },
    aiNotice: {
      creditTitle: "Crédit d'IA épuisé",
      serviceTitle: 'Service IA indisponible',
      networkTitle: 'Connexion interrompue',
      dismiss: 'Fermer',
    },
    // Écran chargé à la demande (components/lazy/) dont le fichier n'arrive
    // pas : réseau coupé, ou nouvelle version mise en ligne depuis l'ouverture.
    lazyLoad: {
      failed:
        "Cet écran n'a pas pu se charger. Une nouvelle version de MyBrief est peut-être en ligne : rechargez la page.",
      failedRecording:
        "Cet écran n'a pas pu se charger. Rechargez la page à la fin de la réunion : une nouvelle version de MyBrief est peut-être en ligne.",
      reload: 'Recharger',
    },
    continueRecording: {
      title: 'Toujours en réunion ?',
      message: "Vous enregistrez depuis {duration}. Voulez-vous poursuivre l'enregistrement ?",
      countdown: 'Arrêt automatique dans {countdown}',
      continue: 'Poursuivre',
      stop: 'Arrêter et sauvegarder',
      maxDurationToast:
        "Durée maximale de 8 h atteinte : l'enregistrement a été arrêté et sauvegardé.",
    },
    disconnection: {
      title: 'Vous êtes déconnecté',
      message: 'Veuillez vous reconnecter pour continuer à utiliser MyBrief.',
      reconnect: 'Se reconnecter',
      confirm: 'Fermer',
    },
  },
  en: {
    app: {
      documentTitle: 'MyBrief - Meeting Transcription & Summary',
      languageToggleLabel: 'Change language',
      languageNames: {
        fr: 'French',
        en: 'English',
      },
    },
    orientation: {
      title: 'Rotate your device',
      message: 'MyBrief is designed for portrait mode.',
    },
    whatsNew: {
      badgeLabel: 'See what’s new (version {version})',
      title: 'What’s new?',
      subtitle: 'The latest MyBrief updates.',
      version: 'Version {version}',
      new: 'New',
      improvement: 'Improved',
      fix: 'Fixed',
      admins: 'Admin',
      empty: 'Nothing new to show yet.',
      close: 'Close',
    },
    nativeLogin: {
      title: 'Welcome to MyBrief',
      message: 'Sign in to record and summarize your meetings.',
      button: 'Sign in',
      waiting: 'Signing in in your browser…',
      cancel: 'Cancel',
      error: 'Sign-in failed. Please try again.',
    },
    signIn: {
      title: 'Welcome to MyBrief',
      subtitle: 'Sign in to record and summarize your meetings.',
      emailLabel: 'Email address',
      passwordLabel: 'Password',
      submit: 'Sign in',
      submitting: 'Signing in…',
      ssoDivider: 'or',
      ssoButton: 'Sign in with SSO',
      googleButton: 'Continue with Google',
      entraButton: 'Continue with Microsoft',
      forgot: 'Forgot your password?',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      backToSignIn: '← Back to sign in',
      forgotTitle: 'Forgot password',
      forgotMessage:
        'Enter your email address: if an account exists, you will receive a reset link.',
      forgotSubmit: 'Send the link',
      forgotSent:
        'If an account exists for that address, a link has just been sent. It is valid for 30 minutes.',
      resetTitle: 'Choose a new password',
      resetSubmit: 'Save password',
      resetDone: 'Password saved. You can now sign in.',
      errors: {
        invalid_credentials: 'Incorrect email address or password.',
        too_many_attempts: 'Too many attempts. Try again in {minutes} minute(s).',
        invalid_body: 'Check your email address and password.',
        password_login_disabled: 'Password sign-in is disabled on this server.',
        password_reset_disabled: 'Email reset is not configured on this server.',
        invalid_or_expired_token:
          'This link has expired or has already been used. Request a new one.',
        // Server-side origin check: the request did not come from this page.
        forbidden: 'Request refused. Reload the page and try again.',
        network: 'Server unreachable. Check your connection.',
        unknown: 'Something went wrong. Please try again.',
        // Google flow outcomes (slugs returned as ?error= by the callback)
        google_disabled: 'Google sign-in is not configured on this server.',
        google_cancelled: 'Google sign-in cancelled.',
        google_failed: 'Google sign-in failed. Please try again.',
        google_state_mismatch: 'Sign-in session expired. Please try again.',
        google_email_unverified: 'This Google address is not verified.',
        sso_disabled: 'SSO sign-in is not configured on this server.',
        sso_cancelled: 'Sign-in cancelled.',
        sso_failed: 'Sign-in failed. Please try again.',
        sso_state_mismatch: 'Sign-in session expired. Please try again.',
        sso_email_missing:
          'Your account does not publish a usable email address. Contact an administrator.',
        domain_not_allowed:
          'Your email domain is not allowed on this application. Contact an administrator.',
        account_disabled: 'This account is disabled. Contact an administrator.',
      },
    },
    configChecks: {
      adminTitle: 'To fix in Administration',
      configTitle: 'To fix in your settings',
      more: '+ {count} more',
      unknown: 'A setting needs attention here.',
      issues: {
        ai_key_missing:
          'No OpenAI key: meetings are recorded, but nothing is transcribed or summarized.',
        ai_key_rejected: 'OpenAI rejects the saved key: transcription and summaries are stopped.',
        ai_provider_key_missing:
          '{provider} is chosen for transcription, but its key is not saved: nothing is transcribed.',
        ai_provider_key_rejected: '{provider} rejects the saved key: transcription is stopped.',
        ai_summary_provider_key_missing:
          '{provider} is chosen for summaries, but its key is not saved: no summary is written.',
        ai_summary_provider_key_rejected:
          '{provider} rejects the saved key: summaries are stopped.',
        storage_provider_missing:
          '“Store” is offered, but no provider (Google or Microsoft) is chosen: the button does not appear.',
        mail_unavailable:
          '“Send by email” is offered, but the server has no SMTP relay and no account can be linked: the button does not appear.',
        connect_credentials_missing:
          '{provider} credentials are missing: nobody can link their account for email and storage.',
        mybrain_key_unreadable: 'The saved MyBrain key can no longer be read: paste it again.',
        mybrain_key_rejected: 'MyBrain rejects the saved key: meetings no longer reach it.',
        mybrain_right_missing: 'The MyBrain key lost the “feed” right: meetings are refused.',
        mybrain_unreachable:
          'MyBrain does not answer at the saved address: meetings no longer reach it.',
        prices_stale:
          'AI prices were checked {days} days ago: refresh them for accurate estimates.',
        branding_default: 'Logo, welcome line and colors are still the defaults.',
        company_logo_missing:
          "No company logo: infographics show the application's logo in its place.",
        org_context_empty:
          'No organization vocabulary: client names, projects and acronyms may be misspelled in summaries.',
        connection_missing:
          'Storage folders are set, but no {provider} account is linked: uploads will fail.',
        connection_scope_missing:
          'Your {provider} account does not allow storing files: reconnect it.',
        connection_revoked:
          'Your {provider} account no longer responds (access removed or expired): reconnect it.',
        storage_folder_missing:
          'The folder “{folder}” cannot be found: the next upload will recreate it there.',
        storage_drive_missing:
          'The library “{drive}” is no longer reachable: uploads there will fail.',
        tag_folder_missing:
          'Tag “{tag}”: the folder “{folder}” cannot be found, the next upload will recreate it.',
        tag_drive_missing:
          'Tag “{tag}”: the library “{drive}” is no longer reachable, uploads there will fail.',
      },
    },
    adminAuth: {
      tabLabel: 'Authentication',
      // ── "Sign-in page" card: one pill per method, its details on click ──
      loginModesTitle: 'Sign-in page',
      loginModesIntro:
        'The sign-in methods offered to your users, exactly as they appear on the sign-in page. A green dot: the method is shown. Click a pill to set up its method.',
      modesCount: '{count} of {total} shown',
      modeNames: {
        password: 'Email and password',
        google: 'Google',
        entra: 'Microsoft',
        legacy: 'Legacy SSO',
      },
      modeShown: 'Shown',
      modeHidden: 'Hidden',
      modeChanged: 'Changed',
      modeOffer: 'Offer on the sign-in page',
      modePassword: 'Email and password',
      modePasswordUsage: 'For accounts that have a myBrief password.',
      modePasswordEnvOff:
        'Disabled by the deployment configuration (PASSWORD_LOGIN_ENABLED): this method stays hidden regardless of this setting.',
      modeLegacy: 'Legacy SSO (Traefik plugin)',
      modeLegacyHint:
        'Button served by the deployment plugin, alongside native sign-in. Hide it once the native switch is complete to declutter the page.',
      modeTest: 'Test',
      modeTestInfoLabel: 'What the test does',
      modeTestHint:
        '"Test" runs the real sign-in flow in a new tab — the only test that proves the configuration end to end (secret, redirect URI, directory). Completing the flow with another account switches your session to that account.',
      noModeLeft:
        'At least one sign-in method must stay shown, otherwise nobody can sign in anymore — including you.',
      googleTitle: 'Sign in with Google',
      googleIntro:
        'Create a "Web application" OAuth client in Google Cloud Console, then paste the client ID and secret here.',
      entraTitle: 'Sign in with Microsoft Entra ID',
      entraIntro: "Enterprise SSO. Credentials come from your directory's app registration.",
      entraDiscovery: 'Directory (discovery URL)',
      entraFromEnv: 'Taken from the deployment configuration. Server-side only.',
      entraRedirectLocked:
        'This URI is ALREADY registered in your Entra app registration: the application reuses it as-is and must not change it. It also handles the return of Microsoft account connections.',
      graphPermissionsHint:
        'For your users to connect their account, the app registration must carry the Microsoft Graph delegated permissions "Mail.Send" (send the minutes) and "Files.ReadWrite" (store into OneDrive), plus "Sites.ReadWrite.All" (SharePoint libraries) as long as "Offer SharePoint libraries" stays on in Administration → Actions. myBrief requests them TOGETHER and Entra does not consent by halves: refuse a single one and no account connects. Microsoft\'s default consent setting requires administrator consent in any case.',
      entraDisabledHint: 'No Entra credentials are configured on this server.',
      entraLegacyPlugin:
        'The legacy SSO (Traefik plugin) is still active alongside on this server.',
      clientId: 'Client ID',
      clientSecret: 'Client secret',
      secretSet: '•••••••• (already saved)',
      secretEmpty: 'Paste the client secret',
      secretKeepHint: 'Leave empty to keep the current secret.',
      secretRequiredHint: 'The secret is required to enable Google sign-in.',
      entraSecretRequiredHint: 'The secret is required to enable Microsoft sign-in.',
      redirectUri: 'Authorised redirect URI',
      redirectHint:
        'Copy this exactly into "Authorised redirect URIs" of your Google Cloud client.',
      redirectUriMail: 'Redirect URI (email sending)',
      redirectMailHint:
        'Second URI of the same Google Cloud client: used by the "Send by email" flow (users\' Gmail connection). Without it, the connection fails with redirect_uri_mismatch. The Gmail API must also be enabled in the project.',
      credentialsRequired: 'Fill in the client ID and secret before enabling Google sign-in.',
      entraCredentialsRequired:
        'An Entra credential is missing — secret, client ID or directory: Microsoft sign-in cannot be enabled.',
      domainsTitle: 'Allowed domains',
      domainsNone: 'None',
      domainsOne: '1 domain',
      domainsMany: '{count} domains',
      domainsIntro:
        'A user signing in with Google or Microsoft from one of these domains automatically gets an account. Others are refused.',
      domainPlaceholder: 'example.com',
      domainAdd: 'Add',
      domainRemove: 'Remove domain',
      domainEmpty:
        'No allowed domain: nobody can create an account through Google or Microsoft. Accounts already created by an administrator keep working.',
      unsavedHint: 'Unsaved changes',
      discardChanges: 'Discard',
      saved: 'Saved',
    },
    adminAi: {
      tabLabel: 'API keys',
      modelsTabLabel: 'Models',
      providersTitle: 'AI providers',
      providersCount: '{count} of {total} connected',
      tileSummary: 'Summaries',
      tileTranscription: 'Transcription',
      tileInfographic: 'Infographic',
      tileChanged: 'Changed',
      tileKeyNeeded: 'Key required',
      filterLabel: 'Provider',
      filterAll: 'All',
      pricesInfoLabel: 'How to read prices',
      lockedModel: 'Locked: its provider’s key is missing',
      openaiUsage: 'Summaries, actions, titles, infographic and transcription',
      providerUsage: {
        mistral: 'Transcription of live speech and imported files (Voxtral), and summary writing',
        speechmatics: 'Transcription of live speech and imported files, processed in Europe',
        assemblyai: 'Transcription of live speech and imported files',
      },
      providerConsoles: {
        mistral: 'console.mistral.ai',
        speechmatics: 'portal.speechmatics.com',
        assemblyai: 'assemblyai.com/dashboard',
      },
      keyTitle: 'OpenAI API key',
      keyIntro:
        'Create a key on platform.openai.com, then paste it here: it is checked against OpenAI before being saved, and never leaves the server.',
      keyReplace: 'Replace',
      keyAdd: 'Add a key',
      statusOn: 'Configured',
      statusOff: 'Missing',
      statusRequired: 'Required',
      statusOptional: 'Optional',
      sourceSettings: 'Key saved from this screen:',
      sourceEnv: 'Key provided by the server configuration:',
      sourceNone: 'No key configured: transcription and summaries are unavailable.',
      updatedBy: 'Saved by',
      keyPlaceholderNew: 'sk-…',
      keyPlaceholderReplace: 'sk-… (replaces the current key)',
      overrideEnvWarning:
        'This key will take precedence over the one in the server configuration file.',
      test: 'Test the key',
      testing: 'Testing…',
      testOk: 'Key valid',
      clear: 'Remove the key',
      clearConfirm:
        'Remove the saved key? The application will fall back to the one in the server configuration file, if any.',
      saved: 'OpenAI key saved',
      modelTitle: 'Transcription model',
      modelIntro:
        'Model that transcribes speech live while recording. It changes neither summaries nor action detection.',
      modelLabel: 'Model used live',
      modelSourceEnv: 'Model provided by the server configuration.',
      modelSourceDefault: 'Application default model.',
      modelRetired:
        '{from}, chosen for this installation, is retired by OpenAI on {date}. {model}, which transcribes the same way, already replaces it.',
      modelRetiredKeep: 'Keep {model}',
      modelHelp:
        'Test before saving: the test opens a real transcription session and reveals a model your organization cannot access.',
      modelTest: 'Test this model',
      modelTesting: 'Testing…',
      modelTestOk: 'Model working',
      modelSaved: 'Model saved',
      modelInService: 'In use',
      pricePerHour: '/h',
      priceLevel: 'Price level: {tier} of {levels}',
      priceUnknown: 'Price unknown',
      priceDeltaLess: '{amount} less per hour than the model in use.',
      priceDeltaMore: '{amount} more per hour than the model in use.',
      priceDeltaSame: 'Same price per hour as the model in use.',
      pricesBasis:
        "Cost of one hour of transcription, at its provider's public rate converted to euros. Each extra € means a price roughly twice as high. In a video meeting, the other side's sound is transcribed separately: up to twice this cost.",
      pricesRefreshLink: 'Refresh prices in Usage',
      pricePerSummary: '/summary',
      summaryPriceCaption: 'Estimated cost of a summary · one-hour meeting',
      summaryPricesBasis:
        "The cost shown is that of a summary of a one-hour meeting, estimated with the Usage page's assumptions and the provider's public rate converted to euros. It is approximate: it follows the meeting's length and how much the model writes. Each extra € means a price roughly four times as high.",
      summaryDeltaLess: '{amount} less per summary than the model in use.',
      summaryDeltaMore: '{amount} more per summary than the model in use.',
      summaryDeltaSame: 'Same price per summary as the model in use.',
      summaryTitle: 'Summary writing model',
      summaryIntro:
        'Model that writes the meeting summary from the transcript. It decides the length, clarity and structure of the result — the most visible setting on this screen.',
      summaryLabel: 'Model used for summaries',
      summarySourceEnv: 'Model imposed by the server configuration.',
      summarySourceDefault: 'Application default model.',
      summaryOffList:
        'This model comes from the server configuration and is not among the choices offered here. Picking one from this list would replace it, with no way back from this screen.',
      summaryHelp:
        'Test before saving: the test checks that your organization can access this model (it does not judge summary quality, and costs a fraction of a cent).',
      summaryTest: 'Test model access',
      summaryTesting: 'Testing…',
      summaryTestOk: 'Model accessible',
      summarySaved: 'Writing model saved',
      infographicTitle: 'Meeting infographic',
      infographicIntro:
        'Offers, when generating a summary, to create the meeting infographic: the AI writes its content from the transcript, the actions and the notes, and picks one of six templates — Overview, Decision, Roadmap, Dashboard, Workshop, Review.',
      infographicToggleLabel: 'Offer the infographic',
      infographicHelp:
        'When disabled, the "Infographic" option disappears from the generation card for every account. When enabled, each group decides who can use it, in People → Groups. Each requested infographic is one call to the text model, billed on the OpenAI key (API keys page).',
      infographicOn: 'Offered',
      infographicTileSub: 'Six templates',
      infographicLookHelp:
        'Infographics use the logo and colours from Organisation → Brand & appearance: changing them also changes how existing infographics look.',
      infographicOff: 'Hidden',
      infographicSaved: 'Infographic setting saved',
      unsavedHint: 'Unsaved changes',
      discardChanges: 'Discard',
      models: {
        'gpt-realtime-whisper': 'Long-standing default — word by word, proven on long meetings',
        'gpt-live-transcribe': 'Built for live — word by word, same family as the default',
        'gpt-transcribe': 'Newest — word by word, final text repunctuated per segment',
        'voxtral-mini-transcribe-realtime-2602':
          'Word by word, punctuated as people speak. Stable version',
        'voxtral-mini-transcribe-realtime-3-0':
          'Mistral’s newest, more languages. In public preview',
        'speechmatics-melia-1': 'Speechmatics’ newest, switches between languages on its own',
        'speechmatics-enhanced': 'Speechmatics’ most proven, very accurate in French',
        'universal-3-6-pro':
          'AssemblyAI’s most accurate, 32 languages. Billed by meeting duration, pauses included',
        'universal-streaming-multilingual':
          'AssemblyAI’s cheapest, 6 languages including French. Billed by meeting duration',
      },
      modelNames: {
        'gpt-6-astra': 'GPT-6 Astra',
        'gpt-6.1-sol': 'GPT-6.1 Sol',
        'gpt-6-luna': 'GPT-6 Luna',
        'gpt-5.6-sol': 'GPT-5.6 Sol',
        'gpt-5.4': 'GPT-5.4',
        'gpt-5.4-mini': 'GPT-5.4 mini',
        'mistral-large-4': 'Mistral Large 4',
        'mistral-medium-3-5': 'Mistral Medium 3.5',
        'mistral-large-2512': 'Mistral Large 3',
        'mistral-small-2603': 'Mistral Small 4',
        'gpt-realtime-whisper': 'GPT Realtime Whisper',
        'gpt-live-transcribe': 'GPT Live Transcribe',
        'gpt-transcribe': 'GPT Transcribe',
        'voxtral-mini-transcribe-realtime-2602': 'Voxtral Realtime',
        'voxtral-mini-transcribe-realtime-3-0': 'Voxtral Realtime 3',
        'speechmatics-melia-1': 'Melia 1',
        'speechmatics-enhanced': 'Enhanced',
        'universal-3-6-pro': 'Universal-3.6 Pro',
        'universal-streaming-multilingual': 'Universal-Streaming Multilingual',
      },
      providers: {
        openai: 'OpenAI',
        mistral: 'Mistral',
        speechmatics: 'Speechmatics',
        assemblyai: 'AssemblyAI',
      },
      providerLocked: 'Add a {provider} key to pick these models.',
      providerUnlock: 'Add the {provider} key',
      providerKeyLabel: '{provider} API key',
      providerKeyHelp:
        'Create a key on {console}, then paste it here: it is checked against {provider} before being saved, and never leaves the server.',
      providerKeyPlaceholderNew: 'Paste your {provider} key',
      providerKeyPlaceholderReplace: 'Replace with a new key',
      providerKeyNeeded: 'This model needs a {provider} key.',
      providerKeyClearConfirm:
        'Remove the {provider} key? Its models can no longer be chosen until a key is pasted again.',
      providerKeyStored: '{provider} key saved',
      summaryModels: {
        'gpt-6-astra': 'OpenAI’s most capable, deepest reasoning — and by far the most expensive',
        'gpt-6.1-sol': 'Close to Astra on complex meetings, at a fifth of the price',
        'gpt-5.6-sol': 'Previous generation, its most capable tier',
        'gpt-5.4': 'Recommended — proven on our summaries: the best structure for the price',
        'gpt-5.4-mini': 'Cheap and fast — a more compact summary, with less nuance',
        'gpt-6-luna': 'OpenAI’s lightest and cheapest — for simple meetings',
        'mistral-large-4': 'Mistral’s most capable. In public preview',
        'mistral-medium-3-5': 'Mistral’s latest stable model, versatile',
        'mistral-large-2512': 'Mistral’s proven large model, at a low price',
        'mistral-small-2603': 'Mistral’s lightest and cheapest',
      },
      errors: {
        openai_key_doubled_prefix:
          'This key starts with "sk-sk-": it was probably pasted on top of an existing "sk-". Paste the whole key into an empty field.',
        openai_key_malformed: 'This does not look like an OpenAI key (it must start with "sk-").',
        openai_key_rejected: 'OpenAI rejected this key.',
        openai_key_missing: 'No key is configured on this server.',
        transcription_model_rejected: 'OpenAI rejected this transcription model.',
        summary_model_rejected:
          'OpenAI rejected this writing model — your organization probably cannot access it.',
        provider_key_missing:
          'This model needs a {provider} key: save it on the API keys page, then choose the model.',
        provider_key_in_use:
          'A {provider} model is still in use with this key (transcription or summaries): pick another provider’s model first, then remove it.',
        provider_key_rejected: '{provider} rejected this key.',
        provider_key_malformed: 'This does not look like a {provider} key.',
        provider_key_looks_openai:
          'This is an OpenAI key ("sk-…"): paste the key created at {provider} here.',
        provider_model_rejected:
          '{provider} rejected this model — your account probably cannot access it.',
      },
    },
    adminBranding: {
      tabLabel: 'Brand & appearance',
      companyTabLabel: 'Company',
      // ── Folded dashboard: two groups of tiles, one setting unfolded on click ──
      groupWords: "Your organisation's words",
      groupLook: 'Appearance',
      tileContext: 'Vocabulary',
      tileContextEmpty: 'Attached to every summary',
      tileCorrections: 'Corrections',
      tileCorrectionsEmpty: 'Words replaced during meetings',
      tileCompanyLogo: 'Company logo',
      tileCompanyLogoSub: 'At the top of infographics',
      tileCompanyLogoMissing: 'To add',
      tileLogo: 'Application logo',
      tileLogoSub: 'Sidebar, sign-in, welcome screen, infographic footer',
      tileTagline: 'Tagline',
      tileTaglineDefault: 'Default tagline',
      tileTaglineSub: 'Under the name, in the sidebar',
      tileTaglineEn: 'In English: {text}',
      tileColors: 'Colors',
      tileColorsCustom: 'Customised',
      tileColorsDefault: 'Original colors',
      tileChanged: 'Changed',
      tileInvalid: 'To fix',
      companyLogoTitle: 'Company logo',
      companyLogoIntro:
        'Opens every infographic and every PDF summary, top left. A wide logo fits better than a square one.',
      companyLogoSetBadge: 'Added',
      companyLogoMissingBadge: 'Missing',
      companyLogoFallback: "Until then, infographics show the application's logo in its place.",
      companyLogoPreviewAlt: 'Company logo preview',
      companyLogoReset: 'Remove the company logo',
      companyLogoHint: 'PNG, JPEG, WebP or SVG, {max} KB max. Wide format recommended.',
      logoTitle: 'Application logo',
      logoIntro:
        'Shown in the sidebar, on the sign-in screen, on the welcome screen, and at the foot of every infographic.',
      logoCustomBadge: 'Custom',
      logoDefaultBadge: 'Built-in logo',
      logoPreviewAlt: 'Logo preview',
      logoChoose: 'Choose an image…',
      logoHint: 'PNG, JPEG, WebP or SVG, {max} KB max. Square format recommended.',
      logoTooLarge: 'Image too large: {max} KB max.',
      logoBadType: 'Choose an image (PNG, JPEG, WebP or SVG).',
      logoReadError: 'Could not read this file. Try another image.',
      logoReset: 'Back to the built-in logo',
      taglineTitle: 'Tagline',
      taglineIntro: 'Shown under the application name, in the sidebar.',
      taglineLabel: 'In French',
      taglinePlaceholder: 'Assistant au quotidien',
      taglineHint: 'Left empty, the default tagline is used.',
      taglineEnLabel: 'In English',
      taglineEnPlaceholder: 'Everyday assistant',
      taglineEnHint:
        'Shown when the interface is in English. Left empty, the French tagline is shown, or failing that the default tagline.',
      colorTitle: 'Interface colors',
      colorIntro: 'Color the buttons, links and accents of the whole application, for everyone.',
      colorLabel: 'Primary color',
      colorHexLabel: 'Hex code',
      colorInvalid: 'Invalid color: expected #rrggbb format.',
      colorReset: 'Back to the original orange',
      colorSecondaryLabel: 'Secondary color',
      colorSecondaryHint:
        'The light orange: second tone of gradients and a few accents. It accompanies the primary color, it does not replace it.',
      colorSecondaryReset: 'Back to the original light orange',
      updatedBy: 'Saved by',
      unsavedHint: 'Unsaved changes',
      discardChanges: 'Discard',
      saved: 'Saved',
    },
    // Card at the top of the Configuration tab (BrandingTab); saving goes
    // through the page's single button, hence no action labels here.
    adminOrgContext: {
      title: "Your organisation's vocabulary and context",
      intro:
        'Attached to EVERY summary, for every account: the client names, project names and in-house acronyms the model has no way of guessing.',
      badgeSet: 'Set',
      badgeEmpty: 'Not set',
      label: 'Text attached to summaries',
      placeholder:
        'E.g.: we manufacture hydraulic pumps. “ADV” means sales administration, “INITECH” and “Globex” are clients.',
      help: 'Helps spell those terms correctly and understand references. Left empty, nothing is attached — the original behaviour.',
      counter: '{n} / {max} characters',
      updatedBy: 'Saved by',
    },
    // "Automatic corrections" card of the Configuration tab
    // (TranscriptCorrectionsCard), right under the vocabulary; saved by the
    // page's single button. {term} = the term at fault, {max} = the cap.
    adminTranscriptCorrections: {
      title: 'Automatic transcript corrections',
      intro:
        'Words the transcription gets wrong every time, replaced automatically during meetings.',
      badgeOne: '1 correction',
      badgeMany: '{n} corrections',
      badgeEmpty: 'None',
      scopeTitle: 'Applies to every meeting, for every account.',
      scopeText:
        'Use them sparingly: keep them for the proper names and acronyms the transcription always gets wrong. A common word would be replaced everywhere — even where it was right.',
      fromHeader: 'The transcription writes…',
      toHeader: 'Write instead',
      fromPlaceholder: 'E.g. Klobex, Clobex',
      toPlaceholder: 'E.g. Globex',
      rowLabel: 'Correction {n}',
      remove: 'Remove this correction',
      add: 'Add a correction',
      counter: '{n} / {max}',
      limitReached: 'Limit of {max} corrections reached: remove one to add another.',
      emptyTitle: 'No corrections yet.',
      emptyText:
        'Add one when a name keeps coming out misspelled, meeting after meeting. For example:',
      emptyFrom: 'Klobex',
      emptyTo: 'Globex',
      rules:
        'Several wrong spellings? Separate them with commas. Capitals and accents do not matter, and only whole words are replaced: “Paul” leaves “Pauline” alone.',
      tryTitle: 'Try it',
      tryHint: 'Type a sentence to see the result, even before saving.',
      tryLabel: 'Test sentence',
      tryPlaceholder: 'E.g. We met Klobex yesterday.',
      tryResult: 'Result',
      tryNoChange: 'Nothing to correct in this sentence.',
      futureOnly: 'They apply to transcriptions made after saving: past meetings do not change.',
      updatedBy: 'Saved by',
      errors: {
        missingFrom: 'Enter what the transcription writes.',
        missingTo: 'Enter what to write instead.',
        tooShort: '“{term}” is too short: a single letter cannot be corrected.',
        termTooLong: '“{term}” is too long: 60 characters at most.',
        tooManyVariants: '{term} spellings at most per correction.',
        sameAsTarget: '“{term}” is already written that way: nothing to correct.',
        duplicate: '“{term}” appears twice in the list.',
      },
      warnings: {
        common:
          '“{term}” is a common word: it would be replaced in every sentence, even where it is right.',
        short:
          '“{term}” is very short: a real word could be spelled the same, ignoring accents and capitals.',
      },
    },
    // Administration "Templates" tab: the shared templates offered to every
    // account. Same editor as "My templates" (TemplateEditor); the FR label
    // stays the primary editing language whatever the UI language.
    adminTemplates: {
      tabLabel: 'Templates',
      intro:
        'The summary templates offered to every account: the app’s built-in defaults — editable below — plus the ones you create. Anyone can also add their own under "Settings → My templates".',
      loading: 'Loading…',
      empty: 'No custom template. The built-in default templates are used.',
      defaultBadge: 'default',
      modifiedBadge: 'default · edited',
      resetToDefault: 'Restore default',
      confirmReset: 'Restore the default version of "{name}"? Your changes will be removed.',
      defaultEditHint:
        'Built-in default template: saving your changes replaces the original version for every account. "Restore default" brings it back at any time.',
      add: 'Add a template',
      pickTitle: 'No template selected',
      pickHint: 'Pick a template in the list to edit it, or create a new one.',
      pickHintEmpty: 'Create the first template: it will then appear in the list.',
      delete: 'Delete',
      cancel: 'Cancel',
      save: 'Save',
      backToList: 'Back to the list',
      confirmDelete: 'Delete the template "{name}"?',
      saveSuccess: '"{name}" saved.',
      saveError: 'Error {status} while saving.',
      deleteError: 'Error {status} while deleting.',
      networkError: 'Could not reach the server: {message}',
      fetchError: 'Error {status} while loading the templates.',
      sessionExpired: 'Session expired: sign in again, the change was not saved.',
      errorNameRequired: 'The template name (FR) is required.',
      errorValueInvalid: 'The template key is invalid.',
      errorValueRequired: 'The template key is required.',
      limitReached: '',
      limitReachedServer: 'Template limit reached.',
      sectionIdentity: 'Identity',
      fieldIcon: 'Icon',
      nameLabel: 'Name (FR)',
      namePlaceholder: 'E.g.: Réunion standard',
      slugHint: 'Unique template identifier: {slug}',
      addEnVersion: '+ Add EN name',
      hideEnVersion: '− Hide EN name',
      fieldLabelEn: 'Name (EN)',
      fieldLabelEnPlaceholder: 'E.g.: Standard meeting',
      sectionDirectives: 'Instructions to the AI',
      directivesHint:
        'What the AI should produce in the ✨ AI summary block — the main summary of the output (content, style, priorities).',
      directivesPlaceholder:
        'E.g.: Write a summary structured in 3 parts: decisions, actions, context…',
      sectionScaffold: 'Summary layout',
      scaffoldHint:
        'The structure of the final output: one or more summaries, plus headings, text and meeting info.',
      scaffoldHelp:
        'Define the visual structure of the output. ' +
        'The ✨ AI summary block (defined by the Directives above) is always present: move it around, it cannot be removed. ' +
        'Add extra summaries if needed — ⚡ 20 words, 📃 100 words, 🎯 Key points — and the meeting info.',
      scaffoldPlaceholder:
        'E.g.:\n# Summary\n**Date:** {{date}}\n\n{{résumé}}\n\n## Actions\n{{actions}}',
      varGroupAi: 'AI blocks',
      varGroupMeta: 'Meeting info',
      varAlreadyInserted:
        'Already in the layout — only one instance allowed. Move the pill directly in the text.',
      helpAria: 'Layout help',
      formatHint: 'Formatting',
      formatBold: 'Bold',
      formatItalic: 'Italic',
      formatUnderline: 'Underline',
      formatH1: 'Heading 1',
      formatH2: 'Heading 2',
      formatDragBlock: 'Move block',
      insertVariableHint: 'Insert a variable',
      starterPickerTitle: 'Choose a starting point',
      starterPickerSubtitle: 'Start from scratch or base it on an existing template.',
      starterFromScratch: 'From scratch',
      starterFromTemplate: 'Based on: {name}',
      starterPickerCancel: 'Cancel',
      copySuffix: '(copie)',
      copySuffixEn: '(copy)',
    },
    // Settings → During the meeting → Replaced words (settings/CorrectionsSection):
    // the ACCOUNT's corrections list. `card` overrides the texts of the card
    // shared with the administration (adminTranscriptCorrections).
    configCorrections: {
      intro:
        'Words the transcription gets wrong in YOUR meetings, replaced automatically at the end of each sentence. They come on top of the ones your administrator set for everyone.',
      learnTitle: 'Remember the replacements in my notes',
      learnHint:
        'Writing “Replace Durend with Durand” in a meeting’s notes adds the replacement to your list: no need to write it again in the next meeting.',
      learnLabel: 'Add the replacements written in my notes to my list',
      learnScope:
        'Replacements are kept when both words sound almost the same — the mark of a mistranscribed word. A replacement such as “Replace Bob with Robert” only applies to its meeting: add it below if you want it everywhere.',
      learnOff: 'Off: a replacement written in your notes only applies to its meeting.',
      card: {
        title: 'My replaced words',
        intro: 'What the transcription gets wrong in your meetings, and what to write instead.',
        scopeTitle: 'Applies to your meetings only.',
        scopeText:
          'Remove a replacement that was only meant for one meeting: it applies to every later one, even where the word was right.',
        fromPlaceholder: 'E.g. Durend, Durant',
        toPlaceholder: 'E.g. Durand',
        rowLabel: 'Replacement {n}',
        remove: 'Remove this replacement',
        add: 'Add a replacement',
        limitReached:
          'Limit of {max} replacements reached: remove one to add another. Until then, the ones in your notes are no longer kept.',
        emptyTitle: 'No replaced word yet.',
        emptyText:
          'Add one when a name keeps coming back misspelled meeting after meeting — or write the replacement in your notes. For example:',
        emptyFrom: 'Durend',
        emptyTo: 'Durand',
        tryPlaceholder: 'E.g. We met Mr Durend yesterday.',
      },
      discardChanges: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      errors: {
        network: 'Could not connect. Check your network, then try again.',
        unknown: 'Saving failed. Try again.',
      },
    },
    configActionDetection: {
      tabLabel: 'Action detection',
      intro:
        'What the assistant picks up during YOUR meetings, and how often. These settings are yours alone; the test bench at the bottom lets you judge a change before adopting it.',
      stateTitle: 'Detection during meetings',
      stateHint:
        'When active, actions appear in the side panel as the conversation unfolds, with nobody having to type them.',
      enabledLabel: 'Detect actions during meetings',
      disabledWarning:
        'Detection is off: no action will be suggested during meetings. Participants can still add them by hand.',
      whatTitle: 'What the assistant looks for',
      whatHint: 'These settings make up the instruction sent to the model on every analysis.',
      sensitivityLabel: 'Sensitivity',
      sensitivity: {
        explicit: {
          label: 'Strict (default)',
          hint: 'Only what is announced as an action. Little noise, but a commitment made in passing goes unnoticed.',
        },
        balanced: {
          label: 'Balanced',
          hint: 'Announced actions, plus those someone takes on or is handed — “I’ll take care of it”, “can you follow up with the client?”. A need voiced with nobody picking it up is ignored.',
        },
        wide: {
          label: 'Wide',
          hint: 'Anything that looks like a task, even with nobody to carry it — “we need to send the quote”, “we should”, “remember to”. For workshops: better to delete one action too many than to miss one.',
        },
      },
      triggerWordsLabel: 'Trigger words',
      triggerWordsPlaceholder: 'action, to do, site visit',
      triggerWordsHint:
        'Comma-separated, {max} at most. A sentence containing one announces an action. Left empty, only meaning counts.',
      allowUpdatesLabel: 'Refine actions as the meeting goes',
      allowUpdatesHint:
        'An action already detected fills in when the conversation later specifies its owner, due date or what to deliver. Turned off, each action stays exactly as first detected.',
      paceTitle: 'Pace',
      paceHint:
        'Applied by the browser during the meeting. Analysing more often surfaces actions faster, and costs more.',
      windowLabel: 'Listening depth',
      windowValue: 'last {n} sentences',
      windowHint:
        'What the model re-reads on each analysis. Wider, it better understands an action stated in several steps; narrower, it goes straight to the point.',
      intervalLabel: 'Time between analyses',
      intervalEverySentence: 'Every sentence',
      intervalValue: 'Every {n} sentences',
      intervalHint:
        'An action appears about {seconds} seconds after being stated. Spacing them out reduces the number of model calls.',
      testTitle: 'Test bench',
      testHint:
        'Paste a meeting excerpt and see what detection makes of it, using the settings shown above.',
      sampleLabel: 'Conversation excerpt',
      samplePlaceholder:
        'Marc: we need to follow up with INITECH before Friday.\nSophie: I’ll take care of it, I’ll call them tomorrow.\nMarc: action for Julie, prepare the renewal quote.',
      testRun: 'Test detection',
      testRunning: 'Analysing…',
      testScopeHint: 'Tests the settings shown, saved or not. No effect on meetings in progress.',
      testFound: '{n} action(s) detected',
      testNoAction: 'No action detected in this excerpt.',
      testUntitled: 'Untitled action',
      testNoOwner: 'Owner to be decided',
      testStale: 'Settings have changed since this test.',
      showPrompt: 'Show the instruction sent to the model',
      hidePrompt: 'Hide the instruction',
      unsavedHint: 'Unsaved changes',
      discardChanges: 'Discard',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      errors: {
        detection_test_content_missing: 'Paste a conversation excerpt before testing.',
        detection_test_failed: 'The test did not complete.',
        detection_settings_invalid: 'One of the displayed settings is invalid.',
        too_many_requests: 'Too many tests in a short time. Try again in a few minutes.',
        bad_origin: 'Request refused for security reasons. Reload the page and try again.',
        unauthorized: 'Session expired. Sign in again.',
        unknown: 'Something went wrong.',
      },
    },
    adminStats: {
      tabLabel: 'Usage',
      intro:
        'How myBrief is used over the selected period: meetings, recorded time, active accounts. Aggregate figures only, never meeting contents.',
      rangeLabel: 'Observed period',
      ranges: {
        7: '7 days',
        30: '30 days',
        90: '90 days',
        365: '12 months',
        0: 'All time',
      },
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      periodHint: 'Meetings recorded, {range}.',
      kpiMeetings: 'Meetings',
      kpiMeetingsHint: 'Over {range} · {total} since the start',
      kpiTotalTime: 'Recorded time',
      kpiAverage: 'Average length',
      kpiAverageHint: 'Median {median}',
      kpiNoDuration: 'No measured duration in this period',
      kpiNewUsers: '{count} new accounts in this period',
      durationBasis: 'Over {counted} of {total} meetings',
      partialDurations:
        'Some meetings have no recorded duration: the measurement was added in August 2026. They count towards the meeting total, but are excluded from durations and averages.',
      noDurationNotice:
        'No meeting in this period has a recorded duration: the measurement was added in August 2026 and only applies to later meetings. Durations will appear as new recordings come in.',
      noDurationEmpty: 'No duration recorded in this period.',
      chartMeetings: 'Meetings over time',
      chartTime: 'Recorded time',
      chartTimeHint: 'Cumulated hours per period.',
      chartDurations: 'Length distribution',
      chartDurationsHint: 'How many meetings fall in each length band.',
      chartWeekdays: 'Activity by day',
      chartWeekdaysHint: 'Weekdays on which meetings are recorded.',
      chartTopUsers: 'Most active users',
      chartTopUsersHint: 'Meetings recorded in this period.',
      chartTemplates: 'Templates in use',
      chartTemplatesHint: 'Templates picked to generate summaries.',
      buckets: {
        lt15: 'Under 15 min',
        lt30: '15 to 30 min',
        lt60: '30 to 60 min',
        lt120: '1 to 2 h',
        gte120: 'Over 2 h',
      },
      weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      weekdaysLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      colPeriod: 'Period',
      colMeetings: 'Meetings',
      colTime: 'Time',
      colBucket: 'Band',
      colDay: 'Day',
      colUser: 'User',
      colTemplate: 'Template',
      colLastMeeting: 'Last meeting',
      showTable: 'Data',
      showChart: 'Chart',
      empty: 'No meeting in this period.',
      emptyUsers: 'No active user in this period.',
      never: 'Never',
      daysAgo: '{days} d ago',
      today: 'today',
      hours: '{value} h',
      footnote: 'First meeting recorded on {first} · {total} meetings stored.',
      templateUnknown: 'No template',
      filtersLabel: 'Statistics filters',
      customRange: 'Dates…',
      customFrom: 'From',
      customTo: 'To',
      customApply: 'Apply',
      customRangeLabel: 'from {from} to {to}',
      filterGroup: 'Group',
      filterUser: 'User',
      filterTemplate: 'Template',
      allGroups: 'All groups',
      allUsers: 'All users',
      allTemplates: 'All templates',
      disabledOption: '{name} (disabled)',
      resetFilters: 'Clear filters',
      everyone: 'The whole organisation',
      scopeGroup: 'Group {name}',
      scopeTemplate: 'Template {name}',
      deltaNew: 'New',
      deltaPoints: '{value} pt',
      deltaTitle: 'Compared with {from} – {to}: {value}',
      vsPrevious: 'vs previous period',
      kpiAdoption: 'Adoption rate',
      kpiAdoptionHint: '{active} active accounts out of {enabled}',
      kpiAdoptionNone: 'No open account in this scope',
      kpiNewUser: '1 new',
      kpiNewUsersShort: '{count} new',
      kpiSummaries: 'Summaries',
      kpiSummariesHint: '{count} of {total} meetings have one',
      kpiSummariesNone: 'No meeting in this period',
      kpiPerActive: 'Meetings per active account',
      kpiPerActiveHint: 'Average over {count} active accounts',
      adoptionTitle: 'Adoption health',
      adoptionHint: 'Open accounts, by how they used myBrief over the period.',
      adoptionLead: '{share} of accounts use myBrief at least every other week.',
      adoptionEmpty: 'No open account in this scope.',
      adoptionStatuses: {
        regular: 'Regular',
        occasional: 'Occasional',
        dormant: 'Dormant',
        never: 'Never started',
      },
      adoptionDefinitions: {
        regular: 'At least every other week',
        occasional: 'Less than every other week',
        dormant: 'Nothing this period, used before',
        never: 'No meeting recorded',
      },
      adoptionSee: 'See these accounts',
      statusLabels: {
        regular: 'Regular',
        occasional: 'Occasional',
        dormant: 'Dormant',
        never: 'Never started',
      },
      usersTitle: 'Usage by user',
      usersHint: 'Every account over the period. Click a name to focus the whole page on it.',
      usersHintPdf:
        'Every account over the period, from most to least active. Active weeks: weeks with at least one meeting. ▲ ▼: more or fewer meetings than in the previous period.',
      usersSearch: 'Search a name, an address, a group',
      usersFilterAll: 'All',
      usersStatusFilter: 'Filter by status',
      usersShown: '{shown} of {total} accounts',
      usersNoMatch: 'No account matches.',
      usersEmpty: 'No account in this scope.',
      exportCsv: 'Export as CSV',
      csvFilename: 'mybrief_usage',
      colGroups: 'Groups',
      colStatus: 'Status',
      colAverage: 'Avg. length',
      colRegularity: 'Regularity',
      colSummaries: 'Summaries',
      regularity: '{active}/{weeks} wk',
      regularityTitle: 'At least one meeting in {active} weeks out of {weeks}',
      trendTitle: '{count} meetings in the previous period',
      disabledBadge: 'Disabled',
      focusAction: 'See statistics for {name}',
      sortedAsc: 'sorted ascending',
      sortedDesc: 'sorted descending',
      csv: {
        name: 'Name',
        email: 'Address',
        groups: 'Groups',
        status: 'Status',
        meetings: 'Meetings',
        previous: 'Meetings (previous period)',
        minutes: 'Recorded time (min)',
        avgMinutes: 'Average length (min)',
        activeWeeks: 'Active weeks',
        weeks: 'Weeks in period',
        summaries: 'Summaries',
        lastMeeting: 'Last meeting',
        lastSeen: 'Last sign-in',
        total: 'Meetings in total',
      },
      focusKicker: 'Statistics for',
      focusBack: 'Whole team',
      focusCreated: 'Account created on {date}',
      focusLastSeen: 'Last signed in on {date}',
      focusNeverSeen: 'Never signed in',
      exportPdf: 'Export as PDF',
      pdf: {
        title: 'Export statistics as PDF',
        intro: 'Choose what the report contains. It uses the period and filters on screen:',
        sectionsLabel: 'Report sections',
        sections: {
          overview: 'Key figures',
          adoption: 'Adoption health',
          meetings: 'Meetings over time',
          time: 'Recorded time',
          durations: 'Length distribution',
          weekdays: 'Activity by day',
          topUsers: 'Most active users',
          templates: 'Templates in use',
          users: 'Usage by user',
          costs: 'Estimated AI spend',
        },
        all: 'Select all',
        none: 'Clear all',
        cancel: 'Cancel',
        generate: 'Generate PDF',
        generating: 'Generating…',
        empty: 'Select at least one section.',
        failed: 'The PDF could not be generated. Please try again.',
        done: 'PDF report downloaded.',
        privacy: 'The report names people: share it with care.',
        reportKicker: 'myBrief · Statistics',
        reportTitle: 'Usage report',
        period: 'Period',
        scope: 'Scope',
        issued: 'Issued on',
        issuedBy: '{date} by {author}',
        previousNote:
          'Changes compared with the previous period of the same length, {from} to {to}.',
        durationNote:
          'Durations measured on {counted} of {total} meetings: the measurement only exists since August 2026.',
        footer: 'Document generated by MyBrief - developed by MyAlfred.ai',
        filename: 'mybrief_statistics',
      },
      errors: {
        range_invalid:
          'Invalid period: the start date must come before the end date and not be in the future.',
      },
      costs: {
        title: 'Estimated AI spend',
        hint: 'Transcription, summaries, infographics and assistants, at the pace observed over {days} days, with the models in use and the latest public prices.',
        unavailable:
          'The spend estimate could not be computed. The other statistics are still accurate.',
        monthly: 'Spend per month',
        monthlyHint: 'Estimate at the pace of the period',
        perHour: 'One hour of myBrief',
        perHourMeasured: 'Average over {duration} recorded',
        perHourMeasuredInferred:
          'Average over {duration} of meetings, {count} with inferred length',
        perHourReference: 'Typical one-hour meeting, without infographic',
        period: 'Over the period',
        periodHint: '{meetings} meetings · {perMeeting} per meeting',
        periodHintEmpty: 'No meeting in this period',
        breakdownLabel: 'Spend by item',
        perMonthValue: '{value} / month',
        lines: {
          transcription: 'Transcription',
          summary: 'Summaries',
          infographic: 'Infographics',
          assistants: 'In-meeting assistants',
        },
        linesHint: {
          transcription: 'Live transcription',
          summary: 'Writing and regenerations',
          infographic: 'Layout, then image',
          assistants: 'Action detection and titles',
        },
        units: {
          hour: '{value} per hour',
          summary: '{value} per summary',
          infographic: '{value} per infographic',
        },
        share: '{value} of spend',
        unknownTariff: 'Unknown price',
        unpricedLine: 'Unknown price for {models}',
        unpricedNotice:
          'No known price for {models}: this spend is not counted. “Refresh prices” looks them up online.',
        colLine: 'Item',
        colModels: 'Models',
        colVolume: 'Volume',
        colUnit: 'Unit cost',
        colPeriod: 'Over the period',
        colMonthly: 'Per month',
        colShare: 'Share',
        compareTitle: 'Compare models',
        compareIntro:
          'What the same activity would have cost with each model offered in Administration (AI models). Only the price changes: quality is best judged by trying.',
        colModel: 'Model',
        colTariff: 'Public price',
        colDelta: 'Difference per month',
        current: 'In use',
        tariffAudio: '{price} / min',
        tariffText: '{input} in · {output} out, per million tokens',
        tariffImage: '{price} / image',
        assumptionsTitle: 'How it is calculated',
        assumptions: {
          prices:
            'Public list prices, excluding taxes, discounts and free credits: an estimate, not an invoice.',
          audio:
            'Transcription is billed per minute of audio. A video meeting transcribes two streams (microphone and meeting audio): the estimate counts only one.',
          tokens:
            'About {chars} characters per token. Each summary rereads the whole transcript and produces about {output} tokens, reasoning included.',
          speechMeasured: 'Speech rate of your meetings: {rate} characters per second.',
          speechDefault:
            'Typical speech rate: {rate} characters per second (not enough measured meetings yet).',
          inferred:
            'Meetings without a recorded duration (before August 2026): {count}. Their length is inferred from the transcript length.',
          detection:
            'Action detection: about {calls} analyses per recorded hour, for accounts that turned it on.',
          image:
            'Infographic: one call to the text model, about {tokens} written tokens — its layout costs nothing. Only the latest infographic of a meeting is counted.',
          excluded:
            'Not counted: audio file imports, transcript proofreading from notes, and tests from AI models.',
        },
        sources: {
          builtin: 'built into myBrief',
          litellm: 'public price lists, via LiteLLM',
        },
        fxSources: {
          builtin: 'built-in rate',
          ecb: 'ECB reference rate',
          'currency-api': 'market rate',
        },
        pricesAsOf: 'Prices as of {date} ({source})',
        fxAsOf: '$1 = €{rate} ({source}, {date})',
        pricesRefresh: 'Refresh prices',
        pricesRefreshing: 'Looking up…',
        refreshedAll: 'Prices and exchange rate refreshed.',
        refreshedNoFx:
          'Prices refreshed. The exchange rate could not be fetched: the last known one still applies.',
        refreshedFxOnly:
          'Exchange rate refreshed. Prices could not be fetched: the last known ones still apply.',
        refreshedMissing:
          'Models not found online ({count}): their last known price still applies.',
        errors: {
          prices_unreachable:
            'The price sources cannot be reached from the server: the last known prices still apply.',
        },
      },
    },
    adminActions: {
      tabLabel: 'Actions',
      meetingTitle: 'After each meeting',
      summaryTitle: 'After each summary',
      summaryIntro: 'Buttons offered on every generated summary.',
      actionEmail: 'Send by email',
      actionStorage: 'Store',
      actionDownload: 'Download',
      previewLabel: 'Preview:',
      previewEmpty: 'No button will be shown.',
      providerLabel: 'Provider',
      providerNone: 'None',
      providerGdrive: 'Google (Gmail + Drive)',
      providerSharepoint: 'Microsoft (Outlook + OneDrive)',
      folderLabel: 'Target folder',
      folderPlaceholder: 'E.g.: myBrief/Minutes',
      folderHint:
        'Path inside each user\'s Google Drive or OneDrive. Left empty, documents go to a "myBrief" folder.',
      storageNotConfigured: 'Choose a provider to make the "Store" button appear.',
      storageNotConnected:
        'myBrief only accesses folders it created itself. If your users already own a folder with that name, a same-named folder will be created next to it: that is the one receiving the documents.',
      emailUnavailable:
        'No SMTP relay is configured on this server: the "Send by email" button will not appear.',
      saved: 'Saved',

      maxRecipientsLabel: 'Maximum recipients',
      maxRecipientsHint:
        'How many addresses a user may add besides their own — for their default list as well as each of their per-tag lists. Their account always stays in copy.',
      tagRecipientsRuleTitle: 'Recipients per tag',
      tagRecipientsRuleBody:
        'Your users may give each tag its own recipient list (“My tags”). It replaces their default list for conversations carrying that tag — it is not added to it. The ceiling above applies to each list.',
      allowSmtpExternalLabel: 'Let this server’s relay write to third parties',
      allowSmtpExternalHint:
        'Without a connected account, mail leaves through this server’s SMTP relay. Writing to external recipients puts your domain’s reputation (SPF/DMARC) on the line — only enable this if your relay sends outbound and your domain covers it.',
      allowSmtpExternalOff:
        'Disabled: without a connected account, the document goes to its author only, and the interface says so.',

      subjectTemplateLabel: 'Email subject',
      subjectTemplatePlaceholder: 'E.g.: Minutes {{titre}} — {{date}}',
      filenameTemplateLabel: 'File name',
      filenameTemplatePlaceholder: 'E.g.: {{date}}-{{titre}}',
      templateHint: 'Left empty, myBrief keeps its usual format.',
      variablesLabel: 'Available variables',

      testEmail: 'Test sending',
      testStorage: 'Test storage',
      testRunning: 'Testing…',
      testScopeHint: 'Tested with organisation values, ignoring your personal settings.',

      // ── Rebuilt around actions ────────────────────────────────────────────
      previewTitle: 'What your users will see',
      previewIntro:
        'The button bar as it will appear, safeguards included: a button that is enabled but inoperative does not show up.',
      previewMeeting: 'After each meeting:',
      previewSummary: 'After each summary:',
      providerCardTitle: 'Linked account',
      providerCardIntro:
        'Provider of the accounts your users link. The same account serves both email sending AND file storage.',
      sharePointScopeLabel: 'Offer SharePoint libraries',
      sharePointScopeOnHint:
        'Connecting requests "Sites.ReadWrite.All" — read and write in every SharePoint site the person can reach. Entra does not consent by halves: if your directory refuses that permission, NO account connects at all, not even for OneDrive alone.',
      sharePointScopeOffHint:
        'Connecting no longer requests "Sites.ReadWrite.All": your directory only has "Mail.Send" and "Files.ReadWrite" left to grant, and storage lands in OneDrive. Administrator consent is still required if your directory demands it for those two. Accounts already linked keep their libraries until they reconnect.',
      mailCardTitle: 'Send by email',
      mailCardIntro: 'Where the button appears, and how far your users may adjust their sending.',
      storageCardTitle: 'Store',
      storageCardIntro: 'Where the button appears, and which folder documents land in.',
      downloadCardTitle: 'Download',
      downloadCardIntro: 'Saves the document on the device. Depends on no account and no relay.',
      filenameCardTitle: 'Default file naming',
      filenameCardIntro:
        'File names when the user has set nothing of their own. Click a variable to insert it.',
      testEmailDisabled: 'No SMTP relay configured on this server.',
      testStorageDisabled: 'Choose a provider first.',
      chooseAccount: 'Choose the connected account',
      // ── Folded dashboard: the preview, one tile per button and per shared setting ──
      groupButtons: 'The buttons offered',
      groupShared: 'Shared settings',
      tileScopeBoth: 'Meeting and summary',
      tileScopeMeeting: 'After the meeting',
      tileScopeSummary: 'After the summary',
      tileScopeNone: 'Off',
      tileMailSub: '{max} recipients at most',
      tileMailBlocked: 'No relay',
      tileStorageBlocked: 'Account required',
      tileFolder: 'Folder: {folder}',
      tileFolderDefault: '“myBrief” folder',
      tileNoAccount: 'No connected account',
      tileDownloadSub: 'No account or relay needed',
      tileAccountSub: 'Email sending and storage',
      tileAccountNone: 'Email through the server relay, no storage',
      tileSharePointOn: 'SharePoint libraries offered',
      tileSharePointOff: 'OneDrive only',
      tileNaming: 'File names',
      tileNamingDefault: 'Usual format',
      tileNamingSub: 'When the user has set nothing',
      tileChanged: 'Changed',
      unsavedHint: 'Unsaved changes',
      discardChanges: 'Discard',
    },
    adminMyBrain: {
      tabLabel: 'MyBrain',
      intro:
        'MyBrain is your organization’s shared brain. Once connected, it receives finished meetings and turns them into records, after approval in its review.',
      connectionTitle: 'MyBrain connection',
      connectionIntro:
        'The address of your MyBrain, and an API key created for MyBrief in MyBrain → Administration → API keys, with the “Feed the brain” right.',
      statusOn: 'Connected',
      statusOff: 'To configure',
      connectedAs: 'Connected as “{application}” — rights: {rights}.',
      rightNames: { lire: 'read', nourrir: 'feed' },
      updatedBy: 'Set by',
      keyUnreadable:
        'This server can no longer read the saved key: its encryption key has changed. Paste the key again.',
      urlLabel: 'MyBrain address',
      urlPlaceholder: 'https://mybrain.example.com',
      urlHelp: 'The “API URL” MyBrain displays when the key is created works too.',
      keyLabel: 'API key',
      keyPlaceholderNew: 'mbk_…',
      keyPlaceholderReplace: 'mbk_… (replaces the current key)',
      keyCurrent: 'Saved key:',
      keyRequiredHint:
        'New address: paste the key again. The saved key is never sent to another address.',
      keyHelp:
        'The address and the key are checked with MyBrain before being saved. The key never leaves the server.',
      test: 'Test the connection',
      testing: 'Testing…',
      testOk: 'Connection working',
      testOkDraft: 'Connection working: “{application}”, rights: {rights}. Save to apply it.',
      testNeeds: {
        both: 'To test: the MyBrain address and an API key.',
        url: 'To test: the MyBrain address.',
        key: 'To test: an API key.',
      },
      clear: 'Remove the key',
      clearConfirm: 'Remove the key? No meeting will be sent to MyBrain until a new key is saved.',
      policyTitle: 'Sending meetings',
      policyIntro:
        'Who sends their meetings to MyBrain. A meeting is sent when it ends — “Generate summary” or “Save” —, only once.',
      policies: {
        off: { label: 'Off', hint: 'No meeting is sent to MyBrain.' },
        optin: {
          label: 'Each user decides',
          hint: 'Everyone turns sending on in Settings → After the meeting → MyBrain. Nothing is sent until they do.',
        },
        forced: {
          label: 'Required for everyone',
          hint: 'Meetings from every account are sent. Everyone sees it in Settings → After the meeting → MyBrain, without being able to turn it off.',
        },
      },
      policyNotConfigured: 'Nothing is sent until the MyBrain connection is configured.',
      contentTitle: 'What is sent',
      contentIntro: 'For each meeting, a text that MyBrain reads as a source:',
      contentItems: [
        'the title, date and time, duration',
        'the author — the person who recorded it — and the tag',
        'the notes, the actions and the summary',
        'the full transcript',
      ],
      contentReview:
        'Everything arrives as a proposal in MyBrain’s review: nothing enters the brain without approval. The question goes to the meeting’s author if they have a MyBrain account, otherwise to the record’s owner or to the curators.',
      saved: 'MyBrain settings saved',
      unsavedHint: 'Unsaved changes',
      discardChanges: 'Discard',
      errors: {
        mybrain_url_invalid:
          'This address is not valid: enter the web address of your MyBrain, for example https://mybrain.example.com.',
        mybrain_key_malformed: 'This does not look like a MyBrain key: it starts with “mbk_”.',
        mybrain_key_rejected: 'MyBrain refused this key: it is unknown, or has been deleted.',
        mybrain_right_missing:
          'This key does not have the “Feed the brain” right. Create one that does, in MyBrain → Administration → API keys.',
        mybrain_not_found: 'No MyBrain answers at this address. Check it.',
        mybrain_invalid_response: 'This address does not answer like a MyBrain. Check it.',
        mybrain_redirected: 'This address redirects elsewhere: enter the final address.',
        mybrain_unreachable: 'MyBrain cannot be reached from the MyBrief server.',
        mybrain_timeout: 'MyBrain did not answer in time.',
        mybrain_unavailable: 'MyBrain does not accept submissions at the moment.',
        mybrain_rate_limited: 'MyBrain is limiting calls: try again in a few minutes.',
        mybrain_error: 'MyBrain ran into an error.',
        mybrain_not_configured: 'Enter the MyBrain address and an API key.',
        mybrain_key_required:
          'New address: paste the key again. The saved key is never sent to another address.',
        mybrain_connection_lost: 'The connection to MyBrain was cut on the way. Try again.',
      },
    },
    configMyBrain: {
      sectionLabel: 'MyBrain',
      intro:
        'MyBrain is your organization’s shared brain: it keeps what the team knows, record by record. Your meetings can feed it.',
      toggleTitle: 'Send my meetings to MyBrain',
      toggleHint: 'Each meeting is sent once, when you end it with “Generate summary” or “Save”.',
      toggleLabel: 'Send my meetings to MyBrain',
      statusOn: 'On',
      statusOff: 'Off',
      statusForced: 'Required',
      forcedNote:
        'Your administrators send meetings from every account to MyBrain: this cannot be turned off here.',
      contentTitle: 'What is sent',
      contentItems: [
        'the title, date and time, duration',
        'your name, your address and the meeting’s tag',
        'the notes, the actions and the summary',
        'the full transcript',
      ],
      reviewNote:
        'Everything arrives in MyBrain’s review: nothing enters the brain without approval, and the question goes to you if you have a MyBrain account.',
      notRetroactive: 'Only meetings started after sending was turned on are sent.',
      openReview: 'Open MyBrain’s review',
      recentTitle: 'Latest sends',
      recentHint: 'Your latest meetings sent to MyBrain, and their status.',
      recentEmpty: 'No meeting sent yet.',
      statusSent: 'Sent',
      statusSending: 'Sending',
      statusError: 'Failed',
      sentOn: 'Sent on {date}',
      triedOn: 'Attempt of {date}',
      parts: 'in {n} parts',
      recipientUnknown:
        'Your address has no MyBrain account: approval goes to the record’s owner, or to the curators.',
      autoRetry: 'A new attempt is scheduled automatically.',
      ambiguous: 'It may have arrived: check MyBrain’s review before trying again.',
      retry: 'Try again',
      retrying: 'Sending…',
      retried: 'Meeting sent to MyBrain.',
      errors: {
        mybrain_disabled: 'MyBrain is no longer offered on this installation.',
        mybrain_policy_forced: 'Sending is required by your administrators.',
        mybrain_not_enabled: 'Turn on sending your meetings first.',
        mybrain_already_sent: 'This meeting has already reached MyBrain.',
        mybrain_sending: 'This meeting is being sent.',
        mybrain_nothing_to_send:
          'This meeting has nothing to send: no transcript, no summary, no note.',
        meeting_not_found: 'This meeting no longer exists.',
        meeting_recording: 'This meeting is still being recorded.',
        mybrain_unreachable: 'MyBrain could not be reached.',
        mybrain_timeout: 'MyBrain did not answer in time.',
        mybrain_interrupted: 'Sending was interrupted.',
        mybrain_connection_lost: 'The connection to MyBrain was cut on the way.',
        mybrain_not_retryable: 'This meeting was never sent: there is nothing to try again.',
        internal_error: 'Sending failed on our side.',
        mybrain_rate_limited: 'MyBrain was receiving too many meetings at once.',
        mybrain_error: 'MyBrain ran into an error.',
        mybrain_unavailable: 'MyBrain does not accept submissions at the moment.',
        mybrain_rejected: 'MyBrain refused the content of this meeting.',
        mybrain_too_long: 'This meeting exceeds what MyBrain accepts.',
        mybrain_key_rejected: 'The MyBrain connection needs attention: tell your administrators.',
        mybrain_right_missing: 'The MyBrain connection needs attention: tell your administrators.',
        mybrain_not_found: 'The MyBrain connection needs attention: tell your administrators.',
        mybrain_redirected: 'The MyBrain connection needs attention: tell your administrators.',
        mybrain_invalid_response:
          'The MyBrain connection needs attention: tell your administrators.',
        too_many_requests: 'Too many attempts in a short time. Try again in a while.',
        bad_origin: 'Request blocked for security. Reload the page and try again.',
        network: 'Server unreachable. Check your connection.',
        unknown: 'Something went wrong.',
      },
    },
    passwordPolicy: {
      hint: 'At least {min} characters.',
      required: 'Enter a password.',
      too_short: 'The password must be at least {min} characters long.',
      too_long: 'The password is too long.',
      too_common: 'This password is too common.',
      contains_email: 'The password must not contain your email address.',
      mismatch: 'The two passwords do not match.',
    },
    account: {
      signedInWith: {
        google: 'Signed in with Google',
        entra: 'Signed in with Microsoft',
        password: 'Signed in with a password',
        oidc: 'Signed in with SSO',
        sso: 'Signed in with SSO',
      },
      menuLabel: 'My account',
      guest: 'Guest',
      changePasswordTitle: 'Change password',
      groupsLabel: 'Your group',
      groupsHint: 'Assigned by your administrator.',
      capsuleRemaining: '{remaining} left',
      thisMonth: 'This month',
      monthMeetings: 'Meetings',
      monthRecorded: 'Recorded',
      monthSummaries: 'Summaries',
      seeStats: 'See details',
      language: 'Language',
      forcedTitle: 'Choose your password',
      forcedMessage:
        'Your account is still using its initial password. Choose a new one to continue.',
      currentLabel: 'Current password',
      newLabel: 'New password',
      confirmLabel: 'Confirm new password',
      submit: 'Save',
      submitting: 'Saving…',
      saved: 'Password changed. Your other devices have been signed out.',
      cancel: 'Cancel',
      errors: {
        invalid_current_password: 'Current password is incorrect.',
        password_not_set: 'This account has no password. Use “forgot password” instead.',
        too_many_attempts: 'Too many attempts. Try again later.',
        network: 'Server unreachable. Check your connection.',
        unknown: 'Something went wrong. Please try again.',
      },
    },
    adminDashboard: {
      tabLabel: 'Dashboard',
      intro: 'What is left to fix in the organization, and the page where to fix it.',
      issuesTitle: 'To fix',
      issuesEmpty: 'Nothing to fix: the installation is in order.',
      levels: { error: 'Outage', warning: 'Setting with no effect', tip: 'Tip' },
      activityTitle: 'Activity over the last 30 days',
      activityLink: 'See usage',
      meetings: 'Meetings',
      recorded: 'Recorded time',
      activeAccounts: 'Active accounts',
      activeOf: '{active} of {total}',
      activityError: 'Figures are not available right now.',
    },
    adminPanel: {
      sectionsLabel: 'Administration sections',
      groupPeople: 'People',
      groupModels: 'AI models',
      groupCapabilities: 'Capabilities',
      groupCosts: 'Costs',
      groupOrganization: 'Organization',
      restricted: 'Restricted to administrators.',
      noAccess: 'The account {email} has no access to administration.',
      signInRequired: 'Sign in to access administration.',
    },
    adminUsers: {
      tabLabel: 'Accounts',
      intro: 'The accounts that use myBrief on this installation. Click an account to edit it.',
      searchPlaceholder: 'Search for a user…',
      createButton: 'New user',
      empty: 'No users.',
      colName: 'Name',
      colEmail: 'Email',
      colLastConnection: 'Last sign-in',
      neverConnected: 'Never',
      countOne: '1 user',
      countMany: '{count} users',
      countPartial: '{shown} of {total} users shown',
      showMore: 'Show more',
      roleAdmin: 'Administrator',
      roleUser: 'User',
      adminBadge: 'Admin',
      you: 'you',
      disabledBadge: 'Disabled',
      noPasswordBadge: 'SSO only',
      activeLabel: 'Active',
      activeToggle: 'Account active',
      activeHintOn: 'Disable this account: its open sessions will be closed.',
      activeHintOff: 'Re-enable this account.',
      activeSelfHint: 'You cannot disable your own account.',
      lastConnection: 'Last sign-in:',
      never: 'never',
      createTitle: 'New user',
      editTitle: 'Edit user',
      emailLabel: 'Email address',
      nameLabel: 'Display name',
      roleLabel: 'Role',
      passwordLabel: 'Initial password',
      passwordAuto: 'Leave empty to generate a password automatically.',
      mustChangeLabel: 'Require a password change on first sign-in',
      disabledLabel: 'Account disabled',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      back: 'Back to the list',
      resetPassword: 'Reset password',
      resetConfirm: 'Reset the password for {email}? Their active sessions will be closed.',
      generatedTitle: 'Password to hand over',
      generatedMessage: 'Write it down now: it will not be shown again.',
      copy: 'Copy',
      copied: 'Copied',
      close: 'Close',
      deleteButton: 'Delete',
      deleteAccount: 'Delete account',
      deleteTitle: 'Permanently delete this account',
      deleteMessage:
        'This deletes the account {email} along with all its meetings, personal templates and configuration. It cannot be undone.',
      deleteConfirmLabel: 'Type {email} to confirm',
      deleteConfirm: 'Delete permanently',
      groupsLabel: 'Group',
      groupsHint:
        'One group per account. Made an administrator, the account joins the administrators’ group; back to user, it leaves it for the default group.',
      groupFilterLabel: 'Filter by group',
      groupFilterAll: 'All groups',
      emptyForGroup: 'No users in this group.',
      errors: {
        email_taken: 'An account already exists with this address.',
        group_not_found: 'The chosen group no longer exists. Reload the page.',
        no_login_mode_left:
          'Cannot save: no sign-in method would remain shown on the sign-in page.',
        last_admin: 'Not possible: this is the last active administrator.',
        self_target: 'You cannot apply this action to your own account.',
        user_not_found: 'This account no longer exists.',
        invalid_body: 'Check the fields you filled in.',
        forbidden: 'You do not have the required permissions.',
        network: 'Server unreachable. Check your connection.',
        unknown: 'Something went wrong. Please try again.',
      },
    },
    adminGroups: {
      tabLabel: 'Groups',
      intro:
        "Sets of users: departments, teams, profiles. Every account belongs to exactly one group: the default one welcomes every new account, the administrators' one every account that becomes an administrator. A group can cap its members' meeting minutes.",
      counter: '{count} / {max}',
      createButton: '+ New group',
      loading: 'Loading…',
      empty: 'No groups.',
      defaultBadge: 'Default',
      defaultHint:
        'Every new account joins it, and an account removed from its group returns to it. It can be renamed, not deleted.',
      adminBadge: 'Administrators',
      adminHint:
        'Every account promoted to administrator joins it, and leaves it if demoted. It can be renamed, not deleted.',
      membersNone: 'No members',
      membersOne: '1 member',
      membersMany: '{n} members',
      noDescription: 'No description',
      openMembers: 'See the members of {name}',
      editTitle: 'Edit group',
      createTitle: 'New group',
      deleteButton: 'Delete',
      nameLabel: 'Group name',
      namePlaceholder: 'Sales, Management, Interns…',
      descriptionLabel: 'Description',
      descriptionPlaceholder: 'Optional: what this group is for, who belongs in it.',
      colorLabel: 'Colour',
      previewLabel: 'Preview',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      back: 'Back to groups',
      membersTitle: 'Members',
      addMemberLabel: 'Add a member',
      addMemberPlaceholder: 'Name or address…',
      addMemberHint: 'Type to search among the accounts of this installation.',
      addMemberNone: 'No account matches.',
      addMemberAllIn: 'Every account found is already in this group.',
      adding: 'Adding…',
      remove: 'Remove',
      removeLastHint: 'Removed from here, they return to “{default}”.',
      removeOnlyDefaultHint: 'One only leaves the default group by joining another group.',
      currentGroup: 'Currently in',
      noMembers: 'Nobody in this group yet. Add members above, or from each account’s details.',
      deleteTitle: 'Delete this group',
      deleteMessage: 'Delete “{name}”? Its members return to “{default}”. No account is deleted.',
      deleteConfirm: 'Delete the group',
      quotaLabel: 'Meeting minutes per month',
      quotaUnlimited: 'Unlimited',
      quotaLimited: 'Limited to',
      quotaUnit: 'min per month and per person',
      quotaMinutesLabel: 'Minutes per month',
      quotaHint:
        'Each member gets this quota for themselves: moving someone to another group changes their quota. Everyone sees their meter at the bottom of the left column.',
      quotaPill: '{minutes} min / month',
      quotaPillUnlimited: 'Unlimited',
      rightsLabel: 'Rights',
      infographicLabel: 'Generate infographics',
      infographicHint: 'Members can create the infographic of a meeting summary.',
      infographicPill: 'Infographics',
      aiHelpLabel: 'AI Help in meetings',
      aiHelpHint: 'Members can turn on AI Help during their meetings.',
      aiHelpPill: 'AI Help',
      aiHelpMyBrainLabel: 'AI Help with myBrain',
      aiHelpMyBrainHint:
        'These members’ AI Help reads the shared myBrain wiki — the same access for the whole group.',
      aiHelpMyBrainPill: 'AI Help + myBrain',
      infographicGlobalOff:
        'The AI models section does not offer infographics at the moment: this right will apply once they are turned on there.',
      peopleTitle: 'Users',
      peopleHint: 'Drag an account onto a group, or select it and then choose the group.',
      peopleSearch: 'Search accounts…',
      peopleEmpty: 'No accounts.',
      peopleTruncated: '{shown} of {total} accounts shown: search to find the others.',
      pickedHint: 'Choose a group for {name}.',
      dropHere: 'Drop here',
      dropRelease: 'Release to move',
      dropAdd: 'Move {name} here',
      dropAddTo: 'Move {name} to {group}',
      dropAlready: 'Already in this group',
      addedTo: '{name} is now in {group}.',
      errors: {
        quota_required: 'Enter a number of minutes, or choose “Unlimited”.',
        name_required: 'Give the group a name.',
        name_too_long: 'Name too long: {max} characters at most.',
        description_too_long: 'Description too long: {max} characters at most.',
        color_invalid: 'Pick a colour from the palette.',
        duplicate_name: 'A group already has this name.',
        limit_reached: 'Maximum number of groups reached ({max}).',
        group_not_found: 'This group no longer exists.',
        default_group: 'The default group cannot be deleted.',
        admin_group: 'The administrators’ group cannot be deleted.',
        user_not_found: 'One of the accounts no longer exists. Reload the page.',
        invalid_body: 'Check the fields you filled in.',
        forbidden: 'You do not have the required permissions.',
        network: 'Server unreachable. Check your connection.',
        unknown: 'Something went wrong. Please try again.',
      },
    },
    nativeRecording: {
      notifBody: 'Recording in progress…',
      mediaTitle: 'MyBrief - Recording',
      mediaAlbum: 'Meeting transcription',
    },
    offlineCapture: {
      startedOffline:
        '📡 Offline — audio is being recorded, transcription will catch up when the network returns',
      gapMarker: '⟨ Offline passage — transcription deferred until the network returns ⟩',
      markerAuthor: 'MyBrief',
      gapResolved: '✅ Offline passage transcribed and reinserted',
      interruptionMarker: '⟨ Recording interrupted for {duration} ⟩',
      lostMarker: '⟨ Offline passage not transcribed — the app closed first ⟩',
      pendingAtStop:
        '⏳ {count} offline passage(s) awaiting transcription — will upload automatically when the network returns, keep the app open',
    },
    buttons: {
      record: 'Record',
      stop: 'Stop',
      resume: '▶️ Resume',
      downloadAudio: 'Download audio',
      generateSummary: '✨ Generate summary',
      summaryGenerating: '⏳ Generating...',
      export: '📥 Export',
      downloadPDF: '📄 Download PDF',
      addAction: 'Add an action manually',
      hideAction: 'Hide action',
      newMeeting: '🔄 New meeting',
      hideTranscription: 'Hide transcription',
      showTranscription: 'Show transcription',
      help: 'Help',
      feedback: 'Report a bug or an idea',
      logout: 'Logout',
      close: 'Close',
      open: 'Open',
      start: 'Start',
      summarize: 'Summarize',
      saveMeeting: 'Save',
      generateArrow: 'Generate →',
      administration: 'Administration',
      myTemplates: 'My templates',
      myTags: 'My tags',
      configuration: 'Settings',
      adminShort: 'Admin',
    },
    sections: {
      summaryTitle: '📝 Summary',
      transcriptionTitle: '💬 Audio transcription',
      transcriptionSubtitle: 'Updates every 8 seconds',
      actionsTitle: '✅ Detected actions',
      actionsSubtitle: 'Editable',
      actionsHint: 'Speak explicitly about <b>actions</b> for them to appear here',
    },
    transcription: {
      defaultAuthor: 'Speaker',
      waiting: 'Waiting for transcription…',
      backToLive: 'Back to the live transcription',
      empty: 'No transcription yet.',
      editHint: 'Double-click to edit',
      // Naming the video-call participants (the “Visio” badge).
      speakers: {
        nameBadge: 'Name this participant',
        splitHere: 'Another participant from here on',
        title: 'Who is speaking here?',
        unidentified: 'unidentified',
        placeholder: 'Participant name…',
        apply: 'Name',
        everywhere: 'Everywhere “{name}” speaks',
        scopeHint: 'Otherwise, from here until the next change of voice.',
      },
    },
    statuses: {
      ready: 'Ready',
      requestingMicrophone: '🎤 Requesting microphone access...',
      requestingSystemAudio: '🖥️ Requesting system audio access (optional)...',
      connectingToServer: '🌐 Connecting to server...',
      recordingError: '❌ Recording error',
      noSystemAudio: 'No system sound detected, microphone capture only',
      systemDeviceMissing: 'Computer sound device not found, microphone capture only',
      systemDeviceIsMic: 'Computer sound is set to the microphone, microphone capture only',
      systemDeviceFailed: 'Computer sound unavailable, microphone capture only',
      systemDenied: 'System sound capture denied, using microphone only',
      systemUnsupported: 'System sound capture not supported by this browser',
      recordingUnavailable: 'Local recording unavailable on this browser',
      mixedStreamUnavailable: 'Combined audio stream unavailable',
      recorderPrepError: 'Error while preparing local recording',
      recordingInProgress: 'Recording in progress',
      recordingFinished: 'Recording finished',
      connectionLost: '⚠️ Connection lost, reconnecting...',
      connectionRestored: '✅ Connection restored',
      transcriptionInterrupted: '⚠️ Transcription interrupted, reconnecting...',
      transcriptionCreditExhausted: '❌ AI credit exhausted — transcription paused',
      transcriptionLimited: '⚠️ Transcription service temporarily throttled',
      captureResumed: '✅ Recording resumed after a {duration} interruption',
      // Replacement written in the notes, added to the account's "Replaced
      // words" (utils/noteLearning.js). {from} → {to}; {n}, {max}.
      replacementLearned:
        '✅ “{from}” will be replaced with “{to}” in your next meetings (Settings → During the meeting → Replaced words)',
      replacementsLearned:
        '✅ {n} replacements from your notes kept for your next meetings (Settings → During the meeting → Replaced words)',
      replacementsFull:
        '⚠️ Your replaced words are full ({max}): remove some in Settings → During the meeting → Replaced words so the next ones are kept',
      recordingInterrupted:
        '⚠️ Recording interrupted (call, other app) — tap the screen to resume it',
      summaryGenerating: 'Generating summary...',
      summaryReady: 'Summary generated',
      summaryError: 'Error while generating the summary',
      transcriptionSaved: '✅ Transcript saved',
      processingAudio: 'Processing audio file...',
      importingAudio: 'Importing audio',
      exported: 'Data exported',
      templateStatus: 'Template: {name}',
    },
    /** Summary editor toolbar + autosave indicator. */
    editor: {
      toolbarLabel: 'Summary formatting',
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      title: 'Title',
      subtitle: 'Subtitle',
      bulletList: 'Bullet list',
      orderedList: 'Numbered list',
      link: 'Hyperlink',
      linkHint: 'Select some text to create a link',
      linkUrlPlaceholder: 'Link address (https://…)',
      linkApply: 'Apply',
      linkRemove: 'Remove',
      clearFormatting: 'Clear formatting',
      saving: 'Saving…',
      saved: 'Saved',
      saveFailed: 'Not saved',
    },
    alerts: {
      incompatibleBrowser:
        '⚠️ Your browser does not support audio recording. Use a recent version of Chrome, Firefox, or Edge.',
      noTranscription: 'No transcription available to generate a summary',
      invalidAudioFile: 'Please select a valid audio file.',
      fileTooLarge: 'The file is too large. The maximum size is 25MB.',
      audioImportError: 'Error importing audio file: {error}',
      recordBusy:
        'The server is already transcribing other files. Try the import again in a minute.',
      audioTooLong:
        'This recording is too long to be transcribed in one go. Split it into parts under 5 minutes and import them one after the other.',
      audioImportEmpty:
        'The server returned an empty response. Check the API service and the OpenAI key.',
      audioImportNoSpeech:
        'No transcription found in the server response. Check that the audio file actually contains speech.',
      audioImportServer: 'Server error: {status} - {detail}',
      pdfGenerationError: 'Error generating PDF: {error}',
      summarySaveError: 'Saving the summary failed — your latest edits are not stored.',
      transcriptionSaveError: 'Saving the transcript failed — your latest edits are not stored.',
      historyLoadError: 'Unable to load history: {error}',
      meetingTitleError:
        'The meeting is saved, but its title could not be generated — rename it from the history.',
      micDenied:
        'Microphone blocked: allow it for MyBrief in your browser or phone settings, then start again.',
      micNotFound:
        'No microphone found. Plug one in, or pick another one in Settings → During the meeting → Microphone and sound, then try again.',
      micBusy: 'The microphone is already in use by another app. Close it, then try again.',
      recordingStartFailed: 'The recording could not start. Please try again in a moment.',
      notesActionsSaveError: 'Saving notes and actions failed — your latest edits are not stored.',
    },
    actions: {
      ownerLabel: '👤 Owner:',
      deadlineLabel: '📅 Due date:',
      descriptionLabel: '📝 Description:',
      ownerPlaceholder: 'To be decided',
      manualEditHint: 'Click to edit the description...',
      newBadge: 'NEW',
      countsLabel: 'Actions: {visible} visible · {hidden} hidden',
      actionPlaceholder: 'Action…',
      emptyMessage: 'Detected actions will appear here.',
      detectedTitle: 'Detected actions',
      listeningMessage: 'Listening for actions…',
      analysisLabel: 'Analyzing…',
      collapsePanel: 'Collapse actions',
      expandPanel: 'Show actions',
      hintLabel: 'How actions are detected',
      hint: 'Detected automatically as the meeting goes on, then refined sentence by sentence. Edit them or add your own freely: they travel with the summary. A hidden action leaves it, and comes back from “Hidden actions”.',
      hiddenToggle: 'Hidden actions ({count})',
      restoreAction: 'Restore',
      restoreActionLabel: 'Restore the action “{title}”',
      untitledAction: 'Untitled action',
    },
    notes: {
      title: 'Meeting notes',
      placeholder:
        'Your notes: key points, figures, decisions… woven into the summary.\nTo fix a name: “Replace Alexe with Alex”, or “SAL: support system for lenses”.',
      expandPanel: 'Expand notes',
      shrinkPanel: 'Shrink notes',
      hintLabel: 'How notes are used',
      hint: 'Your notes enrich the summary: key points, decisions and figures are woven in, even when they were never said out loud. To fix a mistranscribed name, be explicit — “Replace Alexe with Alex” — or define the acronym (“SAL: support system for lenses”). A merely mentioned name never replaces other names: only clearly garbled words (“Fabrican” → “Fabrikam”) fix themselves.',
    },
    ariaLabels: {
      newTab: 'new tab',
      resizeSummary: 'Adjust summary width',
      resizeColumns: 'Adjust columns width',
      openMenu: 'Open menu',
      searchMeeting: 'Search a meeting',
      goToLiveTranscription: 'Return to live transcription',
      deleteThisMeeting: 'Delete this meeting',
      generateSummary: 'Generate summary',
      saveMeeting: 'Save the meeting without a summary',
      recordingInProgress: 'Recording in progress',
      close: 'Close',
      closeModal: 'Close modal',
    },
    sidebar: {
      historyTitle: 'History',
      backHome: 'Back to home',
      home: 'Home',
      newMeeting: 'New meeting',
      searchPlaceholder: 'Search…',
      noMeetings: 'No meetings',
      defaultMeetingTitle: 'Meeting',
      titlePending: 'Naming in progress…',
      summaryWriting: 'Summary being written…',
      meetingOf: "{name}'s meeting",
      liveLabel: 'Meeting in progress',
      tagMenu: 'Tag',
      tagSelectLabel: 'Meeting tag',
      tagBack: 'Back',
      tagNone: 'No tag',
      tagManage: 'Manage tags…',
      tagNoneYet: 'No tag created yet',
      // Tag picker search — in the name AND the context of tags.
      tagSearch: 'Search tags',
      tagSearchCreate: 'Search or create a tag…',
      tagRecent: 'Recent',
      tagAll: 'All tags',
      tagNoMatch: 'No matching tag.',
      tagCreate: 'Create “{label}”',
      filterAll: 'All',
      filterUntagged: 'Untagged',
      filterLabel: 'Filter by tag',
      noMeetingsForTag: 'No meeting with this tag',
      filterHiddenOne: '1 meeting hidden by the filter',
      filterHiddenMany: '{n} meetings hidden by the filter',
      filterReset: 'Show all',
      tagline: 'Everyday assistant',
      groupThisWeek: 'This week',
      groupLastWeek: 'Last week',
      loading: 'Loading…',
      profile: 'Profile',
      rename: 'Rename',
      delete: 'Delete',
      resizeLabel: 'Resize the history',
      resizeHint: 'Drag to resize • Double-click to reset',
    },
    dock: {
      requestingMicShort: 'Mic access…',
    },
    quota: {
      title: 'Meeting time',
      renewal: 'Resets on 1 {month}.',
      groupHint: 'Quota of the {group} group: {limit} per month and per person.',
      blockedShort: 'Quota reached',
      exhaustedToast:
        'Your meeting minutes for this month are used up: they reset on 1 {month}. Your administrator can raise your group’s quota.',
      exhaustedLiveToast:
        'Your meeting minutes for this month are used up. Recording continues until you stop it, but you won’t be able to start another meeting before 1 {month}.',
      minutesOnly: '{m} min',
      hoursOnly: '{h} h',
      hoursMinutes: '{h} h {m} min',
    },
    myStats: {
      creditsTabLabel: 'Time credit',
      intro:
        "Your use of MyBrief: your meetings, recorded time and this month's time credit. Figures only, never what was said in your meetings.",
      rangeLabel: 'Period',
      ranges: { month: 'This month', 90: '3 months', 365: '12 months', all: 'All time' },
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      remainingOf: 'left of {limit}',
      exhaustedBig: 'Used up',
      exhaustedOn: 'Credit used up on {date}.',
      gaugeLabel: '{remaining} left of {limit}',
      legendLeft: 'What is left',
      legendPace: 'Steady pace: {value}',
      paceAlert: 'Faster than the month: at this pace, your credit will run out around {date}.',
      liveHint: 'Includes the meeting in progress.',
      unlimitedTitle: 'Unlimited time',
      unlimitedLine: '{time} recorded in {month}.',
      unlimitedHint: 'No time limit applies to your account.',
      kpiMeetings: 'Meetings',
      kpiMeetingsHint: '{total} since the start',
      kpiTime: 'Recorded time',
      kpiDeleted: '+ {time} from deleted meetings, still counted in the credit',
      kpiAverage: 'Average length',
      kpiAverageHint: 'Median {median} · longest {longest}',
      kpiSummaries: 'Summaries',
      kpiRegenerated: 'Including {count} regenerated',
      kpiRegeneratedOne: 'Including 1 regenerated',
      kpiNoRegeneration: 'No regeneration',
      kpiNoDuration: 'No length measured for this period',
      chartCredit: 'Through the month',
      chartCreditHint: 'What is left of your credit, day by day.',
      legendRemaining: 'Credit left',
      legendPaceLine: 'Steady pace',
      legendProjection: 'Projection',
      legendWeekend: 'Weekend',
      today: 'today',
      projectionLabel: 'runs out around {date}',
      colDay: 'Day',
      colUsedDay: 'Used that day',
      colRemaining: 'Left',
      chartTime: 'Recorded time',
      chartTimeHint: 'Hours recorded per period.',
      chartTemplates: 'Templates used',
      chartTemplatesHint: 'The template chosen for each summary.',
      chartWeekdays: 'Days of the week',
      chartWeekdaysHint: 'The days you record.',
      chartDurations: 'Meeting length',
      chartDurationsHint: 'How many meetings per length band.',
      templateUnknown: 'No template',
      colPeriod: 'Period',
      colTime: 'Time',
      colTemplate: 'Template',
      colMeetings: 'Meetings',
      empty: 'No meeting in this period.',
      partialDurations:
        'Some meetings have no recorded length: the measurement was added in August 2026. They count in the number of meetings, not in the lengths.',
      teamIntro:
        "Each account's time credit this month, most urgent first. A click opens their statistics: figures only, never what was said in their meetings.",
      allGroups: 'All groups',
      groupFilter: 'Filter by group',
      sumLimited: 'Accounts with a credit',
      sumLimitedValue: '{limited} of {accounts}',
      sumExhausted: 'Credit used up',
      sumAtRisk: 'Used up before 1 {month} at this pace',
      colAccount: 'Account',
      colCredit: 'Credit left',
      colPace: 'Pace',
      colLast: 'Last meeting',
      creditLine: '{remaining} of {limit}',
      unlimitedCell: 'Unlimited · {time} this month',
      paceExhausted: 'Used up on {date}',
      paceAlertShort: 'Runs out around {date}',
      paceOk: 'On pace',
      paceNone: 'No limit',
      noMeeting: 'No meeting',
      never: 'Never',
      teamEmpty: 'No account in this group.',
      back: 'All accounts',
      viewingTitle: "{name}'s statistics",
      viewingHint: 'What {name} sees in “My statistics”.',
      openAccount: "Open {name}'s statistics",
      errors: {
        user_not_found: 'This account no longer exists.',
        forbidden: 'For administrators only.',
        unknown: 'Statistics could not be loaded. Try again in a moment.',
      },
    },
    // Meeting AI Help (components/aiHelp/, stores/aiHelp.js). `{name}` is the
    // wake word set by the administration ("Alfred").
    aiHelp: {
      name: 'AI Help',
      setupSwitch: 'AI Help for this meeting',
      setupOn:
        '{name} follows the meeting and steps in in writing; a sound announces its alerts, its ideas and what it does for you.',
      setupOff: 'Off for this meeting.',
      setupNote:
        'Settings carried over from your last meeting. The project is recognised from the tag or from what is said. Everything changes in one click during the meeting.',
      setupNoteNoBrain:
        'Settings carried over from your last meeting. {name} relies on the meeting, your notes and the agenda. Everything changes in one click during the meeting.',
      domainsLabel: 'Areas of intervention',
      domains: {
        project: {
          title: 'Project guardrail',
          hint: 'Alerts when a decision contradicts the project.',
        },
        qa: {
          title: 'Questions & answers',
          hint: 'Answers your questions. Without them, {name} still does what you ask.',
        },
        agenda: { title: 'Agenda', hint: 'Keeps the items, recalls the forgotten ones.' },
        ideas: { title: 'Idea box', hint: 'Suggests a lead from time to time.' },
      },
      agendaLabel: 'Items to cover',
      agendaHint: 'one per line',
      agendaPlaceholder: 'Phase 2 progress\nRisks\nBudget',
      agendaVoiceHint:
        'Or announce them in the meeting — “on the agenda: …” — and {name} keeps them.',
      agendaEmpty: 'No item yet. Announce them aloud — “on the agenda: …” — or add one.',
      agendaAddLabel: 'Add an item to the agenda',
      agendaAddPlaceholder: 'Add an item…',
      agendaAdd: 'Add this item',
      agendaRemove: 'Remove “{point}” from the agenda',
      agendaHeard: 'Kept from what was said in the meeting',
      agendaEdit: 'Fix',
      agendaEvents: {
        noted: 'I have noted the agenda',
        closing: 'The meeting is ending: some items were not covered',
      },
      pillOn: 'AI Help is on — click to turn it off',
      pillOff: 'AI Help is off — click to turn it on',
      turnedOn: 'AI Help on',
      turnedOff: 'AI Help off',
      wakeSay: '“{name}, …”',
      wakeLabel: '“{name}”',
      wakeHint: 'To talk to it, start your sentence with “{name}”',
      domainsOpen: 'Choose what AI Help follows',
      domainsSome: 'Choose what AI Help follows — {on} of {total} areas on',
      ask: 'Ask',
      askTitle: 'Ask {name}',
      askLabel: 'Your question to {name}',
      askPlaceholder: 'Your question…',
      askLabelCommands: 'Your request to {name}',
      askPlaceholderCommands: 'A request: a tag, a note, a timer, a pause…',
      commandsOnly:
        'Questions & answers are off: {name} does not answer questions, but does what you ask.',
      askSend: 'Send the question',
      suggestions: [
        'Give me a summary',
        'Where is the agenda at?',
        'Which actions were decided?',
        'What did we forget?',
        'Any other ideas?',
      ],
      chatEmpty:
        'Ask {name} for a summary, the agenda, the actions, ideas — or to start a timer, pause, fix the transcript, write the minutes. Here, or aloud: “{name}, …”.',
      chatEmptyCommands:
        'Ask {name} to add a tag, take a note, start a timer, pause, fix the transcript or write the minutes. Here, or aloud: “{name}, …”.',
      settings: 'AI Help settings',
      soundMute: 'Mute AI Help for this meeting',
      soundUnmute: 'Unmute AI Help',
      soundLocked: 'The browser is blocking sound — click to enable it',
      soundMuted: 'Sound off',
      soundBack: 'Sound on',
      soundUnlocked: 'Sound enabled',
      openPreferences: 'Startup, sounds and voice for all your meetings →',
      voicePointsLeft: 'Points left: {points}',
      prefs: {
        intro:
          'What AI Help does in your meetings, before they even start. During a meeting, everything changes for that meeting only: the bell on its pill mutes it.',
        startTitle: 'When a meeting starts',
        startHint: 'AI Help and its areas as they are when each meeting opens.',
        startSwitch: 'AI Help on',
        startOff:
          'Your meetings start without it: its orb, in the bottom bar, turns it on in one click.',
        soundsTitle: 'Sounds',
        soundsHint: 'One sound per meaning, to know what is coming without looking at the screen.',
        sounds: {
          alerts: {
            label: 'Alerts',
            hint: 'Three rising notes: contradiction, reminder, points left out at the end.',
          },
          ideas: { label: 'Ideas', hint: 'A ring of a desk bell.' },
          actions: { label: 'Actions done', hint: 'Two short notes: understood, done.' },
          timer: {
            label: 'Timer end',
            hint: 'A short melody when the countdown reaches zero.',
          },
        },
        listen: 'Listen',
        listenTo: 'Listen to the “{label}” sound',
        voiceTitle: 'Voice',
        voiceHint: 'Read aloud what it writes. Muting it during a meeting silences the voice too.',
        voiceSwitch: 'Read aloud',
        readLabel: 'What it reads',
        read: { answers: 'Its answers', alerts: 'Its alerts and reminders', ideas: 'Its ideas' },
        engineLabel: 'Engine',
        engines: {
          browser: {
            label: 'Your browser',
            hint: 'Free, on your device: nothing leaves it. The voices are your system’s.',
          },
          openai: { label: 'OpenAI', hint: 'Natural voices, billed to your organization’s key.' },
          mistral: {
            label: 'Mistral',
            hint: 'Voxtral, billed to your organization’s Mistral key.',
          },
        },
        engineRetires: 'OpenAI retires these models on {date}.',
        enginesChecking: 'Checking the available voices…',
        enginesNote:
          'OpenAI and Mistral voices appear once your administrator has entered their key, and only after a successful trial.',
        engineGone: 'This engine is no longer offered: choose another one.',
        noBrowserVoice: 'This browser cannot read aloud.',
        modelLabel: 'Model',
        voiceLabel: 'Voice',
        voiceDefault: 'System default voice',
        otherLanguages: 'Other languages',
        sample: 'Hello, I am {name}. This is how I will read what I write during your meetings.',
        sampleSpeaking: 'Reading…',
        sampleDone: 'Voice tried.',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved',
        discard: 'Discard changes',
        errors: {
          voice_blocked: 'The browser is blocking sound: click in the page, then try again.',
          voice_unavailable: 'This voice is not available on this device.',
          voice_failed: 'The voice could not be played.',
          voice_unknown: 'This voice does not exist for this model.',
          voice_model_unknown: 'This voice model is not offered.',
          too_many_requests: 'Too many tries in a short time: try again in a moment.',
          ai_help_not_allowed: 'Your group no longer has access to AI Help.',
          default: 'Something went wrong. Try again.',
        },
      },
      close: 'Close',
      kinds: {
        alert: 'Contradiction',
        agenda: 'Agenda',
        idea: 'Idea',
        answer: 'Answer',
        project: 'Question',
        reminder: 'Reminder',
      },
      acts: {
        tag: 'Tag “{label}” set on the meeting.',
        tagMissing: 'None of your tags is called “{label}”: create it in My tags.',
        note: 'Note added: {text}',
        reminder: 'Reminder in {minutes} min: {label}',
        reminderBare: 'Reminder in {minutes} min.',
        timerStart: 'Timer started: {time}.',
        timerStartLabel: 'Timer started: {time} — {label}',
        timerAdd: 'Timer extended by {time}: {left} left.',
        timerCut: 'Timer shortened by {time}: {left} left.',
        timerStop: 'Timer stopped.',
        timerNone: 'No timer is running.',
        pause: 'Meeting paused. {name} can no longer hear you: use “Resume”, or ask in writing.',
        pauseNoop: 'The meeting is already paused.',
        resume: 'Meeting resumed.',
        resumeNoop: 'The meeting is not paused.',
        end: 'Meeting ended.',
        summaryNow: 'Meeting ended: minutes written with the “{template}” template.',
        summaryNowDefault: 'Meeting ended: minutes written.',
        summaryLater: 'Minutes ordered for the end of the meeting, with the “{template}” template.',
        summaryLaterDefault: 'Minutes ordered for the end of the meeting.',
        templateMissing: 'No template is called “{template}”: nothing was started.',
        replace: 'Transcript fixed: “{find}” replaced with “{with}”.',
        replaceAll: 'Transcript fixed: “{find}” replaced everywhere with “{with}”.',
        remove: 'Transcript fixed: “{find}” removed.',
        replaceMissing: '“{find}” is not in the transcript: nothing was changed.',
      },
      reminderTitle: 'Time for your reminder',
      timer: {
        left: 'Timer: {time} left',
        leftLabel: 'Timer “{label}”: {time} left',
        done: 'Time’s up',
        stop: 'Stop the timer',
        close: 'Close the timer',
      },
      askedByVoice: 'Asked out loud',
      askedInWriting: 'Asked in writing',
      thinking: '{name} is looking…',
      wakeMark: 'Question to {name}',
      acknowledge: 'Got it',
      acknowledged: 'Seen',
      dismiss: 'Put away',
      dismissLabel: 'Put this intervention away',
      othersOpenOne: '1 more intervention — see all',
      othersOpenMany: '{count} more interventions — see all',
      sizeUp: 'Make the window and its text bigger',
      sizeDown: 'Make the window and its text smaller',
      agendaStates: { done: 'Covered', now: 'In progress', todo: 'Not covered yet' },
      projectLabel: 'Meeting project',
      projectLinked: '{project} · myBrain',
      projectUnknown: 'Project to confirm',
      projectNone: 'No project',
      projectChange: 'Change',
      projectAskTitle: 'Which project is this meeting about?',
      projectAskBody: 'I cannot tell from the tag or from what is said. One click is enough.',
      projectNoneChoice: 'None of these',
      projectSearch: 'Search a project in myBrain',
      projectEmpty: 'No project sheet has that name.',
      tagLinkTitle: 'Link the “{tag}” tag to this project?',
      tagLinkBody:
        'Next meetings with this tag will start straight on “{project}”, without asking you.',
      tagRelinkBody:
        'This tag currently leads to “{linked}”. Link it to “{project}” instead? Next meetings with this tag will start on it.',
      tagLinkYes: 'Link',
      tagLinkNo: 'Not now',
      tagLinkFailed: 'The tag could not be linked. Try again.',
      openSheet: 'Open “{title}” in myBrain',
      stageLabel: 'AI Help intervention',
      notice: 'myBrain is not responding: {name} carries on with the meeting alone.',
      knowledgeNotes: {
        empty: 'myBrain has nothing on this question: answer drawn from the meeting.',
        down: 'myBrain did not respond: answer drawn from the meeting.',
        no_right:
          'Your group lacks the “AI Help with myBrain” right: answer drawn from the meeting.',
        no_key_right: 'The myBrain key lacks the “read” right: answer drawn from the meeting.',
      },
      noBrain:
        'Your account does not read myBrain: {name} answers from the meeting, your notes and your context.',
      noBrainReasons: {
        no_group_right:
          'Your group lacks the “AI Help with myBrain” right: {name} answers from the meeting, your notes and your context.',
        no_read_right:
          'The myBrain key lacks the “read” right: {name} answers from the meeting, your notes and your context.',
        not_connected:
          'myBrain is not connected to myBrief: {name} answers from the meeting, your notes and your context.',
      },
      notices: {
        mybrain_right_missing:
          'myBrain refuses read access to the myBrief key: {name} carries on with the meeting alone.',
        mybrain_key_rejected:
          'myBrain no longer recognises the myBrief key: {name} carries on with the meeting alone.',
        mybrain_timeout:
          'myBrain is taking too long to respond: {name} carries on with the meeting alone.',
        questions_off:
          'Questions & answers are off: {name} does not answer, but does what you ask — a tag, a note, a pause…',
      },
      errors: {
        default: '{name} could not answer. Try again.',
        network: 'Connection lost: the question was not sent.',
        too_many_requests: 'Too many questions in a short time. Try again in a moment.',
        ai_help_no_answer: '{name} found no answer.',
        ai_help_domain_off:
          'That is a question: {name} does not answer it, questions & answers are off.',
        ai_help_mybrain_not_allowed: 'Reading myBrain is not open to your account.',
        mybrain_unreachable: 'myBrain is not responding. Try again later.',
        mybrain_not_found: 'This sheet no longer exists in myBrain.',
      },
      tag: {
        title: 'Project in myBrain',
        hint: 'When a meeting carries this tag, AI Help knows which project it is about.',
        suggested: 'Suggested from the tag name',
        linked: 'Linked to this tag',
        none: 'No linked project. The AI will recognise it from what is said, or ask.',
        link: 'Link',
        unlink: 'Unlink',
      },
    },
    adminAiHelp: {
      tabLabel: 'AI Help',
      intro:
        'During a meeting, the AI follows what is said and steps in in writing: answers, alerts, ideas. Set here what the installation offers. Who uses it is decided in Groups.',
      domainsTitle: 'Areas of intervention on offer',
      domainsHint:
        'An area turned off here appears for no one. The others are on by default at the start of every meeting.',
      domains: {
        project:
          'Alerts when a decision contradicts the goal, scope or a deadline of the meeting’s project.',
        qa: 'Answers questions, out loud or in writing. With myBrain: the sheets. Without: the current meeting. When off, it can still be asked to act: tag, note, pause…',
        agenda:
          'Keeps the items to cover, announced in the meeting or added at the desk. Says whether they were covered, flags the ones being forgotten and, at the end, the ones never raised.',
        ideas: 'Suggests a lead or a question to consider from time to time.',
      },
      needsMyBrain: 'myBrain',
      domainLocked: 'Unavailable: the myBrain key lacks the “lire” (read) right.',
      wakeTitle: 'Wake word',
      wakeHint:
        'The first name participants give the AI to talk to it out loud: a question, or something to do.',
      wakeExample: 'In a meeting: “{name}, remind me of the delivery date?”',
      paceTitle: 'Spontaneous interventions',
      paceHint: 'What the AI flags on its own, without being called.',
      paces: {
        quiet: { label: 'Discreet', hint: 'Clear contradictions only, no ideas.' },
        normal: {
          label: 'Normal',
          hint: 'Contradictions, items being forgotten, one idea every ten minutes at most and, as the meeting ends, the items never raised.',
        },
        busy: {
          label: 'Frequent',
          hint: 'Also slight drifts, and one idea every five minutes at most — the AI shows up more often.',
        },
      },
      brainTitle: 'Reading myBrain',
      brainOk: 'Connection verified. The key has the “lire” (read) right.',
      brainNoRead:
        'The myBrain key lacks the “lire” (read) right: AI Help works without myBrain. If the key has just been granted it, “Test the connection” in the MyBrain tab reads it again; otherwise a myBrain administrator can issue a key that has it.',
      brainOff: 'myBrain is not connected: AI Help works without it (MyBrain tab).',
      brainScope:
        'AI Help reads the shared wiki on behalf of the application, not the person: every authorised account has the same access. The restricted areas of myBrain stay closed to it.',
      accessTitle: 'Who has access',
      accessNoneBadge: 'No one yet',
      accessBadgeOne: '1 group',
      accessBadgeMany: '{count} groups',
      accessNone:
        'No group has the “AI Help in meetings” right yet: no one sees it, you included. Grant it to a group in the Groups tab, under Rights.',
      accessSome: 'AI Help appears to the members of these groups. The others see nothing.',
      accessNotYou:
        'Your account is in none of these groups: you will not see it in your own meetings.',
      meOk: 'Your account: AI Help reads myBrain in your meetings.',
      meReasons: {
        no_group_right:
          'Your account has AI Help, but its group lacks the “AI Help with myBrain” right: in your meetings it will not consult myBrain.',
        no_read_right:
          'Your account has AI Help, but the myBrain key lacks the “read” right: in your meetings it will not consult myBrain.',
        not_connected:
          'Your account has AI Help, but myBrain is not connected to myBrief: it sticks to the meeting.',
      },
      accessWithBrain: 'with myBrain',
      accessOpenGroups: 'Open Groups',
      testTitle: 'Test the reading',
      testHint:
        'Ask a question as you would in a meeting: you see what myBrain returns to myBrief to answer it.',
      testPlaceholder: 'What is the … project?',
      testButton: 'Test',
      testing: 'Reading…',
      testContextOne: 'myBrain returned 1 sheet in {ms} ms:',
      testContextMany: 'myBrain returned {count} sheets in {ms} ms:',
      testContextNone:
        'myBrain returned no sheet for this question ({ms} ms). AI Help then falls back on the keyword search below.',
      testSearch: 'Keyword search “{keywords}”:',
      testSearchNone: 'no sheet found.',
      testNoKeywords: 'This question holds no keyword to search for.',
      testFailed: 'myBrain refused this reading: {reason}',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      errors: {
        default: 'The settings could not be saved.',
        network: 'Connection lost. Try again.',
        too_many_requests: 'Too many attempts in a short time. Try again in a moment.',
        mybrain_not_connected: 'myBrain is not connected: do it in the MyBrain tab.',
        mybrain_right_missing: 'the key lacks the “lire” (read) right.',
        mybrain_key_rejected: 'myBrain rejects the key.',
        mybrain_unreachable: 'myBrain cannot be reached from the myBrief server.',
        mybrain_timeout: 'myBrain did not respond in time.',
        mybrain_unavailable: 'this myBrain does not offer this reading.',
      },
    },
    meetingBar: {
      title: 'Meeting controls',
      notes: 'Notes',
      actions: 'Actions',
      pause: 'Pause',
      resume: 'Resume',
      end: 'End',
      pausedStatus: 'Paused — the meeting is not over yet',
      pausedShort: 'Paused',
      endTitle: 'End the meeting?',
      endSubtitle: 'Choose what to keep.',
      endSummarize: 'Summarize now',
      endSummarizeHint: 'Recording stops and the summary is written.',
      endSave: 'Save without a summary',
      endSaveHint:
        'The meeting is filed in the history with its notes and actions. The summary can wait.',
      endDelete: 'Delete the meeting',
      endDeleteHint: 'Nothing is kept.',
      endCancel: 'Cancel',
    },
    meetingResume: {
      dock: 'Resume',
      dockTitle: 'Resume recording: what follows is added to this meeting',
      cta: 'Resume recording',
      ctaTitle: 'What follows will be added at the end of this transcript',
      marker: '⟨ Recording resumed on {date} at {time} ⟩',
    },
    dockCard: {
      templateUsed: 'Template used',
      groupUserTemplates: 'My templates',
      templatesSection: 'Templates',
      instructionsLabel: 'Additional instructions',
      instructionsPlaceholder: 'In this area, you can provide additional information...',
      // Options of THIS generation: two switch tiles, under the page meter.
      // The number of actions shows next to the title.
      optionsSection: 'Add to the summary',
      actionsOption: 'Detected actions',
      actionsOptionHint: 'Listed in their own section',
      actionsOptionNone: 'No actions detected',
      infographicOption: 'Infographic',
      infographicOptionHint: 'An extra image of the meeting',
      cancel: 'Cancel',
      optional: 'optional',
    },
    // Page meter: the length of the ✨ AI summary, set in pages — slider of the
    // generation card (PageMeterSlider), template editor section, length shown
    // on the summary's tag. See src/lib/pageMeter.js.
    pageMeter: {
      name: 'Page meter',
      subtitle: 'Length of the ✨ AI summary, once laid out',
      sliderAria: 'Summary length, in pages',
      words: '≈ {n} words',
      reading: '{n} min read',
      extras: 'The layout’s title, details and actions come on top.',
      capNote:
        'Short meeting: beyond {max}, there would be nothing true left to write. The summary will stop around {max}.',
      capZone: 'Beyond: not enough material in this meeting',
      badgeTitle: 'Adjustable length (page meter) — {value}',
      pickerOff:
        'This template doesn’t offer the page meter: the summary’s length follows its directives.',
      tagTitle: 'Page meter — requested: {requested} · written: ≈ {measured}',
      editorToggle: 'Offer the page meter',
      editorHint:
        'When generating, everyone sets the length of the ✨ AI summary, from ¼ page to 10 pages. Choose where it starts.',
      editorOff: 'Off: the summary’s length only follows your directives.',
      editorDefault: 'Default position',
      editorPriority: 'The page meter overrides any length written in the directives.',
    },
    // Meeting infographic: floating thumbnail on the Summary tab, generation
    // animation, full-screen viewer (ResumeOverlays).
    infographic: {
      pendingLabel: 'Infographic in progress…',
      errorLabel: 'Infographic failed',
      errorHint:
        'The infographic could not be generated. Regenerate a summary with the Infographic option on to retry.',
      thumbAlt: 'Meeting infographic',
      openAria: 'View the infographic full size',
      title: 'Meeting infographic',
      download: 'Download the infographic',
      close: 'Close',
      regenerate: 'Regenerate the infographic',
      remove: 'Delete the infographic',
      shortLabel: 'Infographic',
      regenerateShort: 'Regenerate',
      removeShort: 'Delete',
      createInvite: 'Create an infographic',
      createInviteHint:
        "Generate this meeting's infographic — icons, charts, your organisation's logo — from the transcription, actions and notes.",
      removeConfirm:
        'Delete the infographic for this meeting? The meeting and its summary are untouched — you can generate a new one.',
      actionFailed: 'The infographic action failed. Please try again.',
      disabledError: 'Infographics are disabled by the administration.',
      notAllowedError: 'Your group does not allow you to create infographics.',
      downloadPreparing: 'Preparing the image…',
      zoomIn: 'Enlarge',
      zoomOut: 'Fit to screen',
      downloadFailed: 'The infographic image could not be prepared. Please try again.',
      sheet: {
        templates: {
          synthese: 'Overview',
          decision: 'Decision',
          feuille_de_route: 'Roadmap',
          tableau_de_bord: 'Dashboard',
          atelier: 'Workshop',
          bilan: 'Review',
        },
        logoAlt: 'Organisation logo',
        untitled: 'Meeting',
        essential: 'Key point',
        topics: 'Topics',
        ideas: 'Ideas',
        decision: 'Decision made',
        decisions: 'Decisions',
        otherDecisions: 'Other decisions',
        vigilance: 'Watch points',
        options: 'Options considered',
        retained: 'Chosen',
        pros: 'For',
        cons: 'Against',
        goal: 'Goal',
        milestones: 'Milestones',
        done: 'Done',
        upcoming: 'Upcoming',
        target: 'Goal',
        indicators: 'Indicators',
        breakdown: 'Breakdown',
        ofTarget: '{pct} of {target}',
        targetLabel: 'target {value}',
        before: 'before',
        now: 'now',
        question: 'The question',
        ideaOne: 'idea',
        ideaMany: 'ideas',
        themeOne: 'theme',
        themeMany: 'themes',
        retainedOne: 'chosen',
        retainedMany: 'chosen',
        retainedIdeas: 'Chosen ideas',
        voteOne: '{count} vote',
        voteMany: '{count} votes',
        nextSteps: 'Agreed next steps',
        verdict: 'In short',
        worked: 'What worked',
        struggled: 'What got stuck',
        tryNext: 'To try',
        actions: 'Actions',
        moreActionOne: '+ 1 more action in the summary',
        moreActionMany: '+ {count} more actions in the summary',
        participants: 'Participants',
        morePeopleOne: 'and 1 other',
        morePeopleMany: 'and {count} others',
        nextStep: 'Next step',
        madeWith: 'myBrief',
        appLogoAlt: 'Application logo',
        tagLogoAlt: 'Client or project logo',
      },
    },
    tagsPanel: {
      title: 'My tags',
      close: 'Close',
      intro:
        'A tag sorts your conversations by client, project or topic. It can also tell the AI what they are about, where their reports are filed and who receives them.',
      loading: 'Loading…',
      empty: 'No tag yet. Create one to start sorting your conversations.',
      add: 'New tag',
      labelField: 'Name',
      labelPlaceholder: 'Acme Corp',
      colorField: 'Colour',
      colorNames: {
        slate: 'Slate grey',
        brown: 'Brown',
        red: 'Red',
        orange: 'Orange',
        amber: 'Amber',
        lime: 'Lime',
        green: 'Green',
        teal: 'Teal',
        sky: 'Sky blue',
        blue: 'Blue',
        navy: 'Navy',
        violet: 'Violet',
        fuchsia: 'Fuchsia',
        pink: 'Pink',
        'blue-stripes': 'Blue stripes',
        'red-stripes': 'Red stripes',
        'green-spots': 'Green spots',
        'amber-spots': 'Amber spots',
        'violet-ring': 'Violet ring',
        'teal-ring': 'Teal ring',
        'navy-orange': 'Half navy, half orange',
      },
      hueField: 'Custom colour',
      hueSlider: 'Hue angle',
      lightnessSlider: 'Lightness',
      shapeField: 'Shape',
      shapeNames: {
        circle: 'Circle',
        square: 'Square',
        diamond: 'Diamond',
        triangle: 'Triangle',
        hexagon: 'Hexagon',
        star: 'Star',
        heart: 'Heart',
      },
      save: 'Save',
      cancel: 'Cancel',
      deleteTitle: 'Delete this tag?',
      deleteBody:
        'The tag "{label}" will be deleted. Conversations carrying it are not deleted — they simply lose their tag.',
      deleteBodyCount:
        'The tag "{label}" will be deleted and {count} conversation(s) will lose their sorting. No conversation is deleted.',
      confirmDelete: 'Delete',
      // ── The page: a list on the left, the chosen tag's sheet on the right ──
      counterOne: '{n} tag out of {max}',
      counterMany: '{n} tags out of {max}',
      searchLabel: 'Search a tag',
      searchPlaceholder: 'Name, person, acronym…',
      searchEmpty: 'No tag matches.',
      taggedOne: '1 conversation',
      taggedMany: '{n} conversations',
      taggedNone: 'No conversation',
      // Legend of a row's two icons: the tag's OWN rule.
      legendFolder: 'has its own folder',
      legendMail: 'has its own recipients',
      commonTitle: 'Shared settings',
      commonHint: 'For tags without their own rule',
      // A tag's sheet.
      ficheCountOne: '1 conversation carries this tag',
      ficheCountMany: '{n} conversations carry this tag',
      ficheCountNone: 'No conversation carries this tag yet',
      inHistory: 'In the history',
      appearance: 'Name and look',
      removeTag: 'Delete the tag',
      back: 'My tags',
      savedHint: 'Every choice is saved right away.',
      // ── In-place name, quick dot ──
      rename: 'Rename',
      pastille: 'Colour and shape',
      pastilleMore: 'Patterns and custom colour…',
      // ── Client or project logo ──
      logoQuestion: 'Which logo on its documents?',
      logoWhen:
        'The client’s or the project’s: as a medallion on the infographic, at the top of the PDF report, and in this list.',
      logoDrop: 'Drop a logo',
      logoBrowse: 'or click to choose it · PNG, JPG, SVG',
      logoReplace: 'Replace…',
      logoRemove: 'Remove',
      logoAlt: 'Logo of the “{tag}” tag',
      logoSaving: 'Uploading logo…',
      logoSaveError: 'Could not save the logo. Try again.',
      // ── Filing and sending, folded ──
      ruleEdit: 'Change',
      ruleClose: 'Close',
      peopleMore: '+ {n}',
      // ── Context — what the AI should know about the matter (lib/tagContext.js) ──
      contextQuestion: 'What should the AI know?',
      contextWhen:
        'The project, its people and their roles, the acronyms: what it takes to understand a conversation tagged “{tag}”.',
      contextPlaceholder:
        'E.g. head-office renovation, handover in June. People: Claire Martin, client; Hugo Bernard, engineering firm. Acronyms: HP = heat pump.',
      contextReadBy: 'Read by',
      contextReaders: {
        summary: 'Report',
        transcript: 'Transcript',
        infographic: 'Infographic',
        aiHelp: 'AI Help',
      },
      contextCount: '{n} / {max}',
      contextSaving: 'Saving…',
      contextSaved: 'Saved',
      contextGuard:
        'The AI uses it to understand who is who and what the acronyms mean. It does not copy it into the report as if it had been said in the meeting.',
      contextSaveError: 'Could not save this text. Try again.',
      // ── Filing — the tag → "Store" action link ──
      folderQuestion: 'Where should its reports go?',
      folderWhen: 'When you choose “Store” after a conversation tagged “{tag}”.',
      folderDefaultTitle: 'With the other reports',
      folderDefaultAuto: 'In a folder named after it, created on the first upload:',
      folderDefaultRoot: 'Straight into your main folder:',
      folderCustomTitle: 'In a folder I choose',
      folderNone: 'No folder chosen yet.',
      folderChoose: 'Choose a folder…',
      folderChange: 'Change folder',
      rootAdmin: 'Folder set by your administrator',
      storageClosed:
        'File storage is disabled by your organisation. Destinations stay saved and will apply if it reopens.',
      storageNotConnected:
        'Connect your Google or Microsoft account (Settings → Connected accounts) to pick folders.',
      storageDriveMissing:
        'Your account is connected without file access. Connect it again from Settings → Connected accounts to allow storage.',
      storageSaveError: 'Could not save the destination. Try again.',
      // ── Sending — the tag → "Send by email" action link ──
      mailQuestion: 'Who should receive its reports?',
      mailWhen: 'When you choose “Send by email” after a conversation tagged “{tag}”.',
      mailDefaultTitle: 'The usual recipients',
      mailDefaultNow: 'Currently: {who}.',
      mailCustomTitle: 'Specific people',
      mailCustomHint: 'They receive the report instead of your usual recipients. You stay in copy.',
      mailNone: 'Nobody yet.',
      mailChoose: 'Choose people…',
      mailEdit: 'Edit the list…',
      mailClosed:
        'Email sending is disabled by your organisation. Lists stay saved and will apply if it reopens.',
      recipientsSelfOnly: 'you only',
      recipientsDefaultOne: 'you + 1 address',
      recipientsDefaultMany: 'you + {n} addresses',
      // ── Shared settings: what "with the others" and "usual" mean ──
      commonIntro:
        'They apply to every tag set to “With the other reports” or “The usual recipients”.',
      rootTitle: 'Main folder',
      rootEdit: 'Change in Storing',
      defaultRecipientsTitle: 'Usual recipients',
      defaultRecipientsEdit: 'Change in Email sending',
      // ── Creating and editing (TagForm) ──
      newHint: 'A name and a badge are enough. Filing and sending are set next, in its sheet.',
      creating: 'Being created',
      create: 'Create the tag',
      moreColors: 'More choices: patterns and custom colour',
      preview: 'Preview',
      previewHistory: 'In the history',
      previewHeader: 'At the top of a conversation',
      previewMeeting: 'Your meeting',
      editableHint: 'Name, colour and shape can be changed at any time.',
      // Error messages, keyed by the slug returned by the API.
      errors: {
        duplicate_label: 'You already have a tag with this name.',
        limit_reached: 'Limit reached: {max} tags maximum.',
        label_required: 'Give the tag a name.',
        label_too_long: 'Name too long ({max} characters maximum).',
        color_invalid: 'Unknown colour.',
        shape_invalid: 'Unknown shape.',
        context_too_long: 'Text too long ({max} characters maximum).',
        logo_invalid: 'This file is not an image: choose a PNG, JPG or SVG.',
        logo_too_big: 'Image too heavy for a logo: choose a simpler one.',
        logo_unreadable: 'Unreadable image: try another file.',
        tag_not_found: 'This tag no longer exists. Reload the page.',
        meeting_not_found: 'This conversation could not be found.',
        network: 'Cannot complete this right now. Try again.',
      },
    },
    userTemplatesPanel: {
      // Icons (title, sections, buttons) are SVGs owned by the component,
      // as in the administration panel: no more emoji in the texts.
      title: 'My templates',
      close: 'Close',
      loading: 'Loading…',
      empty: 'No personal template yet. Click "Add" to create one.',
      sectionIdentity: 'Identity',
      sectionDirectives: 'AI directives',
      sectionScaffold: 'Output layout',
      directivesHint:
        'Describe what the AI should produce in the ✨ AI summary block — the main summary of your output (style, content, length).',
      directivesPlaceholder:
        'e.g. Summarize the exchange in 50 words max, focus on decisions made and actions to take.',
      scaffoldHint:
        'The skeleton of your output. It always contains the ✨ AI summary (defined by your Directives) — move it wherever you want, add extra summaries (20 words, 100 words, key points) and the meeting info. Everything else appears as-is.',
      scaffoldHelp:
        'Your output can contain one or more summaries. The ✨ AI summary is the main one: always present, it follows your Directives above — move it around, it cannot be removed. The ⚡ 20-word summary, 📃 100-word summary and 🎯 Key points pills add extra summaries, independent of the Directives. Also insert the meeting info (date, author, actions…) wherever you want. The rest of the text (headings, lines, formatting) stays as-is.',
      scaffoldPlaceholder:
        '# Meeting notes — {{date}}\n*Author: {{author}} — Duration: {{duration}}*\n\n## Summary\n\n{{résumé}}\n\n## Actions to take\n\n{{actions}}',
      fieldIcon: 'Icon',
      nameLabel: 'Template name',
      namePlaceholder: 'e.g. Sales summary',
      addEnVersion: '+ add French version',
      hideEnVersion: '− remove French version',
      fieldLabelEn: 'Name (French)',
      fieldLabelEnPlaceholder: 'ex: Synthèse commerciale',
      slugHint: 'Identifier: {slug}',
      insertVariableHint:
        'Click to insert an info that MyBrief will replace automatically in the summary.',
      varGroupAi: 'AI blocks',
      varGroupMeta: 'Meeting info',
      varAlreadyInserted:
        'Already in the layout — only one instance allowed. Move the pill directly in the text.',
      formatBold: 'Bold',
      formatItalic: 'Italic',
      formatUnderline: 'Underline',
      formatH1: 'Heading 1',
      formatH2: 'Heading 2',
      formatDragBlock: 'Move block',
      formatHint: 'Select some text then click to format it.',
      helpAria: 'Show help',
      previewLabel: 'Preview (with sample data)',
      starterPickerTitle: 'Start from a template',
      starterPickerSubtitle: 'Pick a starting point — you can edit everything afterwards.',
      starterFromScratch: 'Start from scratch',
      starterFromTemplate: 'Inspired by {name}',
      starterPickerCancel: 'Cancel',
      copySuffix: '(copy)',
      save: 'Save',
      cancel: 'Cancel',
      backToList: 'Back to list',
      delete: 'Delete',
      add: 'Add a template',
      pickTitle: 'No template selected',
      pickHint: 'Pick a template from the list to edit it, or create a new one.',
      pickHintEmpty: 'Create your first template — it will then show up in the list.',
      limitReached: '5-template limit reached. Delete one to create a new one.',
      limitReachedServer: '5-template limit reached on the server.',
      confirmDelete: 'Delete the template "{name}"?',
      saveSuccess: '"{name}" saved.',
      saveError: 'Error {status} while saving.',
      fetchError: 'Error {status} while loading templates.',
      networkError: 'Network error: {message}',
      errorNameRequired: 'Template name is required.',
      errorValueRequired: 'Template name is required.',
      errorValueInvalid: 'The name cannot be empty or made only of special characters.',
    },
    modals: {
      deleteMeetingTitle: 'Delete the meeting?',
      deleteFromHistoryBody: 'This meeting will be permanently removed from history.',
      deleteCurrentBody: 'The current recording and transcription will be permanently deleted.',
      cancel: 'Cancel',
      confirmDelete: 'Delete',
      deleteVersionTitle: 'Delete {label}?',
      deleteVersionFallback: 'this version',
      deleteVersionBody:
        'This version of the summary will be deleted. The other versions are kept.',
      resumeInterruptedTitle: 'Meeting interrupted',
      resumeInterruptedBody:
        'Recording stopped before the meeting ended. The transcript, notes, actions and timer are kept. Resume where it stopped?',
      endInterrupted: 'End the meeting',
      resume: 'Resume',
    },
    configActions: {
      tabLabel: 'Actions',
      afterSummaryTitle: 'After the first summary',
      afterSummaryHint:
        'A window offers to file the meeting, send the summary by email and store it, in one go.',
      afterSummaryToggle: 'Offer these actions after the first summary',
      intro: 'What becomes of your minutes: who receives them, where they land, under what name.',
      recipientsTitle: 'Recipients',
      recipientPlaceholder: 'name@example.com',
      recipientAdd: 'Add',
      remove: 'Remove',
      recipientInvalid: 'This address does not look valid.',
      recipientRejected: 'Rejected addresses: {list}',
      recipientsTooMany: '{max} recipients maximum.',
      alwaysCopied:
        'You are always in copy, no matter what. Leave the list empty to receive it yourself only.',
      alwaysCopiedShort: 'You stay in copy, no matter what.',
      // Recipients per tag — a tag's list REPLACES the default list.
      tagRecipientsTitle: 'Recipients per tag',
      tagRecipientsIntro:
        'A tag may have its own recipients. They replace the list above for the conversations carrying it.',
      tagRecipientsDefault: 'Default list',
      tagRecipientsEdit: 'Edit…',
      tagRecipientsDialogTitle: 'Tag recipients',
      tagRecipientsDialogHint:
        'These addresses replace your default list for conversations carrying this tag — they are not added to it.',
      tagRecipientsEmptyNote: 'Without any address, this tag follows your default list.',
      tagRecipientsCancel: 'Cancel',
      tagRecipientsApply: 'Apply',
      forTag: '{message} (tag "{tag}")',

      folderTitle: 'Storage folder',
      folderPlaceholder: 'E.g.: Clients/Acme/Minutes',
      folderHint: 'Left empty, myBrief uses the folder set by your administrator.',
      browse: 'Browse…',
      libraryLabel: 'Library:',
      approvalLabel: 'Ask me to confirm before every upload',
      approvalHint: 'A window recaps the target folder and the file name before anything leaves.',
      tagSubfoldersLabel: 'One subfolder per tag',
      tagSubfoldersHint:
        'A tagged conversation lands in "storage folder / tag name", created when needed.',
      tagFoldersTitle: 'Destinations per tag',
      tagFoldersIntro: 'A tag can target its own folder — including in another library.',
      tagFoldersEmpty: 'No tags yet. Create some from the "My tags" panel.',
      tagFolderAuto: 'Subfolder "{tag}"',
      tagFolderDefault: 'Storage folder',
      tagFolderReset: 'Reset',
      folderDriveRoot: 'Library root',

      pickerTitle: 'Choose a folder',
      pickerClose: 'Close',
      pickerLibrary: 'Library',
      pickerRoot: 'Root',
      pickerUp: 'Up',
      pickerSearch: 'Search for a folder…',
      pickerSearchGo: 'Search',
      pickerSearchResults: 'Search results',
      pickerNoResult: 'No folder found.',
      pickerEmpty: 'No subfolder here.',
      pickerLoading: 'Loading…',
      pickerNewFolder: 'New folder…',
      pickerCreate: 'Create',
      pickerSelection: 'Selection:',
      pickerConfirm: 'Choose this folder',
      pickerSharedDrivesMissing:
        'Your shared drives are not listed here: your account was connected before myBrief could list them. Reconnect it from “Settings → Connected accounts” to see them. My Drive and storage keep working.',
      // Same server flag, Microsoft side: SharePoint sites are the ones missing,
      // for lack of the "Sites.ReadWrite.All" permission. A directory that
      // REFUSES it never gets here — Entra refuses the whole connection
      // (see lib/connections/providers.js). Only connections made before it was
      // added see this message.
      pickerSharedSitesMissing:
        'Your SharePoint libraries are not listed here: your account was connected before myBrief requested the "Sites.ReadWrite.All" permission. Reconnect it from “Settings → Connected accounts” to see them. Your OneDrive and storage keep working.',
      pickerMore: 'Show more',
      browseErrors: {
        browse_scope_missing:
          'Your account was linked before this window existed: reconnect it to browse your folders. Uploading still works.',
        storage_not_connected: 'Link your account to browse your folders.',
        storage_scope_missing: 'Reconnect your account to allow uploads.',
        storage_not_configured: 'No storage provider configured by your administrator.',
        storage_auth_revoked: 'Access was revoked. Reconnect your account.',
        folder_name_invalid: 'A folder name cannot contain "/".',
        browse_failed: 'Cannot read your folders right now.',
      },

      approvalTitle: 'Upload this document?',
      approvalFolder: 'Folder',
      approvalDefaultFolder: 'Default folder',
      approvalTag: 'Tag',
      approvalAccount: 'Account',
      approvalFile: 'File',
      approvalCancel: 'Cancel',
      approvalConfirm: 'Upload',

      subjectLabel: 'Email subject',
      subjectPlaceholder: 'E.g.: Minutes {{titre}} — {{date}}',
      filenameLabel: 'File name',
      filenamePlaceholder: 'E.g.: {{date}}-{{titre}}',
      templateHint:
        'The extension is added automatically. Left empty, myBrief names files as usual.',
      variablesLabel: 'Insert:',
      previewLabel: 'Preview:',
      templateUnknown: 'Unknown variables: {list}',
      sampleTitle: 'Client review',
      sampleDate: '2026-08-09',
      sampleType: 'Summary',
      sampleAccount: 'you@example.com',

      testEmail: 'Test sending',
      testStorage: 'Test storage',
      testRunning: 'Testing…',

      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      loadError: 'Could not load your settings.',
      saveError: 'Could not save. Please try again shortly.',

      // ── Linked account (header banner) ───────────────────────────────────
      connectTitle: '{provider} account',
      connectedHint: 'Your mail leaves from {account}, and your files land there.',
      // `{drive}`: "Google Drive" or "OneDrive" depending on the chosen provider
      // (see utils/storageVocabulary.js).
      notConnectedHint:
        'Link your account to send from your own mailbox and store in your own {drive}.',
      connectCta: 'Link my {provider} account',
      reconnectCta: 'Reconnect my account',
      reconnectWhy:
        'Your account is linked but does not allow file storage: it was linked before that access existed. Reconnect it to grant it.',
      connectDesktopOnly:
        'Linking an account happens in the browser. Open myBrief on your computer.',
      connectUnavailable:
        'No {provider} account is configured on this installation. Contact your administrator.',
      connectSmtpFallback:
        'Without a linked account, your mail leaves from the server relay — and you are then its only recipient.',
      connectedBadge: 'Connected',
      notConnectedBadge: 'Not connected',
      driveMissingBadge: 'Storage not allowed',

      // ── Cards, one per action ────────────────────────────────────────────
      mailCardTitle: 'Send by email',
      mailCardHint: 'Who receives your minutes, and under what subject.',
      mailViaAccount: 'via your account',
      mailViaServer: 'via the server relay',
      storageCardTitle: 'Store',
      storageCardHint: 'Where your documents land in your {drive}.',
      filenameCardTitle: 'File naming',
      filenameCardHint:
        'Applies to sent, stored and downloaded documents. Click a variable to insert it.',
      ceilingClosedTitle: 'Nothing to configure',
      mailClosedBody:
        'Your administrator has not enabled sending by email. File naming remains adjustable below.',
      storageClosedBody:
        'Your administrator has not enabled document storage. File naming remains adjustable below.',

      // ── Saving ───────────────────────────────────────────────────────────
      unsavedHint: 'Unsaved changes',
      discardChanges: 'Discard',
      // One label per target: two side-by-side "Save and test" buttons would not
      // say which one sends an email and which one stores a file.
      saveAndTestEmail: 'Save and test sending',
      saveAndTestStorage: 'Save and test storage',

      // ── Test diagnosis ───────────────────────────────────────────────────
      testStale: 'This result predates your changes. Save, then run the test again.',
      testVia: 'Transport',
      testFrom: 'Sender',
      testTo: 'Recipients',
      testSubject: 'Subject',
      testProvider: 'Provider',
      testFolder: 'Folder',
      testFilename: 'File',
      testCacheUsed: 'Folder reused without a new lookup',
      sourceUser: 'your settings',
      sourceAdmin: 'organisation setting',
      sourceBuiltin: 'built-in value',
      sourceAccount: 'your account',
      sourceDefault: 'default folder',
      sourceTag: 'tag setting',

      // ── Server error slugs ───────────────────────────────────────────────
      // Every message names the GESTURE: "reconnect" and "contact your
      // administrator" are not fixed in the same place, and a single message
      // would force opening the server logs to know which one applies.
      errors: {
        action_disabled: 'this action is disabled by your administrator.',
        mailer_disabled:
          'no sending method is available. Link your account, or contact your administrator.',
        mail_send_failed: 'sending was refused. Please try again shortly.',
        gmail_disconnected:
          'your account no longer allows sending. Reconnect it from the banner above.',
        storage_not_configured: 'no storage provider is chosen. Contact your administrator.',
        storage_not_connected: 'your account is not linked. Link it from the banner above.',
        storage_scope_missing:
          'your account does not allow file storage. Reconnect it from the banner above.',
        storage_auth_revoked:
          'access to your storage was revoked. Reconnect your account from the banner above.',
        storage_upload_failed: 'storage was refused. Please try again shortly.',
        attachment_too_large: 'the document is too large to attach.',
        bad_origin: 'request refused. Reload the page and try again.',
        forbidden: 'you do not have access to this action.',
        invalid_body: 'settings refused by the server.',
        network: 'the server is unreachable. Check your connection.',
        unknown: 'unexpected error.',
      },
    },
    profile: {
      intro: 'Your identity in myBrief, and your language.',
      identityTitle: 'Identity',
      nameLabel: 'Name',
      emailLabel: 'Email address',
      languageTitle: 'Language',
      languageHint:
        'The language of the interface, and also of transcription, detected actions and summaries.',
      securityTitle: 'Password',
      securityHint: 'Your account signs in with a password: change it here.',
    },
    config: {
      title: 'Settings',
      audioSection: 'Microphone',
      audioIntro:
        'The microphone chosen here applies to this device only: a device id has no meaning from one machine to another.',
      audioLabel: 'Sound input channel.',
      audioDeviceLabel: 'Device',
      audioDeviceHint:
        'Saved immediately. If the microphone is unavailable when recording starts, the system default takes over.',
      audioDefault: 'System default microphone',
      audioPermissionHint: 'Allow microphone access to see device names.',
      audioPermissionBtn: 'Allow microphone',
      audioNoDevice: 'No microphone detected.',
      systemAudioSection: 'Computer sound',
      systemAudioLabel: 'Second channel: the video call, a video, an app',
      systemAudioIntro:
        'Firefox and Safari do not share screen audio: without this setting, myBrief only records your microphone there. To also record the other side of a video call or the sound of an app, install a virtual audio device (BlackHole on Mac, VB-CABLE or “Stereo Mix” on Windows), then choose it here.',
      systemAudioDeviceLabel: 'Device',
      systemAudioNone: 'None: microphone only',
      systemAudioHint:
        'It opens alongside the microphone when you start a “Video meeting”. The choice is saved for this device.',
      systemAudioMissing:
        '“{device}” cannot be found on this computer: plug it back in, reinstall it, or choose another one.',
      systemAudioIsMic:
        'This device is also your microphone: myBrief will not open it twice. Choose another one here, or another microphone above.',
      systemAudioTest: 'Test the sound',
      systemAudioTesting: 'Listening…',
      systemAudioTestHint: 'Play a video or some music on the computer: the gauge should move.',
      systemAudioHeard: 'Sound received: myBrief will hear the video call and apps.',
      systemAudioSilent:
        'No sound received. Check that the computer was playing something, and that its audio output goes through this device.',
      systemAudioFailed:
        'This device could not be opened. Allow microphone access, or choose another one.',
      contextSection: 'My context',
      detectionSection: 'Action detection',
      correctionsSection: 'Replaced words',
      contextHint: 'Sent before every summary generation.',
      contextIntro:
        'This text is sent before every summary generation to provide your context (job, company, role, useful information…).',
      contextPlaceholder:
        'E.g. I am Sales Manager at Acme. My meetings are often about B2B opportunities. My manager is…',
      groupAccount: 'My account',
      profileSection: 'My profile',
      aiSection: 'AI preferences',
      aiHelpSection: 'AI Help',
      audioNav: 'Microphone and sound',
      groupMeetings: 'My meetings',
      meetingSection: 'During the meeting',
      actionsSection: 'After the meeting',
      aiElsewhere:
        'Action detection and replaced words are set with everything that plays out in a meeting.',
      aiElsewhereLink: 'Open “During the meeting”',
      usageSection: 'Usage & credits',
      actionMailSection: 'Email sending',
      actionStorageSection: 'Storing',
      groupLibrary: 'My library',
      toolsSection: 'Tools',
      importSection: 'Import audio',
      importIntro:
        'Turn an existing recording into a summary: pick an audio file, MyBrief transcribes then summarises it like a meeting.',
      importCta: 'Choose an audio file',
      importFormats:
        'All common audio formats (mp3, m4a, wav, webm…). Processing starts as soon as the file is picked.',
      extensionSection: 'Chrome extension',
      extIntro:
        'An icon in the Chrome toolbar: one click opens MyBrief, another starts a meeting — wherever you are on the web. Nothing changes inside MyBrief itself.',
      extStateInstalled: 'Extension installed and linked to this site',
      extStateVersion: 'version {version}',
      extStateOutdated: 'A new version of the extension is available',
      extStateOutdatedHint:
        'Version {version} installed, {latest} available. Loaded from a folder, the extension does not update itself.',
      extUpdateZip: 'Download the new version (.zip)',
      extUpdateHint:
        'Unzip it into the "mybrief-extension" folder already installed, replacing its files — its location is shown on the MyBrief card in chrome://extensions. Then click ↻ on that card. Unzipped anywhere else, it would become a second extension, to link again.',
      extStateMissing: 'Extension not detected in this browser',
      extStateMissingHint:
        'Follow the steps below. Once the extension is linked, this line turns green by itself.',
      extBrowserNote:
        'The extension exists for Chrome and the browsers built on it (Edge, Brave…). On Firefox or Safari, MyBrief opens as usual, without the extension.',
      extFigure: {
        alt: 'The extension menu: logo, status, New meeting button, Open MyBrief button.',
        status: 'Signed in',
        primary: 'New meeting',
        secondary: 'Open MyBrief',
        links: ['History', 'Settings'],
      },
      extInstallTitle: '1. Install',
      extInstallStore: 'Add to Chrome',
      extInstallStoreHint:
        'Opens in the Chrome Web Store. Click "Add to Chrome", confirm, then pin the icon: puzzle piece right of the address bar, pin next to MyBrief.',
      extInstallZip: 'Download the extension (.zip)',
      extInstallZipHint:
        'Not on the Chrome Web Store yet: Chrome loads it from a folder, in four steps.',
      extInstallZipSteps: [
        {
          label: 'Download the file and unzip it',
          hint: 'A "mybrief-extension" folder appears. Keep it: Chrome reads the extension from there, deleting it uninstalls the extension.',
        },
        {
          label: 'Open chrome://extensions',
          hint: 'Paste this address into the Chrome address bar. Top right, switch on "Developer mode".',
        },
        {
          label: 'Click "Load unpacked"',
          hint: 'Pick the "mybrief-extension" folder, the one that contains the manifest.json file. The MyBrief icon appears in the toolbar.',
        },
        {
          label: 'Pin the icon',
          hint: 'Puzzle piece right of the address bar, then the pin next to MyBrief.',
        },
      ],
      extLinkTitle: '2. Link to this site',
      extLinkIntro:
        'The extension needs to know where your MyBrief lives. It reads it from the open tab: nothing to type.',
      extLinkSteps: [
        { label: 'Stay on this tab' },
        { label: 'Click the MyBrief icon in the Chrome toolbar' },
        {
          label: 'Click "Use this site as my MyBrief"',
          hint: 'Chrome asks for permission to access this site: accept. That is what lets the extension find your tab instead of opening a second one.',
        },
      ],
      extUseTitle: '3. Use',
      extUseItems: [
        {
          label: 'New meeting',
          desc: 'Opens MyBrief and starts recording — or comes back to the tab already open. A meeting in progress is never interrupted.',
        },
        { label: 'Open MyBrief', desc: 'Finds your tab, or opens one.' },
        {
          label: 'Keyboard shortcut',
          desc: 'Alt + Shift + M (Option + Shift + M on Mac) starts a meeting without opening the menu. Change it in chrome://extensions/shortcuts.',
        },
        {
          label: 'REC badge',
          desc: 'During a meeting, the icon shows "REC" and the menu shows the elapsed time. The button becomes "Back to the meeting".',
        },
        {
          label: 'Video call reminder',
          desc: 'In the menu, tick "Remind me when a video call is open": a blue dot appears on the icon whenever a Meet, Teams, Zoom or Webex tab is open with no MyBrief meeting running. Chrome then asks permission to read the address of tabs on those sites only.',
        },
      ],
      extAdminNote:
        'Company-wide: your IT department can install the extension on every workstation through Chrome policy (ExtensionInstallForcelist), with no action from users.',
      mailSection: 'Connected accounts',
      mailIntro: 'Choose the account that sends your documents when you click "Send by email".',
      // `{provider}` is replaced with the provider chosen by the installation
      // (Google or Microsoft) — see SettingsPanel.svelte.
      mailGoogleTitle: '{provider} account',
      mailGoogleHint:
        'Allow myBrief to send emails from your address and store your documents — your mailbox is never read.',
      mailConnected: 'Connected',
      mailNotConnected: 'Not connected',
      mailAccountLabel: 'Authorized account',
      mailConnect: 'Connect my {provider} account',
      mailConnectDesktopOnly:
        'Connecting an account is done from a browser. Open myBrief on a computer to authorize it: the account will stay connected here.',
      mailDisconnect: 'Disconnect',
      mailDisconnecting: 'Disconnecting…',
      mailSmtpNote: 'Without a connected account, emails are sent by the myBrief server.',
      mailSmtpNone:
        'No mail relay is configured on this server: connect a {provider} account to enable "Send by email".',
      mailGoogleUnavailable:
        '{provider} sign-in is not configured on this server. Ask your administrator.',
      mailErrors: {
        connect_cancelled: 'Authorization cancelled: the account was not connected.',
        connect_failed: 'The connection failed. Try again.',
        connect_state_mismatch: 'The security check failed. Try again from this page.',
        connect_session_mismatch:
          'The flow was finished by a different account than the one that started it.',
        connect_no_refresh_token:
          'The provider did not grant a durable authorization. Try again: first remove myBrief from your account access if the error persists.',
        connect_not_configured: 'The connection is not configured on this server.',
        too_many_attempts: 'Too many attempts. Try again in a few minutes.',
      },
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      error: 'Error while saving',
      close: 'Close',
    },
    settingsSearch: {
      placeholder: 'Search settings…',
      label: 'Search settings',
      open: 'Search settings',
      shortcut: 'Shortcut: {keys}',
      clear: 'Clear search',
      results: 'Matching settings',
      countOne: '1 setting found',
      countMany: '{n} settings found',
      empty: 'No setting matches “{query}”.',
      emptyHint: 'Try another word, such as “microphone”, “language” or “folder”.',
      keywords: {
        'config.profile': 'account, identity, name, address, email, avatar, group',
        'config.profile.identity': 'name, first name, address, email, avatar, group, team',
        'config.profile.language': 'language, langue, french, français, english, translation',
        'config.profile.password': 'password, credentials, security, login',
        'config.ai': 'artificial intelligence, ai, assistant, instructions, prompt',
        'config.ai.context':
          'context, job, role, position, company, about me, instructions, prompt',
        'config.meeting.detection': 'actions, tasks, todo, to do, commitments, follow-ups, detect',
        'config.meeting.detection.state': 'enable, disable, turn off, live detection',
        'config.meeting.detection.what': 'sensitivity, keywords, triggers, strict, broad',
        'config.meeting.detection.pace': 'frequency, pace, speed, interval, depth, cost',
        'config.meeting.detection.test': 'try, test, sandbox, sample, simulation',
        'config.meeting.corrections':
          'corrections, replace, replacement, spelling, mistranscribed words, proper names, dictionary',
        'config.meeting.corrections.learn': 'notes, learn, remember, keep, automatic',
        'config.meeting.corrections.list': 'list, spelling, misspelled name, acronym, fix',
        'config.ai.aiHelp': 'meeting assistant, orb, bell, sounds, voice, startup, default',
        'config.meeting': 'in a meeting, during the meeting, live, recording, transcription',
        'config.meeting.aiHelp': 'meeting assistant, orb, bell, sounds, voice, startup, default',
        'config.meeting.aiHelp.start': 'turn on, turn off, startup, domains, default',
        'config.meeting.aiHelp.sounds':
          'sound, bell, chime, beep, notifications, mute, silence, timer, countdown, melody',
        'config.meeting.aiHelp.voice':
          'voice, read aloud, text to speech, speech synthesis, speak, tts, openai, mistral',
        'config.meeting.audio': 'audio, sound, mic, microphone, headset, audio input, device',
        'config.meeting.audio.mic': 'mic, microphone, headset, input, device',
        'config.meeting.audio.system':
          'video call, computer sound, speaker, blackhole, vb-cable, stereo mix, firefox, safari, teams, zoom, meet',
        'config.actions': 'actions, after meeting, send, share, export, minutes',
        'config.actions.mail': 'mail, email, e-mail, send, recipients, subject',
        'config.actions.mail.send': 'mail, email, recipients, subject, copy, cc',
        'config.actions.mail.tagRecipients': 'tags, recipients per tag, mailing list',
        'config.actions.mail.filename':
          'file name, naming, rename, attachment, pdf, docx, download',
        'config.actions.mail.afterSummary': 'window, what next, offer, popup, after the summary',
        'config.actions.storage':
          'store, upload, drive, onedrive, sharepoint, folder, file, save, archive',
        'config.actions.storage.folder':
          'folder, drive, onedrive, sharepoint, library, confirmation, subfolder',
        'config.actions.storage.tagFolders': 'folder per tag, tags, subfolder, filing',
        'config.actions.mybrain': 'mybrain, brain, knowledge base, team',
        'config.actions.mybrain.send': 'mybrain, brain, share, send my meetings',
        'config.actions.mybrain.recent': 'mybrain, sent meetings, failure, retry',
        'config.mail':
          'google, microsoft, gmail, outlook, office 365, linked account, connection, authorization, oauth',
        'config.usage': 'statistics, stats, consumption, quota, credit, minutes, time left',
        'config.templates': 'templates, format, layout, minutes, summary, structure',
        'config.tags': 'labels, folders, categories, colors, organize, clients, projects',
        'config.tools': 'tools, utilities, import, extension',
        'config.tools.import':
          'audio file, mp3, m4a, wav, upload, existing recording, voice recorder, dictaphone',
        'config.tools.extension': 'chrome, browser, extension, keyboard shortcut, edge, brave',
        'config.help': 'help, documentation, docs, guide, manual, tutorial, faq',
        'config.feedback': 'bug, issue, problem, idea, suggestion, report, feedback, support',
        'admin.dashboard': 'home, dashboard, diagnostics, alerts, activity',
        'admin.users':
          'users, accounts, people, role, administrator, create account, disable, delete, reset password',
        'admin.groups':
          'groups, teams, members, quota, minutes per month, rights, infographics, ai help',
        'admin.ai': 'api keys, api key, token, providers, openai, mistral, speechmatics',
        'admin.ai.openai': 'api key, gpt, chatgpt',
        'admin.ai-models': 'models, llm, gpt, transcription, writing, summary, price, cost',
        'admin.ai-models.summary': 'summary model, minutes, writing, gpt, llm',
        'admin.ai-models.transcription':
          'transcription model, speech recognition, speech to text, real time',
        'admin.ai-models.infographic': 'image, drawing, visual, illustration, graphic style',
        'admin.templates': 'templates, layouts, minutes formats, default templates, organization',
        'admin.actions': 'buttons, send, store, download, after meeting, smtp, relay',
        'admin.actions.email': 'mail, smtp, relay, maximum recipients, subject, third parties',
        'admin.actions.storage': 'drive, onedrive, sharepoint, target folder, upload',
        'admin.actions.download': 'download, pdf, docx, file',
        'admin.actions.account':
          'google, microsoft, gmail, outlook, sharepoint, provider, linked account',
        'admin.actions.naming': 'file name, naming, format',
        'admin.aihelp': 'assistant, meeting, wake word, domains, interventions',
        'admin.aihelp.access': 'groups, rights, access, who',
        'admin.aihelp.wake': 'first name, name, wake word, trigger',
        'admin.aihelp.pace': 'interventions, spontaneous, alerts, frequency',
        'admin.mybrain': 'mybrain, brain, knowledge base, key, connection',
        'admin.mybrain.connection': 'address, url, api key, test connection',
        'admin.mybrain.policy': 'sending meetings, mandatory, enforced, optional',
        'admin.credits': 'credit, quota, minutes, time, exhausted, per account',
        'admin.stats':
          'statistics, consumption, costs, spending, budget, pdf report, export, prices, usage',
        'admin.company': 'company, vocabulary, glossary, jargon, acronyms, corrections',
        'admin.company.context': 'vocabulary, glossary, jargon, acronyms, proper names, context',
        'admin.company.corrections':
          'corrections, replace, spelling, mistranscribed words, dictionary',
        'admin.branding': 'brand, branding, appearance, logo, colors, theme, style guide',
        'admin.branding.logo': 'logo, image, icon, brand',
        'admin.branding.tagline': 'slogan, subtitle, welcome line, tagline',
        'admin.branding.colors': 'color, colour, theme, palette, primary, secondary',
        'admin.auth': 'sign in, login, sso, authentication, sign-in page',
        'admin.auth.password': 'password, email, credentials',
        'admin.auth.google': 'google, workspace, sso, oauth, client id, secret',
        'admin.auth.entra': 'microsoft, entra, azure ad, office 365, sso, oauth',
        'admin.auth.domains': 'allowed domains, restriction, addresses, company',
      },
    },
    home: {
      greeting: 'Welcome',
      greetingNamed: 'Welcome {name}',
      subtitle: 'Start a new meeting or browse your history.',
    },
    welcome: {
      title: 'Welcome to MyBrief',
      betaTag: 'Beta version',
      tagline: 'You talk. MyBrief writes the summary.',
      steps: [
        { title: 'Start', text: '“{start}”, at the bottom of the screen' },
        { title: 'Talk', text: 'Your words appear live' },
        { title: 'Summarize', text: 'A summary ready to share' },
      ],
      visio: 'On a video call? Pick “{visio}” when you start.',
      createdBy: 'Created by',
      getStarted: 'Get started',
    },
    meetingType: {
      title: 'What kind of meeting?',
      consentTitle: 'Consent required:',
      consent: 'every participant must agree to the recording about to start.',
      inPerson: 'In-person meeting',
      visio: 'Video meeting',
      visioHint:
        'Video call: share the meeting’s tab — or “Entire screen” for the Teams or Zoom app — with the audio box ticked.',
      visioHintDevice: 'Video call: myBrief also records the computer’s sound, through “{device}”.',
      cancel: 'Cancel',
    },
    browserAudioNotice: {
      title: 'Partially compatible browser',
      lead: 'Firefox and Safari cannot share the sound of a video call or an app: here, myBrief only records your microphone.',
      detail:
        'To also record the other side, open myBrief in Google Chrome or Microsoft Edge, or install a virtual audio device and choose it in Settings → During the meeting → Microphone and sound.',
      note: 'The microphone works normally.',
      configure: 'Set up computer sound',
      ack: 'Got it',
    },
    history: {
      title: 'History',
      loading: 'Loading history...',
      empty: 'No history available yet.',
      invalidFormat: 'Unexpected data format for history.',
      retry: 'Try again',
      close: 'Close',
      selection: 'Selection',
      itemLabel: 'Item',
      sessionExpired: 'Session expired. Please sign in again.',
      genericError: 'Error while loading history.',
    },
    resumeLoading: 'Summary in progress...',
    messages: {
      summaryError: 'An error occurred.',
      summaryErrorExpired: 'An error occurred. (Session expired)',
      summaryReadyFor: 'The summary of “{title}” is ready',
      summaryFailedFor: 'The summary of “{title}” could not be written',
      aiServiceError:
        'The AI transcription service is temporarily unavailable. Please try again shortly, or contact support if the problem persists.',
      aiNetworkError: 'Connection failed. Please check your internet connection and try again.',
      aiCreditExhausted:
        'The AI service{provider} has run out of credit. Generation is paused until the account is topped up — please contact your administrator to restore the service.',
      actionStored: 'Document stored in "{folder}".',
      actionStoredIn: 'Document stored in "{folder}" ({library}).',
      actionEmailSent: 'Document sent to {email}.',
      actionEmailSentNoFile:
        'Document sent to {email}, but the attached file could not be generated. The content is in the message body.',
      actionEmailTooLarge:
        'The document is too large to send as an attachment. Download it and send it manually.',
      actionEmailError: 'Sending by email failed. Please try again shortly.',
      actionStorageNotConnected:
        'Storing to {provider} is not configured. Connect your account in "Settings → Connected accounts", or contact your administrator.',
      actionStorageReconnect:
        'Your account does not (or no longer) allow file storage. Reconnect it in "Settings → Connected accounts" to grant this access.',
      actionStorageError: 'Storing failed. Please try again shortly.',
      actionEmailDropped:
        'Document sent to you only: this server is not allowed to write to external recipients. Connect your account in "Settings → Connected accounts" so your mail leaves from your own mailbox.',
      actionTestEmailOk: 'Test email sent to {recipients} (via {via}).',
      actionTestStorageOk: 'Test file "{filename}" stored in "{folder}".',
      actionTestTooMany: 'Too many tests in a short time. Try again in a few minutes.',
      actionTestTooManyMinutes: 'Too many tests in a short time. Try again in {minutes} min.',
      actionTestTooManySeconds: 'Too many tests in a short time. Try again in {seconds} s.',
      actionTestError: 'The test failed: {reason}',
      meetingSaved: 'Meeting saved to your history.',
    },
    documentBar: {
      tabsLabel: 'Meeting documents',
      transcription: 'Transcript',
      summaryTab: 'Summary {n}',
      summaryPending: 'Summary {n} — generating…',
      deleteSummary: 'Delete Summary {n}',
      summarize: 'Summarize',
      summarizeHint: 'Generate the summary of this meeting',
      newSummary: 'New summary',
      newSummaryHint: 'Generate a new version of the summary',
      closePicker: 'Close the template picker',
    },
    postActions: {
      share: 'Share',
      titleSummary: 'Share the summary',
      titleTranscription: 'Share the transcript',
      email: 'Send by email',
      emailTag: 'Send via the tag',
      emailUserHint: 'Your usual recipients',
      emailSelfHint: 'Only you — no saved recipients',
      recipientOne: '1 recipient',
      recipientsMany: '{count} recipients',
      storage: 'Store in {provider}',
      storageTag: 'Store via the tag',
      storageUserHint: 'Your storage folder',
      compose: 'Write in my mail app',
      composeHintPrefilled: 'Recipients pre-filled: review, add more if needed',
      composeHint: 'Opens ready to review: add the recipients',
      subjectSummary: 'Summary — {title}',
      subjectSummaryUntitled: 'Summary of your myBrief meeting',
      subjectTranscription: 'Transcript — {title}',
      subjectTranscriptionUntitled: 'Transcript of your myBrief meeting',
      bodyTruncated:
        '[… text cut: too long for an email. Download the full document from MyBrief.]',
      composeTruncated:
        'Too long for an email: the text was cut. To send it in full, use sending by email or download.',
      downloadSummary: 'Download the PDF',
      downloadTranscription: 'Download the transcript',
      busyEmail: 'Sending…',
      busyStorage: 'Storing…',
      busyDownload: 'Preparing…',
    },
    // "What next?" window after a meeting's FIRST summary
    // (components/AfterSummaryDialog.svelte): tag, email, storage, in one go.
    afterSummary: {
      title: 'Your summary is ready',
      subtitle: 'File it and share it in one go.',
      close: 'Close',
      tagTitle: 'File the meeting',
      tagPrompt: 'Its tag picks the recipients and the folder.',
      tagCurrent: 'Filed under',
      tagChange: 'Change',
      tagKeep: 'Keep',
      tagNew: 'New tag',
      tagNewPlaceholder: 'Tag name',
      tagCreate: 'Create',
      tagCancel: 'Cancel',
      tagNoneYet: 'No tags yet: create the first one.',
      emailTitle: 'Send by email',
      emailTagHint: 'Recipients of the {tag} tag',
      emailUserHint: 'Your usual recipients',
      emailSelfHint: 'Only you for now',
      emailCopy: 'You are copied.',
      recipientPlaceholder: 'Add an address',
      recipientAdd: 'Add',
      recipientRemove: 'Remove {address}',
      recipientSavedTag: 'Added addresses join the recipients of the {tag} tag.',
      recipientSavedUser:
        'Added addresses join your default list: they will also receive your next untagged summaries.',
      recipientsFull: '{max} recipients at most.',
      storageTitle: 'Store in {provider}',
      storageTagFolder: 'Folder of the {tag} tag',
      storageTagSubfolder: '"{tag}" subfolder of your storage folder',
      storageUserFolder: 'Your storage folder',
      storageDefaultFolder: "Your organisation's default folder",
      storageApproval: 'You will review the destination before it is stored.',
      selected: 'Selected',
      dontOffer: "Don't offer this again",
      later: 'Later',
      pickOne: 'Pick an action',
      verbTag: 'file',
      verbEmail: 'send',
      verbStorage: 'store',
      and: 'and',
      stepEmail: 'sending by email',
      stepStorage: 'storing in {provider}',
      running: 'In progress: {steps}…',
      tagApplied: 'Meeting filed under "{tag}".',
      tagFailed: 'The tag could not be set: nothing was sent, try again from "Share".',
      offerOff: 'This window will no longer open. Turn it back on in Settings → After the meeting.',
    },
    aiNotice: {
      creditTitle: 'AI credit exhausted',
      serviceTitle: 'AI service unavailable',
      networkTitle: 'Connection lost',
      dismiss: 'Close',
    },
    lazyLoad: {
      failed:
        'This screen could not load. A new version of MyBrief may be online: reload the page.',
      failedRecording:
        'This screen could not load. Reload the page once the meeting is over: a new version of MyBrief may be online.',
      reload: 'Reload',
    },
    continueRecording: {
      title: 'Still in a meeting?',
      message: 'You have been recording for {duration}. Keep recording?',
      countdown: 'Auto-stop in {countdown}',
      continue: 'Keep recording',
      stop: 'Stop and save',
      maxDurationToast: 'Maximum duration of 8 h reached: the recording was stopped and saved.',
    },
    disconnection: {
      title: 'You are disconnected',
      message: 'Please sign in again to keep using MyBrief.',
      reconnect: 'Sign in again',
      confirm: 'Close',
    },
  },
};

/**
 * Textes par défaut des résumés
 */
export const defaultSummaryTexts = {
  fr: `Le résumé de la réunion apparaîtra ici après avoir cliqué sur "Générer et envoyer le résumé".\n\nLe format du résumé s'adaptera au type de réunion sélectionné.`,
  en: `The meeting summary will appear here after clicking "Generate summary".\n\nThe summary format adapts to the selected meeting type.`,
};
