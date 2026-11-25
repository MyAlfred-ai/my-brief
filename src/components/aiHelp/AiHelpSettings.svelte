<script>
  /**
   * Les réglages de l'Aide IA pour la réunion en cours — l'envers du pupitre.
   * Le pupitre est une conversation (AiHelpDesk) ; ce qu'on règle rarement vit
   * ici, derrière une icône : l'allumer ou l'éteindre, ses domaines, l'ordre
   * du jour point par point, le projet de la réunion. Le son se coupe d'un
   * geste dans l'en-tête du pupitre (AiHelpSoundButton) ; ce qui vaut pour
   * TOUTES les réunions — démarrage, sons, voix — s'ouvre d'ici, dans Réglages
   * → Aide IA.
   *
   * Sur téléphone c'est le seul endroit pour l'éteindre et choisir ses
   * domaines : la pastille du dock n'y existe pas.
   */
  import { tick } from 'svelte';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    aiHelp,
    aiHelpDomainOn,
    setAiHelpEnabled,
    addAiHelpAgendaPoint,
    removeAiHelpAgendaPoint,
    chooseAiHelpProject,
    declineAiHelpProject,
    searchAiHelpProjects,
  } from '../../stores/aiHelp.js';
  import AiIcon from './AiIcon.svelte';
  import AiHelpSwitch from './AiHelpSwitch.svelte';
  import AiHelpDomains from './AiHelpDomains.svelte';
  import AiHelpAgenda from './AiHelpAgenda.svelte';
  import { openPanel } from '../../stores/panels.js';

  const SEARCH_DEBOUNCE_MS = 300;

  let point = '';
  let picking = false;
  let query = '';
  let results = [];
  let searched = false;
  let searchTimer = null;

  $: T = $uiText.aiHelp;
  $: name = $aiHelp.wakeWord || T.name;
  $: on = $aiHelp.enabled;
  $: withAgenda = aiHelpDomainOn($aiHelp, 'agenda');
  $: agenda = $aiHelp.agendaState;
  $: withProject = on && $aiHelp.myBrain && ($aiHelp.domains.project || $aiHelp.domains.qa);
  $: projectText = $aiHelp.project
    ? fill(T.projectLinked, { project: $aiHelp.project.title || $aiHelp.project.path })
    : $aiHelp.projectDeclined
      ? T.projectNone
      : T.projectUnknown;

  function addPoint() {
    if (!point.trim()) return;
    addAiHelpAgendaPoint(point);
    point = '';
  }

  function onQuery(value) {
    query = value;
    clearTimeout(searchTimer);
    if (value.trim().length < 2) {
      results = [];
      searched = false;
      return;
    }
    searchTimer = setTimeout(async () => {
      const asked = value;
      const res = await searchAiHelpProjects(asked);
      if (asked !== query) return;
      results = res.ok ? res.projects : [];
      searched = true;
    }, SEARCH_DEBOUNCE_MS);
  }

  async function startPicking() {
    picking = true;
    await tick();
    document.getElementById('aidk-project')?.focus();
  }

  function pick(path) {
    picking = false;
    query = '';
    results = [];
    searched = false;
    if (path) chooseAiHelpProject(path);
    else declineAiHelpProject();
  }
</script>

