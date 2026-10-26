<script>
  /**
   * Utilisation par utilisateur — chaque compte du périmètre sur la période :
   * statut d'adoption, réunions (et leur écart à la période précédente), temps,
   * durée moyenne, régularité (semaines actives), comptes rendus, dernière
   * réunion. Des volumes, jamais un titre ni un contenu de réunion.
   *
   * Remplace « Comptes les moins actifs » (huit lignes fixes) : trié par
   * réunions croissantes, ou filtré sur « En sommeil », le tableau répond à la
   * même question sans s'arrêter au huitième.
   *
   * Recherche, statut et tri se font ICI, sans relire le serveur : ce sont des
   * vues du même périmètre. Le CSV exporte ce qui est affiché, dans l'ordre
   * affiché. Un clic sur un nom centre toute la page sur ce compte (`focus`).
   */
  import { createEventDispatcher } from 'svelte';
  import IconSearch from '~icons/solar/magnifier-linear';
  import IconExport from '~icons/solar/file-download-linear';
  import IconUp from '~icons/solar/alt-arrow-up-linear';
  import IconDown from '~icons/solar/alt-arrow-down-linear';
  import GroupChip from '../../ui/GroupChip.svelte';
  import { saveFile } from '../../../platform/download.js';
  import { fill } from '../../../utils/i18nFormat.js';
  import { daysSince, formatCount, formatDate, formatDuration } from './format.js';
  import {
    ADOPTION_COLORS,
    ADOPTION_STATUSES,
    accountName,
    accountsCsv,
    matchesQuery,
    regularityOf,
    sortAccounts,
    trendOf,
  } from './statsView.js';

  export let accounts = [];
  export let texts;
  export let lang = 'fr';
  /** Statut affiché ('' = tous) — lié par StatsTab, que la carte d'adoption règle aussi. */
  export let status = '';
  /** Colonne des groupes : sans intérêt quand l'organisation n'en a qu'un. */
  export let showGroups = true;

  const dispatch = createEventDispatcher();

  let query = '';
  let sortKey = 'meetings';
  let sortDir = 'desc';

  // Statut et régularité partagent une colonne : l'un est le verdict, l'autre
  // sa mesure (semaines actives). Les colonnes secondaires s'effacent quand la
  // CARTE rétrécit (requêtes de conteneur, cf. le style) : le panneau
  // d'administration n'a pas la largeur de l'écran.
  $: columns = [
    { key: 'name', label: texts.colUser, align: 'left' },
    ...(showGroups ? [{ key: 'groups', label: texts.colGroups, align: 'left', fixed: true }] : []),
    { key: 'status', label: texts.colStatus, align: 'left' },
    { key: 'meetings', label: texts.colMeetings },
    { key: 'durationSeconds', label: texts.colTime },
    { key: 'avgDurationSeconds', label: texts.colAverage },
    { key: 'summaries', label: texts.colSummaries },
    { key: 'lastMeetingAt', label: texts.colLastMeeting },
  ];

  $: counts = Object.fromEntries(
    ADOPTION_STATUSES.map((s) => [s, accounts.filter((row) => row.status === s).length]),
  );
  $: visible = sortAccounts(
    accounts.filter((row) => (!status || row.status === status) && matchesQuery(row, query)),
    sortKey,
    sortDir,
  );

  function sortBy(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortKey = key;
    // Un nom et un statut se lisent du début ; un volume, du plus grand.
    sortDir = key === 'name' || key === 'status' ? 'asc' : 'desc';
  }

  function ariaSort(key, currentKey, direction) {
    if (key !== currentKey) return 'none';
    return direction === 'asc' ? 'ascending' : 'descending';
  }

  function exportCsv() {
    const day = new Date().toISOString().slice(0, 10);
    saveFile({
      filename: `${texts.csvFilename}_${day}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      data: accountsCsv(visible, texts, lang),
    });
  }

  /** « il y a 3 j », ou « aujourd'hui » plutôt que « il y a 0 j ». */
  function sinceLabel(iso, t) {
    const days = daysSince(iso);
    return days ? fill(t.daysAgo, { days }) : t.today;
  }

  const initials = (row) =>
    accountName(row)
      .split(/[\s.@_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
</script>

<section class="ut-card" id="stats-usage-table">
  <header class="ut-head">
    <div>
      <h4>{texts.usersTitle}</h4>
      <p class="ut-hint">{texts.usersHint}</p>
    </div>
    <button type="button" class="ut-export" on:click={exportCsv} disabled={!visible.length}>
      <IconExport width="14" height="14" aria-hidden="true" />
      {texts.exportCsv}
    </button>
  </header>

  {#if accounts.length === 0}
    <p class="ut-empty">{texts.usersEmpty}</p>
  {:else}
    <div class="ut-tools">
      <label class="ut-search">
        <IconSearch width="15" height="15" aria-hidden="true" />
        <input
          type="search"
          placeholder={texts.usersSearch}
          aria-label={texts.usersSearch}
          bind:value={query}
        />
      </label>
      <div class="ut-chips" role="group" aria-label={texts.usersStatusFilter}>
        <button
          type="button"
          class="ut-chip"
          class:ut-chip-on={!status}
          aria-pressed={!status}
          on:click={() => (status = '')}
        >
          {texts.usersFilterAll}
          <span class="ut-chip-n">{formatCount(accounts.length, lang)}</span>
        </button>
        {#each ADOPTION_STATUSES as s (s)}
          <button
            type="button"
            class="ut-chip"
            class:ut-chip-on={status === s}
            aria-pressed={status === s}
            disabled={!counts[s] && status !== s}
            on:click={() => (status = status === s ? '' : s)}
          >
            <span class="ut-dot" style="background: {ADOPTION_COLORS[s]}"></span>
            {texts.adoptionStatuses[s]}
            <span class="ut-chip-n">{formatCount(counts[s], lang)}</span>
          </button>
        {/each}
      </div>
    </div>

    <p class="ut-count" aria-live="polite">
      {fill(texts.usersShown, {
        shown: formatCount(visible.length, lang),
        total: formatCount(accounts.length, lang),
      })}
    </p>

    {#if visible.length === 0}
      <p class="ut-empty">{texts.usersNoMatch}</p>
    {:else}
      <div class="ut-wrap">
        <table class="ut-table">
          <thead>
            <tr>
              {#each columns as column (column.key)}
                <th
                  scope="col"
                  class="ut-c-{column.key}"
                  class:ut-left={column.align === 'left'}
                  aria-sort={column.fixed ? null : ariaSort(column.key, sortKey, sortDir)}
                >
                  {#if column.fixed}
                    {column.label}
                  {:else}
                    <button type="button" class="ut-sort" on:click={() => sortBy(column.key)}>
                      {column.label}
                      {#if sortKey === column.key}
                        <span class="ut-sort-icon" aria-hidden="true">
                          {#if sortDir === 'asc'}<IconUp width="12" height="12" />{:else}<IconDown
                              width="12"
                              height="12"
                            />{/if}
                        </span>
                        <span class="ut-sr"
                          >{sortDir === 'asc' ? texts.sortedAsc : texts.sortedDesc}</span
                        >
                      {/if}
                    </button>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each visible as row (row.email)}
              {@const trend = trendOf(row, lang, texts)}
              {@const regular = regularityOf(row, texts)}
              <tr class:ut-off={row.disabled}>
                <th scope="row" class="ut-left">
                  <button
                    type="button"
                    class="ut-user"
                    title={fill(texts.focusAction, { name: accountName(row) })}
                    on:click={() => dispatch('focus', row.email)}
                  >
                    <span class="ut-avatar" aria-hidden="true">{initials(row)}</span>
                    <span class="ut-who">
                      <span class="ut-name">{accountName(row)}</span>
                      {#if row.name}<span class="ut-mail">{row.email}</span>{/if}
                      <!-- Carte étroite : les colonnes Statut et Dernière réunion
                           disparaissent, l'essentiel revient sous le nom. -->
                      <span class="ut-status ut-inline">
                        <span class="ut-dot" style="background: {ADOPTION_COLORS[row.status]}"
                        ></span>
                        {texts.statusLabels[row.status]}
                        {#if row.lastMeetingAt}
                          · {sinceLabel(row.lastMeetingAt, texts)}
                        {/if}
                      </span>
                    </span>
                  </button>
                  {#if row.disabled}<span class="ut-badge">{texts.disabledBadge}</span>{/if}
                </th>
                {#if showGroups}
                  <td class="ut-left ut-c-groups">
                    <span class="ut-groups">
                      {#each row.groups as group (group.id)}<GroupChip {group} />{/each}
                    </span>
                  </td>
                {/if}
                <td class="ut-left ut-c-status" title={regular.long}>
                  <span class="ut-status">
                    <span class="ut-dot" style="background: {ADOPTION_COLORS[row.status]}"></span>
                    {texts.statusLabels[row.status]}
                  </span>
                  <span class="ut-reg">
                    <span class="ut-reg-track" aria-hidden="true"
                      ><span
                        class="ut-reg-bar"
                        style="width: {row.weeks ? (row.activeWeeks / row.weeks) * 100 : 0}%"
                      ></span></span
                    >
                    {regular.short}
                  </span>
                </td>
                <td>
                  <span class="ut-num">{formatCount(row.meetings, lang)}</span>
                  {#if trend.text}
                    <span class="ut-trend ut-trend-{trend.delta.direction}" title={trend.title}
                      >{trend.text}</span
                    >
                  {/if}
                </td>
                <td>{row.durationSeconds ? formatDuration(row.durationSeconds, lang) : '—'}</td>
                <td class="ut-c-avgDurationSeconds">
                  {row.avgDurationSeconds ? formatDuration(row.avgDurationSeconds, lang) : '—'}
                </td>
                <td class="ut-c-summaries">{formatCount(row.summaries, lang)}</td>
                <td class="ut-c-lastMeetingAt">
                  {#if row.lastMeetingAt}
                    {formatDate(row.lastMeetingAt, lang)}
                    <span class="ut-since">{sinceLabel(row.lastMeetingAt, texts)}</span>
                  {:else}
                    <span class="ut-never">{texts.never}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</section>

<style>
  .ut-card {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1rem 1.1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    min-width: 0;
    scroll-margin-top: 1rem;
  }
  .ut-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .ut-head h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .ut-hint {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .ut-export {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .ut-export:hover:not(:disabled) {
    background: var(--surface-tint);
    color: var(--ink-soft);
  }
  .ut-export:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ut-empty {
    margin: 0;
    padding: 1.2rem 0;
    text-align: center;
    font-size: 0.84rem;
    color: var(--ink-faint);
  }

  /* ── Outils ── */
  .ut-tools {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .ut-search {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1 1 220px;
    max-width: 320px;
    padding: 0 0.65rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-faint);
  }
  .ut-search:focus-within {
    border-color: var(--brand-secondary-soft-18);
    box-shadow: 0 0 0 3px var(--brand-secondary-soft-08);
  }
  .ut-search input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.42rem 0;
    border: none;
    background: transparent;
    color: var(--ink);
    font-family: inherit;
    font-size: 0.83rem;
  }
  .ut-search input:focus {
    outline: none;
  }
  .ut-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .ut-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.76rem;
    cursor: pointer;
  }
  .ut-chip:hover:not(:disabled) {
    border-color: var(--line-strong);
    color: var(--ink-soft);
  }
  .ut-chip:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ut-chip-on {
    border-color: var(--brand-soft-18);
    background: var(--brand-soft-08);
    color: var(--ink);
    font-weight: 600;
  }
  .ut-chip-n {
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
  .ut-count {
    margin: -0.2rem 0 0;
    font-size: 0.74rem;
    color: var(--ink-faint);
  }

  /* ── Tableau ── */
  /* Hauteur bornée, en-tête collant : quarante comptes ne repoussent pas les
     dépenses et les graphiques trois écrans plus bas, et la colonne qu'on lit
     garde son nom en défilant. */
  .ut-wrap {
    max-height: 34rem;
    overflow: auto;
    margin: 0 -0.2rem;
  }
  .ut-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.83rem;
    font-variant-numeric: tabular-nums;
  }
  .ut-table th,
  .ut-table td {
    padding: 0.55rem 0.5rem;
    text-align: right;
    color: var(--ink-soft);
    white-space: nowrap;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }
  .ut-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface);
    box-shadow: inset 0 -1px 0 var(--line);
    padding-top: 0.2rem;
    vertical-align: bottom;
    /* « Comptes rendus » sur deux lignes plutôt qu'une colonne deux fois trop large. */
    white-space: normal;
    line-height: 1.25;
    font-weight: 600;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-faint);
  }
  .ut-table tbody tr:last-child th,
  .ut-table tbody tr:last-child td {
    border-bottom: none;
  }
  .ut-table tbody tr:hover {
    background: var(--surface-tint);
  }
  .ut-table .ut-left {
    text-align: left;
  }
  .ut-sort {
    display: inline-flex;
    align-items: flex-end;
    text-align: inherit;
    gap: 0.2rem;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }
  .ut-sort:hover {
    color: var(--ink-soft);
  }
  .ut-sort-icon {
    display: inline-flex;
    color: var(--brand-text);
  }
  .ut-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .ut-user {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    max-width: 260px;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .ut-avatar {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--brand-secondary-soft-12);
    color: var(--brand-text);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .ut-who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .ut-name {
    color: var(--ink);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ut-user:hover .ut-name {
    color: var(--brand-text);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .ut-mail {
    font-size: 0.74rem;
    color: var(--ink-faint);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ut-badge {
    display: inline-block;
    margin-left: 0.4rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--surface-tint);
    border: 1px solid var(--line);
    color: var(--ink-faint);
    font-size: 0.68rem;
    font-weight: 600;
    vertical-align: middle;
  }
  .ut-off .ut-name {
    color: var(--ink-muted);
  }
  .ut-groups {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    max-width: 220px;
    white-space: normal;
  }

  .ut-status {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--ink-soft);
  }
  .ut-inline {
    display: none;
    font-size: 0.72rem;
    margin-top: 0.1rem;
    white-space: nowrap;
  }
  .ut-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .ut-num {
    color: var(--ink);
    font-weight: 600;
  }
  .ut-trend {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ink-faint);
  }
  .ut-trend-up,
  .ut-trend-new {
    color: var(--success-text);
  }
  .ut-trend-down {
    color: var(--danger-text);
  }

  .ut-reg {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.2rem;
    font-size: 0.72rem;
    color: var(--ink-faint);
  }
  .ut-reg-track {
    width: 40px;
    height: 6px;
    border-radius: 3px;
    background: var(--viz-track);
    overflow: hidden;
  }
  .ut-reg-bar {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--viz-series-2);
  }

  .ut-since {
    display: block;
    font-size: 0.72rem;
    color: var(--ink-faint);
  }
  .ut-never {
    color: var(--danger-strong);
  }

  /* Carte étroite : les colonnes secondaires s'effacent, de la moins à la
     plus utile. Mesuré sur la carte, pas sur l'écran : à 1 280 px, la barre
     latérale et les marges du panneau lui laissent ~950 px. */
  @container (max-width: 980px) {
    .ut-c-avgDurationSeconds {
      display: none;
    }
  }
  @container (max-width: 820px) {
    .ut-c-summaries {
      display: none;
    }
  }
  @container (max-width: 700px) {
    .ut-c-groups {
      display: none;
    }
  }
  /* Téléphone : qui, combien, et le statut sous le nom. */
  @container (max-width: 560px) {
    .ut-c-status,
    .ut-c-lastMeetingAt,
    .ut-avatar {
      display: none;
    }
    .ut-inline {
      display: inline-flex;
    }
    .ut-user {
      max-width: 140px;
    }
    .ut-mail {
      display: none;
    }
    .ut-table th,
    .ut-table td {
      padding: 0.5rem 0.4rem;
    }
  }
  @media (max-width: 640px) {
    .ut-card {
      padding: 0.85rem 0.9rem 0.95rem;
    }
    .ut-head {
      flex-direction: column;
    }
    .ut-search {
      max-width: none;
    }
  }
</style>
