<script>
  /**
   * Panneau « Actions détectées ».
   *
   * Ce markup vivait en double dans App.svelte : une copie pour l'écran
   * d'enregistrement, une pour l'écran de relecture. Elles ne divergeaient que
   * par l'état vide — d'où la variante `listening`.
   *
   * Pendant l'enregistrement, le panneau est monté même sans action : c'est là
   * que se montrent l'état « à l'écoute » et l'indicateur d'analyse, qui
   * disent aux participants que la détection tourne.
   *
   * La corbeille d'une carte MASQUE l'action, elle ne la supprime pas : elle
   * passe dans « Actions masquées », sous les cartes, d'où elle se rétablit
   * (HiddenActionsList) — une corbeille, au sens où l'on en ressort ce qu'on y
   * a mis. L'icône d'œil fermé, essayée, se lisait à 14 px comme un chevron.
   * Les champs vides s'affichent en placeholder — aucun texte n'est écrit à la
   * place de l'utilisateur.
   */
  import IconClipboardCheck from '~icons/solar/clipboard-check-outline';
  import IconTrashBin from '~icons/solar/trash-bin-2-linear';
  import IconCollapsePanel from '~icons/solar/sidebar-minimalistic-linear';
  import SparkleIcon from './icons/SparkleIcon.svelte';
  import InfoHint from './ui/InfoHint.svelte';
  import HiddenActionsList from './HiddenActionsList.svelte';

  export let actions = [];
  /** Actions masquées : listées repliées sous les cartes, avec « Rétablir ». */
  export let hiddenActions = [];
  export let countsLabel = '';
  export let collapsed = false;
  /** Écran d'enregistrement : état vide « à l'écoute » et échappée du fondu bas. */
  export let listening = false;
  /** Une analyse est en vol. */
  export let analysisActive = false;
  export let uiText;
  export let texts;

  export let onToggleCollapsed = () => {};
  export let onAddManual = () => {};
  export let onAddFromCollapsed = () => {};
  export let onRemove = () => {};
  export let onRestore = () => {};
  export let onSave = () => {};

  // Libellés lus dans `uiText`, déjà reçu : les passer un à un en props
  // alourdissait les deux montages d'App.svelte, plafonné.
  $: toggleLabel = collapsed ? uiText.actions.expandPanel : uiText.actions.collapsePanel;
</script>

<div class="actions-panel-new" class:ap-collapsed={collapsed} class:ap-live={listening}>
  <div class="ap-header">
    <IconClipboardCheck width="18" height="18" class="ap-title-icon" />
    <span class="ap-title">{uiText.actions.detectedTitle}</span>
    <InfoHint label={uiText.actions.hintLabel} text={uiText.actions.hint} />
    <span class="ap-count">{countsLabel}</span>
    {#if analysisActive}
      <!-- SparkleIcon se pose en absolute : il lui faut ce conteneur dimensionné. -->
      <span
        class="ap-analysis-slot"
        role="status"
        aria-label={uiText.actions.analysisLabel}
        title={uiText.actions.analysisLabel}
      >
        <SparkleIcon />
      </span>
    {/if}
    <button
      class="ap-collapse-btn"
      on:click={onToggleCollapsed}
      aria-label={toggleLabel}
      aria-expanded={!collapsed}
      title={toggleLabel}
    >
      <IconCollapsePanel width="18" height="18" />
    </button>
    {#if collapsed}
      <button
        class="ap-collapsed-add"
        on:click={onAddFromCollapsed}
        aria-label={texts.buttons.addAction}
        title={texts.buttons.addAction}
      >
        <svg width="30" height="23" viewBox="0 0 35 27" fill="none" aria-hidden="true">
          <rect
            x="0.542725"
            y="0.54248"
            width="33"
            height="25.7937"
            rx="12.8968"
            stroke="currentColor"
            stroke-width="1.08525"
            stroke-linecap="round"
            stroke-dasharray="4.34 4.34"
          />
          <path
            d="M17.0352 8.54248V18.3362"
            stroke="currentColor"
            stroke-width="0.979368"
            stroke-linecap="round"
          />
          <path
            d="M21.9397 13.4316L12.146 13.4316"
            stroke="currentColor"
            stroke-width="0.979368"
            stroke-linecap="round"
          />
        </svg>
      </button>
    {/if}
  </div>
  <div class="ap-content">
    <button class="ap-add-btn" on:click={onAddManual}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
      </svg>
      {texts.buttons.addAction}
    </button>
    <!-- Keyé par id : les nouvelles actions sont ajoutées EN TÊTE. Sans clé,
         Svelte décale les valeurs et crée le nœud en queue — l'animation
         d'apparition jouait sur la dernière carte, et une saisie en cours
         glissait d'une carte à l'autre. -->
    {#each actions as a, i (a.id)}
      <div
        class="ap-card"
        class:ap-card-flash-new={a.flash === 'new'}
        class:ap-card-flash-updated={a.flash === 'updated'}
        style="animation-delay: {i * 0.08}s"
      >
        <!-- Barre titre (Task Title Container Figma : fond chaud, titre orange bold) -->
        <div class="ap-card-titlebar">
          <input
            class="ap-title-input"
            class:ap-field-updated={a.updatedFields?.includes('title')}
            type="text"
            bind:value={a.title}
            on:blur={onSave}
            placeholder={uiText.actions.actionPlaceholder}
          />
          <button
            class="ap-delete-btn"
            on:click={() => onRemove(a)}
            title={texts.buttons.hideAction}
            aria-label={texts.buttons.hideAction}
          >
            <IconTrashBin width="14" height="14" />
          </button>
        </div>
        <!-- Corps (Task Description Container : responsable, échéance, avatar, description) -->
        <div class="ap-card-body">
          {#if a.description !== undefined}
            <textarea
              class="ap-desc"
              class:ap-field-updated={a.updatedFields?.includes('description')}
              bind:value={a.description}
              on:blur={onSave}
              placeholder={uiText.actions.manualEditHint}
            ></textarea>
          {/if}
          <div class="ap-card-meta">
            <div class="ap-avatar" aria-hidden="true">
              {(a.owner || a.title || '?')[0].toUpperCase()}
            </div>
            <input
              class="ap-owner-input"
              class:ap-field-updated={a.updatedFields?.includes('owner')}
              type="text"
              bind:value={a.owner}
              on:blur={onSave}
              placeholder={uiText.actions.ownerPlaceholder}
            />
            <input
              class="ap-date-input"
              class:ap-field-updated={a.updatedFields?.includes('dueDate')}
              type="date"
              bind:value={a.dueDate}
              on:change={onSave}
            />
          </div>
        </div>
      </div>
    {/each}
    {#if actions.length === 0}
      {#if listening}
        <div class="ap-listening">
          <span class="ap-listening-dot" aria-hidden="true"></span>
          <span class="ap-listening-text">{uiText.actions.listeningMessage}</span>
        </div>
      {:else}
        <div class="ap-empty">{uiText.actions.emptyMessage}</div>
      {/if}
    {/if}
    <HiddenActionsList actions={hiddenActions} {uiText} {onRestore} />
  </div>
</div>
