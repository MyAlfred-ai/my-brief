<script>
  /**
   * Les domaines d'intervention de l'Aide IA — un geste par domaine, partout
   * où on les règle : en cartes sur l'écran de démarrage, en puces dans le
   * pupitre, en lignes dans le menu de la pastille du dock. Trois formes, une
   * seule logique : ce composant.
   *
   * Le menu (`menu`) dit tout de chaque domaine — son nom, ce qu'il fait, son
   * état : c'est lui qui a remplacé les quatre icônes muettes de la pastille.
   *
   * Seuls les domaines que le compte PEUT utiliser sont montrés (droit du
   * groupe, réglage de l'installation, clé myBrain) : un domaine grisé qu'on ne
   * peut pas allumer est une question de plus pendant une réunion.
   */
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { aiHelp, AI_HELP_DOMAINS, toggleAiHelpDomain } from '../../stores/aiHelp.js';
  import AiIcon from './AiIcon.svelte';

  /** @type {'cards'|'chips'|'menu'} */
  export let variant = 'chips';

  $: T = $uiText.aiHelp;
  $: name = $aiHelp.wakeWord || T.name;
  $: shown = AI_HELP_DOMAINS.filter((key) => $aiHelp.allowed[key]);
</script>

<div class="aid aid-{variant}" role="group" aria-label={T.domainsLabel}>
  {#each shown as key (key)}
    {@const on = $aiHelp.domains[key] === true}
    <button
      type="button"
      class="aid-item"
      class:aid-on={on}
      aria-pressed={on}
      on:click={() => toggleAiHelpDomain(key)}
    >
      <span class="aid-badge"><AiIcon name={key} size={variant === 'cards' ? 18 : 17} /></span>
      <span class="aid-text">
        <span class="aid-title">{T.domains[key].title}</span>
        {#if variant !== 'chips'}
          <span class="aid-hint">{fill(T.domains[key].hint, { name })}</span>
        {/if}
      </span>
      {#if variant === 'cards' && on}
        <span class="aid-check"><AiIcon name="check" size={12} strokeWidth={3} /></span>
      {/if}
      {#if variant === 'menu'}
        <!-- Un interrupteur dessiné : le bouton entier bascule, `aria-pressed` le dit. -->
        <span class="aid-switch" aria-hidden="true"></span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .aid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .aid-cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .aid-menu {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 2px;
  }

  .aid-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px 0 4px;
    border: 1.5px solid var(--line);
    border-radius: 18px;
    background: var(--surface);
    color: var(--mb-text-secondary);
    font-family: 'Lexend', sans-serif;
    font-size: calc(12.5px * var(--ai-scale, 1));
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.18s,
      border-color 0.18s,
      color 0.18s,
      transform 0.15s;
  }
  .aid-item:active {
    transform: scale(0.96);
  }
  .aid-item:focus-visible {
    outline: 2px solid var(--ai-ink);
    outline-offset: 2px;
  }
  .aid-on {
    border-color: var(--ai-line);
    background: var(--ai-soft);
    color: var(--ai-ink);
  }
  .aid-badge {
    width: 28px;
    height: 28px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--surface-tint);
    color: var(--mb-text-secondary);
    transition:
      background 0.2s,
      color 0.2s;
  }
  .aid-on .aid-badge {
    background: var(--ai);
    color: #fff;
  }
  .aid-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  /* Cartes — écran de démarrage. */
  .aid-cards .aid-item {
    gap: 10px;
    min-height: 62px;
    padding: 9px 10px 9px 11px;
    border-radius: 14px;
  }
  .aid-cards .aid-badge {
    width: 34px;
    height: 34px;
  }
  .aid-cards .aid-text {
    flex: 1;
  }
  .aid-cards .aid-title {
    font-size: calc(13.5px * var(--ai-scale, 1));
    color: var(--ink);
  }
  .aid-hint {
    font-size: calc(11.5px * var(--ai-scale, 1));
    font-weight: 400;
    line-height: 1.4;
    color: var(--mb-text-secondary);
  }
  .aid-check {
    width: 20px;
    height: 20px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--ai);
    color: #fff;
    animation: aid-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  /* Menu — pastille du dock : une ligne par domaine, pleine largeur, sans
     cadre ; l'interrupteur à droite dit l'état, la pastille de l'icône aussi. */
  .aid-menu .aid-item {
    gap: 10px;
    min-height: 50px;
    padding: 6px 8px;
    border: none;
    border-radius: 11px;
    background: transparent;
  }
  .aid-menu .aid-item:hover {
    background: var(--ai-soft);
  }
  .aid-menu .aid-badge {
    width: 32px;
    height: 32px;
  }
  .aid-menu .aid-text {
    flex: 1;
  }
  .aid-menu .aid-title {
    font-size: 13px;
    color: var(--ink);
  }
  .aid-switch {
    position: relative;
    width: 30px;
    height: 18px;
    flex: none;
    border-radius: 9px;
    background: var(--line-strong);
    transition: background 0.2s;
  }
  .aid-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--surface);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
    transition: transform 0.2s;
  }
  .aid-on .aid-switch {
    background: var(--ai);
  }
  .aid-on .aid-switch::after {
    transform: translateX(12px);
  }

  @keyframes aid-pop {
    0% {
      transform: scale(0);
    }
    70% {
      transform: scale(1.25);
    }
    100% {
      transform: scale(1);
    }
  }

  /* Téléphone : deux colonnes de tuiles — l'icône, le nom dessous, la coche en
     coin. En une colonne avec leurs phrases, les quatre domaines faisaient
     passer la carte sous « Démarrer » (mesuré à 375 px). */
  @media (max-width: 480px) {
    .aid-cards .aid-item {
      position: relative;
      flex-direction: column;
      align-items: flex-start;
      gap: 7px;
      min-height: 84px;
      padding: 10px 11px;
    }
    .aid-cards .aid-hint {
      display: none;
    }
    .aid-cards .aid-check {
      position: absolute;
      top: 10px;
      right: 10px;
    }
  }
  @media (pointer: coarse) {
    .aid-chips .aid-item {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aid-check {
      animation: none;
    }
    .aid-switch,
    .aid-switch::after {
      transition: none;
    }
  }
</style>
