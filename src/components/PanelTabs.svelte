<script>
  /**
   * Sélecteur de section des panneaux (Administration, Réglages) —
   * MOBILE uniquement (≤768px, le breakpoint où la sidebar devient un drawer
   * et le panneau passe plein écran).
   *
   * Sur desktop, les sections s'affichent dans la sidebar à la place de
   * l'historique (voir Sidebar.svelte + stores/panels.js) : les pastilles qui
   * vivaient ici ont disparu avec cette refonte. Reste le menu déroulant —
   * un seul bouton (section active + chevron) qui ouvre la liste complète,
   * parce qu'une rangée de pastilles débordait d'un téléphone avec une barre
   * de défilement masquée (Connexion et IA étaient introuvables).
   *
   * Pastilles de configuration (`alert` d'une entrée, cf. stores/configChecks.js) :
   * sur le bouton, la plus grave de toutes — c'est lui qu'il faut déplier pour
   * trouver la section — puis sur chaque entrée, avec sa phrase ÉCRITE dessous :
   * un téléphone n'a pas de survol pour ouvrir une bulle.
   *
   * En tête de la liste, la recherche dans les réglages : taper « micro »
   * remplace les sections par les réglages qui répondent, et en ouvre un.
   */
  import IconChevron from '~icons/solar/alt-arrow-down-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconExternal from '~icons/solar/square-arrow-right-up-linear';
  import ConfigAlertDot from './ui/ConfigAlertDot.svelte';
  import SettingsSearchField from './settings/SettingsSearchField.svelte';
  import SettingsSearchResults from './settings/SettingsSearchResults.svelte';
  import { settingsQuery } from '../stores/settingsSearch.js';
  import { mergeAlerts } from '../utils/configAlerts.js';

  /** @type {{ id: string, label: string, icon: any, group?: string, href?: string,
   *   action?: string, danger?: boolean,
   *   alert?: {level: string, items: {level: string, text: string}[]}|null }[]} */
  export let tabs = [];
  export let active = '';
  export let onSelect = () => {};
  export let ariaLabel = '';
  // Suffixe du nom accessible des entrées LIEN : « Aide (nouvel onglet) ».
  export let newTabLabel = '';
  /** Entrée GESTE (« Se déconnecter ») : son identifiant remonte au parent. */
  export let onAction = (_id) => {};

  let open = false;

  // Une entrée LIEN (`href`, « Aide ») quitte l'app dans un nouvel onglet, une
  // entrée GESTE (`action`, « Se déconnecter ») remonte son identifiant : elles
  // ferment la liste et ne sont jamais la section affichée sur le bouton.
  $: sections = tabs.filter((t) => !t.href && !t.action);
  $: links = tabs.filter((t) => t.href || t.action);
  $: current = sections.find((t) => t.id === active) || sections[0];
  // Toutes les lignes de toutes les pastilles, pour celle du bouton.
  $: menuAlert = mergeAlerts(sections.map((t) => t.alert));

  function pick(id) {
    open = false;
    if (id !== active) onSelect(id);
  }

  /** Un résultat de recherche ouvert : la liste se referme sur la page. */
  function close() {
    open = false;
  }
</script>

<svelte:window on:click={() => (open = false)} />

