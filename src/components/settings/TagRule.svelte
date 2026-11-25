<script>
  /**
   * Une règle de la fiche d'un tag — rangement ou envoi — repliée en UNE
   * ligne : la question, la réponse retenue, « Modifier ». Les deux choix
   * (cartes radio de TagFiche, passées en slot) ne s'affichent qu'ouverts.
   *
   * Pourquoi replier : la fiche porte désormais aussi le contexte pour l'IA et
   * le logo. Dépliées, les deux règles occupaient chacune un écran pour dire
   * un choix binaire qu'on règle une fois ; repliées, la réponse se lit d'un
   * coup d'œil et reste à un clic.
   *
   * Composant de présentation : l'état ouvert/fermé appartient à TagFiche,
   * qui le remet à zéro quand on change de tag.
   */
  /** Composant d'icône (unplugin-icons). */
  export let icon;
  /** Identifiant du titre — l'étiquette du groupe radio que TagFiche passe en slot. */
  export let headingId;
  export let question = '';
  /** Quand la règle s'applique — affiché une fois ouverte. */
  export let when = '';
  /** La réponse retenue, en clair. */
  export let summary = '';
  /** Son détail : le dossier visé, les destinataires. */
  export let detail = '';
  export let open = false;
  export let editLabel = '';
  export let closeLabel = '';
  export let onToggle = () => {};
</script>

<section class="tgr" class:tgr-open={open} aria-labelledby={headingId}>
  <div class="tgr-head">
    <span class="tgr-icon" aria-hidden="true"
      ><svelte:component this={icon} width="19" height="19" /></span
    >
    <div class="tgr-text">
      <h4 id={headingId}>{question}</h4>
      <!-- Replié seulement : dépliée, les choix disent la même chose. -->
      {#if !open}
        <p class="tgr-summary">
          <span class="tgr-answer">{summary}</span>
          {#if detail}<span class="tgr-detail">{detail}</span>{/if}
        </p>
      {/if}
    </div>
    <button
      type="button"
      class="tgr-toggle"
      aria-expanded={open}
      aria-controls="{headingId}-body"
      aria-label="{open ? closeLabel : editLabel} : {question}"
      on:click={onToggle}
    >
      {open ? closeLabel : editLabel}
    </button>
  </div>
  {#if open}
    <div class="tgr-body" id="{headingId}-body">
      {#if when}<p class="tgr-when">{when}</p>{/if}
      <slot />
    </div>
  {/if}
  <!-- Ce qui doit se voir même replié : un refus d'écriture. -->
  <slot name="after" />
</section>

<style>
  .tgr {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px 28px;
  }
  .tgr + :global(.tgr) {
    border-top: 1px solid var(--line);
  }
  .tgr-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
  }
  .tgr-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--surface-tint);
    color: var(--ink-soft);
    flex-shrink: 0;
  }
  .tgr-text {
    flex: 1 1 260px;
    min-width: 0;
  }
  .tgr-text h4 {
    margin: 0;
    font-size: 15.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .tgr-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.5;
  }
  .tgr-answer {
    font-weight: 500;
    color: var(--tag-dot, var(--ink-soft));
  }
  .tgr-detail {
    min-width: 0;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .tgr-toggle {
    height: 36px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--surface);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-soft);
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .tgr-toggle:hover {
    background: var(--surface-tint);
    border-color: var(--line-faint);
  }
  .tgr-toggle:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .tgr-open .tgr-toggle {
    background: var(--surface-tint);
  }
  .tgr-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .tgr-when {
    margin: 0 0 0 54px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
  @media (max-width: 760px) {
    .tgr {
      padding: 18px;
    }
    .tgr-when {
      margin-left: 0;
    }
  }
  @media (pointer: coarse) {
    .tgr-toggle {
      height: 44px;
    }
  }
</style>
