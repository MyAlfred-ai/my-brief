<script>
  /**
   * Une ligne de la carte « Fournisseurs d'IA » (onglet IA) : le logo et le
   * rôle d'un fournisseur, l'état de sa clé, et de quoi la coller, la tester
   * ou la retirer. OpenAI et Mistral en ont chacun une, même anatomie : c'est
   * ce qui rend lisible qu'une clé débloque des modèles.
   *
   * Le champ reste FERMÉ tant qu'une clé est en place (« Remplacer » l'ouvre) :
   * une ligne configurée se lit en un coup d'œil. Il est ouvert d'emblée quand
   * la clé manque et qu'elle est requise. `open()` l'ouvre et y met le focus —
   * c'est le chemin du bouton « Ajouter la clé Mistral » des modèles
   * verrouillés.
   *
   * Composant de présentation : l'enregistrement reste celui de l'onglet (un
   * seul bouton Enregistrer), les tests et le retrait remontent en événements.
   */
  import { createEventDispatcher, tick } from 'svelte';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconKey from '~icons/solar/key-minimalistic-linear';
  import StatusBadge from '../ui/StatusBadge.svelte';

  /** 'openai' | 'mistral'… — préfixe des identifiants du champ. */
  export let id;
  /** Marque carrée (prop `size`), dans la pastille. */
  export let logo = null;
  /**
   * Ou logo COMPLET (symbole et nom, prop `height`) — une marque qui ne se
   * recadre pas : il prend une pastille élargie, à la place du nom, et le rôle
   * passe dessous. Le nom reste lu par les lecteurs d'écran.
   */
  export let wordmark = null;
  export let name = '';
  /** Ce que fait ce fournisseur dans myBrief, en une ligne. */
  export let usage = '';
  /** 'ok' | 'warn' | 'neutral' */
  export let tone = 'neutral';
  export let status = '';
  /** Provenance de la clé en place (« Clé enregistrée depuis cet écran : ») ; vide = aucune. */
  export let source = '';
  /** Indice de la clé en place (`sk-pro…QLAA`). */
  export let hint = '';
  /** Ligne discrète sous la provenance (« Enregistrée par … »). */
  export let meta = '';
  /** Avertissement sous la provenance (aucune clé alors qu'elle est requise). */
  export let sourceWarning = '';
  /** La clé collée (bind:value) — jamais celle du serveur, qui ne sort pas. */
  export let value = '';
  export let inputLabel = '';
  export let placeholder = '';
  export let help = '';
  /** Avertissement sous le champ (la clé remplacera celle du déploiement…). */
  export let warning = '';
  /** Champ ouvert (bind) — fermé tant qu'une clé est en place. */
  export let editing = false;
  export let editLabel = '';
  export let testLabel = '';
  export let testingLabel = '';
  export let testOkLabel = '';
  /** 'idle' | 'testing' | 'ok' */
  export let testState = 'idle';
  export let canTest = false;
  export let clearLabel = '';
  export let canClear = false;
  export let busy = false;

  const dispatch = createEventDispatcher();
  let input;

  /** Ouvre le champ et y met le focus, en le ramenant à l'écran. */
  export async function open() {
    editing = true;
    await tick();
    input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    input?.focus({ preventScroll: true });
  }
</script>

