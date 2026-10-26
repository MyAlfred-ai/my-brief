<script context="module">
  /**
   * Dernière réponse, par compte : rouvrir le menu affiche aussitôt les
   * chiffres connus pendant que la relecture part. Clé = l'adresse : après une
   * déconnexion sans rechargement (mode mot de passe), le compte suivant ne
   * voit jamais ceux du précédent.
   */
  let cache = { email: '', stats: null };
</script>

<script>
  /**
   * « Ce mois-ci » — le bloc du menu de compte qui résume « Mes
   * statistiques » : le crédit de temps du mois (reste, barre, rythme
   * régulier), puis trois chiffres (réunions, temps enregistré, comptes
   * rendus), et le lien vers la page complète.
   *
   * Pourquoi dans le menu : les statistiques avaient trois portes (la carte
   * « Temps de réunion », une icône muette à côté de la roue crantée, une ligne
   * du menu de compte) et aucune ne montrait rien avant d'ouvrir une page
   * plein écran. Le menu de compte est l'endroit où l'on vient voir « où j'en
   * suis » : il le dit, et ne renvoie à la page que pour le détail.
   *
   * Deux sources, chacune pour ce qu'elle sait :
   * - le crédit vient de `quotaNow` (stores/quota.js), déjà là et vivant — la
   *   réunion en cours s'en déduit — : la barre s'affiche sans attendre ;
   * - le rythme, les chiffres et le temps d'un compte sans quota viennent de
   *   /stats/me (le même appel que la page), relu à chaque ouverture. En
   *   échec, ils manquent, sans message : le menu n'est pas l'endroit d'une
   *   erreur, la page la dira.
   *
   * La barre se remplit de ce qui RESTE, comme l'anneau de l'avatar et la
   * jauge de la page. Le repère est le rythme régulier : la barre qui le
   * dépasse dit « en avance ».
   *
   * Réactivité : toutes les dérivations nomment leurs dépendances (cf.
   * CLAUDE.md, « Réactivité Svelte »).
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import IconArrow from '~icons/solar/arrow-right-linear';
  import { fetchMyStats } from '../../services/statsApi.js';
  import { auth } from '../../stores/auth.js';
  import { quota, quotaNow } from '../../stores/quota.js';
  import { liveElapsedStore } from '../../stores/recording.js';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { formatCount, formatDuration } from '../admin/stats/format.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { formatMinutes, formatDay, monthLabel, periodMonths } from '../../utils/quotaFormat.js';

  /** Ouvre « Mes statistiques ». */
  export let onOpen = () => {};

  const emailNow = () => get(auth).user?.email || '';

  let stats = cache.email && cache.email === emailNow() ? cache.stats : null;
  let loading = true;

  onMount(async () => {
    const owner = emailNow();
    const res = await fetchMyStats('month');
    loading = false;
    // Compte changé pendant l'appel : la réponse n'est plus la sienne.
    if (!res.ok || !owner || owner !== emailNow()) return;
    stats = res.data;
    cache = { email: owner, stats };
  });

  $: lang = $currentLanguageStore;
  $: t = $uiText.account;
  $: ms = $uiText.myStats;
  $: qt = $uiText.quota;

  $: credit = stats?.credit || null;
  $: period = $quota.period || credit?.period || null;
  $: tz = period?.timeZone || 'UTC';
  $: month = monthLabel(period?.start, lang, { timeZone: tz });
  $: renewalMonth = periodMonths(period, lang).renewal;

  $: limited = $quotaNow.limited;
  $: exhausted = limited && $quotaNow.tone === 'out';
  $: limitLabel = limited ? formatMinutes($quota.limitMinutes, qt) : '';
  $: big = exhausted ? ms.exhaustedBig : formatMinutes($quotaNow.remainingMinutes, qt);
  $: sub = exhausted
    ? fill(qt.renewal, { month: renewalMonth })
    : fill(ms.remainingOf, { limit: limitLabel });

  $: pace = limited && !exhausted && credit?.pace ? credit.pace : null;
  $: paceRatio =
    pace && $quotaNow.limitSeconds > 0
      ? Math.min(1, Math.max(0, pace.expectedRemainingSeconds / $quotaNow.limitSeconds))
      : null;
  $: paceLine = pace
    ? fill(ms.legendPace, {
        value: formatMinutes(Math.floor(pace.expectedRemainingSeconds / 60), qt),
      })
    : '';
  $: paceAlert = pace?.alert
    ? fill(ms.paceAlert, { date: formatDay(pace.exhaustsAt, lang, { timeZone: tz }) })
    : '';

  // Sans quota, le temps du mois n'est connu que de la relecture.
  $: unlimitedKnown = !limited && ($quota.loaded || !!credit);
  $: unlimitedLine =
    !limited && credit
      ? fill(ms.unlimitedLine, {
          time: formatDuration((credit.monthSeconds || 0) + ($liveElapsedStore || 0), lang),
          month,
        })
      : '';

  $: totals = stats?.totals || null;
  $: kpis = [
    {
      key: 'meetings',
      label: t.monthMeetings,
      value: totals && formatCount(totals.meetings, lang),
    },
    {
      key: 'recorded',
      label: t.monthRecorded,
      value:
        totals && (totals.durationSeconds ? formatDuration(totals.durationSeconds, lang) : '—'),
    },
    {
      key: 'summaries',
      label: t.monthSummaries,
      value: totals && formatCount(totals.summaries, lang),
    },
  ];