<div class="aist">
  <div class="aist-row">
    <span class="aist-row-label">{T.setupSwitch}</span>
    <AiHelpSwitch checked={on} label={T.setupSwitch} onChange={setAiHelpEnabled} />
  </div>

  {#if !on}
    <p class="aidk-muted">{T.setupOff}</p>
  {:else}
    <AiHelpDomains variant="chips" />

    {#if withAgenda}
      <!-- L'ordre du jour tel que l'IA le suit : ce qu'on a ajouté, ce qu'elle a
           entendu. Un point mal compris se retire d'un clic. -->
      <div class="aidk-field aidk-agenda">
        <span class="aidk-label">{T.kinds.agenda}</span>
        {#if agenda.length}
          <AiHelpAgenda points={agenda} onRemove={removeAiHelpAgendaPoint} />
        {:else}
          <p class="aidk-muted">{fill(T.agendaEmpty, { name })}</p>
        {/if}
        <form class="aidk-form aidk-add" on:submit|preventDefault={addPoint}>
          <label for="aidk-agenda" class="aidk-sr">{T.agendaAddLabel}</label>
          <input
            id="aidk-agenda"
            type="text"
            autocomplete="off"
            maxlength="160"
            placeholder={T.agendaAddPlaceholder}
            bind:value={point}
          />
          <button type="submit" class="aidk-add-btn" aria-label={T.agendaAdd} title={T.agendaAdd}>
            <AiIcon name="plus" size={17} strokeWidth={2.2} />
          </button>
        </form>
      </div>
    {/if}

    {#if withProject}
      <div class="aidk-field aidk-project">
        <span class="aidk-project-line">
          <AiIcon name="book" size={15} />
          <span class="aidk-project-text" class:aidk-project-unknown={!$aiHelp.project}>
            {projectText}
          </span>
          {#if !picking}
            <button type="button" class="aidk-link" on:click={startPicking}>
              {T.projectChange}
            </button>
          {/if}
        </span>
        {#if picking}
          <label for="aidk-project" class="aidk-sr">{T.projectSearch}</label>
          <div class="aidk-search">
            <AiIcon name="search" size={16} />
            <input
              id="aidk-project"
              type="text"
              autocomplete="off"
              placeholder={T.projectSearch}
              value={query}
              on:input={(e) => onQuery(e.currentTarget.value)}
            />
          </div>
          {#each results as project (project.path)}
            <button type="button" class="aidk-row" on:click={() => pick(project.path)}>
              {project.title}
            </button>
          {/each}
          {#if searched && results.length === 0}
            <p class="aidk-muted">{T.projectEmpty}</p>
          {/if}
          <button type="button" class="aidk-link" on:click={() => pick('')}>
            {T.projectNone}
          </button>
        {/if}
      </div>
    {/if}

    {#if !$aiHelp.myBrain}
      <!-- La raison, pas un constat : « votre groupe », « la clé », « pas relié »
           ne se règlent pas au même endroit. -->
      <p class="aidk-muted aidk-reason">
        {fill(T.noBrainReasons[$aiHelp.myBrainReason] || T.noBrain, { name })}
      </p>
    {/if}
  {/if}

  <!-- Pour TOUTES les réunions : démarrage, sons, voix — l'onglet « Aide IA »
       de « Pendant la réunion », puisqu'on vient d'une réunion. -->
  <button
    type="button"
    class="aidk-link aist-prefs"
    on:click={() => openPanel('config', 'meeting', 'aiHelp')}
  >
    {T.openPreferences}
  </button>
</div>

<style>
  .aist {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
    font-family: 'Lexend', sans-serif;
  }
  .aist-prefs {
    align-self: flex-start;
    margin-top: 2px;
  }
  .aist-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .aist-row-label {
    flex: 1;
    min-width: 0;
    font-size: calc(13px * var(--ai-scale, 1));
    font-weight: 500;
    color: var(--ink);
  }
  .aidk-muted {
    margin: 0;
    font-size: calc(12px * var(--ai-scale, 1));
    line-height: 1.5;
    color: var(--mb-text-secondary);
  }
  .aidk-label {
    font-size: calc(12px * var(--ai-scale, 1));
    font-weight: 500;
    color: var(--mb-text-secondary);
  }
  .aidk-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .aidk-field {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding-top: 10px;
    border-top: 1px solid var(--ai-soft-strong);
  }
  .aidk-reason {
    padding-top: 10px;
    border-top: 1px solid var(--ai-soft-strong);
  }
  .aist input {
    font-family: inherit;
    color: var(--ink);
  }
  .aidk-form {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .aidk-add input {
    flex: 1;
    min-width: 0;
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--ai-line);
    border-radius: 17px;
    background: var(--surface);
    font-size: calc(12.5px * var(--ai-scale, 1));
  }
  .aidk-add-btn {
    width: 34px;
    height: 34px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--ai-line);
    border-radius: 50%;
    background: var(--ai-soft);
    color: var(--ai-ink);
    cursor: pointer;
    transition: background 0.15s;
  }
  .aidk-add-btn:hover {
    background: var(--ai-soft-strong);
  }
  .aidk-project-line {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--ai-ink);
    font-size: calc(13px * var(--ai-scale, 1));
  }
  .aidk-project-text {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aidk-project-unknown {
    font-weight: 400;
    color: var(--mb-text-secondary);
  }
  .aidk-link {
    align-self: flex-start;
    min-height: 30px;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--ai-ink);
    font-family: inherit;
    font-size: calc(12.5px * var(--ai-scale, 1));
    font-weight: 500;
    text-decoration: underline;
    cursor: pointer;
  }
  .aidk-search {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 38px;
    padding: 0 12px;
    border: 1.5px solid var(--ai-line);
    border-radius: 19px;
    color: var(--mb-text-secondary);
  }
  .aidk-search input {
    flex: 1;
    min-width: 0;
    height: 30px;
    border: none;
    outline: none;
    background: transparent;
    font-size: calc(13px * var(--ai-scale, 1));
  }
  .aidk-search:focus-within {
    outline: 2px solid var(--ai);
    outline-offset: 1px;
  }
  .aidk-row {
    display: flex;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    min-height: 36px;
    padding: 5px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
    font-family: inherit;
    font-size: calc(13px * var(--ai-scale, 1));
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }
  .aidk-row:hover {
    background: var(--ai-soft);
  }
  .aist button:focus-visible,
  .aist input:focus-visible {
    outline: 2px solid var(--ai);
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    .aidk-add-btn {
      width: 44px;
      height: 44px;
    }
    .aidk-row,
    .aidk-link {
      min-height: 44px;
    }
    .aidk-add input {
      height: 44px;
      /* 16 px : en dessous, Safari iOS zoome sur le champ à la saisie. */
      font-size: calc(16px * var(--ai-scale, 1));
    }
  }
</style>