<div class="pk">
  <div class="pk-head" class:pk-head-grid={!wordmark}>
    {#if wordmark}
      <span class="pk-logo pk-logo-wide" aria-hidden="true"
        ><svelte:component this={wordmark} height={18} /></span
      >
      <span class="pk-title pk-spacer"><span class="pk-hidden">{name}</span></span>
    {:else}
      <!-- Grille : le rôle sous le nom, à côté du logo ; dans une ligne
           étroite (téléphone), il passe sous le logo — entre le logo et le
           badge, il s'écrasait sur quatre lignes. -->
      <span class="pk-logo" aria-hidden="true"><svelte:component this={logo} size={22} /></span>
      <span class="pk-name" class:pk-name-alone={!usage}>{name}</span>
      {#if usage}<span class="pk-usage pk-usage-side">{usage}</span>{/if}
    {/if}
    <StatusBadge {tone} text={status} />
  </div>

  <div class="pk-body" class:pk-body-flush={wordmark}>
    {#if wordmark}<p class="pk-usage pk-usage-line">{usage}</p>{/if}
    {#if source}
      <p class="pk-source">
        {source} <code>{hint}</code>
        {#if meta}<span class="pk-meta">· {meta}</span>{/if}
      </p>
    {:else if sourceWarning}
      <p class="pk-source pk-source-warn">{sourceWarning}</p>
    {/if}

    {#if editing}
      <div class="pk-field">
        <span class="pk-field-icon" aria-hidden="true"><IconKey width="16" height="16" /></span>
        <input
          bind:this={input}
          id="{id}-key"
          class="pk-input"
          type="password"
          autocomplete="off"
          spellcheck="false"
          aria-label={inputLabel}
          aria-describedby={help ? `${id}-key-help` : undefined}
          {placeholder}
          bind:value
        />
      </div>
      {#if help}<p class="pk-help" id="{id}-key-help">{help}</p>{/if}
      {#if warning}<p class="pk-warn">{warning}</p>{/if}
    {/if}
  </div>

  <div class="pk-actions">
    {#if testState === 'ok'}
      <span class="pk-ok"
        ><IconCheck width="15" height="15" aria-hidden="true" /> {testOkLabel}</span
      >
    {/if}
    {#if !editing && editLabel}
      <button type="button" class="pk-btn" on:click={open} aria-label="{editLabel} — {name}">
        {editLabel}
      </button>
    {/if}
    {#if canClear}
      <button
        type="button"
        class="pk-btn"
        on:click={() => dispatch('clear')}
        disabled={busy}
        aria-label="{clearLabel} — {name}"
      >
        {clearLabel}
      </button>
    {/if}
    {#if testLabel}
      <button
        type="button"
        class="pk-btn"
        on:click={() => dispatch('test')}
        disabled={!canTest || testState === 'testing' || busy}
        aria-label="{testState === 'testing' ? testingLabel : testLabel} — {name}"
      >
        {testState === 'testing' ? testingLabel : testLabel}
      </button>
    {/if}
  </div>
</div>

<style>
  .pk {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.9rem 0;
  }
  .pk + :global(.pk) {
    border-top: 1px solid var(--line);
  }
  .pk-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  /* Le logo dans une pastille neutre : deux marques de styles opposés (nœud
     monochrome, pavés colorés) prennent ainsi le même poids visuel. */
  .pk-logo {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff;
    color: #1a1a1a;
  }
  .pk-logo-wide {
    width: auto;
    padding: 0 0.75rem;
  }
  .pk-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .pk-title {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .pk-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
  }
  .pk-usage {
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--ink-faint);
  }
  .pk-head-grid {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'logo name badge'
      'logo usage badge';
    column-gap: 0.75rem;
    row-gap: 0.1rem;
  }
  .pk-head-grid .pk-logo {
    grid-area: logo;
  }
  .pk-head-grid .pk-name {
    grid-area: name;
    align-self: end;
  }
  .pk-head-grid .pk-name-alone {
    grid-row: 1 / 3;
    align-self: center;
  }
  .pk-usage-side {
    grid-area: usage;
    align-self: start;
  }
  .pk-head-grid > :global(*:last-child) {
    grid-area: badge;
  }
  @container (max-width: 480px) {
    .pk-head-grid {
      grid-template-areas:
        'logo name badge'
        'usage usage usage';
      row-gap: 0.45rem;
    }
    .pk-head-grid .pk-name {
      align-self: center;
    }
  }
  /* Le détail s'aligne sous le nom, pas sous le logo : la ligne se lit comme
     un bloc. Sur téléphone, toute la largeur — le retrait y mangerait la clé. */
  .pk-body {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding-left: calc(38px + 0.75rem);
  }
  .pk-body:empty {
    display: none;
  }
  /* Logo complet : pas de colonne de logo à laisser libre, le détail part du bord. */
  .pk-body-flush {
    padding-left: 0;
  }
  .pk-usage-line {
    margin: 0;
  }
  .pk-source {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--ink-soft);
  }
  .pk-source code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    padding: 0.1rem 0.35rem;
    border-radius: 5px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .pk-meta {
    color: var(--ink-faint);
  }
  .pk-source-warn {
    padding: 0.5rem 0.7rem;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  .pk-field {
    position: relative;
  }
  .pk-field-icon {
    position: absolute;
    top: 50%;
    left: 0.7rem;
    display: flex;
    transform: translateY(-50%);
    color: var(--ink-faint);
    pointer-events: none;
  }
  .pk-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.6rem 0.75rem 0.6rem 2.1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.92rem;
    background: #fff;
    color: #1a1a1a;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .pk-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .pk-help {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--ink-faint);
  }
  .pk-warn {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 0.85rem;
  }
  .pk-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .pk-actions:empty {
    display: none;
  }
  .pk-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: oklch(48% 0.12 150);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .pk-btn {
    padding: 0.45rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85rem;
    transition: background 0.15s;
  }
  .pk-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .pk-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (max-width: 640px) {
    .pk-body {
      padding-left: 0;
    }
  }
</style>
