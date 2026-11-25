<script>
  /**
   * Rubrique « Organisation » de l'administration, en DEUX PAGES pour UN
   * composant (`view`) : « Entreprise » (les mots de l'organisation) et
   * « Marque & apparence » (logo, phrase, couleurs). Elles se sont séparées
   * parce qu'on ne vient pas chercher la même chose : l'une change les comptes
   * rendus de tout le monde, l'autre le cadre. Le composant reste un seul :
   * même chargement, même barre d'enregistrement, même règle « on n'envoie que
   * ce qui a changé » — et chaque page ne peut changer que ce qu'elle montre.
   *
   * L'identité de l'installation, pour tous les comptes — le vocabulaire de l'organisation
   * (joint à CHAQUE compte rendu), les corrections automatiques de la
   * transcription (appliquées à CHAQUE réunion) et l'apparence de myBrief
   * (logo, phrase d'accueil de la barre latérale, couleurs primaire et
   * secondaire).
   *
   * Trois documents serveur, UN bouton Enregistrer. Le vocabulaire vit dans
   * `appSettings/orgContext` (routes /admin/settings/org-context), les
   * corrections dans `appSettings/transcriptCorrections`, l'apparence dans
   * `appSettings/branding`. Réunis sur une page, leur laisser chacun son
   * bouton aurait mis trois « Enregistrer » à l'écran, dont un seul sous les
   * yeux. Le bouton envoie ce qui a changé, document par document, et
   * n'adopte que ce qui a réussi : un échec d'un côté laisse l'autre
   * enregistré et les champs restants marqués « non enregistrés ».
   *
   * Le logo est lu en data-URL (FileReader) et stocké en base : rien à servir,
   * rien à monter, et la sonde publique /api/auth/config le transporte comme
   * n'importe quel réglage. Poids borné ICI (mêmes plafonds que le serveur) :
   * refuser à la sélection met l'erreur sous les yeux de la personne qui vient
   * de choisir le fichier, pas dans un 400 générique à l'enregistrement.
   *
   * À l'enregistrement, seuls les champs MODIFIÉS partent (absent = inchangé,
   * vide = retour à la valeur intégrée — même contrat que l'onglet IA), puis
   * `refreshCapabilities()` relit la sonde publique : les couleurs, le logo et
   * la phrase s'appliquent immédiatement, sans recharger la page. Le
   * vocabulaire, lui, rejoint le store d'assemblage du prompt :
   * l'administrateur est aussi un utilisateur, son prochain compte rendu doit
   * porter ce qu'il vient d'écrire. Même chose pour les corrections : sa
   * prochaine phrase transcrite les applique déjà.
   *
   * TABLEAU DE BORD REPLIÉ (2026-10-28), comme l'onglet IA : deux groupes de
   * tuiles — les mots de l'organisation (vocabulaire, corrections), l'
   * apparence (logo, phrase d'accueil, couleurs) — disent ce qui est en place,
   * et un clic déplie le réglage d'une tuile sous son groupe, un seul à la
   * fois. Les saisies vivent ici, pas dans les panneaux : replier une tuile ne
   * perd rien, et sa tuile dit « Modifié » jusqu'à l'enregistrement.
   */
  import { onMount } from 'svelte';
  import IconBook from '~icons/solar/book-2-linear';
  import IconPen from '~icons/solar/pen-new-square-linear';
  import IconImage from '~icons/solar/gallery-linear';
  import IconBuildings from '~icons/solar/buildings-2-linear';
  import IconText from '~icons/solar/text-square-linear';
  import IconPalette from '~icons/solar/palette-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import DashCard from '../ui/DashCard.svelte';
  import DashTile from '../ui/DashTile.svelte';
  import BrandColorField from './BrandColorField.svelte';
  import TranscriptCorrectionsCard from './TranscriptCorrectionsCard.svelte';
  import {
    fetchBrandingSettings,
    saveBrandingSettings,
    fetchOrgContextSettings,
    saveOrgContextSettings,
    fetchTranscriptCorrections,
    saveTranscriptCorrections,
  } from '../../services/adminUsersApi.js';
  import { refreshCapabilities } from '../../stores/auth.js';
  import {
    DEFAULT_PRIMARY_COLOR,
    DEFAULT_SECONDARY_COLOR,
    HEX_COLOR_PATTERN,
  } from '../../stores/branding.js';
  import { setOrgContext } from '../../stores/orgContext.js';
  import { setTranscriptCorrections } from '../../stores/transcriptCorrections.js';
  import {
    checkRows,
    rowsKey,
    rowsToRules,
    rulesToRows,
  } from '../../utils/transcriptCorrections.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';
  import { setCompanyLogo } from '../../stores/companyLogo.js';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import defaultLogoUrl from '../../logo.webp';

  // Mêmes plafonds que le serveur (lib/repositories/settings.js) : une image
  // de 600 Ko donne une data-URL ≈ 800 Ko ; ORG_CONTEXT_MAX pour le texte.
  const LOGO_FILE_MAX = 600 * 1024;
  const LOGO_MAX_KB = Math.round(LOGO_FILE_MAX / 1024);
  const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
  const CONTEXT_MAX = 2000;

  let saved = {
    logo: '',
    companyLogo: '',
    tagline: '',
    taglineEn: '',
    primaryColor: '',
    secondaryColor: '',
    updatedAt: null,
    updatedBy: null,
  };
  let savedContext = { context: '', updatedAt: null, updatedBy: null };
  let savedCorrections = { rules: [], updatedAt: null, updatedBy: null };
  let savedCorrectionsKey = '[]';
  let correctionRows = [];
  let logo = '';
  // Logo de l'ENTREPRISE (en tête des infographies), à côté de celui de
  // l'application : même saisie, même plafond, un champ à lui.
  let companyLogo = '';
  // Le champ de fichier est unique : `pickTarget` dit quel logo il remplit.
  let pickTarget = 'logo';
  let tagline = '';
  let taglineEn = '';
  let color = DEFAULT_PRIMARY_COLOR;
  let secondary = DEFAULT_SECONDARY_COLOR;
  let context = '';
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';
  let fileInput;
  // Le réglage déplié sous les tuiles : un seul à la fois.
  let openSection = ''; // '' | 'context' | 'corrections' | 'companyLogo' | 'logo' | 'tagline' | 'colors'

  /**
   * Ce que l'écran montre : 'company' (vocabulaire et corrections), 'look'
   * (logo, phrase, couleurs) ou 'all'.
   * @type {'all'|'company'|'look'}
   */
  export let view = 'all';
  $: showWords = view !== 'look';
  $: showLook = view !== 'company';

  $: texts = $uiText.adminBranding;
  $: ctxTexts = $uiText.adminOrgContext;
  $: userTexts = $uiText.adminUsers;
  // '' en base = orange intégré ; les sélecteurs, eux, montrent toujours une
  // vraie couleur. On compare donc des valeurs EFFECTIVES.
  $: savedColor = saved.primaryColor || DEFAULT_PRIMARY_COLOR;
  $: savedSecondary = saved.secondaryColor || DEFAULT_SECONDARY_COLOR;
  $: colorsValid = HEX_COLOR_PATTERN.test(color.trim()) && HEX_COLOR_PATTERN.test(secondary.trim());
  $: contextValid = context.length <= CONTEXT_MAX;
  // Déclarations réactives et non fonctions : Svelte ne suit que les
  // identifiants qu'il VOIT (piège rencontré sur les autres écrans de réglages).
  $: logoDirty = logo !== saved.logo;
  $: companyLogoDirty = companyLogo !== (saved.companyLogo || '');
  $: taglineDirty = tagline !== (saved.tagline || '') || taglineEn !== (saved.taglineEn || '');
  $: colorsDirty = color.trim() !== savedColor || secondary.trim() !== savedSecondary;
  $: brandingDirty = logoDirty || companyLogoDirty || taglineDirty || colorsDirty;
  $: contextDirty = context.trim() !== (savedContext.context || '');
  $: correctionsDirty = rowsKey(correctionRows) !== savedCorrectionsKey;
  $: correctionsValid = checkRows(correctionRows).every((v) => v?.level !== 'error');
  $: dirty = brandingDirty || contextDirty || correctionsDirty;
  $: canSave = dirty && colorsValid && contextValid && correctionsValid && saveState !== 'saving';
  $: counter = ctxTexts.counter
    .replace('{n}', String(context.length))
    .replace('{max}', String(CONTEXT_MAX));

  // ── Tuiles : ce qui est en place, en un coup d'œil ──
  $: tcTexts = $uiText.adminTranscriptCorrections;
  $: correctionRules = rowsToRules(correctionRows);
  $: correctionsCount =
    correctionRules.length === 0
      ? tcTexts.badgeEmpty
      : correctionRules.length === 1
        ? tcTexts.badgeOne
        : tcTexts.badgeMany.replace('{n}', String(correctionRules.length));
  $: correctionsSample = correctionRules.map((rule) => `${rule.from[0]} → ${rule.to}`).join(' · ');
  // Une couleur en cours de saisie n'est peut-être pas encore une couleur :
  // la pastille garde alors la dernière valide.
  $: primarySwatch = HEX_COLOR_PATTERN.test(color.trim()) ? color.trim() : savedColor;
  $: secondarySwatch = HEX_COLOR_PATTERN.test(secondary.trim()) ? secondary.trim() : savedSecondary;
  $: colorsCustom =
    primarySwatch.toLowerCase() !== DEFAULT_PRIMARY_COLOR ||
    secondarySwatch.toLowerCase() !== DEFAULT_SECONDARY_COLOR;
  $: wordTiles = [
    {
      id: 'context',
      icon: IconBook,
      label: texts.tileContext,
      sub: context.trim() || texts.tileContextEmpty,
      flag: contextDirty ? texts.tileChanged : '',
    },
    {
      id: 'corrections',
      icon: IconPen,
      label: texts.tileCorrections,
      sub: correctionsSample || texts.tileCorrectionsEmpty,
      flag: !correctionsValid ? texts.tileInvalid : correctionsDirty ? texts.tileChanged : '',
      warn: !correctionsValid,
    },
  ];
  $: lookTiles = [
    {
      // Sans logo d'entreprise, les infographies portent celui de
      // l'application : la tuile le signale, comme la pastille de la section.
      id: 'companyLogo',
      icon: IconBuildings,
      label: texts.tileCompanyLogo,
      sub: texts.tileCompanyLogoSub,
      flag: companyLogoDirty ? texts.tileChanged : companyLogo ? '' : texts.tileCompanyLogoMissing,
      warn: !companyLogo && !companyLogoDirty,
    },
    {
      id: 'logo',
      icon: IconImage,
      label: texts.tileLogo,
      sub: texts.tileLogoSub,
      flag: logoDirty ? texts.tileChanged : '',
    },
    {
      id: 'tagline',
      icon: IconText,
      label: texts.tileTagline,
      sub: taglineEn.trim()
        ? fill(texts.tileTaglineEn, { text: taglineEn.trim() })
        : texts.tileTaglineSub,
      flag: taglineDirty ? texts.tileChanged : '',
    },
    {
      id: 'colors',
      icon: IconPalette,
      label: texts.tileColors,
      sub: colorsCustom ? texts.tileColorsCustom : texts.tileColorsDefault,
      flag: !colorsValid ? texts.tileInvalid : colorsDirty ? texts.tileChanged : '',
      warn: !colorsValid,
    },
  ];

  onMount(load);

  async function load() {
    loading = true;
    errorMessage = '';
    const [branding, org, corrections] = await Promise.all([
      fetchBrandingSettings(),
      fetchOrgContextSettings(),
      fetchTranscriptCorrections(),
    ]);
    loading = false;
    if (branding.ok) adoptBranding(branding.data.settings);
    if (org.ok) adoptContext(org.data.settings);
    if (corrections.ok) adoptCorrections(corrections.data.settings);
    const failed = [branding, org, corrections].find((r) => !r.ok);
    if (failed) errorMessage = messageFor(failed.data);
  }

  function adoptBranding(settings) {
    saved = settings;
    logo = settings.logo || '';
    companyLogo = settings.companyLogo || '';
    tagline = settings.tagline || '';
    taglineEn = settings.taglineEn || '';
    color = settings.primaryColor || DEFAULT_PRIMARY_COLOR;
    secondary = settings.secondaryColor || DEFAULT_SECONDARY_COLOR;
  }

  function adoptContext(settings) {
    savedContext = settings || { context: '', updatedAt: null, updatedBy: null };
    context = savedContext.context || '';
    setOrgContext(context);
  }

  function adoptCorrections(settings) {
    savedCorrections = settings || { rules: [], updatedAt: null, updatedBy: null };
    correctionRows = rulesToRows(savedCorrections.rules);
    savedCorrectionsKey = rowsKey(correctionRows);
    setTranscriptCorrections(savedCorrections.rules);
  }

  function toggleSection(id) {
    openSection = openSection === id ? '' : id;
  }

  function messageFor(data) {
    return userTexts.errors[data?.error] || userTexts.errors.unknown;
  }

  /** @param {'logo'|'companyLogo'} target - le logo que le fichier choisi remplira */
  function pickLogo(target) {
    pickTarget = target;
    fileInput?.click();
  }

  function onLogoChosen(event) {
    const file = event.currentTarget.files?.[0];
    // Même fichier re-choisi après une erreur : sans ce reset, aucun événement.
    event.currentTarget.value = '';
    if (!file) return;
    errorMessage = '';
    if (!LOGO_TYPES.includes(file.type)) {
      errorMessage = texts.logoBadType;
      return;
    }
    if (file.size > LOGO_FILE_MAX) {
      errorMessage = texts.logoTooLarge.replace('{max}', String(LOGO_MAX_KB));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      if (pickTarget === 'companyLogo') companyLogo = value;
      else logo = value;
    };
    reader.onerror = () => {
      errorMessage = texts.logoReadError;
    };
    reader.readAsDataURL(file);
  }

  function discard() {
    adoptBranding(saved);
    adoptContext(savedContext);
    adoptCorrections(savedCorrections);
    errorMessage = '';
  }

  // Seuls les champs modifiés partent ; une couleur redevenue la teinte
  // intégrée s'enregistre '' — c'est le « pas de personnalisation » du serveur,
  // pas une couleur qui vaudrait par coïncidence celle du défaut.
  function colorPatch(raw, fallback) {
    const value = raw.trim().toLowerCase();
    return value === fallback ? '' : value;
  }

  function brandingPatch() {
    const patch = {};
    if (logo !== saved.logo) patch.logo = logo;
    if (companyLogo !== (saved.companyLogo || '')) patch.companyLogo = companyLogo;
    if (tagline !== (saved.tagline || '')) patch.tagline = tagline.trim();
    if (taglineEn !== (saved.taglineEn || '')) patch.taglineEn = taglineEn.trim();
    if (color.trim() !== savedColor) {
      patch.primaryColor = colorPatch(color, DEFAULT_PRIMARY_COLOR);
    }
    if (secondary.trim() !== savedSecondary) {
      patch.secondaryColor = colorPatch(secondary, DEFAULT_SECONDARY_COLOR);
    }
    return patch;
  }

  async function saveBranding(patch) {
    const res = await saveBrandingSettings(patch);
    if (res.ok) {
      adoptBranding(res.data.settings);
      // Propage à toute l'application (couleur, logo, phrase) via la sonde
      // publique — sans rechargement. Le logo d'entreprise n'y passe pas :
      // les infographies le reçoivent directement.
      refreshCapabilities();
      setCompanyLogo(res.data.settings.companyLogo);
    }
    return res;
  }

  async function saveContext() {
    const res = await saveOrgContextSettings({ context: context.trim() });
    if (res.ok) adoptContext(res.data.settings);
    return res;
  }

  async function saveCorrections() {
    const res = await saveTranscriptCorrections({ rules: rowsToRules(correctionRows) });
    if (res.ok) adoptCorrections(res.data.settings);
    return res;
  }

  async function save() {
    saveState = 'saving';
    errorMessage = '';
    const patch = brandingPatch();
    const jobs = [];
    if (Object.keys(patch).length > 0) jobs.push(saveBranding(patch));
    if (contextDirty) jobs.push(saveContext());
    if (correctionsDirty) jobs.push(saveCorrections());
    const results = await Promise.all(jobs);
    const failed = results.find((r) => !r.ok);
    if (failed) {
      saveState = 'idle';
      errorMessage = messageFor(failed.data);
      return;
    }
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
  }
