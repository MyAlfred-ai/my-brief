<script>
  /**
   * Onglet « Configuration » du panneau d'administration : l'identité de
   * l'installation, pour tous les comptes — le vocabulaire de l'organisation
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
   */
  import { onMount } from 'svelte';
  import IconBook from '~icons/solar/book-2-linear';
  import IconImage from '~icons/solar/gallery-linear';
  import IconText from '~icons/solar/text-square-linear';
  import IconPalette from '~icons/solar/palette-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
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
  import { uiText } from '../../store.js';
  import defaultLogoUrl from '../../logo.png';

  // Mêmes plafonds que le serveur (lib/repositories/settings.js) : une image
  // de 600 Ko donne une data-URL ≈ 800 Ko ; ORG_CONTEXT_MAX pour le texte.
  const LOGO_FILE_MAX = 600 * 1024;
  const LOGO_MAX_KB = Math.round(LOGO_FILE_MAX / 1024);
  const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
  const CONTEXT_MAX = 2000;

  let saved = {
    logo: '',
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
  let tagline = '';
  let taglineEn = '';
  let color = DEFAULT_PRIMARY_COLOR;
  let secondary = DEFAULT_SECONDARY_COLOR;
  let context = '';
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';
  let fileInput;

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
  $: brandingDirty =
    logo !== saved.logo ||
    tagline !== (saved.tagline || '') ||
    taglineEn !== (saved.taglineEn || '') ||
    color.trim() !== savedColor ||
    secondary.trim() !== savedSecondary;
  $: contextDirty = context.trim() !== (savedContext.context || '');
  $: correctionsDirty = rowsKey(correctionRows) !== savedCorrectionsKey;
  $: correctionsValid = checkRows(correctionRows).every((v) => v?.level !== 'error');
  $: dirty = brandingDirty || contextDirty || correctionsDirty;
  $: canSave = dirty && colorsValid && contextValid && correctionsValid && saveState !== 'saving';
  $: counter = ctxTexts.counter
    .replace('{n}', String(context.length))
    .replace('{max}', String(CONTEXT_MAX));

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

  function messageFor(data) {
    return userTexts.errors[data?.error] || userTexts.errors.unknown;
  }

  function pickLogo() {
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
      logo = String(reader.result || '');
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
      // publique — sans rechargement.
      refreshCapabilities();
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

    <p class="bt-intro">{texts.intro}</p>

    <!-- ── Vocabulaire et contexte de l'organisation ── -->
    <!-- En tête : c'est le réglage qui change les comptes rendus de tout le
         monde, l'apparence n'en change que le cadre. -->
    <SettingsCard
      title={ctxTexts.title}
      hint={ctxTexts.intro}
      icon={IconBook}
      on={!!savedContext.context}
    >
      <StatusBadge
        slot="badge"
        tone={context.trim() ? 'ok' : 'neutral'}
        text={context.trim() ? ctxTexts.badgeSet : ctxTexts.badgeEmpty}
      />

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
    </SettingsCard>

    <!-- ── Corrections automatiques de la transcription ── -->
    <!-- Sous le vocabulaire : même sujet (les mots de l'organisation), autre
         moment — le vocabulaire guide le compte rendu, les corrections
         réécrivent la transcription elle-même. -->
    <TranscriptCorrectionsCard
      bind:rows={correctionRows}
      savedCount={savedCorrections.rules.length}
      updatedBy={savedCorrections.updatedBy}
    />

    <!-- ── Logo ── -->
    <SettingsCard title={texts.logoTitle} hint={texts.logoIntro} icon={IconImage} on={!!saved.logo}>
      <StatusBadge
        slot="badge"
        tone={logo ? 'ok' : 'neutral'}
        text={logo ? texts.logoCustomBadge : texts.logoDefaultBadge}
      />

      <div class="bt-logo-row">
        <span class="bt-logo-preview">
          <img src={logo || defaultLogoUrl} alt={texts.logoPreviewAlt} />
        </span>
        <div class="bt-logo-actions">
          <button type="button" class="bt-ghost" on:click={pickLogo}>{texts.logoChoose}</button>
          {#if logo}
            <button type="button" class="bt-ghost" on:click={() => (logo = '')}>
              {texts.logoReset}
            </button>
          {/if}
          <p class="bt-hint">{texts.logoHint.replace('{max}', String(LOGO_MAX_KB))}</p>
        </div>
      </div>
      <input
        type="file"
        accept={LOGO_TYPES.join(',')}
        bind:this={fileInput}
        on:change={onLogoChosen}
        class="bt-file"
        aria-hidden="true"
        tabindex="-1"
      />
    </SettingsCard>

    <!-- ── Phrase d'accueil ── -->
    <SettingsCard
      title={texts.taglineTitle}
      hint={texts.taglineIntro}
      icon={IconText}
      on={!!(saved.tagline || saved.taglineEn)}
    >
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
    </SettingsCard>

    <!-- ── Couleurs de l'interface ── -->
    <SettingsCard
      title={texts.colorTitle}
      hint={texts.colorIntro}
      icon={IconPalette}
      on={!!(saved.primaryColor || saved.secondaryColor)}
    >
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
    </SettingsCard>

    {#if saved.updatedBy}
      <p class="bt-meta">{texts.updatedBy} {saved.updatedBy}</p>
    {/if}

    <div class="bt-actions">
      {#if saveState === 'saved'}
        <span class="bt-ok"
          ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.saved}</span
        >
      {:else if dirty}
        <span class="bt-dirty">{texts.unsavedHint}</span>
      {/if}
      {#if dirty}
        <button type="button" class="bt-ghost" on:click={discard} disabled={saveState === 'saving'}>
          {texts.discardChanges}
        </button>
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

  .bt-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  /* Anatomie des cartes : SettingsCard (ui/) ; pastilles : StatusBadge. Ne
     restent ici que les champs. */

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
  .bt-logo-actions {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
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
