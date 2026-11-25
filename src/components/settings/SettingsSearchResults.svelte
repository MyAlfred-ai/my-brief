<script>
  /**
   * Résultats de la recherche dans les réglages, à la place des sections de
   * la colonne (ou du déroulant mobile) tant que le champ n'est pas vide.
   *
   * Une ligne par réglage : son titre, tel qu'à l'écran, et le chemin pour y
   * aller (« Mon compte › Audio »). Un réglage de l'AUTRE panneau — un
   * administrateur qui cherche « logo » depuis « Réglages » — porte le nom
   * de ce panneau en tête de chemin et son icône.
   *
   * Le focus reste dans le champ (SettingsSearchField) : la souris choisit une
   * ligne sans le lui prendre (`mousedown` neutralisé), le clavier la désigne
   * par `aria-activedescendant`.
   */
  import IconExternal from '~icons/solar/square-arrow-right-up-linear';
  import IconSettings from '~icons/solar/tuning-4-linear';
  import IconAdmin from '~icons/solar/shield-user-linear';
  import IconAiHelp from '../icons/AiHelpIcon.svelte';
  import { uiText } from '../../store.js';
  import { panelNav } from '../../stores/panels.js';
  import {
    settingsQuery,
    settingsActive,
    settingsResults,
    goToSetting,
  } from '../../stores/settingsSearch.js';
  import { fill } from '../../utils/i18nFormat.js';

  export let idPrefix = 'ss';
  export let onPicked = (_result) => {};

  const PANEL_ICONS = { config: IconSettings, admin: IconAdmin };

  $: texts = $uiText.settingsSearch;
  $: newTab = $uiText.ariaLabels.newTab;
  // Les icônes des pages du panneau ouvert sont celles de sa colonne.
  $: icons = new Map($panelNav.items.map((item) => [item.id, item.icon]));
  // Un réglage de l'Aide IA porte SON orbe, dans sa teinte, plutôt que l'icône
  // de la page qui l'héberge : l'écran est sous deux pages (« Préférences IA »
  // et « Pendant la réunion »), c'est à l'orbe qu'on le reconnaît.
  const isAiHelp = (result) => result.panel === 'config' && result.sub === 'aiHelp';
  $: rows = $settingsResults.map((result) => ({
    ...result,
    ai: isAiHelp(result),
    icon: isAiHelp(result)
      ? IconAiHelp
      : (!result.elsewhere && icons.get(result.section)) || PANEL_ICONS[result.panel],
    trailText: result.trail.join(' › '),
  }));
  $: active = Math.min($settingsActive, Math.max(rows.length - 1, 0));
  $: status = !rows.length
    ? fill(texts.empty, { query: $settingsQuery.trim() })
    : rows.length === 1
      ? texts.countOne
      : fill(texts.countMany, { n: rows.length });

  function pick(result) {
    goToSetting(result);
    onPicked(result);
  }

  /** Un LIEN s'ouvre par le navigateur (clic du milieu compris) : on referme
   *  seulement la recherche derrière lui. */
  function followLink(result) {
    settingsQuery.set('');
    onPicked(result);
  }
</script>

<div class="ssr">
  <p class="ssr-status" class:ssr-sr={rows.length > 0} role="status">{status}</p>
  {#if rows.length}
    <ul id="{idPrefix}-list" class="ssr-list" role="listbox" aria-label={texts.results}>
      {#each rows as row, i (row.key)}
        <li
          id="{idPrefix}-opt-{i}"
          class="ssr-item"
          class:ssr-item-active={i === active}
          role="option"
          aria-selected={i === active}
          tabindex="-1"
          on:mousedown|preventDefault
          on:mouseenter={() => settingsActive.set(i)}
          on:click={() => !row.href && pick(row)}
          on:keydown={(event) => event.key === 'Enter' && !row.href && pick(row)}
        >
          {#if row.href}
            <a
              class="ssr-link"
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              tabindex="-1"
              aria-label="{row.title} ({newTab})"
              on:click={() => followLink(row)}
            >
              <span class="ssr-icon" aria-hidden="true">
                <svelte:component this={row.icon} width="16" height="16" />
              </span>
              <span class="ssr-text">
                <span class="ssr-title">{row.title}</span>
                {#if row.trailText}<span class="ssr-trail">{row.trailText}</span>{/if}
              </span>
              <span class="ssr-ext" aria-hidden="true"><IconExternal width="13" height="13" /></span
              >
            </a>
          {:else}
            <span
              class="ssr-icon"
              class:ssr-icon-elsewhere={row.elsewhere && !row.ai}
              class:ssr-icon-ai={row.ai}
              aria-hidden="true"
            >
              <svelte:component this={row.icon} width="16" height="16" />
            </span>
            <span class="ssr-text">
              <span class="ssr-title">{row.title}</span>
              {#if row.trailText}<span class="ssr-trail">{row.trailText}</span>{/if}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="ssr-hint">{texts.emptyHint}</p>
  {/if}
</div>

<style>
  .ssr {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  /* Le nombre de résultats n'est utile qu'aux lecteurs d'écran ; la phrase
     « Aucun réglage… » est, elle, pour tout le monde. */
  .ssr-status {
    margin: 0;
    padding: 6px 10px 2px;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--ink-soft);
  }
  .ssr-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .ssr-hint {
    margin: 0;
    padding: 0 10px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--ink-faint);
  }
  .ssr-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .ssr-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 7px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--ink);
    cursor: pointer;
  }
  .ssr-item-active {
    background: var(--mb-bg-tabs);
    border-color: var(--mb-border-card);
  }
  .ssr-link {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex: 1;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .ssr-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    color: var(--mb-orange);
  }
  /* Une page de l'autre panneau : l'icône du panneau, en retrait. */
  .ssr-icon-elsewhere {
    color: var(--ink-muted);
  }
  .ssr-icon-ai {
    color: var(--ai);
  }
  .ssr-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .ssr-title {
    font-size: 13.5px;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .ssr-trail {
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--mb-text-secondary);
    overflow-wrap: anywhere;
  }
  .ssr-ext {
    display: inline-flex;
    margin-left: auto;
    margin-top: 2px;
    color: var(--ink-muted);
  }
  @media (pointer: coarse) {
    .ssr-item {
      min-height: 44px;
      align-items: center;
    }
  }
</style>
