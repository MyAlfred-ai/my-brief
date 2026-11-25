<script>
  /**
   * Le détail d'un mode de connexion (onglet Authentification), déplié sous
   * sa pastille : sa marque et son état sur la page de connexion, l'
   * interrupteur qui le propose, ses réglages (slot) et « Tester ». Même
   * anatomie pour les quatre modes — mot de passe, Google, Microsoft, SSO
   * historique — comme ProviderKey pour les fournisseurs d'IA : c'est ce qui
   * rend la page lisible d'un mode à l'autre.
   *
   * L'état (« Affiché » / « Masqué ») lit les capacités du SERVEUR, la même
   * source que la page de connexion : il dit ce que voit un utilisateur, pas
   * l'interrupteur en cours d'édition. « Tester » suit la même règle, inerte
   * tant que le serveur ne sert pas le mode.
   *
   * Composant de présentation : l'enregistrement reste celui de l'onglet (un
   * seul bouton Enregistrer), le test remonte en événement.
   */
  import { createEventDispatcher } from 'svelte';
  import InfoHint from '../ui/InfoHint.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';

  /** Marque carrée (prop `size`)… */
  export let logo = null;
  /** …ou icône d'un jeu d'icônes (props width/height). */
  export let icon = null;
  export let name = '';
  /** Ce que propose ce mode, en une ligne. */
  export let usage = '';
  /** Le mode est servi par le serveur (page de connexion). */
  export let live = false;
  export let shownLabel = '';
  export let hiddenLabel = '';
  /** L'interrupteur (bind:checked) ; masqué quand rien n'est réglable. */
  export let checked = false;
  export let showToggle = true;
  export let toggleText = '';
  export let toggleDisabled = false;
  /** « Tester » : vide, pas de bouton (le mot de passe n'a pas de flux à jouer). */
  export let testLabel = '';
  /** Ce que fait le test, derrière un ⓘ. */
  export let testInfo = '';
  export let testInfoLabel = '';

  const dispatch = createEventDispatcher();
</script>

<div class="lm">
  <!-- Grille : la phrase sous le nom, à côté du logo ; dans un panneau
       étroit (téléphone), elle passe sous le logo — entre le logo et le
       badge, elle s'écrasait sur six lignes. -->
  <div class="lm-head">
    <span class="lm-logo" aria-hidden="true">
      {#if logo}
        <svelte:component this={logo} size={22} />
      {:else if icon}
        <svelte:component this={icon} width="20" height="20" />
      {/if}
    </span>
    <span class="lm-name" class:lm-name-alone={!usage}>{name}</span>
    {#if usage}<span class="lm-usage">{usage}</span>{/if}
    <StatusBadge tone={live ? 'ok' : 'neutral'} text={live ? shownLabel : hiddenLabel} />
  </div>

  {#if showToggle}
    <div class="lm-toggle">
      <span class="lm-toggle-text" aria-hidden="true">{toggleText}</span>
      <ToggleSwitch bind:checked disabled={toggleDisabled} label={name} />
    </div>
  {/if}

  <slot />

  {#if testLabel}
    <div class="lm-actions">
      {#if testInfo}<InfoHint label={testInfoLabel} text={testInfo} place="above" />{/if}
      <button
        type="button"
        class="lm-test"
        disabled={!live}
        aria-label="{testLabel} — {name}"
        on:click={() => dispatch('test')}
      >
        {testLabel}
      </button>
    </div>
  {/if}
</div>

<style>
  .lm {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff;
  }
  .lm-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'logo name badge'
      'logo usage badge';
    column-gap: 0.75rem;
    row-gap: 0.1rem;
    align-items: center;
  }
  .lm-head > :global(*:last-child) {
    grid-area: badge;
  }
  /* Le logo dans une pastille neutre, comme ProviderKey : une icône et une
     marque colorée y prennent le même poids. */
  .lm-logo {
    grid-area: logo;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff;
    color: var(--brand-text);
  }
  .lm-name {
    grid-area: name;
    align-self: end;
    min-width: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
  }
  .lm-name-alone {
    grid-row: 1 / 3;
    align-self: center;
  }
  .lm-usage {
    grid-area: usage;
    align-self: start;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--ink-faint);
  }
  @container (max-width: 480px) {
    .lm-head {
      grid-template-areas:
        'logo name badge'
        'usage usage usage';
      row-gap: 0.45rem;
    }
    .lm-name {
      align-self: center;
    }
  }
  /* Libellé à gauche, interrupteur à droite — la ligne à interrupteur des
     autres onglets. */
  .lm-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--surface);
  }
  .lm-toggle-text {
    font-size: 0.9rem;
    color: var(--ink);
  }
  .lm-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .lm-test {
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
  .lm-test:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .lm-test:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .lm-test:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
</style>
