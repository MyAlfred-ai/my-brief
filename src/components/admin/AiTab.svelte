<script>
  /**
   * Rubrique « Modèles IA » de l'administration : les fournisseurs d'IA et
   * leurs clés (OpenAI, Mistral, Speechmatics, AssemblyAI), le modèle qui
   * RÉDIGE les comptes rendus, le modèle de transcription et l'infographie —
   * proposée ou non, dessinée par le modèle d'image choisi, à la charte de
   * l'installation.
   *
   * DEUX PAGES, UN COMPOSANT (`view`) : « Clés API » montre les fournisseurs,
   * « Modèles » ce qui tourne. Les deux lisent le même réglage serveur et
   * n'envoient que ce qui a changé ; en faire deux composants aurait dupliqué
   * tout ce qui les relie — un modèle se verrouille sans la clé de son
   * fournisseur, et la tuile le dit. Ce que la séparation coûte : on ne colle
   * plus une clé ET on ne choisit plus son modèle d'un seul « Enregistrer » ;
   * depuis « Modèles », « Clé requise » mène à « Clés API », ouverte sur le
   * bon fournisseur.
   *
   * Le modèle de rédaction est le réglage le plus visible de l'écran : c'est
   * lui qui décide de la longueur et de la structure du compte rendu. Il vit
   * ici parce que le figer dans le code avait un coût réel — jusqu'au
   * 2026-09-01 il valait gpt-4o-mini sans que personne puisse le constater ni
   * le changer, et les comptes rendus sortaient plus courts que ceux du même
   * prompt dans ChatGPT (cf. lib/summaryModels.js). Depuis le 2026-10-29 il se
   * choisit comme celui de transcription — même liste à une ligne par modèle,
   * même filtre par fournisseur, même verrou sans clé — chez OpenAI ou chez
   * Mistral, avec le coût estimé d'un compte rendu d'une réunion d'une heure.
   *
   * La clé pilote la transcription, le résumé et la détection d'actions — sans
   * elle l'application enregistre mais ne produit rien. La régler ici évite de
   * redéployer pour une clé expirée ou remplacée.
   *
   * Chaque modèle montre son PRIX : un niveau en « € » et le coût d'une heure
   * de transcription, ou d'un compte rendu, en euros, aux tarifs de l'écran
   * Statistiques (servis par GET /settings/ai, cf. lib/costs). Choisir un
   * modèle, c'est aussi choisir une dépense : l'écart avec le modèle en
   * service s'affiche avant l'enregistrement.
   *
   * La clé n'est JAMAIS reçue de l'API : on n'affiche que sa provenance et un
   * indice (`sk-proj…UyoA`), assez pour reconnaître laquelle est en place — et
   * pour voir à l'œil une clé collée deux fois.
   *
   * Le serveur VÉRIFIE la clé auprès d'OpenAI avant de l'enregistrer : ce
   * formulaire ne peut donc pas mettre l'application en panne.
   *
   * FOURNISSEURS D'ABORD : la première carte porte les clés, une ligne par
   * fournisseur (ProviderKey) ; les listes des modèles se rangent par
   * fournisseur, et ceux d'un fournisseur tiers restent verrouillés tant que
   * sa clé n'est ni enregistrée ni collée — la clé Mistral débloque à la fois
   * Voxtral et les comptes rendus Mistral. La clé débloque les modèles :
   * c'est tout le schéma de l'écran. Le serveur le tient aussi
   * (`provider_key_missing`). « Tester ce modèle » éprouve la clé collée avant
   * même de l'enregistrer, comme « Tester la clé » de chaque ligne.
   *
   * Les fournisseurs tiers viennent du SERVEUR (`providerKeys`, dans l'ordre
   * de la carte) : l'écran n'en connaît que les textes et les logos. Le champ
   * de clé d'un fournisseur s'appelle `<fournisseur>ApiKey` des deux côtés.
   *
   * TABLEAU DE BORD REPLIÉ (2026-10-28) : les fournisseurs tiennent sur une
   * ligne de pastilles, trois tuiles disent ce qui tourne (rédaction,
   * transcription, infographie), et un clic déplie le réglage d'une tuile ou
   * la clé d'un fournisseur — un seul à la fois. L'écran tient sans défiler ;
   * la liste des modèles, une ligne chacun, se filtre par fournisseur. Rien
   * n'est replié qui demande un geste : clé OpenAI absente, modèle en service
   * sans sa clé — ces panneaux s'ouvrent d'eux-mêmes au chargement.
   *
   * UN bouton Enregistrer par page, comme ailleurs dans l'administration —
   * et le corps envoyé ne porte QUE ce qui a changé : la clé si une nouvelle a
   * été collée, le modèle s'il a été modifié. Un corps qui porterait toujours
   * les deux effacerait la clé dès qu'on ne change que le modèle (vide =
   * « retire la clé » côté serveur) ; c'est aussi ce qui permet aux deux
   * pages de partager ce composant. Les tests, eux, restent dans leur carte :
   * ils portent sur UN réglage, pas sur la page.
   */
  import { onMount, tick } from 'svelte';
  import IconPlug from '~icons/solar/plug-circle-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconMicrophone from '~icons/solar/microphone-3-linear';
  import IconGallery from '~icons/solar/gallery-linear';
  import IconDocumentText from '~icons/solar/document-text-linear';
  import DashCard from '../ui/DashCard.svelte';
  import DashPill from '../ui/DashPill.svelte';
  import DashTile from '../ui/DashTile.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import ModelPicker from './ModelPicker.svelte';
  import PriceDelta from './PriceDelta.svelte';
  import ProviderFilter from './ProviderFilter.svelte';
  import ProviderKey from './ProviderKey.svelte';
  import { LOGOS, WORDMARKS } from './providerBrands.js';
  import { formatDate, formatEuros, pricingLines } from './stats/format.js';
  import { SUMMARY_PRICE_STEP, priceDelta, pricedChoices } from '../../utils/modelPrices.js';
  import { refreshCapabilities } from '../../stores/auth.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';
  import { get } from 'svelte/store';
  import { panelNav, selectPanelSection } from '../../stores/panels.js';
  import {
    fetchAiSettings,
    saveAiSettings,
    testAiKey,
    testTranscriptionModel,
    testSummaryModel,
  } from '../../services/adminUsersApi.js';
  import { currentLanguageStore, uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';

  /** Le champ d'une clé tierce, même règle que le serveur (providerKeyField). */
  /**
   * Ce que l'écran montre : 'keys' (les fournisseurs et leurs clés), 'models'
   * (rédaction, transcription, infographie) ou 'all'.
   * @type {'all'|'keys'|'models'}
   */
  export let view = 'all';
  $: showKeys = view !== 'models';
  $: showModels = view !== 'keys';

  const keyField = (provider) => `${provider}ApiKey`;

  let settings = {
    hasKey: false,
    source: 'none',
    hint: '',
    transcriptionModel: '',
    transcriptionModelSource: 'default',
    transcriptionModelRetired: null,
    transcriptionModels: [],
    transcriptionProviders: {},
    providerKeys: {},
    summaryModel: '',
    summaryModelSource: 'default',
    summaryModels: [],
    summaryProviders: {},
    summaryModelOffList: false,
    infographicEnabled: true,
    updatedAt: null,
    updatedBy: null,
  };
  // Prix des modèles proposés (GET /settings/ai) ; `null` quand le serveur
  // n'a pas pu les établir : les modèles s'affichent alors sans prix.
  let prices = null;
  let apiKey = '';
  // Clés tierces collées, par fournisseur — jamais celles du serveur.
  let providerDrafts = {};
  let model = '';
  let summaryModel = '';
  let infographicEnabled = true;
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  // Ce que le dernier enregistrement a écrit — pour dire « Clé enregistrée »
  // ou « Modèle enregistré », pas un « Enregistré » qui ne dit pas quoi.
  let savedFields = {
    key: false,
    providerKeys: [],
    model: false,
    summary: false,
    infographic: false,
  };
  let testState = 'idle'; // 'idle' | 'testing' | 'ok'
  let providerTestStates = {}; // par fournisseur : 'idle' | 'testing' | 'ok'
  let modelTestState = 'idle'; // 'idle' | 'testing' | 'ok'
  // Champs de clé ouverts (ProviderKey) : fermés tant qu'une clé est en place.
  let openaiEditing = false;
  let providerEditing = {};
  // Lignes des fournisseurs, pour ouvrir leur champ depuis la liste des modèles.
  const providerRows = {};
  // Ce qui est déplié : un réglage (tuile) et un fournisseur (pastille) au plus.
  let openSection = ''; // '' | 'summary' | 'transcription' | 'infographic'
  let openProvider = ''; // '' | 'openai' | un fournisseur tiers
  // Filtre de chaque liste de modèles : 'all' ou un fournisseur.
  let modelFilter = 'all';
  let summaryFilter = 'all';
  let summaryTestState = 'idle'; // 'idle' | 'testing' | 'ok'
  let errorMessage = '';

  $: texts = $uiText.adminAi;
  $: userTexts = $uiText.adminUsers;
  $: lang = $currentLanguageStore;
  // Une clé saisie ici remplacera celle du déploiement : le dire AVANT
  // l'enregistrement, pas après.
  $: willOverrideEnv = apiKey.trim() && settings.source === 'env';
  // Déclarations réactives et non fonctions : Svelte ne suit que les
  // identifiants qu'il VOIT (piège rencontré sur les autres écrans de réglages).
  $: keyChanged = !!apiKey.trim();
  $: modelChanged = !!model && model !== settings.transcriptionModel;
  // Fournisseur de chaque modèle, servi avec la liste (une projection d'avant
  // Voxtral n'en porte pas : tout y est OpenAI).
  $: providers = settings.transcriptionProviders || {};
  $: keyedProviders = Object.keys(settings.providerKeys || {});
  $: selectedProvider = providers[model] || 'openai';
  $: selectedKeyed = keyedProviders.includes(selectedProvider);
  // État de chaque fournisseur tiers. Un objet déclaré, et non des fonctions
  // appelées dans le gabarit : la réactivité ne suit que ce qu'elle voit.
  $: providerState = Object.fromEntries(
    keyedProviders.map((provider) => {
      const has = !!settings.providerKeys[provider]?.hasKey;
      const draft = (providerDrafts[provider] || '').trim();
      return [
        provider,
        {
          has,
          draft,
          // Ses modèles attendent une clé, enregistrée ou collée.
          locked: !has && !draft,
          // Il transcrit ou rédige : sa clé ne se retire pas.
          inService:
            providers[settings.transcriptionModel] === provider ||
            summaryProviders[settings.summaryModel] === provider,
          // « Tester la clé » : avec son modèle choisi, à défaut son premier —
          // le jeton de Mistral est lié à un modèle.
          testModel:
            selectedProvider === provider
              ? model
              : settings.transcriptionModels.find((id) => providers[id] === provider) || '',
        },
      ];
    }),
  );
  $: providerKeysChanged = keyedProviders.filter((provider) => providerState[provider]?.draft);
  // Modèle tiers choisi sans clé enregistrée ni collée : rien à enregistrer
  // qui tienne — le serveur refuserait, et la réunion suivante échouerait.
  $: providerKeyNeeded = selectedKeyed && !!providerState[selectedProvider]?.locked;
  // Le test d'un modèle tiers se fait avec la clé collée, sinon l'enregistrée.
  $: modelTestable = selectedKeyed ? !providerState[selectedProvider]?.locked : settings.hasKey;
  // Du moins cher au plus cher, chacun avec son niveau en « € ».
  $: transcriptionChoices = pricedChoices(settings.transcriptionModels, prices?.transcription);
  $: transcriptionOptions = transcriptionChoices.map((choice) => {
    const group = providers[choice.id] || 'openai';
    return {
      id: choice.id,
      name: texts.modelNames[choice.id] || '',
      group,
      // Tous fournisseurs confondus, l'étiquette dit qui ; filtrée, elle se tait.
      provider: modelFilter === 'all' ? texts.providers[group] || group : '',
      description: texts.models[choice.id] || '',
      tier: choice.tier,
      price: choice.unitEur === null ? '' : formatEuros(choice.unitEur, lang),
      locked: !!providerState[group]?.locked,
    };
  });
  $: filteredOptions =
    modelFilter === 'all'
      ? transcriptionOptions
      : transcriptionOptions.filter((option) => option.group === modelFilter);
  // Filtres : tous, puis chaque fournisseur qui a des modèles, dans l'ordre de la carte.
  $: filterProviders = ['openai', ...keyedProviders].filter((provider) =>
    transcriptionOptions.some((option) => option.group === provider),
  );
  // Fournisseur → clé manquante, pour les filtres et leurs cadenas.
  $: lockedProviders = Object.fromEntries(
    keyedProviders.map((provider) => [provider, !!providerState[provider]?.locked]),
  );
  $: selectedChoice = transcriptionChoices.find((choice) => choice.id === model) || null;
  $: selectedName = texts.modelNames[model] || model;
  $: selectedDescription = texts.models[model] || '';

  // ── Pastilles des fournisseurs ──
  $: providerPills = [
    {
      id: 'openai',
      label: texts.providers.openai,
      logo: LOGOS.openai,
      has: settings.hasKey,
      status: settings.hasKey ? texts.statusOn : texts.statusOff,
    },
    ...keyedProviders.map((provider) => ({
      id: provider,
      label: texts.providers[provider] || provider,
      logo: LOGOS[provider],
      wordmark: WORDMARKS[provider],
      has: !!providerState[provider]?.has,
      status: providerBadges[provider]?.text || '',
    })),
  ];
  $: connectedCount = providerPills.filter((pill) => pill.has).length;

  // ── Tuiles : ce qui tourne, en un coup d'œil ──
  $: selectedHour =
    selectedChoice?.unitEur == null
      ? ''
      : `${formatEuros(selectedChoice.unitEur, lang)}${texts.pricePerHour}`;
  $: tiles = [
    {
      id: 'summary',
      icon: IconDocumentText,
      label: texts.tileSummary,
      value: summaryName,
      logo: LOGOS[summarySelectedProvider],
      sub: [texts.providers[summarySelectedProvider] || summarySelectedProvider, summaryPrice]
        .filter(Boolean)
        .join(' · '),
      changed: summaryChanged,
      warn: summaryKeyNeeded ? texts.tileKeyNeeded : '',
    },
    {
      id: 'transcription',
      icon: IconMicrophone,
      label: texts.tileTranscription,
      value: selectedName,
      logo: LOGOS[selectedProvider],
      wordmark: WORDMARKS[selectedProvider],
      // Le logo complet porte déjà le nom du fournisseur : le prix suffit.
      sub: WORDMARKS[selectedProvider]
        ? selectedHour
        : [texts.providers[selectedProvider] || selectedProvider, selectedHour]
            .filter(Boolean)
            .join(' · '),
      changed: modelChanged,
      warn: providerKeyNeeded ? texts.tileKeyNeeded : '',
    },
    {
      id: 'infographic',
      icon: IconGallery,
      label: texts.tileInfographic,
      value: infographicEnabled ? texts.infographicOn : texts.infographicOff,
      sub: infographicEnabled ? texts.infographicTileSub : '',
      changed: infographicChanged,
    },
  ];
  // Badge de chaque ligne tierce : facultative tant qu'aucun modèle choisi ne l'exige.
  $: providerBadges = Object.fromEntries(
    keyedProviders.map((provider) => {
      const { has } = providerState[provider] || {};
      const required = selectedProvider === provider || summarySelectedProvider === provider;
      return [
        provider,
        {
          tone: has ? 'ok' : required ? 'warn' : 'neutral',
          text: has ? texts.statusOn : required ? texts.statusRequired : texts.statusOptional,
        },
      ];
    }),
  );
  // Sans clé OpenAI, rien ne tourne : son champ est ouvert d'emblée.
  $: if (!loading && !settings.hasKey) openaiEditing = true;
  // Ce que le choix en cours changerait à la dépense, par heure : dit AVANT
  // d'enregistrer, quand les deux prix sont connus.
  $: transcriptionDelta = priceDelta(transcriptionChoices, model, settings.transcriptionModel);
  $: provenance = pricingLines(prices, $uiText.adminStats.costs, lang);
  // Un choix resté sur un modèle qu'OpenAI retire, déjà remplacé en service :
  // un avis, et son « Garder ».
  // Toutes les dépendances dans l'expression, `lang` compris : cachées dans
  // `retiredNotice`, la réactivité ne les verrait pas.
  $: retired = settings.transcriptionModelRetired;
  $: retiredText = retired
    ? retiredNotice(texts.modelRetired, retired, settings.transcriptionModel, lang)
    : '';
  $: summaryChanged = !!summaryModel && summaryModel !== settings.summaryModel;

  // ── Rédaction : mêmes ressorts que la transcription, son propre filtre ──
  // La liste doit pouvoir AFFICHER un modèle imposé par le serveur et absent
  // de la liste : sans lui, aucune ligne ne serait cochée, et l'écran
  // mentirait sur le modèle réellement en service.
  $: summaryIds = settings.summaryModels.includes(settings.summaryModel)
    ? settings.summaryModels
    : [settings.summaryModel, ...settings.summaryModels].filter(Boolean);
  // Fournisseur de chaque modèle (une projection d'avant Mistral n'en porte
  // pas : tout y est OpenAI, comme un modèle hors liste).
  $: summaryProviders = settings.summaryProviders || {};
  $: summarySelectedProvider = summaryProviders[summaryModel] || 'openai';
  $: summaryKeyed = keyedProviders.includes(summarySelectedProvider);
  // Modèle Mistral choisi sans clé enregistrée ni collée : même verrou que la
  // transcription — le serveur refuserait, chaque compte rendu échouerait.
  $: summaryKeyNeeded = summaryKeyed && !!providerState[summarySelectedProvider]?.locked;
  $: summaryTestable = summaryKeyed
    ? !providerState[summarySelectedProvider]?.locked
    : settings.hasKey;
  // Du moins cher au plus cher, au pas de quatre (cf. utils/modelPrices.js).
  $: summaryChoices = pricedChoices(summaryIds, prices?.summary, { step: SUMMARY_PRICE_STEP });
  $: summaryOptions = summaryChoices.map((choice) => {
    const group = summaryProviders[choice.id] || 'openai';
    return {
      id: choice.id,
      name: texts.modelNames[choice.id] || '',
      group,
      provider: summaryFilter === 'all' ? texts.providers[group] || group : '',
      description: texts.summaryModels[choice.id] || '',
      tier: choice.tier,
      price: choice.unitEur === null ? '' : formatEuros(choice.unitEur, lang),
      locked: !!providerState[group]?.locked,
    };
  });
  $: summaryFiltered =
    summaryFilter === 'all'
      ? summaryOptions
      : summaryOptions.filter((option) => option.group === summaryFilter);
  $: summaryFilterProviders = ['openai', ...keyedProviders].filter((provider) =>
    summaryOptions.some((option) => option.group === provider),
  );
  $: summaryName = texts.modelNames[summaryModel] || summaryModel;
  $: summaryDescription = texts.summaryModels[summaryModel] || '';
  $: summaryUnitEur = summaryChoices.find((choice) => choice.id === summaryModel)?.unitEur ?? null;
  $: summaryPrice =
    summaryUnitEur === null ? '' : `${formatEuros(summaryUnitEur, lang)}${texts.pricePerSummary}`;
  $: summaryDelta = priceDelta(summaryChoices, summaryModel, settings.summaryModel);
  // Normalisé des deux côtés (`!== false`) : une projection d'avant ce réglage
  // ne porte pas le champ, et son absence vaut « activée » — pas « modifiée ».
  $: infographicChanged = infographicEnabled !== (settings.infographicEnabled !== false);
  $: dirty =
    keyChanged ||
    providerKeysChanged.length > 0 ||
    modelChanged ||
    summaryChanged ||
    infographicChanged;
  // Un modèle sans la clé de son fournisseur bloque l'enregistrement — là où
  // on choisit les modèles. Sur « Clés API », seul ce qu'on y saisit compte :
  // y bloquer une clé au nom d'un modèle qu'on ne peut pas y changer serait
  // une impasse.
  $: canSave =
    dirty && (!showModels || (!providerKeyNeeded && !summaryKeyNeeded)) && saveState !== 'saving';

  onMount(load);

  async function load() {
    loading = true;
    errorMessage = '';
    const res = await fetchAiSettings();
    loading = false;
    if (!res.ok) {
      errorMessage = messageFor(res.data);
      return;
    }
    settings = res.data.settings;
    prices = res.data.prices || null;
    model = settings.transcriptionModel;
    summaryModel = settings.summaryModel;
    infographicEnabled = settings.infographicEnabled !== false;
    // Ce qui demande un geste ne reste pas replié : sans clé OpenAI rien ne
    // tourne ; un modèle en service sans la clé de son fournisseur non plus.
    if (!settings.hasKey) openProvider = 'openai';
    const lacksKey = (provider) =>
      !!settings.providerKeys?.[provider] && !settings.providerKeys[provider].hasKey;
    if (lacksKey((settings.transcriptionProviders || {})[settings.transcriptionModel])) {
      openSection = 'transcription';
    } else if (lacksKey((settings.summaryProviders || {})[settings.summaryModel])) {
      openSection = 'summary';
    }
    // « Clé requise », cliqué sur la page « Modèles », a mené ici en nommant
    // un fournisseur (cf. showProviderKey) : sa ligne s'ouvre d'elle-même.
    const wanted = get(panelNav).sub;
    if (showKeys && wanted && (wanted === 'openai' || settings.providerKeys?.[wanted])) {
      if (wanted === 'openai') {
        openProvider = 'openai';
        openaiEditing = true;
      } else {
        showProviderKey(wanted);
      }
    }
  }

  function toggleSection(id) {
    openSection = openSection === id ? '' : id;
  }

  function toggleProvider(id) {
    openProvider = openProvider === id ? '' : id;
  }

  /** Déplie la ligne d'un fournisseur et met le focus dans son champ de clé. */
  async function showProviderKey(provider) {
    // La clé se saisit sur la page « Clés API » : depuis « Modèles », on y va,
    // et elle s'ouvre sur ce fournisseur (cf. load).
    if (!showKeys) {
      selectPanelSection('ai', provider);
      return;
    }
    openProvider = provider;
    await tick();
    providerRows[provider]?.open();
  }

  /**
   * Slug d'erreur → texte. `upstreamMessage` est le message du fournisseur
   * lui-même (clé révoquée, quota épuisé…) : on le montre tel quel, il est
   * plus précis que tout ce qu'on pourrait écrire à sa place. `provider`
   * nomme le fournisseur dans les erreurs de clés tierces.
   */
  function messageFor(data) {
    const base = fill(
      texts.errors[data?.error] || userTexts.errors[data?.error] || userTexts.errors.unknown,
      { provider: texts.providers[data?.provider] || data?.provider || '' },
    );
    return data?.upstreamMessage ? `${base} — ${data.upstreamMessage}` : base;
  }

  async function save() {
    // Seuls les champs modifiés partent : absent = inchangé côté serveur.
    const patch = {};
    if (keyChanged) patch.apiKey = apiKey.trim();
    for (const provider of providerKeysChanged) {
      patch[keyField(provider)] = providerState[provider].draft;
    }
    if (modelChanged) patch.transcriptionModel = model;
    if (summaryChanged) patch.summaryModel = summaryModel;
    if (infographicChanged) patch.infographicEnabled = infographicEnabled;
    const fields = {
      key: keyChanged,
      providerKeys: providerKeysChanged,
      model: modelChanged,
      summary: summaryChanged,
      infographic: infographicChanged,
    };
    saveState = 'saving';
    errorMessage = '';
    testState = 'idle';
    modelTestState = 'idle';
    summaryTestState = 'idle';
    const res = await saveAiSettings(patch);
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    settings = res.data.settings;
    prices = res.data.prices || null;
    apiKey = '';
    providerDrafts = {};
    openaiEditing = false;
    providerEditing = {};
    model = settings.transcriptionModel;
    summaryModel = settings.summaryModel;
    infographicEnabled = settings.infographicEnabled !== false;
    savedFields = fields;
    // L'interrupteur de l'infographie est une capacité de l'installation : la
    // case « Générer une infographie » et l'onglet Groupes la relisent sans
    // attendre un rechargement de page.
    if (fields.infographic) refreshCapabilities();
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
  }

  function discard() {
    apiKey = '';
    providerDrafts = {};
    openaiEditing = false;
    providerEditing = {};
    model = settings.transcriptionModel;
    summaryModel = settings.summaryModel;
    infographicEnabled = settings.infographicEnabled !== false;
    errorMessage = '';
  }

  async function test() {
    testState = 'testing';
    errorMessage = '';
    const res = await testAiKey();
    if (!res.ok) {
      testState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    testState = 'ok';
    setTimeout(() => {
      if (testState === 'ok') testState = 'idle';
    }, 2500);
  }

  function clearKey() {
    if (!confirm(texts.clearConfirm)) return;
    apiKey = '';
    saveState = 'saving';
    errorMessage = '';
    saveAiSettings({ apiKey: '' }).then((res) => {
      if (!res.ok) {
        saveState = 'idle';
        errorMessage = messageFor(res.data);
        return;
      }
      settings = res.data.settings;
      saveState = 'idle';
    });
  }

  /**
   * « Tester la clé » d'une ligne tierce : la clé collée (sinon l'enregistrée),
   * éprouvée chez son fournisseur avec un de ses modèles. Rien n'est stocké.
   */
  async function testProvider(provider) {
    providerTestStates = { ...providerTestStates, [provider]: 'testing' };
    errorMessage = '';
    const { testModel: candidate, draft } = providerState[provider];
    const res = await testTranscriptionModel(candidate, draft);
    if (!res.ok) {
      providerTestStates = { ...providerTestStates, [provider]: 'idle' };
      errorMessage = messageFor(res.data);
      return;
    }
    providerTestStates = { ...providerTestStates, [provider]: 'ok' };
    setTimeout(() => {
      if (providerTestStates[provider] === 'ok') {
        providerTestStates = { ...providerTestStates, [provider]: 'idle' };
      }
    }, 2500);
  }

  /**
   * Retire la clé d'un fournisseur tiers. Proposé seulement quand aucun de ses
   * modèles ne transcrit : sinon le serveur refuse (`provider_key_in_use`), à
   * juste titre.
   */
  function clearProviderKey(provider) {
    const label = texts.providers[provider] || provider;
    if (!confirm(fill(texts.providerKeyClearConfirm, { provider: label }))) return;
    providerDrafts = { ...providerDrafts, [provider]: '' };
    providerEditing = { ...providerEditing, [provider]: false };
    saveState = 'saving';
    errorMessage = '';
    saveAiSettings({ [keyField(provider)]: '' }).then((res) => {
      saveState = 'idle';
      if (!res.ok) {
        errorMessage = messageFor(res.data);
        return;
      }
      settings = res.data.settings;
    });
  }

  /**
   * Avis d'un modèle retiré. Midi UTC : un jour civil lu à minuit UTC
   * tomberait la veille à l'ouest.
   * @param {string} text @param {{from: string, date: string}} r
   * @param {string} replacement @param {string} language
   */
  function retiredNotice(text, r, replacement, language) {
    const date = formatDate(`${r.date}T12:00:00Z`, language) || r.date;
    return fill(text, { from: r.from, date, model: replacement });
  }

  /**
   * Enregistre le remplaçant d'un modèle retiré : le choix devient explicite et
   * l'avis disparaît. Sans ce bouton, garder le remplaçant serait impossible
   * depuis le sélecteur — il est déjà « en service », le choisir ne change rien.
   * @param {'transcriptionModel'} field
   */
  async function keepReplacement(field) {
    saveState = 'saving';
    errorMessage = '';
    const res = await saveAiSettings({ [field]: settings[field] });
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    settings = res.data.settings;
    prices = res.data.prices || null;
    // Seul le champ gardé se recale : un autre choix en cours reste à enregistrer.
    if (field === 'transcriptionModel') model = settings.transcriptionModel;
    savedFields = {
      key: false,
      providerKeys: [],
      model: field === 'transcriptionModel',
      summary: false,
      infographic: false,
    };
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
  }

  /**
   * Test RÉEL du modèle sélectionné : le serveur ouvre une session de
   * transcription avec lui. C'est ce qui distingue « ce modèle existe » de
   * « ce modèle est utilisable avec cette clé, dans cette organisation ».
   */
  async function testModel() {
    modelTestState = 'testing';
    errorMessage = '';
    const res = await testTranscriptionModel(
      model,
      selectedKeyed ? providerState[selectedProvider].draft : '',
    );
    if (!res.ok) {
      modelTestState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    modelTestState = 'ok';
    setTimeout(() => {
      if (modelTestState === 'ok') modelTestState = 'idle';
    }, 2500);
  }

  /**
   * Test d'ACCÈS au modèle de rédaction : un appel de chat minuscule côté
   * serveur. Il ne dit rien de la qualité du compte rendu — la seule question
   * qu'un écran peut trancher avant d'enregistrer est « cette organisation a-t-
   * elle accès à ce modèle ? ». Sinon, la panne se découvrirait à la première
   * génération, chez l'utilisateur. Un modèle Mistral s'éprouve avec la clé
   * collée, avant même de l'enregistrer.
   */
  async function testSummary() {
    summaryTestState = 'testing';
    errorMessage = '';
    const res = await testSummaryModel(
      summaryModel,
      summaryKeyed ? providerState[summarySelectedProvider].draft : '',
    );
    if (!res.ok) {
      summaryTestState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    summaryTestState = 'ok';
    setTimeout(() => {
      if (summaryTestState === 'ok') summaryTestState = 'idle';
    }, 2500);
  }
</script>

<div class="ai-wrap">
  {#if loading}
    <div class="ai-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorMessage}
      <div class="ai-error" role="alert">{errorMessage}</div>
    {/if}

    {#if showKeys}
      <!-- ── Fournisseurs d'IA : une ligne de pastilles, la clé au clic ── -->
      <DashCard
        id="ai-providers"
        icon={IconPlug}
        title={texts.providersTitle}
        meta={fill(texts.providersCount, { count: connectedCount, total: providerPills.length })}
      >
        <div class="ai-pills">
          {#each providerPills as pill (pill.id)}
            <DashPill
              label={pill.label}
              logo={pill.logo}
              wordmark={pill.wordmark}
              on={pill.has}
              addable
              status={pill.status}
              open={openProvider === pill.id}
              on:click={() => toggleProvider(pill.id)}
            />
          {/each}
        </div>

        {#if openProvider === 'openai'}
          <div class="ai-provider-panel">
            <ProviderKey
              id="ai-openai"
              logo={LOGOS.openai}
              name={texts.providers.openai}
              usage={texts.openaiUsage}
              tone={settings.hasKey ? 'ok' : 'warn'}
              status={settings.hasKey ? texts.statusOn : texts.statusOff}
              source={settings.source === 'settings'
                ? texts.sourceSettings
                : settings.source === 'env'
                  ? texts.sourceEnv
                  : ''}
              hint={settings.hint}
              meta={settings.source === 'settings' && settings.updatedBy
                ? `${texts.updatedBy} ${settings.updatedBy}`
                : ''}
              sourceWarning={texts.sourceNone}
              bind:value={apiKey}
              bind:editing={openaiEditing}
              inputLabel={texts.keyTitle}
              placeholder={settings.hasKey ? texts.keyPlaceholderReplace : texts.keyPlaceholderNew}
              help={texts.keyIntro}
              warning={willOverrideEnv ? texts.overrideEnvWarning : ''}
              editLabel={settings.hasKey ? texts.keyReplace : ''}
              testLabel={texts.test}
              testingLabel={texts.testing}
              testOkLabel={texts.testOk}
              {testState}
              canTest={settings.hasKey}
              clearLabel={texts.clear}
              canClear={settings.source === 'settings'}
              busy={saveState === 'saving'}
              on:test={test}
              on:clear={clearKey}
            />
          </div>
        {:else if openProvider}
          <!-- Keyé par fournisseur : passer d'une pastille à l'autre recrée la
             ligne, sans perdre la clé collée (gardée dans providerDrafts). -->
          {#each [openProvider] as provider (provider)}
            {@const label = texts.providers[provider] || provider}
            {@const state = providerState[provider] || {}}
            <div class="ai-provider-panel">
              <ProviderKey
                bind:this={providerRows[provider]}
                id="ai-{provider}"
                logo={LOGOS[provider]}
                wordmark={WORDMARKS[provider]}
                name={label}
                usage={texts.providerUsage[provider] || ''}
                tone={providerBadges[provider]?.tone}
                status={providerBadges[provider]?.text}
                source={state.has ? texts.sourceSettings : ''}
                hint={settings.providerKeys[provider]?.hint || ''}
                bind:value={providerDrafts[provider]}
                bind:editing={providerEditing[provider]}
                inputLabel={fill(texts.providerKeyLabel, { provider: label })}
                placeholder={state.has
                  ? texts.providerKeyPlaceholderReplace
                  : fill(texts.providerKeyPlaceholderNew, { provider: label })}
                help={fill(texts.providerKeyHelp, {
                  provider: label,
                  console: texts.providerConsoles[provider] || '',
                })}
                editLabel={state.has ? texts.keyReplace : texts.keyAdd}
                testLabel={state.locked ? '' : texts.test}
                testingLabel={texts.testing}
                testOkLabel={texts.testOk}
                testState={providerTestStates[provider] || 'idle'}
                canTest={!!state.testModel && !state.locked}
                clearLabel={texts.clear}
                canClear={state.has && !state.inService}
                busy={saveState === 'saving'}
                on:test={() => testProvider(provider)}
                on:clear={() => clearProviderKey(provider)}
              />
            </div>
          {/each}
        {/if}
      </DashCard>
    {/if}

    {#if showModels}
      <!-- ── Ce qui tourne : trois tuiles, un réglage déplié au clic ── -->
      <div class="ai-tiles">
        {#each tiles as tile (tile.id)}
          <DashTile
            icon={tile.icon}
            label={tile.label}
            open={openSection === tile.id}
            flag={tile.warn || (tile.changed ? texts.tileChanged : '')}
            warn={!!tile.warn}
            sub={tile.sub}
            subLogo={tile.logo}
            subWordmark={tile.wordmark}
            on:click={() => toggleSection(tile.id)}>{tile.value}</DashTile
          >
        {/each}
      </div>

      {#if openSection === 'summary'}
        <!-- ── Modèle de rédaction du compte rendu : même anatomie que la
           transcription, le coût estimé d'un compte rendu en face ── -->
        <DashCard
          id="ai-summary"
          level={5}
          title={texts.summaryTitle}
          info={`${texts.summaryIntro} ${texts.summaryPricesBasis}`}
          infoLabel={texts.pricesInfoLabel}
        >
          <ProviderFilter
            bind:value={summaryFilter}
            providers={summaryFilterProviders}
            locked={lockedProviders}
            labels={texts.providers}
            groupLabel={texts.filterLabel}
            allLabel={texts.filterAll}
            lockedText={texts.providerLocked}
            unlockText={texts.providerUnlock}
            on:unlock={(event) => showProviderKey(event.detail)}
          />
          <!-- La liste vient du serveur, plus l'éventuel modèle imposé par le
             déploiement ; les prix aussi. -->
          <ModelPicker
            name="ai-summary-model"
            legend={texts.summaryLabel}
            hideLegend
            bind:value={summaryModel}
            options={summaryFiltered}
            current={settings.summaryModel}
            currentLabel={texts.modelInService}
            lockedLabel={texts.lockedModel}
            unit={texts.pricePerSummary}
            levelLabel={texts.priceLevel}
            unknownLabel={prices ? texts.priceUnknown : ''}
            caption={prices ? texts.summaryPriceCaption : ''}
          />
          {#if summaryDescription}
            <p class="ai-choice"><strong>{summaryName}</strong> — {summaryDescription}</p>
          {/if}
          <!-- Un compte rendu coûte quelques centimes : « même prix » en deçà
             d'un vingtième de centime, pas d'un demi. -->
          <PriceDelta
            delta={summaryDelta}
            epsilon={0.0005}
            less={texts.summaryDeltaLess}
            more={texts.summaryDeltaMore}
            same={texts.summaryDeltaSame}
            {lang}
          />
          {#if summaryKeyNeeded}
            {@const neededLabel =
              texts.providers[summarySelectedProvider] || summarySelectedProvider}
            <p class="ai-warn">
              {fill(texts.providerKeyNeeded, { provider: neededLabel })}
              <button
                type="button"
                class="ai-link"
                on:click={() => showProviderKey(summarySelectedProvider)}
              >
                {fill(texts.providerUnlock, { provider: neededLabel })}
              </button>
            </p>
          {/if}
          {#if settings.summaryModelOffList}
            <p class="ai-warn">{texts.summaryOffList}</p>
          {/if}
          {#if prices}
            <p class="ai-hint">
              {[provenance.prices, provenance.fx].filter(Boolean).join(' · ')}
              <button type="button" class="ai-link" on:click={() => selectPanelSection('stats')}>
                {texts.pricesRefreshLink}
              </button>
            </p>
          {/if}
          {#if settings.summaryModelSource === 'env'}
            <p class="ai-hint">{texts.summarySourceEnv}</p>
          {:else if settings.summaryModelSource === 'default'}
            <p class="ai-hint">{texts.summarySourceDefault}</p>
          {/if}
          <div class="ai-card-actions">
            <span class="ai-hint ai-actions-hint">{texts.summaryHelp}</span>
            {#if summaryTestState === 'ok'}
              <span class="ai-ok"
                ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.summaryTestOk}</span
              >
            {/if}
            <button
              type="button"
              class="ai-ghost"
              on:click={testSummary}
              disabled={!summaryTestable ||
                summaryTestState === 'testing' ||
                saveState === 'saving'}
            >
              {summaryTestState === 'testing' ? texts.summaryTesting : texts.summaryTest}
            </button>
          </div>
        </DashCard>
      {:else if openSection === 'transcription'}
        <!-- ── Modèle de transcription ── -->
        <DashCard
          id="ai-transcription"
          level={5}
          title={texts.modelTitle}
          info={`${texts.modelIntro} ${texts.pricesBasis}`}
          infoLabel={texts.pricesInfoLabel}
        >
          <ProviderFilter
            bind:value={modelFilter}
            providers={filterProviders}
            locked={lockedProviders}
            labels={texts.providers}
            groupLabel={texts.filterLabel}
            allLabel={texts.filterAll}
            lockedText={texts.providerLocked}
            unlockText={texts.providerUnlock}
            on:unlock={(event) => showProviderKey(event.detail)}
          />
          <!-- La liste vient du serveur, ses prix aussi : proposer un modèle qu'il
             refuserait ne produirait qu'une panne au prochain enregistrement. -->
          <ModelPicker
            name="ai-transcription-model"
            legend={texts.modelLabel}
            hideLegend
            bind:value={model}
            options={filteredOptions}
            current={settings.transcriptionModel}
            currentLabel={texts.modelInService}
            lockedLabel={texts.lockedModel}
            unit={texts.pricePerHour}
            levelLabel={texts.priceLevel}
            unknownLabel={prices ? texts.priceUnknown : ''}
          />
          {#if selectedDescription}
            <p class="ai-choice"><strong>{selectedName}</strong> — {selectedDescription}</p>
          {/if}
          <PriceDelta
            delta={transcriptionDelta}
            less={texts.priceDeltaLess}
            more={texts.priceDeltaMore}
            same={texts.priceDeltaSame}
            {lang}
          />
          {#if providerKeyNeeded}
            {@const neededLabel = texts.providers[selectedProvider] || selectedProvider}
            <p class="ai-warn">
              {fill(texts.providerKeyNeeded, { provider: neededLabel })}
              <button
                type="button"
                class="ai-link"
                on:click={() => showProviderKey(selectedProvider)}
              >
                {fill(texts.providerUnlock, { provider: neededLabel })}
              </button>
            </p>
          {/if}
          {#if retired}
            <p class="ai-warn">
              {retiredText}
              <button
                type="button"
                class="ai-link"
                on:click={() => keepReplacement('transcriptionModel')}
                disabled={saveState === 'saving'}
              >
                {fill(texts.modelRetiredKeep, { model: settings.transcriptionModel })}
              </button>
            </p>
          {/if}
          {#if prices}
            <p class="ai-hint">
              {[provenance.prices, provenance.fx].filter(Boolean).join(' · ')}
              <button type="button" class="ai-link" on:click={() => selectPanelSection('stats')}>
                {texts.pricesRefreshLink}
              </button>
            </p>
          {/if}
          {#if settings.transcriptionModelSource === 'env'}
            <p class="ai-hint">{texts.modelSourceEnv}</p>
          {:else if settings.transcriptionModelSource === 'default'}
            <p class="ai-hint">{texts.modelSourceDefault}</p>
          {/if}
          <div class="ai-card-actions">
            <span class="ai-hint ai-actions-hint">{texts.modelHelp}</span>
            {#if modelTestState === 'ok'}
              <span class="ai-ok"
                ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.modelTestOk}</span
              >
            {/if}
            <button
              type="button"
              class="ai-ghost"
              on:click={testModel}
              disabled={!modelTestable || modelTestState === 'testing' || saveState === 'saving'}
            >
              {modelTestState === 'testing' ? texts.modelTesting : texts.modelTest}
            </button>
          </div>
        </DashCard>
      {:else if openSection === 'infographic'}
        <!-- ── Infographie de compte rendu ── -->
        <DashCard id="ai-infographic" level={5} title={texts.infographicTitle}>
          <p class="ai-hint ai-panel-intro">{texts.infographicIntro}</p>
          <div class="ai-toggle-row">
            <span class="ai-toggle-label">{texts.infographicToggleLabel}</span>
            <ToggleSwitch
              bind:checked={infographicEnabled}
              label={texts.infographicToggleLabel}
              disabled={saveState === 'saving'}
            />
          </div>
          <p class="ai-hint">{texts.infographicHelp}</p>

          <!-- Plus de modèle d'image ni de style graphique à régler depuis les
             gabarits (2026-11-17) : la mise en page est fixe, le logo et les
             couleurs viennent de l'Apparence. On le dit, plutôt que de laisser
             chercher où se règle l'allure des infographies. -->
          {#if infographicEnabled}
            <p class="ai-hint">{texts.infographicLookHelp}</p>
          {/if}
        </DashCard>
      {/if}
    {/if}

    <!-- Barre collante : même anatomie que Entreprise, Authentification et
         Actions — un bouton, sous les yeux quelle que soit la hauteur. -->
    <div class="ai-actions">
      {#if dirty}
        <span class="ai-unsaved">{texts.unsavedHint}</span>
        <button type="button" class="ai-ghost" on:click={discard} disabled={saveState === 'saving'}>
          {texts.discardChanges}
        </button>
      {:else if saveState === 'saved'}
        {#if savedFields.key}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.saved}</span
          >
        {/if}
        {#each savedFields.providerKeys as provider (provider)}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" />
            {fill(texts.providerKeyStored, {
              provider: texts.providers[provider] || provider,
            })}</span
          >
        {/each}
        {#if savedFields.model}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.modelSaved}</span
          >
        {/if}
        {#if savedFields.summary}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.summarySaved}</span
          >
        {/if}
        {#if savedFields.infographic}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.infographicSaved}</span
          >
        {/if}
      {/if}
      <button type="button" class="ai-save" on:click={save} disabled={!canSave}>
        {saveState === 'saving' ? userTexts.saving : userTexts.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .ai-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  /* Cartes, pastilles et tuiles : DashCard, DashPill, DashTile (ui/) — la
     même anatomie que Configuration et Authentification. Ne restent ici que
     leur disposition et le contenu des panneaux. */
  .ai-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .ai-provider-panel {
    padding: 0 0.85rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff;
  }
  .ai-tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }

  /* ── Panneau déplié ── */
  .ai-panel-intro {
    margin-top: -0.35rem;
  }
  .ai-choice {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--ink-soft);
  }
  .ai-choice strong {
    color: var(--ink);
  }
  .ai-actions-hint {
    margin: 0 auto 0 0;
    flex: 1 1 14rem;
  }

  .ai-hint {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .ai-warn {
    margin: 0.3rem 0 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 0.85rem;
  }
  .ai-link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-weight: 600;
    color: var(--brand-text);
    cursor: pointer;
  }
  .ai-link:hover {
    text-decoration: underline;
  }
  .ai-link:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    border-radius: 3px;
  }
  .ai-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .ai-skeleton {
    height: 220px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: ai-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes ai-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ai-skeleton {
      animation: none;
    }
  }

  /* Ligne interrupteur de la carte Infographie — même anatomie que les lignes
     à interrupteur des autres onglets : libellé à gauche, interrupteur à droite. */
  .ai-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }
  .ai-toggle-label {
    font-size: 0.9rem;
    color: #1a1a1a;
  }

  /* Gestes propres à une carte (tester, retirer) : alignés à droite, dans la
     carte — ce ne sont pas des enregistrements. */
  .ai-card-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  /* ── Barre d'action collante — même bleed que les autres onglets ──
     Elle déborde sur le padding de `.ap-body` (22px, 16px en mobile) : sans ce
     bleed, le contenu défilerait dans la marge sous la barre. */
  .ai-actions {
    position: sticky;
    bottom: -22px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.6rem;
    border-top: 1px solid var(--line);
    margin: 0 -22px -22px;
    padding: 0.85rem 22px 22px;
    background: #fff;
  }
  .ai-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: oklch(48% 0.12 150);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .ai-unsaved {
    font-size: 0.82rem;
    color: var(--ink-muted);
  }
  .ai-ghost {
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.88rem;
    transition: background 0.15s;
  }
  .ai-ghost:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .ai-ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ai-save {
    padding: 0.6rem 1.3rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-weight: 600;
    font-family: inherit;
    font-size: 0.92rem;
    cursor: pointer;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
    transition:
      background 0.15s,
      transform 0.1s;
  }
  .ai-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .ai-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .ai-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .ai-tiles {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.45rem;
    }
    .ai-actions {
      justify-content: stretch;
      bottom: -14px;
      margin: 0 -16px -14px;
      padding: 0.85rem 16px 14px;
    }
    .ai-actions button {
      flex: 1 1 auto;
    }
  }
</style>
