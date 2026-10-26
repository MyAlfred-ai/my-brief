<script>
  /**
   * Menu de COMPTE : qui je suis, mes groupes, où j'en suis ce mois-ci, les
   * panneaux que la barre n'affiche plus, la langue, et ce qui touche à cet
   * accès (mot de passe, déconnexion). Le contenu du popover, sans sa boîte ni
   * sa position : chaque parent le place.
   *
   * Deux portes d'entrée, un seul menu : la capsule de compte en bas de la
   * Sidebar (ordinateur, tablette) et l'avatar de la barre d'app (téléphone).
   * Extrait de Sidebar.svelte pour que les deux ne divergent pas.
   *
   * « Ce mois-ci » (stats/AccountMonth.svelte) remplace la ligne « Mes
   * statistiques » : le menu dit où l'on en est, la page garde le détail.
   *
   * Les panneaux : Administration (administrateurs) est ici partout — le
   * bouclier a quitté la colonne et la barre d'app. Configuration n'y est que
   * sur téléphone (`withConfig`) : sur ordinateur, la roue crantée reste à un
   * clic, à côté de la capsule. Chaque ligne garde sa pastille de configuration
   * ; au doigt, sans survol pour ouvrir la bulle, la phrase s'écrit sous le
   * libellé.
   *
   * La langue : une bascule FR | EN, à la place du drapeau seul. Chaque bouton
   * se nomme dans SA langue (« English », « Français ») — c'est elle que
   * cherche quelqu'un qui ne lit pas la langue courante.
   */
  import UserAvatar from './ui/UserAvatar.svelte';
  import GroupChip from './ui/GroupChip.svelte';
  import ConfigAlertDot from './ui/ConfigAlertDot.svelte';
  import AccountMonth from './stats/AccountMonth.svelte';
  import IconKey from '~icons/solar/key-minimalistic-linear';
  import IconLogout from '~icons/solar/logout-2-linear';
  import IconSettings from '~icons/solar/settings-linear';
  import IconShield from '~icons/solar/shield-user-linear';
  import IconGlobe from '~icons/solar/global-linear';
  import { auth } from '../stores/auth.js';
  import { uiText, currentLanguageStore } from '../store.js';
  import { accountView } from '../utils/userIdentity.js';

  /** 'stats' | 'config' | 'admin' | 'password' | 'logout' */
  export let onAction = (_id) => {};
  /** @type {(lang: string) => void} */
  export let onSetLanguage = (_lang) => {};
  /** Ligne « Configuration » : sur téléphone, où la roue crantée n'est plus à l'écran. */
  export let withConfig = false;
  /** Pastilles composées par le parent (utils/configAlerts.js `summaryAlert`), ou null. */
  export let configAlert = null;
  export let adminAlert = null;

  const LANGUAGES = [
    { code: 'fr', short: 'FR', name: 'Français' },
    { code: 'en', short: 'EN', name: 'English' },
  ];

  $: me = accountView($auth.user, $uiText.account.signedInWith);
  $: t = $uiText.account;
  $: lang = $currentLanguageStore;
  $: panels = [
    withConfig && {
      id: 'config',
      label: $uiText.buttons.configuration,
      icon: IconSettings,
      alert: configAlert,
    },
    me.isAdmin && {
      id: 'admin',
      label: $uiText.buttons.administration,
      icon: IconShield,
      alert: adminAlert,
    },
  ].filter(Boolean);
</script>

