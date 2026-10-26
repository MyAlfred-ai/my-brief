<script>
  /**
   * Administration → Crédit de temps (admin/CreditsTab).
   *
   * Le crédit de temps du mois de chaque compte, dans l'ordre où l'on agit :
   * épuisés, puis ceux qui le seront avant le renouvellement, puis les autres,
   * enfin les comptes sans limite (ordre calculé par le serveur,
   * services/api/lib/teamCredits.js). Un anneau par compte, coloré comme la
   * jauge et le compteur (utils/creditTone.js), le reste écrit à côté.
   *
   * Un clic ouvre la page du compte (PersonalStats) : des volumes, jamais le
   * contenu de ses réunions. Le filtre de groupe et les compteurs du haut
   * portent sur la même liste — ils ne se contredisent jamais.
   */
  import { onMount } from 'svelte';
  import IconRefresh from '~icons/solar/refresh-linear';
  import UserAvatar from '../ui/UserAvatar.svelte';
  import GroupChip from '../ui/GroupChip.svelte';
  import { fetchTeamCredits } from '../../services/statsApi.js';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { creditTone } from '../../utils/creditTone.js';
  import { accountView } from '../../utils/userIdentity.js';
  import { formatMinutes, formatDay, monthLabel } from '../../utils/quotaFormat.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { formatCount, formatDuration } from '../admin/stats/format.js';

  /** Ouvre la page d'un compte : `{email, name}`. */
  export let onOpen = (_account) => {};

  const RING = 2 * Math.PI * 9;

  let data = null;
  let loading = true;
  let refreshing = false;
  let errorMessage = '';
  let group = 'all';

  $: texts = $uiText.myStats;
  $: qt = $uiText.quota;
  $: lang = $currentLanguageStore;

  onMount(load);

  async function load() {
    errorMessage = '';
    if (data) refreshing = true;
    else loading = true;
    const res = await fetchTeamCredits();
    loading = false;
    refreshing = false;
    if (!res.ok) {
      errorMessage = texts.errors[res.data?.error] || texts.errors.unknown;
      return;
    }
    data = res.data;
  }

  /** Pastille de rythme : `{tone, text}`. */
  function paceChip(account, language, t, tz) {
    const day = (value, timeZone) => formatDay(value, language, { timeZone, month: 'short' });
    if (account.unlimited) return { tone: 'mute', text: t.paceNone };
    if (account.exhausted) {
      return {
        tone: 'out',
        text: account.exhaustedOn
          ? fill(t.paceExhausted, { date: day(account.exhaustedOn) })
          : qt.blockedShort,
      };
    }
    if (account.pace?.alert) {
      return {
        tone: 'warn',
        text: fill(t.paceAlertShort, { date: day(account.pace.exhaustsAt, tz) }),
      };
    }
    if (!account.usedSeconds && !account.meetings) return { tone: 'mute', text: t.noMeeting };
    return { tone: 'ok', text: t.paceOk };
  }

  $: tz = data?.period?.timeZone || 'UTC';
  $: renewalMonth = monthLabel(data?.period?.end, lang, { timeZone: tz });
  $: groupsUsed = (data?.groups || []).filter((g) =>
    (data?.accounts || []).some((a) => a.groups.some((own) => own.id === g.id)),
  );
  $: accounts = (data?.accounts || []).filter(
    (a) => group === 'all' || a.groups.some((own) => own.id === group),
  );
  $: rows = accounts.map((account) => {
    const limit = (account.limitMinutes || 0) * 60;
    const remaining = account.unlimited ? 0 : (account.remainingMinutes || 0) * 60;
    const tone = account.unlimited ? null : creditTone(remaining, limit);
    return {
      account,
      who: account.name || account.email,
      initials: account.name
        ? accountView({ name: account.name }).initials
        : account.email[0]?.toUpperCase(),
      tone,
      dash: tone && tone !== 'out' ? (remaining / limit) * RING : 0,
      credit: account.unlimited
        ? fill(texts.unlimitedCell, { time: formatDuration(account.usedSeconds, lang) })
        : fill(texts.creditLine, {
            remaining: formatMinutes(account.remainingMinutes, qt),
            limit: formatMinutes(account.limitMinutes, qt),
          }),
      pace: paceChip(account, lang, texts, tz),
      last: account.lastMeetingAt
        ? formatDay(account.lastMeetingAt, lang, { timeZone: tz, month: 'short' })
        : texts.never,
    };
  });
  $: summary = {
    accounts: accounts.length,
    limited: accounts.filter((a) => !a.unlimited).length,
    exhausted: accounts.filter((a) => a.exhausted).length,
    atRisk: accounts.filter((a) => a.pace?.alert).length,
  };
