<script>
  /**
   * Carte du compte du TÉLÉPHONE : le contenu du popover que l'avatar de la
   * barre d'app ouvre (MobileAppBar), sans sa boîte ni sa position.
   *
   * La même carte que celle du bas de la Sidebar sur ordinateur — qui je suis,
   * puis les deux boutons « Réglages » et « Admin » (AccountActions) — avec, en
   * plus, « Ce mois-ci » (stats/AccountMonth.svelte) : sur téléphone la
   * capsule de la colonne est masquée, et c'est le seul endroit où le crédit
   * du mois se lit sans ouvrir une page.
   *
   * Ce qu'elle ne porte PLUS : le groupe, la langue, le mot de passe et la
   * sortie. C'était à la fois une fiche et une navigation ; la fiche est la
   * page « Mon profil » des réglages, la sortie ferme leur menu. Une carte,
   * deux boutons, sur tous les écrans.
   *
   * Pastilles : chaque bouton garde la sienne ; au doigt, sans survol pour
   * ouvrir la bulle, la phrase la plus grave s'écrit sous les boutons.
   */
  import UserAvatar from './ui/UserAvatar.svelte';
  import AccountMonth from './stats/AccountMonth.svelte';
  import AccountActions from './AccountActions.svelte';
  import { auth } from '../stores/auth.js';
  import { uiText } from '../store.js';
  import { accountView } from '../utils/userIdentity.js';

  /** 'stats' | 'config' | 'admin' */
  export let onAction = (_id) => {};
  /** Pastilles composées par le parent (utils/configAlerts.js `summaryAlert`), ou null. */
  export let configAlert = null;
  export let adminAlert = null;

  $: me = accountView($auth.user, $uiText.account.signedInWith);
  $: t = $uiText.account;
  $: alerts = [configAlert, adminAlert].filter(Boolean);
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

<AccountMonth onOpen={() => onAction('stats')} />

<div class="am-actions">
  <AccountActions {onAction} {configAlert} {adminAlert} />
</div>
<!-- Au doigt seulement : la bulle d'une pastille ne s'ouvre qu'au survol.
     Masquée aux lecteurs d'écran, qui l'ont déjà en description du bouton. -->
{#each alerts as alert (alert.title)}
  <p class="am-alert-text" aria-hidden="true">
    <strong>{alert.title}</strong>
    {alert.items[0].text}
  </p>
{/each}

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

  .am-actions {
    padding: 8px 2px 2px;
  }

  .am-alert-text {
    display: none;
    margin: 0;
    padding: 6px 6px 2px;
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--mb-text-secondary);
  }
  .am-alert-text strong {
    display: block;
    font-weight: 600;
    color: var(--ink);
  }
  @media (hover: none) {
    .am-alert-text {
      display: block;
    }
  }
</style>
