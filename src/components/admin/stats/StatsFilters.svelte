<script>
  /**
   * Barre de filtres de l'onglet Statistiques : période (glissante ou choisie
   * au jour près), groupe, compte, template — et les deux sorties, Actualiser
   * et Exporter en PDF.
   *
   * Elle ne charge rien : elle rend un nouveau jeu de filtres (`change`), et
   * StatsTab relit le serveur. Tous les filtres cadrent TOUTE la page : il n'y
   * en a qu'une rangée, au-dessus de tout ce qu'elle cadre.
   *
   * Les listes viennent de la réponse (`filters.options`) et ne dépendent
   * d'aucun filtre : choisir un groupe ne fait pas disparaître les autres. Un
   * filtre sans choix possible (un seul groupe, un seul template) ne s'affiche
   * pas — un menu à une option n'est pas un filtre.
   */
  import { createEventDispatcher } from 'svelte';
  import IconRefresh from '~icons/solar/refresh-linear';
  import IconDownload from '~icons/solar/download-minimalistic-linear';
  import IconCalendar from '~icons/solar/calendar-linear';
  import IconClose from '~icons/solar/close-circle-linear';
  import { fill } from '../../../utils/i18nFormat.js';
  import { accountName, templateName } from './statsView.js';

  /** `{days, from, to, group, user, template}` — l'état courant de StatsTab. */
  export let filters;
  /** `filters.options` de la réponse : `{groups, users, templates}`. */
  export let options = null;
  export let texts;
  export let lang = 'fr';
  export let refreshing = false;
  /** Export désactivé tant qu'il n'y a rien d'affiché. */
  export let canExport = false;

  const RANGES = [7, 30, 90, 365, 0];
  const dispatch = createEventDispatcher();

  /** Aujourd'hui en `AAAA-MM-JJ`, heure locale — la borne haute des dates. */
  const today = (() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  })();

  $: custom = !!(filters.from && filters.to);
  let customOpen = false;
  let draftFrom = '';
  let draftTo = '';
  $: draftValid = !!(draftFrom && draftTo && draftFrom <= draftTo && draftFrom <= today);

  $: groups = options?.groups || [];
  $: users = options?.users || [];
  $: templates = options?.templates || [];
  $: scoped = !!(filters.group || filters.user || filters.template);

  function change(patch) {
    dispatch('change', { ...filters, ...patch });
  }

  function pickRange(days) {
    customOpen = false;
    change({ days, from: '', to: '' });
  }

  function toggleCustom() {
    customOpen = !customOpen;
    if (customOpen) {
      draftFrom = filters.from || '';
      draftTo = filters.to || today;
    }
  }

  function applyCustom() {
    if (!draftValid) return;
    customOpen = false;
    change({ from: draftFrom, to: draftTo });
  }
</script>

