<script>
  /**
   * Filtre « fournisseur » d'une liste de modèles de l'onglet IA : « Tous »,
   * puis une pastille par fournisseur — son logo, et un cadenas tant que sa clé
   * manque. Filtré sur un fournisseur verrouillé, une barre le dit et mène à sa
   * clé (événement `unlock`, avec le fournisseur).
   *
   * Partagé par la transcription et la rédaction : les deux listes se filtrent
   * et se déverrouillent de la même façon.
   */
  import { createEventDispatcher } from 'svelte';
  import IconLock from '~icons/solar/lock-keyhole-minimalistic-linear';
  import IconKey from '~icons/solar/key-minimalistic-linear';
  import OpenAiLogo from '../icons/OpenAiLogo.svelte';
  import { LOGOS, WORDMARKS } from './providerBrands.js';
  import { fill } from '../../utils/i18nFormat.js';

  /** `'all'` ou un fournisseur (bind:value). */
  export let value = 'all';
  /** Les fournisseurs qui ont des modèles dans la liste, dans l'ordre de la carte. */
  export let providers = [];
  /** Fournisseur → vrai tant que sa clé manque. */
  export let locked = {};
  /** Fournisseur → nom affiché. */
  export let labels = {};
  /** Nom du groupe, dit aux lecteurs d'écran. */
  export let groupLabel = '';
  export let allLabel = '';
  /** « Ajoutez une clé {provider}… » et « Ajouter la clé {provider} ». */
  export let lockedText = '';
  export let unlockText = '';

  const dispatch = createEventDispatcher();

  $: lockedLabel = value !== 'all' && locked[value] ? labels[value] || value : '';
</script>

<div class="pf" role="group" aria-label={groupLabel}>
  <button
    type="button"
    class="pf-chip"
    aria-pressed={value === 'all'}
    on:click={() => (value = 'all')}>{allLabel}</button
  >
  {#each providers as provider (provider)}
    {@const label = labels[provider] || provider}
    <button
      type="button"
      class="pf-chip"
      aria-pressed={value === provider}
      on:click={() => (value = provider)}
    >
      {#if WORDMARKS[provider]}
        <svelte:component this={WORDMARKS[provider]} height={10} />
        <span class="pf-sr">{label}</span>
      {:else}
        <svelte:component this={LOGOS[provider] || OpenAiLogo} size={14} />
        <span>{label}</span>
      {/if}
      {#if locked[provider]}
        <IconLock width="13" height="13" aria-hidden="true" />
      {/if}
    </button>
  {/each}
</div>
{#if lockedLabel}
  <p class="pf-lockbar">
    <IconLock width="15" height="15" aria-hidden="true" />
    <span>{fill(lockedText, { provider: lockedLabel })}</span>
    <button type="button" class="pf-unlock" on:click={() => dispatch('unlock', value)}>
      <IconKey width="14" height="14" aria-hidden="true" />
      {fill(unlockText, { provider: lockedLabel })}
    </button>
  </p>
{/if}

<style>
  .pf {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .pf-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: #fff;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .pf-chip:hover {
    background: var(--surface-tint);
  }
  .pf-chip[aria-pressed='true'] {
    border-color: var(--brand);
    background: color-mix(in srgb, var(--brand) 8%, #fff);
    color: var(--ink);
    font-weight: 600;
  }
  .pf-chip:focus-visible,
  .pf-unlock:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .pf-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .pf-lockbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
    margin: 0;
    padding: 0.5rem 0.7rem;
    border: 1px dashed var(--line-strong);
    border-radius: 8px;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .pf-unlock {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: none;
    font: inherit;
    font-weight: 600;
    color: var(--brand-text);
    cursor: pointer;
  }
  .pf-unlock:hover {
    text-decoration: underline;
  }
</style>
