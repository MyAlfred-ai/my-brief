<script>
  /**
   * Onglet « MyBrain » du panneau d'administration : brancher MyBrief sur le
   * cerveau partagé de l'organisation, et décider qui y envoie ses réunions.
   *
   * Même anatomie que l'onglet IA, pour la même raison : une clé secrète, un
   * test réel, un seul bouton Enregistrer.
   *
   *   - La clé n'est JAMAIS reçue de l'API : on n'en montre que l'aperçu que
   *     myBrain affiche lui-même (« mbk_AbCd…wxyz »), de quoi rapprocher les
   *     deux écrans.
   *   - Le serveur VÉRIFIE l'adresse et la clé auprès de myBrain avant de les
   *     enregistrer (droit « nourrir » compris) : ce formulaire ne peut pas
   *     brancher un cerveau qui refuserait chaque réunion.
   *   - Le corps envoyé ne porte QUE ce qui a changé : changer la politique ne
   *     renvoie pas la clé (vide = « retire la clé » côté serveur), et ne
   *     dépend pas de la disponibilité de myBrain.
   */
  import { onMount } from 'svelte';
  import IconBrain from '../icons/BrainIcon.svelte';
  import IconUsers from '~icons/solar/users-group-rounded-linear';
  import IconDocument from '~icons/solar/document-text-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import {
    fetchMyBrainAdminSettings,
    saveMyBrainAdminSettings,
    testMyBrainConnection,
  } from '../../services/myBrainApi.js';
  import { uiText } from '../../store.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';

  const POLICIES = ['off', 'optin', 'forced'];

  let settings = {
    url: '',
    hasKey: false,
    keyHint: '',
    keyUnreadable: false,
    policy: 'off',
    configured: false,
    active: false,
    application: '',
    droits: [],
    publicUrl: '',
    verifiedAt: null,
    updatedAt: null,
    updatedBy: null,
  };
  let url = '';
  let apiKey = '';
  let policy = 'off';
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let testState = 'idle'; // 'idle' | 'testing' | 'ok'
  // Verdict d'un test, affiché À CÔTÉ du bouton — l'alerte du haut de l'onglet
  // sort de la vue dès qu'on a fait défiler jusqu'à la clé : { url, apiKey,
  // error } ou, pour une saisie non enregistrée, { url, apiKey, application,
  // droits }. Il ne vaut que pour les valeurs testées (cf. verdictShown).
  let verdict = null;
  let errorMessage = '';

  $: texts = $uiText.adminMyBrain;
  $: userTexts = $uiText.adminUsers;
  // Déclarations réactives et non fonctions : Svelte ne suit que les
  // identifiants qu'il VOIT — derrière un appel, « Enregistrer » resterait figé.
  $: urlChanged = url.trim() !== (settings.url || '');
  $: keyChanged = !!apiKey.trim();
  $: policyChanged = policy !== settings.policy;
  $: dirty = urlChanged || keyChanged || policyChanged;
  // Même règle que le serveur : la clé enregistrée ne part jamais vers un autre
  // hôte. Changer d'hôte sans recoller la clé serait refusé — autant le dire
  // avant l'enregistrement, sous le champ concerné.
  $: keyRequired =
    urlChanged && !keyChanged && settings.hasKey && originOf(url) !== originOf(settings.url);
  $: canSave = dirty && !keyRequired && saveState !== 'saving';
  $: rights = rightsOf(settings.droits, texts.rightNames);
  // Le test porte sur ce que montre le formulaire : il ne lui manque que ce qui
  // n'est ni saisi ni enregistré — et la carte dit quoi, plutôt qu'un bouton
  // grisé sans raison.
  $: keyAvailable = keyChanged || (settings.hasKey && !settings.keyUnreadable);
  $: testMissing = url.trim() ? (keyAvailable ? '' : 'key') : keyAvailable ? 'url' : 'both';
  $: canTest = !testMissing && !keyRequired && testState !== 'testing' && saveState !== 'saving';
  // Retaper l'adresse ou la clé périme le verdict ; l'enregistrement aussi,
  // qui vide la clé saisie.
  $: verdictShown = !!verdict && verdict.url === url.trim() && verdict.apiKey === apiKey.trim();

  onMount(load);

  function rightsOf(droits, names) {
    return (droits || []).map((d) => names[d] || d).join(', ');
  }

  function originOf(value) {
    try {
      return new URL(String(value || '').trim()).origin;
    } catch {
      return '';
    }
  }

  function adopt(next) {
    settings = next;
    url = next.url || '';
    policy = next.policy || 'off';
  }

  async function load() {
    loading = true;
    errorMessage = '';
    const res = await fetchMyBrainAdminSettings();
    loading = false;
    if (!res.ok) {
      errorMessage = messageFor(res.data);
      return;
    }
    adopt(res.data.settings);
  }

  /**
   * Slug d'erreur → texte. Le message de myBrain lui-même (`upstreamMessage`)
   * et l'adresse finale d'une redirection sont joints tels quels : plus précis
   * que tout ce qu'on écrirait à leur place.
   */
  function messageFor(data) {
    const base =
      texts.errors[data?.error] || userTexts.errors[data?.error] || userTexts.errors.unknown;
    const extra = data?.location || data?.upstreamMessage || '';
    return extra ? `${base} — ${extra}` : base;
  }

  async function submit(patch) {
    saveState = 'saving';
    errorMessage = '';
    testState = 'idle';
    const res = await saveMyBrainAdminSettings(patch);
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.data);
      return false;
    }
    adopt(res.data.settings);
    apiKey = '';
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
    return true;
  }

  function save() {
    // Seuls les champs modifiés partent : absent = inchangé côté serveur.
    const patch = {};
    if (urlChanged) patch.url = url.trim();
    if (keyChanged) patch.apiKey = apiKey.trim();
    if (policyChanged) patch.policy = policy;
    return submit(patch);
  }

  function discard() {
    adopt(settings);
    apiKey = '';
    errorMessage = '';
  }

  function clearKey() {
    if (!confirm(texts.clearConfirm)) return;
    apiKey = '';
    submit({ apiKey: '' });
  }

  async function test() {
    testState = 'testing';
    errorMessage = '';
    verdict = null;
    // Même règle que l'enregistrement : seul ce qui a été saisi part, le
    // serveur complète avec ce qui est enregistré.
    const draft = {};
    if (urlChanged) draft.url = url.trim();
    if (keyChanged) draft.apiKey = apiKey.trim();
    const tested = { url: url.trim(), apiKey: apiKey.trim() };
    const res = await testMyBrainConnection(draft);
    if (!res.ok) {
      testState = 'idle';
      verdict = { ...tested, error: messageFor(res.data) };
      return;
    }
    // L'état seul (application, droits) : un test ne défait pas une saisie en
    // cours dans le formulaire.
    settings = res.data.settings;
    if (res.data.draft) {
      // Rien n'est enregistré : le verdict reste affiché, avec l'invitation à
      // enregistrer, tant que le formulaire porte les valeurs testées.
      testState = 'idle';
      verdict = { ...tested, application: res.data.application, droits: res.data.droits };
      return;
    }
    testState = 'ok';
    setTimeout(() => {
      if (testState === 'ok') testState = 'idle';
    }, 2500);
  }