</script>

<div class="tc-wrap" class:tc-refreshing={refreshing}>
  <p class="tc-intro">{texts.teamIntro}</p>

  {#if errorMessage}
    <div class="tc-error" role="alert">{errorMessage}</div>
  {/if}

  {#if loading}
    <div class="tc-skeleton" aria-hidden="true"></div>
  {:else if data}
    <div class="tc-toolbar">
      {#if groupsUsed.length > 1}
        <div class="tc-groups" role="group" aria-label={texts.groupFilter}>
          <button
            type="button"
            class="tc-chip"
            class:tc-chip-on={group === 'all'}
            aria-pressed={group === 'all'}
            on:click={() => (group = 'all')}>{texts.allGroups}</button
          >
          {#each groupsUsed as g (g.id)}
            <button
              type="button"
              class="tc-chip"
              class:tc-chip-on={group === g.id}
              aria-pressed={group === g.id}
              on:click={() => (group = g.id)}>{g.name}</button
            >
          {/each}
        </div>
      {:else}
        <span></span>
      {/if}
      <button type="button" class="tc-refresh" on:click={load} disabled={refreshing}>
        <IconRefresh width="14" height="14" aria-hidden="true" />
        {refreshing ? texts.refreshing : texts.refresh}
      </button>
    </div>

    <div class="tc-sums">
      <div class="tc-sum">
        <small>{texts.sumLimited}</small>
        <span
          >{fill(texts.sumLimitedValue, {
            limited: formatCount(summary.limited, lang),
            accounts: formatCount(summary.accounts, lang),
          })}</span
        >
      </div>
      <div class="tc-sum" class:tc-sum-out={summary.exhausted > 0}>
        <small>{texts.sumExhausted}</small>
        <span>{formatCount(summary.exhausted, lang)}</span>
      </div>
      <div class="tc-sum" class:tc-sum-warn={summary.atRisk > 0}>
        <small>{fill(texts.sumAtRisk, { month: renewalMonth })}</small>
        <span>{formatCount(summary.atRisk, lang)}</span>
      </div>
    </div>

    {#if rows.length === 0}
      <p class="tc-empty">{texts.teamEmpty}</p>
    {:else}
      <div class="tc-table-wrap">
        <table class="tc-table">
          <thead>
            <tr>
              <th scope="col">{texts.colAccount}</th>
              <th scope="col">{texts.colCredit}</th>
              <th scope="col">{texts.colPace}</th>
              <th scope="col" class="tc-num">{texts.colMeetings}</th>
              <th scope="col">{texts.colLast}</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.account.email)}
              <tr>
                <th scope="row">
                  <button
                    type="button"
                    class="tc-who"
                    title={fill(texts.openAccount, { name: row.who })}
                    on:click={() => onOpen({ email: row.account.email, name: row.account.name })}
                  >
                    <UserAvatar initials={row.initials} size={28} />
                    <span class="tc-name">
                      <span class="tc-label">{row.who}</span>
                      <span class="tc-chips">
                        {#each row.account.groups as g (g.id)}<GroupChip group={g} />{/each}
                      </span>
                    </span>
                  </button>
                </th>
                <td>
                  <span class="tc-credit">
                    {#if row.tone}
                      <svg
                        class="tc-ring tc-ring-{row.tone}"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle class="tc-ring-track" cx="12" cy="12" r="9" />
                        <circle
                          class="tc-ring-fill"
                          cx="12"
                          cy="12"
                          r="9"
                          stroke-dasharray="{row.dash} {RING}"
                        />
                      </svg>
                    {:else}
                      <span class="tc-infinity" aria-hidden="true">∞</span>
                    {/if}
                    <span>{row.credit}</span>
                  </span>
                </td>
                <td><span class="tc-pill tc-pill-{row.pace.tone}">{row.pace.text}</span></td>
                <td class="tc-num">{formatCount(row.account.meetings, lang)}</td>
                <td>{row.last}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<style>
  .tc-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    transition: opacity 0.15s;
  }
  .tc-refreshing {
    opacity: 0.55;
  }
  .tc-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .tc-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
  }
  .tc-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .tc-groups {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .tc-chip {
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .tc-chip:hover {
    color: var(--ink);
  }
  .tc-chip-on {
    background: var(--brand-secondary-soft-12);
    border-color: var(--brand-secondary-soft-18);
    color: var(--ink);
    font-weight: 500;
  }
  .tc-refresh {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .tc-refresh:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .tc-sums {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: 0.75rem;
  }
  .tc-sum {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }
  .tc-sum small {
    font-size: 0.74rem;
    color: var(--ink-faint);
  }
  .tc-sum span {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .tc-sum-out span {
    color: var(--credit-out);
  }
  .tc-sum-warn span {
    color: var(--warn-text);
  }
  .tc-empty {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-muted);
  }
  .tc-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }
  .tc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  .tc-table th,
  .tc-table td {
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--line);
    text-align: left;
    white-space: nowrap;
    vertical-align: middle;
  }
  .tc-table tbody tr:last-child th,
  .tc-table tbody tr:last-child td {
    border-bottom: none;
  }
  .tc-table thead th {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--ink-faint);
  }
  .tc-table tbody th {
    font-weight: 400;
    padding: 0.3rem 0.4rem;
  }
  .tc-num {
    text-align: right !important;
    font-variant-numeric: tabular-nums;
  }
  .tc-who {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 0.25rem 0.35rem;
    border: none;
    border-radius: 8px;
    background: transparent;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .tc-who:hover,
  .tc-who:focus-visible {
    background: var(--surface-tint);
  }
  .tc-name {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .tc-label {
    font-size: 0.84rem;
    font-weight: 500;
    color: var(--ink);
  }
  .tc-who:hover .tc-label {
    color: var(--brand-text);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .tc-chips {
    display: flex;
    gap: 0.25rem;
  }
  .tc-credit {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-variant-numeric: tabular-nums;
  }
  .tc-ring {
    width: 24px;
    height: 24px;
    transform: rotate(-90deg);
    flex: 0 0 auto;
  }
  .tc-ring-track {
    fill: none;
    stroke: color-mix(in srgb, var(--ink) 9%, transparent);
    stroke-width: 3.4;
  }
  .tc-ring-fill {
    fill: none;
    stroke-width: 3.4;
    stroke-linecap: round;
  }
  .tc-ring-high .tc-ring-fill {
    stroke: var(--credit-high);
  }
  .tc-ring-mid .tc-ring-fill {
    stroke: var(--credit-mid);
  }
  .tc-ring-low .tc-ring-fill {
    stroke: var(--credit-low);
  }
  .tc-ring-out .tc-ring-track {
    stroke: color-mix(in srgb, var(--credit-out) 45%, transparent);
  }
  .tc-infinity {
    width: 24px;
    text-align: center;
    font-size: 1.05rem;
    color: var(--ink-faint);
  }
  .tc-pill {
    display: inline-block;
    padding: 0.1rem 0.55rem;
    border: 1px solid;
    border-radius: 999px;
    font-size: 0.72rem;
  }
  .tc-pill-out {
    color: var(--danger-text);
    background: var(--danger-bg);
    border-color: var(--danger-line);
  }
  .tc-pill-warn {
    color: var(--warn-text);
    background: var(--warn-bg);
    border-color: var(--warn-line);
  }
  .tc-pill-ok {
    color: var(--success-text);
    background: var(--success-bg);
    border-color: var(--success-line);
  }
  .tc-pill-mute {
    color: var(--ink-faint);
    background: var(--surface);
    border-color: var(--line-strong);
  }
  .tc-skeleton {
    height: 260px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--brand-secondary) 3.5%, #f6f6f6);
  }
</style>
