<script>
  /**
   * Les deux boutons de la carte du compte : « Réglages » (ce qui me concerne)
   * et « Admin » (ce qui concerne l'organisation). Deux espaces, deux boutons
   * LIBELLÉS côte à côte, comme dans MIA — la roue crantée muette et la ligne
   * « Administration » cachée dans le menu du nom obligeaient à savoir où
   * chercher.
   *
   * Deux portes d'entrée, un seul composant : la carte du bas de la Sidebar
   * (ordinateur, tablette) et le menu de l'avatar de la barre d'app
   * (téléphone). Extrait pour que les deux ne divergent pas.
   *
   * « Admin » n'existe que pour un administrateur : le rôle vient du document
   * `user` servi par l'API, la seule source (cf. AdminPanel). Le bouton dont
   * le panneau est ouvert le dit (`aria-current`) : on sait dans quel espace
   * on est sans lire le titre.
   *
   * Chaque bouton porte la pastille de SON espace — le récapitulatif de ce
   * que son panneau a à régler (utils/configAlerts.js `summaryAlert`),
   * composé par le parent.
   *
   * `compact` (rail replié) : icônes seules, empilées ; le nom reste dans
   * `aria-label` et l'infobulle.
   */
  import IconSettings from '~icons/solar/settings-linear';
  import IconShield from '~icons/solar/shield-user-linear';
  import ConfigAlertDot from './ui/ConfigAlertDot.svelte';
  import { auth } from '../stores/auth.js';
  import { activePanel } from '../stores/panels.js';
  import { uiText } from '../store.js';
  import { accountView } from '../utils/userIdentity.js';

  /** 'config' | 'admin' */
  export let onAction = (_id) => {};
  export let configAlert = null;
  export let adminAlert = null;
  export let compact = false;

  $: isAdmin = accountView($auth.user).isAdmin;
  // `name` est le nom accessible : « Admin » tient dans le bouton, un lecteur
  // d'écran entend « Administration ».
  $: buttons = [
    {
      id: 'config',
      label: $uiText.buttons.configuration,
      name: $uiText.buttons.configuration,
      icon: IconSettings,
      alert: configAlert,
    },
    isAdmin && {
      id: 'admin',
      label: $uiText.buttons.adminShort,
      name: $uiText.buttons.administration,
      icon: IconShield,
      alert: adminAlert,
    },
  ].filter(Boolean);
</script>

<div class="aa" class:aa-compact={compact}>
  {#each buttons as button (button.id)}
    <button
      type="button"
      class="aa-btn"
      class:aa-btn-on={$activePanel === button.id}
      aria-label={button.name}
      aria-current={$activePanel === button.id ? 'page' : undefined}
      title={button.alert ? undefined : button.name}
      on:click={() => onAction(button.id)}
    >
      <svelte:component this={button.icon} width="16" height="16" class="aa-icon" />
      <span class="aa-label">{button.label}</span>
      {#if button.alert}
        <ConfigAlertDot {...button.alert} placement={compact ? 'corner' : 'inline'} />
      {/if}
    </button>
  {/each}
</div>

<style>
  /* Deux boutons de même poids ; trop à l'étroit (colonne réduite à 220 px,
     avec une pastille), ils passent l'un sous l'autre plutôt que de couper
     leur libellé. */
  .aa {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .aa-btn {
    /* Repère de la pastille « coin » du rail replié. */
    position: relative;
    --cad-corner-offset: 7px;
    flex: 1 1 92px;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 8px;
    border: 1px solid var(--mb-border-default);
    border-radius: 10px;
    background: var(--mb-bg-surface);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .aa-btn:hover {
    background: var(--mb-orange-10);
  }
  .aa-btn-on,
  .aa-btn-on:hover {
    background: var(--mb-bg-tabs);
    border-color: var(--mb-border-card);
    font-weight: 600;
  }
  .aa-btn :global(.aa-icon) {
    flex-shrink: 0;
    color: var(--mb-orange);
  }
  .aa-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Rail replié : deux boutons-icônes, l'un sous l'autre. */
  .aa-compact {
    flex-direction: column;
    align-items: center;
  }
  .aa-compact .aa-btn {
    flex: none;
    width: 40px;
    height: 40px;
    padding: 0;
    border-color: transparent;
    background: transparent;
    border-radius: 12px;
  }
  .aa-compact .aa-btn:hover,
  .aa-compact .aa-btn-on {
    background: var(--mb-orange-10);
  }
  .aa-compact .aa-label {
    display: none;
  }

  /* Au doigt, la cible reprend 44 px. */
  @media (pointer: coarse) {
    .aa-btn {
      min-height: 44px;
    }
  }
</style>
