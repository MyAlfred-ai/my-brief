<script>
  /**
   * Liste des domaines email autorisés. Purement présentationnel : la
   * normalisation et le dédoublonnage font autorité côté serveur
   * (services/api/lib/auth/domains.js), on reproduit juste ce qu'il faut pour
   * éviter d'afficher un doublon évident (src/utils/allowedDomains.js).
   */
  import { createEventDispatcher } from 'svelte';
  import IconRemove from '~icons/solar/close-circle-linear';
  import { normalizeDomain, withDomain } from '../../utils/allowedDomains.js';

  export let domains = [];
  export let texts; // $uiText.adminAuth
  export let disabled = false;
  /**
   * Saisie pas encore ajoutée. Liée par le parent (`bind:draft`) : un domaine
   * tapé sans cliquer « Ajouter » doit partir avec « Enregistrer ».
   */
  export let draft = '';

  const dispatch = createEventDispatcher();

  function add() {
    const next = withDomain(domains, draft);
    if (!next) return;
    if (next !== domains) dispatch('change', next);
    draft = '';
  }

  function remove(domain) {
    dispatch(
      'change',
      domains.filter((d) => d !== domain),
    );
  }
</script>

<div class="dl-wrap">
  <form class="dl-add" on:submit|preventDefault={add}>
    <input
      class="dl-input"
      type="text"
      placeholder={texts.domainPlaceholder}
      autocomplete="off"
      {disabled}
      bind:value={draft}
    />
    <button
      type="submit"
      class="dl-add-btn"
      disabled={disabled || !normalizeDomain(draft).includes('.')}
    >
      {texts.domainAdd}
    </button>
  </form>

  {#if domains.length === 0}
    <p class="dl-empty">{texts.domainEmpty}</p>
  {:else}
    <ul class="dl-list">
      {#each domains as domain (domain)}
        <li class="dl-item">
          <span class="dl-name">@{domain}</span>
          <button
            type="button"
            class="dl-remove"
            {disabled}
            on:click={() => remove(domain)}
            aria-label={`${texts.domainRemove} ${domain}`}
          >
            <IconRemove width="14" height="14" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dl-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .dl-add {
    display: flex;
    gap: 0.5rem;
  }
  .dl-input {
    flex: 1;
    min-width: 0;
    padding: 0.55rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--brand-secondary) 4.1%, #e0e0e0);
    border-radius: 8px;
    font-size: 0.92rem;
  }
  .dl-add-btn {
    padding: 0.55rem 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-secondary) 4.1%, #e0e0e0);
    border-radius: 8px;
    background: #fff;
    cursor: pointer;
    white-space: nowrap;
  }
  .dl-add-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .dl-empty {
    margin: 0;
    padding: 0.75rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--brand-secondary) 8.8%, #f9f9f9);
    color: color-mix(in srgb, var(--brand-secondary) 22.2%, #2a2a2a);
    font-size: 0.85rem;
    line-height: 1.45;
  }
  .dl-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .dl-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.4rem 0.3rem 0.7rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-secondary) 13.1%, #f5f5f5);
    color: color-mix(in srgb, var(--brand-secondary) 31.8%, #000000);
    font-size: 0.85rem;
  }
  .dl-remove {
    display: inline-flex;
    align-items: center;
    border: none;
    background: none;
    cursor: pointer;
    color: color-mix(in srgb, var(--brand-secondary) 31.6%, #2a2a2a);
    padding: 0 0.15rem;
    line-height: 1;
    transition: color 0.15s;
  }
  .dl-remove:hover:not(:disabled) {
    color: oklch(45% 0.18 25);
  }
  .dl-remove:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