</script>

<div class="bt-wrap">
  {#if loading}
    <div class="bt-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorMessage}
      <div class="bt-error" role="alert">{errorMessage}</div>
    {/if}

    {#if showWords}
      <!-- ── Les mots de l'organisation ──
         En tête : c'est ce qui change les comptes rendus de tout le monde,
         l'apparence n'en change que le cadre. Le vocabulaire guide le compte
         rendu, les corrections réécrivent la transcription elle-même. -->
      <h3 class="bt-group">{texts.groupWords}</h3>
      <div class="bt-tiles bt-tiles-2">
        {#each wordTiles as tile (tile.id)}
          <DashTile
            icon={tile.icon}
            label={tile.label}
            open={openSection === tile.id}
            flag={tile.flag}
            warn={!!tile.warn}
            sub={tile.sub}
            on:click={() => toggleSection(tile.id)}
          >
            {#if tile.id === 'context'}
              {context.trim() ? ctxTexts.badgeSet : ctxTexts.badgeEmpty}
            {:else}
              {correctionsCount}
            {/if}
          </DashTile>
        {/each}
      </div>

      {#if openSection === 'context'}
        <DashCard id="bt-context-panel" level={5} title={ctxTexts.title} info={ctxTexts.intro}>
          <div class="bt-field">
            <label class="bt-label" for="bt-context">{ctxTexts.label}</label>
            <textarea
              id="bt-context"
              class="bt-input bt-textarea"
              rows="5"
              maxlength={CONTEXT_MAX}
              placeholder={ctxTexts.placeholder}
              bind:value={context}
            ></textarea>
            <div class="bt-field-foot">
              <p class="bt-hint">{ctxTexts.help}</p>
              <span class="bt-counter" class:bt-counter-max={!contextValid}>{counter}</span>
            </div>
            {#if savedContext.updatedBy}
              <p class="bt-meta">{ctxTexts.updatedBy} {savedContext.updatedBy}</p>
            {/if}
          </div>
        </DashCard>
      {:else if openSection === 'corrections'}
        <TranscriptCorrectionsCard
          bind:rows={correctionRows}
          updatedBy={savedCorrections.updatedBy}
        />
      {/if}
    {/if}

    {#if showLook}
      <!-- ── Apparence ── -->
      <div class="bt-group-head">
        <h3 class="bt-group">{texts.groupLook}</h3>
        {#if saved.updatedBy}
          <span class="bt-meta">{texts.updatedBy} {saved.updatedBy}</span>
        {/if}
      </div>
      <div class="bt-tiles bt-tiles-2">
        {#each lookTiles as tile (tile.id)}
          <DashTile
            icon={tile.icon}
            label={tile.label}
            open={openSection === tile.id}
            flag={tile.flag}
            warn={!!tile.warn}
            sub={tile.sub}
            on:click={() => toggleSection(tile.id)}
          >
            {#if tile.id === 'companyLogo'}
              {#if companyLogo}
                <img class="bt-tile-logo bt-tile-logo-wide" src={companyLogo} alt="" />
              {/if}
              {companyLogo ? texts.companyLogoSetBadge : texts.companyLogoMissingBadge}
            {:else if tile.id === 'logo'}
              <img class="bt-tile-logo" src={logo || defaultLogoUrl} alt="" />
              {logo ? texts.logoCustomBadge : texts.logoDefaultBadge}
            {:else if tile.id === 'tagline'}
              {tagline.trim() || texts.tileTaglineDefault}
            {:else}
              <span class="bt-swatch" style:background={primarySwatch}></span><span
                class="bt-swatch"
                style:background={secondarySwatch}
              ></span>
              {primarySwatch.toLowerCase()}
            {/if}
          </DashTile>
        {/each}
      </div>

      <!-- Un seul champ de fichier pour les deux logos (cf. pickTarget). -->
      <input
        type="file"
        accept={LOGO_TYPES.join(',')}
        bind:this={fileInput}
        on:change={onLogoChosen}
        class="bt-file"
        aria-hidden="true"
        tabindex="-1"
      />

      {#if openSection === 'companyLogo'}
        <DashCard
          id="bt-company-logo-panel"
          level={5}
          title={texts.companyLogoTitle}
          info={texts.companyLogoIntro}
        >
          <div class="bt-logo-row">
            <span class="bt-logo-preview bt-logo-preview-wide" class:bt-logo-empty={!companyLogo}>
              {#if companyLogo}
                <img src={companyLogo} alt={texts.companyLogoPreviewAlt} />
              {:else}
                <IconBuildings width="28" height="28" aria-hidden="true" />
              {/if}
            </span>
            <div class="bt-logo-actions">
              <div class="bt-logo-buttons">
                <button type="button" class="bt-ghost" on:click={() => pickLogo('companyLogo')}
                  >{texts.logoChoose}</button
                >
                {#if companyLogo}
                  <button type="button" class="bt-ghost" on:click={() => (companyLogo = '')}>
                    {texts.companyLogoReset}
                  </button>
                {/if}
              </div>
              <p class="bt-hint">
                {texts.companyLogoHint.replace('{max}', String(LOGO_MAX_KB))}
              </p>
              {#if !companyLogo}
                <p class="bt-hint bt-hint-warn">{texts.companyLogoFallback}</p>
              {/if}
            </div>
          </div>
        </DashCard>
      {:else if openSection === 'logo'}
        <DashCard id="bt-logo-panel" level={5} title={texts.logoTitle} info={texts.logoIntro}>
          <div class="bt-logo-row">
            <span class="bt-logo-preview">
              <img src={logo || defaultLogoUrl} alt={texts.logoPreviewAlt} />
            </span>
            <div class="bt-logo-actions">
              <div class="bt-logo-buttons">
                <button type="button" class="bt-ghost" on:click={() => pickLogo('logo')}
                  >{texts.logoChoose}</button
                >
                {#if logo}
                  <button type="button" class="bt-ghost" on:click={() => (logo = '')}>
                    {texts.logoReset}
                  </button>
                {/if}
              </div>
              <p class="bt-hint">{texts.logoHint.replace('{max}', String(LOGO_MAX_KB))}</p>
            </div>
          </div>
        </DashCard>
      {:else if openSection === 'tagline'}
        <DashCard
          id="bt-tagline-panel"
          level={5}
          title={texts.taglineTitle}
          info={texts.taglineIntro}
        >
          <div class="bt-grid">
            <div class="bt-field">
              <label class="bt-label" for="bt-tagline">{texts.taglineLabel}</label>
              <input
                id="bt-tagline"
                class="bt-input"
                type="text"
                maxlength="120"
                lang="fr"
                placeholder={texts.taglinePlaceholder}
                bind:value={tagline}
              />
              <p class="bt-hint">{texts.taglineHint}</p>
            </div>
            <div class="bt-field">
              <label class="bt-label" for="bt-tagline-en">{texts.taglineEnLabel}</label>
              <input
                id="bt-tagline-en"
                class="bt-input"
                type="text"
                maxlength="120"
                lang="en"
                placeholder={texts.taglineEnPlaceholder}
                bind:value={taglineEn}
              />
              <p class="bt-hint">{texts.taglineEnHint}</p>
            </div>
          </div>
        </DashCard>
      {:else if openSection === 'colors'}
        <DashCard id="bt-colors-panel" level={5} title={texts.colorTitle} info={texts.colorIntro}>
          <div class="bt-colors">
            <BrandColorField
              id="bt-color"
              label={texts.colorLabel}
              hexLabel={texts.colorHexLabel}
              defaultColor={DEFAULT_PRIMARY_COLOR}
              invalidText={texts.colorInvalid}
              resetText={texts.colorReset}
              bind:value={color}
            />
            <p class="bt-hint">{texts.colorSecondaryHint}</p>
            <BrandColorField
              id="bt-secondary"
              label={texts.colorSecondaryLabel}
              hexLabel={texts.colorHexLabel}
              defaultColor={DEFAULT_SECONDARY_COLOR}
              invalidText={texts.colorInvalid}
              resetText={texts.colorSecondaryReset}
              bind:value={secondary}
            />
          </div>
        </DashCard>
      {/if}
    {/if}

    <!-- Barre collante : même anatomie que Modèles IA, Authentification et Actions. -->
    <div class="bt-actions">
      {#if dirty}
        <span class="bt-dirty">{texts.unsavedHint}</span>
        <button type="button" class="bt-ghost" on:click={discard} disabled={saveState === 'saving'}>
          {texts.discardChanges}
        </button>
      {:else if saveState === 'saved'}
        <span class="bt-ok"
          ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.saved}</span
        >
      {/if}
      <button type="button" class="bt-save" on:click={save} disabled={!canSave}>
        {saveState === 'saving' ? userTexts.saving : userTexts.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .bt-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  /* Tuiles et panneaux : DashTile, DashCard (ui/) — la même anatomie que les
     onglets IA et Authentification. Ne restent ici que les groupes, le
     contenu des tuiles et les champs. */
  .bt-group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.2rem 0.75rem;
  }
  .bt-group {
    margin: 0.3rem 0 -0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-faint);
  }
  .bt-group-head .bt-meta {
    margin-bottom: -0.35rem;
  }
  .bt-tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }
  .bt-tiles-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* Valeurs illustrées : la vignette du logo, les pastilles des couleurs —
     dans la ligne de texte de la tuile. */
  .bt-tile-logo {
    width: 22px;
    height: 22px;
    margin-right: 0.35rem;
    border-radius: 5px;
    object-fit: contain;
    vertical-align: middle;
  }
  .bt-swatch {
    display: inline-block;
    width: 16px;
    height: 16px;
    margin-right: 0.25rem;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
    vertical-align: -2px;
  }
  .bt-swatch + .bt-swatch {
    margin-left: -0.55rem;
    margin-right: 0.45rem;
    box-shadow:
      inset 0 0 0 1px rgb(0 0 0 / 0.12),
      0 0 0 2px #fff;
  }
  .bt-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
    align-items: start;
  }

  /* ── Logo ── */
  .bt-logo-row {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .bt-logo-preview {
    flex: 0 0 auto;
    width: 72px;
    height: 72px;
    border-radius: 10px;
    background: #fff;
    border: 1px dashed var(--line-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .bt-logo-preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  /* Logo d'entreprise : il ouvre les infographies en longueur, l'aperçu aussi. */
  .bt-logo-preview-wide {
    width: 168px;
    padding: 8px;
  }
  .bt-logo-empty {
    color: var(--warn-text);
    border-color: var(--warn-line);
    background: var(--warn-bg);
  }
  .bt-tile-logo-wide {
    width: auto;
    max-width: 64px;
  }
  .bt-hint-warn {
    color: var(--warn-text);
  }
  .bt-logo-actions {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .bt-logo-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  /* Masqué mais focusable par le bouton : l'input nu est infixable au design. */
  .bt-file {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  /* ── Couleurs ── (le trio sélecteur/hexa/réinitialisation : BrandColorField) */
  .bt-colors {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .bt-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }
  .bt-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bt-input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.92rem;
    background: #fff;
    color: #1a1a1a;
    width: 100%;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .bt-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .bt-textarea {
    font: inherit;
    font-size: 0.88rem;
    line-height: 1.5;
    resize: vertical;
    min-height: 96px;
  }
  /* Aide à gauche, compteur à droite ; sur un écran étroit le compteur passe
     sous l'aide plutôt que de l'écraser sur trois mots par ligne. */
  .bt-field-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.25rem 0.75rem;
  }
  .bt-field-foot .bt-hint {
    flex: 1 1 260px;
  }
  .bt-counter {
    flex: 0 0 auto;
    margin-left: auto;
    margin-top: 0.15rem;
    font-size: 0.76rem;
    color: var(--ink-faint);
    white-space: nowrap;
  }
  .bt-counter-max {
    color: var(--danger-text);
    font-weight: 600;
  }
  .bt-hint {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .bt-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .bt-meta {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }

  .bt-skeleton {
    height: 220px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: bt-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes bt-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bt-skeleton {
      animation: none;
    }
  }

  /* Sticky comme .ai-actions (AiTab) : le bouton reste visible sans scroller. */
  .bt-actions {
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
  .bt-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: oklch(48% 0.12 150);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .bt-dirty {
    font-size: 0.82rem;
    color: var(--ink-muted);
  }
  .bt-ghost {
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
  .bt-ghost:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .bt-ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .bt-save {
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
  .bt-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .bt-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .bt-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .bt-tiles,
    .bt-tiles-2,
    .bt-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .bt-tiles {
      gap: 0.45rem;
    }
    .bt-actions {
      justify-content: stretch;
      bottom: -14px;
      margin: 0 -16px -14px;
      padding: 0.85rem 16px 14px;
    }
    .bt-actions button {
      flex: 1 1 auto;
    }
  }
</style>