</script>

<div class="mb-wrap">
  {#if loading}
    <div class="mb-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorMessage}
      <div class="mb-error" role="alert">{errorMessage}</div>
    {/if}

    <p class="mb-intro">{texts.intro}</p>

    <!-- ── Connexion ── -->
    <SettingsCard
      title={texts.connectionTitle}
      hint={texts.connectionIntro}
      icon={IconBrain}
      on={settings.configured}
    >
      <!-- Sans connexion, rien ne part : c'est un geste à faire, pas un état neutre. -->
      <StatusBadge
        slot="badge"
        tone={settings.configured ? 'ok' : 'warn'}
        text={settings.configured ? texts.statusOn : texts.statusOff}
      />

      {#if settings.keyUnreadable}
        <p class="mb-note mb-note-warn">{texts.keyUnreadable}</p>
      {:else if settings.configured && settings.application}
        <p class="mb-note">
          {texts.connectedAs
            .replace('{application}', settings.application)
            .replace('{rights}', rights)}
          {#if settings.updatedBy}<br /><span class="mb-meta"
              >{texts.updatedBy} {settings.updatedBy}</span
            >{/if}
        </p>
      {/if}

      <div class="mb-field">
        <label class="mb-label" for="mb-url">{texts.urlLabel}</label>
        <input
          id="mb-url"
          class="mb-input"
          type="url"
          autocomplete="off"
          spellcheck="false"
          placeholder={texts.urlPlaceholder}
          bind:value={url}
        />
        <p class="mb-hint">{texts.urlHelp}</p>
      </div>

      <div class="mb-field">
        <label class="mb-label" for="mb-key">{texts.keyLabel}</label>
        <input
          id="mb-key"
          class="mb-input"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder={settings.hasKey ? texts.keyPlaceholderReplace : texts.keyPlaceholderNew}
          bind:value={apiKey}
        />
        {#if settings.hasKey}
          <p class="mb-hint">{texts.keyCurrent} <code>{settings.keyHint}</code></p>
        {/if}
        {#if keyRequired}
          <p class="mb-warn">{texts.keyRequiredHint}</p>
        {/if}
        <p class="mb-hint">{texts.keyHelp}</p>
      </div>

      {#if verdictShown && verdict.error}
        <p class="mb-note mb-note-error" role="alert">{verdict.error}</p>
      {:else if verdictShown}
        <p class="mb-note mb-note-ok" role="status">
          <IconCheck width="15" height="15" aria-hidden="true" />
          {texts.testOkDraft
            .replace('{application}', verdict.application)
            .replace('{rights}', rightsOf(verdict.droits, texts.rightNames))}
        </p>
      {/if}

      <div class="mb-card-actions">
        {#if testState === 'ok'}
          <span class="mb-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.testOk}</span
          >
        {:else if testMissing}
          <span class="mb-needs">{texts.testNeeds[testMissing]}</span>
        {/if}
        {#if settings.hasKey}
          <button
            type="button"
            class="mb-ghost"
            on:click={clearKey}
            disabled={saveState === 'saving'}
          >
            {texts.clear}
          </button>
        {/if}
        <button type="button" class="mb-ghost" on:click={test} disabled={!canTest}>
          {testState === 'testing' ? texts.testing : texts.test}
        </button>
      </div>
    </SettingsCard>

    <!-- ── Qui envoie ── -->
    <SettingsCard
      title={texts.policyTitle}
      hint={texts.policyIntro}
      icon={IconUsers}
      on={settings.active}
    >
      <fieldset class="mb-fieldset">
        <legend class="mb-sr">{texts.policyTitle}</legend>
        {#each POLICIES as value (value)}
          <label class="mb-choice" class:mb-choice-on={policy === value}>
            <input type="radio" bind:group={policy} {value} name="mb-policy" />
            <span>
              <strong>{texts.policies[value].label}</strong>
              <em>{texts.policies[value].hint}</em>
            </span>
          </label>
        {/each}
      </fieldset>
      {#if policy !== 'off' && !settings.configured}
        <p class="mb-warn">{texts.policyNotConfigured}</p>
      {/if}
    </SettingsCard>

    <!-- ── Ce qui part ── -->
    <SettingsCard title={texts.contentTitle} hint={texts.contentIntro} icon={IconDocument}>
      <ul class="mb-list">
        {#each texts.contentItems as item (item)}
          <li>{item}</li>
        {/each}
      </ul>
      <p class="mb-hint">{texts.contentReview}</p>
    </SettingsCard>

    <!-- Barre collante : même anatomie que les autres onglets. -->
    <div class="mb-actions">
      {#if dirty}
        <span class="mb-unsaved">{texts.unsavedHint}</span>
        <button type="button" class="mb-ghost" on:click={discard} disabled={saveState === 'saving'}>
          {texts.discardChanges}
        </button>
      {:else if saveState === 'saved'}
        <span class="mb-ok"
          ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.saved}</span
        >
      {/if}
      <button type="button" class="mb-save" on:click={save} disabled={!canSave}>
        {saveState === 'saving' ? userTexts.saving : userTexts.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .mb-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .mb-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  /* Anatomie des cartes : SettingsCard (ui/) ; pastilles : StatusBadge. */
  .mb-note {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px dashed var(--line-strong);
    font-size: 0.82rem;
    color: var(--ink-soft);
    line-height: 1.55;
  }
  .mb-note-warn {
    background: var(--warn-bg);
    border-color: var(--warn-line);
    color: var(--warn-text);
  }
  .mb-note-error {
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
    color: var(--danger-text);
  }
  .mb-note-ok {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    background: var(--success-bg);
    border: 1px solid var(--success-line);
    color: var(--success-text);
  }
  .mb-note-ok :global(svg) {
    flex: none;
    margin-top: 0.15rem;
  }
  .mb-meta {
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  .mb-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .mb-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .mb-input {
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
  .mb-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .mb-hint {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .mb-hint code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    background: color-mix(in srgb, var(--brand-secondary) 4.2%, #f5f5f5);
    padding: 0.1rem 0.35rem;
    border-radius: 5px;
  }
  .mb-warn {
    margin: 0.3rem 0 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 0.85rem;
  }
  .mb-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .mb-list {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.86rem;
    color: var(--ink-soft);
    line-height: 1.6;
  }

  /* Choix de la politique : la carte entière est cliquable, l'intitulé et
     l'explication tiennent sur deux lignes (même dessin que la sensibilité de
     la détection d'actions). */
  .mb-fieldset {
    border: 0;
    padding: 0;
    margin: 0;
  }
  .mb-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .mb-choice {
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
  .mb-choice-on {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
  }
  .mb-choice span {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .mb-choice strong {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--ink);
  }
  .mb-choice em {
    font-style: normal;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.4;
  }

  .mb-skeleton {
    height: 220px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: mb-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes mb-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mb-skeleton {
      animation: none;
    }
  }

  /* Gestes propres à une carte (tester, retirer) : alignés à droite, dans la
     carte — ce ne sont pas des enregistrements. */
  .mb-card-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  /* Ce qui manque pour tester : à côté du bouton grisé, pas ailleurs. */
  .mb-needs {
    font-size: 0.8rem;
    color: var(--ink-muted);
    line-height: 1.45;
  }

  /* ── Barre d'action collante — même bleed que les autres onglets ── */
  .mb-actions {
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
  .mb-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: oklch(48% 0.12 150);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .mb-unsaved {
    font-size: 0.82rem;
    color: var(--ink-muted);
  }
  .mb-ghost {
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
  .mb-ghost:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .mb-ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .mb-save {
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
  .mb-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .mb-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .mb-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .mb-actions {
      justify-content: stretch;
      bottom: -14px;
      margin: 0 -16px -14px;
      padding: 0.85rem 16px 14px;
    }
    .mb-actions button {
      flex: 1 1 auto;
    }
  }
</style>