<div class="pt">
  <div class="pt-dd" on:click|stopPropagation role="none">
    <button
      class="pt-dd-btn"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={ariaLabel}
      on:click={() => (open = !open)}
    >
      {#if current}
        <svelte:component this={current.icon} width="16" height="16" aria-hidden="true" />
        <span class="pt-dd-label">{current.label}</span>
      {/if}
      {#if menuAlert}
        <ConfigAlertDot level={menuAlert.level} items={menuAlert.items} />
      {/if}
      <span class="pt-dd-chevron" class:pt-dd-chevron-open={open} aria-hidden="true">
        <IconChevron width="16" height="16" />
      </span>
    </button>

    {#if open}
      <div class="pt-dd-menu">
        <!-- Chercher un réglage plutôt que parcourir la liste : même recherche
             que la colonne de l'ordinateur (stores/settingsSearch.js). Pas de
             focus d'office : le clavier du téléphone cacherait la liste. -->
        <div class="pt-dd-search">
          <SettingsSearchField idPrefix="pt-settings-search" variant="menu" onPicked={close} />
        </div>
        {#if $settingsQuery.trim()}
          <SettingsSearchResults idPrefix="pt-settings-search" onPicked={close} />
        {:else}
          <div class="pt-dd-items" role="menu" aria-label={ariaLabel}>
            {#each sections as tab, i (tab.id)}
              <!-- Intertitre à chaque changement de groupe, comme dans la colonne
               de l'ordinateur : douze entrées à plat ne se lisent pas. -->
              {#if tab.group && tab.group !== sections[i - 1]?.group}
                <div class="pt-dd-group" role="presentation">{tab.group}</div>
              {:else if !tab.group && sections[i - 1]?.group}
                <!-- Une section sans groupe (« Outils ») ouvre le pied de liste :
                     un filet la détache du groupe qui précède, les liens la suivent. -->
                <div class="pt-dd-rule" role="presentation"></div>
              {/if}
              <button
                class="pt-dd-item"
                class:pt-dd-item-active={active === tab.id}
                class:pt-dd-item-alert={!!tab.alert}
                role="menuitemradio"
                aria-checked={active === tab.id}
                on:click={() => pick(tab.id)}
              >
                <svelte:component this={tab.icon} width="16" height="16" aria-hidden="true" />
                <span class="pt-dd-text">
                  <span>{tab.label}</span>
                  {#if tab.alert}
                    <!-- Déjà en description (la pastille) : pas lue deux fois. -->
                    <span class="pt-dd-alert-text" aria-hidden="true"
                      >{tab.alert.items[0].text}</span
                    >
                  {/if}
                </span>
                {#if tab.alert}
                  <ConfigAlertDot level={tab.alert.level} items={tab.alert.items} />
                {/if}
                {#if active === tab.id}
                  <span class="pt-dd-check" aria-hidden="true">
                    <IconCheck width="16" height="16" />
                  </span>
                {/if}
              </button>
            {/each}
            {#each links as link (link.id)}
              {#if link.href}
                <a
                  class="pt-dd-item pt-dd-link"
                  role="menuitem"
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={newTabLabel ? `${link.label} (${newTabLabel})` : undefined}
                  on:click={() => (open = false)}
                >
                  <svelte:component this={link.icon} width="16" height="16" aria-hidden="true" />
                  <span>{link.label}</span>
                  <span class="pt-dd-ext" aria-hidden="true">
                    <IconExternal width="14" height="14" />
                  </span>
                </a>
              {:else}
                <button
                  class="pt-dd-item"
                  class:pt-dd-danger={link.danger}
                  role="menuitem"
                  on:click={() => {
                    open = false;
                    onAction(link.action);
                  }}
                >
                  <svelte:component this={link.icon} width="16" height="16" aria-hidden="true" />
                  <span>{link.label}</span>
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Desktop : rien — la sidebar porte les sections. */
  .pt {
    display: none;
  }

  @media (max-width: 768px) {
    .pt {
      display: block;
      width: 100%;
      box-sizing: border-box;
      flex-shrink: 0;
      border-bottom: 1px solid var(--line);
      background: var(--surface-tint);
    }
    .pt-dd {
      position: relative;
      padding: 10px 16px;
    }
    .pt-dd-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 44px;
      padding: 10px 14px;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      background: var(--surface);
      color: var(--brand-text);
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      box-shadow: 0 1px 3px -1px
        color-mix(in srgb, color-mix(in srgb, var(--brand) 44.6%, #353535) 20%, transparent);
    }
    .pt-dd-label {
      flex: 1;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pt-dd-chevron {
      display: inline-flex;
      color: var(--ink-muted);
      transition: transform 0.15s ease;
    }
    .pt-dd-chevron-open {
      transform: rotate(180deg);
    }
    .pt-dd-menu {
      position: absolute;
      left: 16px;
      right: 16px;
      top: calc(100% - 4px);
      z-index: 30;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      box-shadow: 0 12px 32px color-mix(in srgb, var(--ink) 18%, transparent);
      max-height: min(60dvh, 420px);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    /* Le champ reste en haut quand la liste défile. */
    .pt-dd-search {
      position: sticky;
      top: -6px;
      z-index: 1;
      margin: -6px -6px 0;
      padding: 6px 6px 4px;
      background: var(--surface);
    }
    .pt-dd-items {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pt-dd-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      /* Le menu est une colonne à hauteur bornée qui défile : sans ça, une
         entrée de deux lignes (phrase de pastille) rétrécit et chevauche la
         suivante au lieu de faire défiler la liste. */
      flex-shrink: 0;
      min-height: 44px;
      padding: 10px 12px;
      border: none;
      border-radius: 8px;
      background: none;
      color: var(--ink-soft);
      font-size: 14px;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
    }
    .pt-dd-item:active {
      background: color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef);
    }
    .pt-dd-group {
      flex-shrink: 0;
      padding: 10px 12px 2px;
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--ink-muted);
    }
    .pt-dd-rule {
      flex-shrink: 0;
      height: 1px;
      margin: 6px 12px;
      background: var(--line);
    }
    /* « Se déconnecter » : le rouge des gestes qui mettent fin à quelque chose. */
    .pt-dd-danger {
      color: var(--danger-strong);
    }
    .pt-dd-item-active {
      color: var(--brand-text);
      background: var(--brand-secondary-soft-08);
      font-weight: 600;
    }
    .pt-dd-check {
      display: inline-flex;
      color: var(--brand-text);
    }
    /* Entrée à phrase de pastille (deux à cinq lignes) : icône, pastille et
       coche s'alignent sur le LIBELLÉ, pas sur le milieu du bloc — centrées,
       elles tombaient en face de la phrase et semblaient appartenir à la
       ligne suivante. Décalages : le centre de la première ligne (14 px de
       texte). */
    .pt-dd-item-alert {
      align-items: flex-start;
    }
    .pt-dd-item-alert > :global(svg),
    .pt-dd-item-alert > .pt-dd-check {
      flex-shrink: 0;
      margin-top: 1px;
    }
    .pt-dd-item-alert > :global(.cad) {
      margin-top: 5px;
    }
    /* Le libellé prend la place ; la pastille et la coche se rangent au bout. */
    .pt-dd-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pt-dd-alert-text {
      font-size: 12px;
      font-weight: 400;
      line-height: 1.35;
      color: var(--mb-text-secondary);
    }
    .pt-dd-link {
      box-sizing: border-box;
      text-decoration: none;
    }
    .pt-dd-ext {
      display: inline-flex;
      margin-left: auto;
      color: var(--ink-muted);
    }
  }
</style>
