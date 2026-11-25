<script>
  /**
   * « Tableau de bord » — la page d'accueil de l'administration : ce qui
   * reste à régler dans l'organisation, et la page où le corriger ; puis
   * l'activité récente de l'installation, en trois chiffres.
   *
   * Pourquoi cette page : les pastilles disent « il y a quelque chose ici »,
   * rubrique par rubrique ; il fallait les ouvrir une à une pour savoir quoi.
   * Le tableau de bord les réunit en phrases, la plus grave d'abord, chacune
   * avec le chemin de sa page (« Modèles IA › Clés API ») — le patron des
   * « points à régler » de MIA. C'est aussi ce qui donne un accueil à
   * l'administration : avant lui, elle s'ouvrait sur une page de réglage prise
   * au hasard de l'ordre de la colonne.
   *
   * Les constats viennent du store (stores/configChecks.js), déjà relu par la
   * Sidebar à l'ouverture du panneau : rien à charger ici, et ce que la page
   * affiche ne peut pas contredire les pastilles. Un constat dont la section
   * n'a pas de page (serveur plus récent que l'écran) reste listé, sans lien.
   *
   * L'activité est une lecture, pas un réglage : les 30 derniers jours, la
   * période par défaut de « Consommation », qui garde le détail. En échec, la
   * carte le dit en une phrase — les points à régler, eux, restent lisibles.
   */
  import { onMount } from 'svelte';
  import IconArrow from '~icons/solar/arrow-right-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import { formatCount, formatDuration } from './stats/format.js';
  import { fetchUsageStats } from '../../services/adminUsersApi.js';
  import { configChecks } from '../../stores/configChecks.js';
  import { selectPanelSection } from '../../stores/panels.js';
  import { currentLanguageStore, uiText } from '../../store.js';
  import { ALERT_LEVELS, alertText } from '../../utils/configAlerts.js';
  import { fill } from '../../utils/i18nFormat.js';

  /**
   * Les pages de l'administration, telles que la colonne les liste :
   * `{ id, label, group }` — de quoi écrire « Rubrique › Page » et y mener.
   * @type {{id: string, label: string, group?: string}[]}
   */
  export let pages = [];

  const ACTIVITY_DAYS = 30;

  let totals = null;
  let activityState = 'loading'; // 'loading' | 'ready' | 'error'

  $: t = $uiText.adminDashboard;
  $: lang = $currentLanguageStore;
  $: pageById = Object.fromEntries(pages.map((page) => [page.id, page]));
  const rank = (level) => {
    const index = ALERT_LEVELS.indexOf(level);
    return index === -1 ? ALERT_LEVELS.length : index;
  };
  // Du plus grave au plus léger ; chaque ligne nomme sa page quand elle existe.
  $: issues = [...$configChecks.organization]
    .sort((a, b) => rank(a.level) - rank(b.level))
    .map((issue, index) => {
      const page = pageById[issue.section] || null;
      return {
        key: `${issue.section}:${issue.code}:${index}`,
        level: ALERT_LEVELS.includes(issue.level) ? issue.level : 'tip',
        text: alertText(issue, $uiText.configChecks),
        page,
        path: page ? [page.group, page.label].filter(Boolean).join(' › ') : '',
      };
    });
  $: figures = totals
    ? [
        { id: 'meetings', label: t.meetings, value: formatCount(totals.meetingsInRange, lang) },
        { id: 'recorded', label: t.recorded, value: formatDuration(totals.durationSeconds, lang) },
        {
          id: 'accounts',
          label: t.activeAccounts,
          value: fill(t.activeOf, {
            active: formatCount(totals.activeAccounts, lang),
            total: formatCount(totals.enabledUsers, lang),
          }),
        },
      ]
    : [];

  onMount(async () => {
    const res = await fetchUsageStats({ days: ACTIVITY_DAYS });
    if (res.ok && res.data?.totals) {
      totals = res.data.totals;
      activityState = 'ready';
    } else {
      activityState = 'error';
    }
  });
</script>

<div class="db">
  <p class="db-intro">{t.intro}</p>

  <section class="db-card" aria-labelledby="db-issues-title">
    <h3 id="db-issues-title" class="db-title">{t.issuesTitle}</h3>
    {#if !$configChecks.loaded}
      <div class="db-skeleton" aria-hidden="true"></div>
    {:else if !issues.length}
      <p class="db-empty">
        <IconCheck width="16" height="16" aria-hidden="true" />
        {t.issuesEmpty}
      </p>
    {:else}
      <ul class="db-issues">
        {#each issues as issue (issue.key)}
          <li class="db-issue">
            <span class="db-dot db-dot-{issue.level}" aria-hidden="true"></span>
            <div class="db-issue-body">
              <!-- La couleur n'est jamais seule à dire la gravité. -->
              <span class="db-level db-level-{issue.level}">{t.levels[issue.level]}</span>
              <p class="db-issue-text">{issue.text}</p>
              {#if issue.page}
                <button
                  type="button"
                  class="db-link"
                  on:click={() => selectPanelSection(issue.page.id)}
                >
                  {issue.path}
                  <IconArrow width="13" height="13" aria-hidden="true" />
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="db-card" aria-labelledby="db-activity-title">
    <div class="db-card-head">
      <h3 id="db-activity-title" class="db-title">{t.activityTitle}</h3>
      <button type="button" class="db-link" on:click={() => selectPanelSection('stats')}>
        {t.activityLink}
        <IconArrow width="13" height="13" aria-hidden="true" />
      </button>
    </div>
    {#if activityState === 'loading'}
      <div class="db-skeleton" aria-hidden="true"></div>
    {:else if activityState === 'error'}
      <p class="db-note">{t.activityError}</p>
    {:else}
      <dl class="db-figures">
        {#each figures as figure (figure.id)}
          <div class="db-figure">
            <dt>{figure.label}</dt>
            <dd>{figure.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}
  </section>
</div>

<style>
  .db {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .db-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .db-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-tint);
  }
  .db-card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px 12px;
  }
  .db-title {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 600;
    color: var(--ink);
  }

  .db-issues {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .db-issue {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 0;
    border-top: 1px solid var(--line);
  }
  .db-issue:last-child {
    padding-bottom: 2px;
  }
  .db-dot {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    margin-top: 5px;
    border-radius: 50%;
  }
  .db-dot-error {
    background: var(--alert-error);
  }
  .db-dot-warning {
    background: var(--alert-warning);
  }
  .db-dot-tip {
    background: var(--alert-tip);
  }
  .db-issue-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }
  .db-level {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-muted);
  }
  .db-level-error {
    color: var(--danger-text);
  }
  .db-level-warning {
    color: var(--warn-text);
  }
  .db-issue-text {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--ink);
  }
  .db-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--brand-text);
    cursor: pointer;
  }
  .db-link:hover {
    color: var(--brand-text-strong);
    text-decoration: underline;
  }

  .db-empty,
  .db-note {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--ink-soft);
  }
  .db-empty {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--success-text);
  }

  .db-figures {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr));
    gap: 10px;
  }
  .db-figure {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
  }
  .db-figure dt {
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .db-figure dd {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .db-skeleton {
    height: 56px;
    border-radius: 8px;
    background: var(--viz-track);
  }

  /* Au doigt, le lien reprend une cible de 44 px. */
  @media (pointer: coarse) {
    .db-link {
      min-height: 44px;
    }
  }
</style>