</script>

<section class="amo amo-{limited ? $quotaNow.tone : 'none'}" aria-label={t.thisMonth}>
  <div class="amo-head">
    <span class="amo-title">{t.thisMonth}</span>
    {#if month}<span class="amo-month">{month}</span>{/if}
  </div>

  {#if limited}
    <p class="amo-big"><strong class="amo-value">{big}</strong> <span>{sub}</span></p>
    <div
      class="amo-bar"
      role="progressbar"
      aria-label={qt.title}
      aria-valuemin="0"
      aria-valuemax={$quota.limitMinutes}
      aria-valuenow={$quotaNow.remainingMinutes}
      aria-valuetext="{big} {sub}"
    >
      <span class="amo-fill" style="width: {$quotaNow.remainingRatio * 100}%"></span>
      {#if paceRatio !== null}
        <span class="amo-pace" style="left: {paceRatio * 100}%"></span>
      {/if}
    </div>
    {#if paceLine}
      <span class="amo-legend"><i class="amo-tick" aria-hidden="true"></i>{paceLine}</span>
    {/if}
    {#if paceAlert}
      <p class="amo-alert">{paceAlert}</p>
    {/if}
  {:else if unlimitedKnown}
    <p class="amo-big amo-unlimited">
      <strong class="amo-value">{ms.unlimitedTitle}</strong>
      {#if unlimitedLine}<span>{unlimitedLine}</span>{/if}
    </p>
  {/if}

  {#if totals || loading}
    <dl class="amo-kpis" aria-busy={!totals}>
      {#each kpis as kpi (kpi.key)}
        <div class="amo-kpi">
          <dt>{kpi.label}</dt>
          <dd>{kpi.value || '—'}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  <button type="button" class="amo-open" role="menuitem" on:click={onOpen}>
    {t.seeStats}
    <IconArrow width="14" height="14" aria-hidden="true" />
  </button>
</section>

<style>
  .amo {
    --amo-accent: var(--credit-high);
    display: flex;
    flex-direction: column;
    margin: 2px 2px 6px;
    padding: 11px 12px 6px;
    border-radius: 12px;
    background: var(--mb-bg-warm-light);
    border: 1px solid var(--mb-border-badge);
    font-family: 'Lexend', sans-serif;
  }
  .amo-mid {
    --amo-accent: var(--credit-mid);
  }
  .amo-low {
    --amo-accent: var(--credit-low);
  }
  .amo-out {
    --amo-accent: var(--credit-out);
  }

  .amo-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .amo-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .amo-month {
    font-size: 11px;
    color: var(--mb-text-tertiary);
  }

  .amo-big {
    margin: 6px 0 0;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    column-gap: 6px;
    font-size: 12px;
    color: var(--mb-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .amo-value {
    font-size: 19px;
    font-weight: 600;
    color: var(--ink);
  }
  .amo-out .amo-value {
    color: var(--danger-strong);
  }
  .amo-unlimited {
    flex-direction: column;
    gap: 1px;
  }
  .amo-unlimited .amo-value {
    font-size: 15px;
  }

  .amo-bar {
    position: relative;
    height: 7px;
    margin: 8px 0 6px;
    border-radius: 999px;
    background: var(--viz-track);
  }
  .amo-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 999px;
    background: var(--amo-accent);
    transition: width 0.6s cubic-bezier(0.33, 1, 0.68, 1);
  }
  .amo-pace,
  .amo-tick {
    width: 2px;
    border-radius: 1px;
    background: var(--ink-soft);
  }
  .amo-pace {
    position: absolute;
    top: -3px;
    height: 13px;
    transform: translateX(-1px);
  }
  .amo-legend {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--mb-text-secondary);
  }
  .amo-tick {
    display: inline-block;
    height: 10px;
  }
  .amo-alert {
    margin: 6px 0 0;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 11.5px;
    line-height: 1.4;
  }

  .amo-kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin: 10px 0 0;
  }
  .amo-kpi {
    display: flex;
    flex-direction: column-reverse;
    gap: 1px;
    min-width: 0;
    padding: 6px 8px;
    border-radius: 9px;
    background: var(--mb-bg-surface);
    border: 1px solid var(--mb-border-subtle);
  }
  /* Le libellé passe à la ligne plutôt que de se couper : « Comptes rendus »
     ne tient pas sur une ligne dans un tiers de menu. */
  .amo-kpi dt {
    font-size: 10.5px;
    line-height: 1.25;
    color: var(--mb-text-tertiary);
  }
  .amo-kpi dd {
    margin: 0;
    font-size: 14.5px;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .amo-kpis[aria-busy='true'] dd {
    color: var(--mb-text-placeholder);
  }

  .amo-open {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: calc(100% + 12px);
    margin: 6px -6px 0;
    padding: 7px 6px;
    border: none;
    border-radius: 8px;
    background: transparent;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--brand-text);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }
  .amo-open:hover {
    background: var(--mb-orange-10);
  }
  .amo-open:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .amo-fill {
      transition: none;
    }
  }
</style>
