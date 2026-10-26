<script>
  /**
   * Section « Détection d'actions » de « Ma configuration ».
   *
   * C'était un onglet d'ADMINISTRATION : ce que l'assistant repère pendant une
   * réunion valait alors pour toute l'installation. C'est un réglage personnel
   * — deux personnes n'animent pas les mêmes réunions, et ce qui est du bruit
   * pour l'une est l'essentiel de l'autre. Il n'y a donc rien au-dessus de
   * l'utilisateur ici : ni plafond ni valeur d'organisation, contrairement aux
   * pages « Envoi d'email » et « Entreposer ».
   *
   * Deux familles de réglages, deux lieux d'application — c'est ce que l'écran
   * dit par ses cartes. Ce que la détection CHERCHE (sensibilité, mots
   * déclencheurs, droit de corriger une action) part dans la consigne envoyée
   * au modèle. Le RYTHME (profondeur d'écoute, espacement) est appliqué par le
   * navigateur, seul à savoir combien de phrases ont été transcrites.
   *
   * Le vocabulaire de l'organisation (noms de clients, sigles) n'est PAS ici :
   * il vaut pour tout le monde et sert aussi aux comptes rendus, donc il se
   * règle dans Administration → Templates. Le serveur le joint à la consigne,
   * en réunion comme au banc d'essai.
   *
   * ── Le banc d'essai teste les réglages AFFICHÉS ────────────────────────────
   * Enregistrés ou non : c'est ce qui permet de juger un changement avant de
   * l'adopter, et l'essai n'a aucun effet de bord. (Le bouton « Tester » des
   * actions, lui, exige un enregistrement préalable — il produit un envoi
   * réel.) En revanche il ne réimplémente rien : le serveur emprunte le chemin
   * d'exécution de la réunion réelle.
   */
  import { onMount } from 'svelte';
  import IconRadar from '~icons/solar/radar-2-linear';
  import IconTuning from '~icons/solar/tuning-2-linear';
  import IconFlask from '~icons/solar/test-tube-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import { saveDetectionSettings, testDetection } from '../../services/actionsApi.js';
  import {
    actionDetection,
    DEFAULT_DETECTION,
    applyDetectionSettings,
    refreshActionDetection,
  } from '../../stores/actionDetection.js';
  import { uiText, currentLanguageStore } from '../../store.js';

  // Mêmes bornes que le serveur (lib/actionDetectionSettings.js) : refuser à la
  // saisie met la limite sous les yeux plutôt que dans un 400 générique.
  const WINDOW_MIN = 3;
  const WINDOW_MAX = 30;
  const INTERVAL_MIN = 1;
  const INTERVAL_MAX = 10;
  const WORDS_MAX = 20;

  let saved = { ...DEFAULT_DETECTION };
  let enabled = DEFAULT_DETECTION.enabled;
  let sensitivity = DEFAULT_DETECTION.sensitivity;
  let triggerWordsText = DEFAULT_DETECTION.triggerWords.join(', ');
  let allowUpdates = DEFAULT_DETECTION.allowUpdates;
  let windowSize = DEFAULT_DETECTION.windowSize;
  let minSentences = DEFAULT_DETECTION.minSentences;

  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';

  // Banc d'essai
  let sample = '';
  let testing = false;
  let testResult = null;
  let showPrompt = false;

  $: texts = $uiText.configActionDetection;

  // Une liste, pas une chaîne : la saisie est libre (virgules, espaces), la
  // valeur envoyée est normalisée.
  $: triggerWords = triggerWordsText
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, WORDS_MAX);

  // Déclarations réactives et non appels de fonction : Svelte ne suit que les
  // identifiants qu'il VOIT — derrière un appel, « Enregistrer » resterait figé
  // sur l'état du montage.
  $: current = JSON.stringify([
    enabled,
    sensitivity,
    triggerWords,
    allowUpdates,
    windowSize,
    minSentences,
  ]);
  $: savedSignature = JSON.stringify([
    saved.enabled,
    saved.sensitivity,
    saved.triggerWords || [],
    saved.allowUpdates,
    saved.windowSize,
    saved.minSentences,
  ]);
  $: dirty = !loading && current !== savedSignature;
  $: valid =
    windowSize >= WINDOW_MIN &&
    windowSize <= WINDOW_MAX &&
    minSentences >= INTERVAL_MIN &&
    minSentences <= INTERVAL_MAX;
  $: canSave = dirty && valid && saveState !== 'saving';
  // Le résultat reste vrai de ce qui a été testé, plus de ce qui est affiché.
  $: staleResult = testResult && testResult.at !== current;

  // Combien de temps de parole avant la première analyse, en clair : un réglage
  // en « phrases » ne parle pas, une réunion se vit en secondes.
  $: pace = (minSentences * 7).toString();

  onMount(load);

  async function load() {
    loading = true;
    errorMessage = '';
    // Le store est la source : l'ordonnanceur d'App.svelte y lit le rythme, et
    // il a pu être hydraté par une réunion précédente. On le rafraîchit quand
    // même — l'écran doit montrer ce qui est en base, pas un cache.
    const res = await refreshActionDetection();
    loading = false;
    if (!res.ok) {
      errorMessage = messageFor({ error: res.error });
      return;
    }
    adopt($actionDetection);
  }

  function adopt(settings) {
    saved = { ...DEFAULT_DETECTION, ...settings };
    enabled = saved.enabled !== false;
    sensitivity = saved.sensitivity || DEFAULT_DETECTION.sensitivity;
    triggerWordsText = (saved.triggerWords || []).join(', ');
    allowUpdates = saved.allowUpdates !== false;
    windowSize = saved.windowSize ?? DEFAULT_DETECTION.windowSize;
    minSentences = saved.minSentences ?? DEFAULT_DETECTION.minSentences;
  }

  function messageFor(data) {
    const base = texts.errors[data?.error] || texts.errors.unknown;
    // Le message d'OpenAI est plus précis que tout ce qu'on écrirait à sa place.
    return data?.upstreamMessage ? `${base} — ${data.upstreamMessage}` : base;
  }

  function discard() {
    adopt(saved);
    errorMessage = '';
  }

  async function save() {
    saveState = 'saving';
    errorMessage = '';
    const res = await saveDetectionSettings({
      enabled,
      sensitivity,
      triggerWords,
      allowUpdates,
      windowSize,
      minSentences,
    });
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    // Le rythme est appliqué par le navigateur : sans cette mise à jour du
    // store, une réunion en cours garderait l'ancien jusqu'au rechargement.
    applyDetectionSettings(res.data.settings);
    adopt($actionDetection);
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
  }

  async function runTest() {
    if (!sample.trim() || testing) return;
    testing = true;
    errorMessage = '';
    const res = await testDetection({
      content: sample.trim(),
      // Même langue qu'en réunion : celle de l'interface.
      language: $currentLanguageStore,
      // Les réglages affichés, pas ceux en base : c'est l'objet du banc d'essai.
      settings: { sensitivity, triggerWords, allowUpdates },
    });
    testing = false;
    if (!res.ok) {
      errorMessage = messageFor(res.data);
      testResult = null;
      return;
    }
    testResult = { actions: res.data.actions || [], prompt: res.data.prompt || '', at: current };
    showPrompt = false;
  }
