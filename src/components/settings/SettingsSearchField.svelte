<script>
  /**
   * Champ de la recherche dans les réglages. Sur ordinateur, sous « Nouvelle
   * réunion », à la place de la recherche de l'historique quand « Réglages »
   * ou l'administration sont ouverts (variante `pill`) ; sur téléphone, en
   * tête du déroulant des sections (variante `menu`, PanelTabs).
   *
   * Combobox à la mode ARIA : le focus reste dans le champ, ↑ ↓ choisissent
   * une ligne de la liste (SettingsSearchResults, qui partage `idPrefix`),
   * Entrée l'ouvre. Échap vide le champ ; dans un champ vide, il rend la main
   * — un second Échap ferme alors le panneau (PanelShell ignore la touche
   * tant qu'elle vient d'un champ).
   */
  import { onDestroy } from 'svelte';
  import IconSearch from '~icons/solar/magnifer-linear';
  import IconClear from '~icons/solar/close-circle-linear';
  import { uiText } from '../../store.js';
  import {
    settingsQuery,
    settingsActive,
    settingsResults,
    goToSetting,
    clearSettingsSearch,
  } from '../../stores/settingsSearch.js';
  import { fill } from '../../utils/i18nFormat.js';

  /** Préfixe des identifiants partagé avec la liste (aria-controls, options). */
  export let idPrefix = 'ss';
  /** 'pill' : colonne de gauche ; 'menu' : déroulant mobile. */
  export let variant = 'pill';
  /** Raccourci affiché dans le champ vide (« Ctrl K ») ; vide, rien. */
  export let shortcut = '';
  /** Après l'ouverture d'un résultat (refermer un tiroir, un déroulant). */
  export let onPicked = (_result) => {};

  let input;

  /** Donne le focus au champ, saisie sélectionnée (raccourci clavier). */
  export function focus() {
    input?.focus();
    input?.select();
  }

  $: texts = $uiText.settingsSearch;
  $: open = $settingsQuery.trim().length > 0;
  $: count = $settingsResults.length;
  $: activeId = open && count ? `${idPrefix}-opt-${Math.min($settingsActive, count - 1)}` : '';

  function pick(result) {
    goToSetting(result);
    onPicked(result);
  }

  function onKeydown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!count) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      settingsActive.set((Math.min($settingsActive, count - 1) + step + count) % count);
    } else if (event.key === 'Enter') {
      if (!count) return;
      event.preventDefault();
      pick($settingsResults[Math.min($settingsActive, count - 1)]);
    } else if (event.key === 'Escape') {
      if ($settingsQuery) {
        event.preventDefault();
        clearSettingsSearch();
      } else {
        input?.blur();
      }
    }
  }

  function clear() {
    clearSettingsSearch();
    input?.focus();
  }

  // Le champ disparaît avec le panneau (ou le déroulant) : la saisie aussi —
  // la retrouver à la réouverture masquerait les sections sans raison visible.
  onDestroy(clearSettingsSearch);
</script>

<div class="ssf ssf-{variant}">
  <IconSearch width="14" height="14" class="ssf-icon" aria-hidden="true" />
  <input
    bind:this={input}
    bind:value={$settingsQuery}
    class="ssf-input"
    type="text"
    role="combobox"
    aria-label={texts.label}
    aria-autocomplete="list"
    aria-expanded={open}
    aria-controls="{idPrefix}-list"
    aria-activedescendant={activeId || undefined}
    aria-keyshortcuts={shortcut ? 'Control+K Meta+K' : undefined}
    title={shortcut ? fill(texts.shortcut, { keys: shortcut }) : undefined}
    placeholder={texts.placeholder}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    enterkeyhint="go"
    on:keydown={onKeydown}
  />
  {#if $settingsQuery}
    <button
      type="button"
      class="ssf-clear"
      aria-label={texts.clear}
      title={texts.clear}
      on:click={clear}
    >
      <IconClear width="15" height="15" aria-hidden="true" />
    </button>
  {:else if shortcut}
    <kbd class="ssf-kbd" aria-hidden="true">{shortcut}</kbd>
  {/if}
</div>

<style>
  .ssf {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
  }
  .ssf :global(.ssf-icon) {
    position: absolute;
    left: 12px;
    pointer-events: none;
    color: var(--mb-text-placeholder);
  }
  .ssf-input {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: transparent;
    border: none;
    outline: none;
    font-family: inherit;
    color: var(--ink);
  }
  .ssf-input::placeholder {
    color: var(--mb-text-placeholder);
    font-weight: 300;
  }

  /* Colonne : la seconde moitié de la pilule « Nouvelle réunion », comme la
     recherche de l'historique qu'elle remplace (Sidebar, `.sb-search`). */
  .ssf-pill {
    height: 40px;
    margin-top: -1px;
    padding: 0 8px 0 34px;
    border-radius: 0 0 var(--mb-radius-pill) var(--mb-radius-pill);
    background: rgba(255, 255, 255, 0.48);
    border: 1px solid rgba(162, 162, 162, 0.2);
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .ssf-pill:focus-within {
    background: var(--surface);
    border-color: rgb(var(--brand-rgb) / 0.45);
  }
  .ssf-pill .ssf-input {
    font-family: 'Lexend', sans-serif;
    font-weight: 300;
    font-size: 14px;
  }

  /* Déroulant mobile : un champ plein, à 44 px pour le doigt. */
  .ssf-menu {
    min-height: 44px;
    padding: 0 6px 0 34px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
  }
  .ssf-menu:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .ssf-menu .ssf-input {
    /* 16 px : en dessous, iOS zoome la page au focus. */
    font-size: 16px;
  }

  .ssf-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .ssf-clear:hover {
    background: rgb(var(--brand-rgb) / 0.08);
    color: var(--ink);
  }
  .ssf-kbd {
    flex-shrink: 0;
    padding: 1px 6px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--surface);
    font-family: inherit;
    font-size: 10.5px;
    color: var(--ink-faint);
    white-space: nowrap;
  }
  /* Au doigt, pas de clavier à annoncer. */
  @media (pointer: coarse) {
    .ssf-kbd {
      display: none;
    }
  }
</style>