<div class="am-info">
  <UserAvatar
    initials={me.initials}
    picture={me.picture}
    provider={me.provider}
    title={me.providerLabel}
    size={36}
  />
  <div class="am-identity">
    <span class="am-name">{me.name ?? t.guest}</span>
    {#if me.email}<span class="am-email">{me.email}</span>{/if}
  </div>
</div>
<!-- Groupes attribués par l'administration : une affaire de compte, comme
     l'adresse — on les lit ici, pas dans un écran de réglage. -->
{#if me.groups.length}
  <div class="am-groups" title={t.groupsHint}>
    <span class="am-groups-label">{t.groupsLabel}</span>
    <div class="am-groups-list">
      {#each me.groups as group (group.id)}
        <GroupChip {group} />
      {/each}
    </div>
  </div>
{/if}

<AccountMonth onOpen={() => onAction('stats')} />

{#each panels as panel (panel.id)}
  <button
    class="am-item"
    class:am-item-alert={!!panel.alert}
    role="menuitem"
    on:click={() => onAction(panel.id)}
  >
    <svelte:component this={panel.icon} width="16" height="16" class="am-icon" />
    <span class="am-text">
      <span>{panel.label}</span>
      {#if panel.alert}
        <!-- Au doigt seulement : la bulle de la pastille ne s'ouvre qu'au survol.
             Masquée aux lecteurs d'écran, qui l'ont déjà en description. -->
        <span class="am-alert-text" aria-hidden="true">{panel.alert.items[0].text}</span>
      {/if}
    </span>
    {#if panel.alert}
      <ConfigAlertDot {...panel.alert} placement="inline" />
    {/if}
  </button>
{/each}
{#if panels.length}<div class="am-sep"></div>{/if}

<div class="am-lang" role="group" aria-label={t.language}>
  <IconGlobe width="16" height="16" class="am-icon" aria-hidden="true" />
  <span class="am-lang-label" aria-hidden="true">{t.language}</span>
  <div class="am-seg">
    {#each LANGUAGES as option (option.code)}
      <button
        class="am-seg-btn"
        class:am-seg-on={lang === option.code}
        role="menuitemradio"
        aria-checked={lang === option.code}
        aria-label={option.name}
        lang={option.code}
        on:click={() => lang !== option.code && onSetLanguage(option.code)}
      >
        {option.short}
      </button>
    {/each}
  </div>
</div>
<!-- Sessions par mot de passe uniquement (invisible en SSO). Ici parce que
     c'est une affaire de compte, pas un écran de réglage. -->
{#if me.canChangePassword}
  <button class="am-item" role="menuitem" on:click={() => onAction('password')}>
    <IconKey width="16" height="16" class="am-icon" />{t.changePasswordTitle}
  </button>
{/if}
{#if me.name}
  <button class="am-item am-logout" role="menuitem" on:click={() => onAction('logout')}>
    <IconLogout width="16" height="16" class="am-icon" />{$uiText.buttons.logout}
  </button>
{/if}

<style>
  .am-info {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 8px;
  }

  .am-identity {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .am-name {
    font-size: 13.5px;
    font-weight: 500;
    color: #000;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .am-email {
    font-size: 11.5px;
    font-weight: 300;
    color: var(--mb-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .am-sep {
    height: 1px;
    background: var(--mb-border-subtle);
    margin: 4px 6px;
  }

  .am-groups {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 0 8px 10px;
  }
  .am-groups-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--ink-muted);
  }
  .am-groups-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .am-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    border: none;
    background: transparent;
    text-align: left;
    font-family: inherit;
    font-size: 13px;
    color: #000;
    padding: 0 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .am-item:hover {
    background: var(--mb-orange-10);
  }

  /* Au doigt : 44 px (la règle de style.css perd contre ce min-height scopé). */
  @media (pointer: coarse) {
    .am-item,
    .am-lang {
      min-height: 44px;
    }
  }

  /* Icônes Solar du menu : orange, alignées ; logout hérite le rouge */
  .am-item :global(.am-icon),
  .am-lang :global(.am-icon) {
    color: var(--mb-orange);
    flex-shrink: 0;
  }

  .am-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .am-alert-text {
    display: none;
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--mb-text-secondary);
  }
  @media (hover: none) {
    .am-alert-text {
      display: block;
      padding: 1px 0 6px;
    }
    .am-item-alert {
      align-items: flex-start;
      padding-top: 8px;
    }
    .am-item-alert > :global(.cad) {
      margin-top: 5px;
    }
  }

  .am-lang {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0 4px 0 8px;
    font-size: 13px;
    color: #000;
  }
  .am-lang-label {
    flex: 1;
  }
  .am-seg {
    display: flex;
    padding: 2px;
    border-radius: 9px;
    background: var(--viz-track);
  }
  .am-seg-btn {
    min-width: 38px;
    height: 26px;
    padding: 0 8px;
    border: none;
    border-radius: 7px;
    background: transparent;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    color: var(--mb-text-secondary);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .am-seg-btn:hover {
    color: #000;
  }
  .am-seg-on {
    background: var(--mb-bg-surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    font-weight: 600;
    color: #000;
    cursor: default;
  }

  .am-logout {
    color: rgb(210, 60, 60);
  }

  .am-logout :global(.am-icon) {
    color: inherit;
  }

  .am-logout:hover {
    background: rgba(210, 60, 60, 0.08);
  }
</style>