</script>

<div class="dt-wrap">
  {#if loading}
    <div class="dt-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorMessage}
      <div class="dt-error" role="alert">{errorMessage}</div>
    {/if}

    <p class="dt-intro">{texts.intro}</p>

    <SettingsCard title={texts.stateTitle} hint={texts.stateHint} icon={IconRadar} on={enabled}>
      <div class="dt-row">
        <label class="dt-row-label" for="dt-enabled">{texts.enabledLabel}</label>
        <ToggleSwitch id="dt-enabled" bind:checked={enabled} label={texts.enabledLabel} />
      </div>
      {#if !enabled}
        <p class="dt-warn">{texts.disabledWarning}</p>
      {/if}
    </SettingsCard>

    <SettingsCard title={texts.whatTitle} hint={texts.whatHint} icon={IconRadar} on={enabled}>
      <fieldset class="dt-field dt-fieldset">
        <legend class="dt-label">{texts.sensitivityLabel}</legend>
        {#each ['explicit', 'balanced', 'wide'] as level (level)}
          <label class="dt-choice" class:dt-choice-on={sensitivity === level}>
            <input type="radio" bind:group={sensitivity} value={level} name="dt-sensitivity" />
            <span>
              <strong>{texts.sensitivity[level].label}</strong>
              <em>{texts.sensitivity[level].hint}</em>
            </span>
          </label>
        {/each}
      </fieldset>

      <div class="dt-field">
        <label class="dt-label" for="dt-words">{texts.triggerWordsLabel}</label>
        <input
          id="dt-words"
          class="dt-input"
          type="text"
          bind:value={triggerWordsText}
          placeholder={texts.triggerWordsPlaceholder}
        />
        <p class="dt-hint">{texts.triggerWordsHint.replace('{max}', String(WORDS_MAX))}</p>
      </div>

      <div class="dt-row">
        <div class="dt-row-text">
          <label class="dt-row-label" for="dt-updates">{texts.allowUpdatesLabel}</label>
          <p class="dt-hint">{texts.allowUpdatesHint}</p>
        </div>
        <ToggleSwitch id="dt-updates" bind:checked={allowUpdates} label={texts.allowUpdatesLabel} />
      </div>
    </SettingsCard>

    <SettingsCard title={texts.paceTitle} hint={texts.paceHint} icon={IconTuning} on={enabled}>
      <div class="dt-field">
        <label class="dt-label" for="dt-window">{texts.windowLabel}</label>
        <div class="dt-slider">
          <input
            id="dt-window"
            type="range"
            min={WINDOW_MIN}
            max={WINDOW_MAX}
            bind:value={windowSize}
          />
          <output class="dt-value">{texts.windowValue.replace('{n}', String(windowSize))}</output>
        </div>
        <p class="dt-hint">{texts.windowHint}</p>
      </div>

      <div class="dt-field">
        <label class="dt-label" for="dt-interval">{texts.intervalLabel}</label>
        <div class="dt-slider">
          <input
            id="dt-interval"
            type="range"
            min={INTERVAL_MIN}
            max={INTERVAL_MAX}
            bind:value={minSentences}
          />
          <output class="dt-value">
            {minSentences === 1
              ? texts.intervalEverySentence
              : texts.intervalValue.replace('{n}', String(minSentences))}
          </output>
        </div>
        <p class="dt-hint">{texts.intervalHint.replace('{seconds}', pace)}</p>
      </div>
    </SettingsCard>

    <SettingsCard title={texts.testTitle} hint={texts.testHint} icon={IconFlask}>
      <div class="dt-field">
        <label class="dt-label" for="dt-sample">{texts.sampleLabel}</label>
        <textarea
          id="dt-sample"
          class="dt-input dt-textarea"
          bind:value={sample}
          rows="5"
          placeholder={texts.samplePlaceholder}
        ></textarea>
      </div>
      <div class="dt-test-actions">
        <button
          class="dt-test-btn"
          type="button"
          on:click={runTest}
          disabled={!sample.trim() || testing}
        >
          {testing ? texts.testRunning : texts.testRun}
        </button>
        <span class="dt-hint">{texts.testScopeHint}</span>
      </div>

      {#if testResult}
        <div class="dt-result" class:dt-result-stale={staleResult} role="status">
          {#if staleResult}
            <p class="dt-stale-note">{texts.testStale}</p>
          {/if}
          {#if testResult.actions.length === 0}
            <p class="dt-result-empty">{texts.testNoAction}</p>
          {:else}
            <p class="dt-result-count">
              {texts.testFound.replace('{n}', String(testResult.actions.length))}
            </p>
            <ul class="dt-result-list">
              {#each testResult.actions as action, i (i)}
                <li class="dt-result-item">
                  <strong>{action.title || texts.testUntitled}</strong>
                  {#if action.description}<span>{action.description}</span>{/if}
                  <span class="dt-result-meta">
                    {action.owner || texts.testNoOwner}
                    {#if action.dueDate}· {action.dueDate}{/if}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
          {#if testResult.prompt}
            <button
              class="dt-prompt-toggle"
              type="button"
              on:click={() => (showPrompt = !showPrompt)}
              aria-expanded={showPrompt}
            >
              {showPrompt ? texts.hidePrompt : texts.showPrompt}
            </button>
            {#if showPrompt}
              <pre class="dt-prompt">{testResult.prompt}</pre>
            {/if}
          {/if}
        </div>
      {/if}
    </SettingsCard>

    <div class="dt-actions">
      {#if dirty}
        <button class="dt-ghost" type="button" on:click={discard}>{texts.discardChanges}</button>
      {/if}
      {#if saveState === 'saved'}
        <span class="dt-ok"><IconCheck width="16" height="16" />{texts.saved}</span>
      {/if}
      <button class="dt-save" type="button" on:click={save} disabled={!canSave}>
        {saveState === 'saving' ? texts.saving : texts.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .dt-wrap {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .dt-intro {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .dt-error {
    padding: 0.7rem 0.85rem;
    border-radius: 8px;
    border: 1px solid var(--danger-line);
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.85rem;
  }
  .dt-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .dt-fieldset {
    border: 0;
    padding: 0;
    margin: 0;
  }
  .dt-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
    padding: 0;
  }
  .dt-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .dt-warn {
    margin: 0;
    font-size: 0.8rem;
    color: var(--danger-text);
  }
  .dt-input {
    width: 100%;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font-family: inherit;
    font-size: 0.88rem;
  }
  .dt-input:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .dt-textarea {
    resize: vertical;
    line-height: 1.5;
  }
  /* Choix de sensibilité : la carte entière est cliquable, l'intitulé et
     l'explication tiennent sur deux lignes. */
  .dt-choice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.6rem 0.7rem;
    margin-top: 0.35rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .dt-choice-on {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
  }
  .dt-choice span {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .dt-choice strong {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--ink);
  }
  .dt-choice em {
    font-style: normal;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.4;
  }
  .dt-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .dt-row-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .dt-row-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
  }
  .dt-slider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .dt-slider input[type='range'] {
    flex: 1 1 auto;
    accent-color: var(--brand);
  }
  .dt-value {
    flex: 0 0 auto;
    min-width: 9.5rem;
    text-align: right;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--brand-text);
    font-variant-numeric: tabular-nums;
  }
  .dt-test-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .dt-test-btn {
    padding: 0.5rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--brand);
    background: var(--brand-secondary-soft-08);
    color: var(--brand-text-strong);
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .dt-test-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .dt-result {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  /* Périmé : grisé mais PAS effacé — il reste vrai de ce qui a été testé. */
  .dt-result-stale {
    border-style: dashed;
    opacity: 0.62;
  }
  .dt-stale-note,
  .dt-result-empty,
  .dt-result-count {
    margin: 0;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .dt-result-count {
    font-weight: 600;
    color: var(--brand-text);
  }
  .dt-result-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .dt-result-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    background: var(--surface-tint);
    font-size: 0.82rem;
    color: var(--ink);
  }
  .dt-result-meta {
    font-size: 0.76rem;
    color: var(--ink-faint);
  }
  .dt-prompt-toggle {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--brand-text);
    font-family: inherit;
    font-size: 0.78rem;
    text-decoration: underline;
    cursor: pointer;
  }
  .dt-prompt {
    margin: 0;
    padding: 0.7rem;
    max-height: 320px;
    overflow: auto;
    border-radius: 8px;
    background: var(--surface-tint);
    border: 1px solid var(--line);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    line-height: 1.5;
    color: var(--ink-soft);
    white-space: pre-wrap;
  }
  /* Collée au bas du panneau : le bouton reste visible sans scroller. */
  .dt-actions {
    position: sticky;
    bottom: -22px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.6rem;
    margin: 0 -22px -22px;
    padding: 0.85rem 22px 22px;
    background: var(--surface);
    border-top: 1px solid var(--line-faint);
  }
  .dt-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    color: var(--success-text);
  }
  .dt-ghost {
    padding: 0.5rem 0.85rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .dt-save {
    padding: 0.55rem 1.1rem;
    border-radius: 10px;
    border: 0;
    background: var(--brand);
    color: #fff;
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  .dt-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .dt-skeleton {
    height: 260px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    /* Nom préfixé : les @keyframes ne sont pas scopés par Svelte. */
    animation: dt-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes dt-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dt-skeleton {
      animation: none;
    }
  }
  @media (max-width: 640px) {
    .dt-actions {
      justify-content: stretch;
      bottom: -14px;
      margin: 0 -16px -16px;
      padding: 0.75rem 16px 16px;
    }
    .dt-value {
      min-width: 7rem;
    }
  }
</style>