<div class="sf" role="group" aria-label={texts.filtersLabel}>
  <div class="sf-row">
    <div class="sf-ranges" role="group" aria-label={texts.rangeLabel}>
      {#each RANGES as value (value)}
        <button
          type="button"
          class="sf-range"
          class:sf-range-on={!custom && filters.days === value}
          aria-pressed={!custom && filters.days === value}
          on:click={() => pickRange(value)}
        >
          {texts.ranges[String(value)]}
        </button>
      {/each}
      <button
        type="button"
        class="sf-range sf-range-custom"
        class:sf-range-on={custom}
        aria-pressed={custom}
        aria-expanded={customOpen}
        on:click={toggleCustom}
      >
        <IconCalendar width="13" height="13" aria-hidden="true" />
        {texts.customRange}
      </button>
    </div>

    <div class="sf-actions">
      <button
        type="button"
        class="sf-btn"
        on:click={() => dispatch('refresh')}
        disabled={refreshing}
      >
        <IconRefresh width="14" height="14" aria-hidden="true" />
        {refreshing ? texts.refreshing : texts.refresh}
      </button>
      <button
        type="button"
        class="sf-btn sf-btn-primary"
        on:click={() => dispatch('exportpdf')}
        disabled={!canExport}
      >
        <IconDownload width="14" height="14" aria-hidden="true" />
        {texts.exportPdf}
      </button>
    </div>
  </div>

  {#if customOpen}
    <form class="sf-custom" on:submit|preventDefault={applyCustom}>
      <label class="sf-date">
        <span>{texts.customFrom}</span>
        <input type="date" bind:value={draftFrom} max={draftTo || today} required />
      </label>
      <label class="sf-date">
        <span>{texts.customTo}</span>
        <input type="date" bind:value={draftTo} min={draftFrom || null} max={today} required />
      </label>
      <button type="submit" class="sf-btn sf-btn-primary" disabled={!draftValid}>
        {texts.customApply}
      </button>
    </form>
  {/if}

  {#if groups.length > 1 || users.length > 1 || templates.length > 1}
    <div class="sf-row sf-selects">
      {#if groups.length > 1}
        <label class="sf-field" class:sf-field-on={filters.group}>
          <span class="sf-field-label">{texts.filterGroup}</span>
          <select value={filters.group} on:change={(e) => change({ group: e.currentTarget.value })}>
            <option value="">{texts.allGroups}</option>
            {#each groups as group (group.id)}
              <option value={group.id}>{group.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if users.length > 1}
        <label class="sf-field" class:sf-field-on={filters.user}>
          <span class="sf-field-label">{texts.filterUser}</span>
          <select value={filters.user} on:change={(e) => change({ user: e.currentTarget.value })}>
            <option value="">{texts.allUsers}</option>
            {#each users as user (user.email)}
              <option value={user.email.toLowerCase()}>
                {user.disabled
                  ? fill(texts.disabledOption, { name: accountName(user) })
                  : accountName(user)}
              </option>
            {/each}
          </select>
        </label>
      {/if}
      {#if templates.length > 1}
        <label class="sf-field" class:sf-field-on={filters.template}>
          <span class="sf-field-label">{texts.filterTemplate}</span>
          <select
            value={filters.template}
            on:change={(e) => change({ template: e.currentTarget.value })}
          >
            <option value="">{texts.allTemplates}</option>
            {#each templates as row (row.template)}
              <option value={row.template}>{templateName(row, lang, texts.templateUnknown)}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if scoped}
        <button
          type="button"
          class="sf-reset"
          on:click={() => change({ group: '', user: '', template: '' })}
        >
          <IconClose width="14" height="14" aria-hidden="true" />
          {texts.resetFilters}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sf {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .sf-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  /* ── Période ── */
  .sf-ranges {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-tint);
    flex-wrap: wrap;
  }
  .sf-range {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.75rem;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .sf-range:hover {
    color: var(--ink);
  }
  .sf-range-on {
    background: var(--surface);
    color: var(--brand-text);
    font-weight: 600;
    box-shadow: 0 1px 3px -1px color-mix(in srgb, var(--ink) 18%, transparent);
  }

  /* ── Actions ── */
  .sf-actions {
    display: inline-flex;
    gap: 0.45rem;
  }
  .sf-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.42rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .sf-btn:hover:not(:disabled) {
    background: var(--surface-tint);
    color: var(--ink-soft);
  }
  .sf-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .sf-btn-primary {
    border-color: transparent;
    background: var(--brand);
    color: #fff;
    font-weight: 600;
    box-shadow: 0 2px 8px -3px rgb(var(--brand-rgb) / 0.5);
  }
  .sf-btn-primary:hover:not(:disabled) {
    background: var(--brand-strong);
    color: #fff;
  }

  /* ── Dates choisies ── */
  .sf-custom {
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
    flex-wrap: wrap;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-tint);
  }
  .sf-date {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .sf-date input {
    padding: 0.38rem 0.55rem;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font-family: inherit;
    font-size: 0.85rem;
    text-transform: none;
    letter-spacing: normal;
  }

  /* ── Périmètre ── */
  .sf-selects {
    justify-content: flex-start;
  }
  /* Le libellé DANS la pastille : une rangée compacte qui se lit « Groupe :
     Tous les groupes », sans étiquettes flottantes au-dessus. */
  .sf-field {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    max-width: 100%;
    padding: 0 0.15rem 0 0.7rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .sf-field:focus-within {
    border-color: var(--brand-secondary-soft-18);
    box-shadow: 0 0 0 3px var(--brand-secondary-soft-08);
  }
  .sf-field-on {
    border-color: var(--brand-soft-18);
    background: var(--brand-soft-08);
  }
  .sf-field-label {
    flex: 0 0 auto;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .sf-field select {
    min-width: 0;
    max-width: 15rem;
    padding: 0.4rem 0.4rem 0.4rem 0;
    border: none;
    background: transparent;
    color: var(--ink);
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 500;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .sf-field select:focus {
    outline: none;
  }
  .sf-reset {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--brand-text);
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .sf-reset:hover {
    color: var(--brand-text-strong);
  }

  @media (max-width: 640px) {
    .sf-ranges {
      flex: 1 1 100%;
      justify-content: space-between;
    }
    .sf-range {
      padding: 0.35rem 0.5rem;
    }
    .sf-actions {
      flex: 1 1 100%;
    }
    .sf-actions .sf-btn {
      flex: 1 1 0;
      justify-content: center;
    }
    .sf-field {
      flex: 1 1 100%;
    }
    .sf-field select {
      flex: 1 1 auto;
      max-width: none;
    }
  }
</style>
