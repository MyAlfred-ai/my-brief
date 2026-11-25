<script>
  /**
   * « Mon profil » — la page d'accueil des réglages : qui je suis, mon groupe,
   * ma langue, mon mot de passe.
   *
   * Tout cela vivait dans le menu déroulant du nom (AccountMenu), à côté de
   * raccourcis vers les panneaux : un menu qui était à la fois une fiche et
   * une navigation. La fiche est devenue une page, comme « Mon profil » dans
   * MIA ; la navigation tient dans les deux boutons de la carte du compte
   * (AccountActions).
   *
   * La langue : chaque bouton se nomme dans SA langue (« English »,
   * « Français ») — c'est elle que cherche quelqu'un qui ne lit pas la langue
   * courante.
   *
   * Le mot de passe n'existe que pour une session par mot de passe (invisible
   * en SSO) : avec Google ou Microsoft, il se change chez eux, et la carte dit
   * par quoi la session a été ouverte plutôt que de proposer un bouton sans
   * effet.
   */
  import IconUser from '~icons/solar/user-id-linear';
  import IconGlobe from '~icons/solar/global-linear';
  import IconKey from '~icons/solar/key-minimalistic-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import UserAvatar from '../ui/UserAvatar.svelte';
  import GroupChip from '../ui/GroupChip.svelte';
  import { auth } from '../../stores/auth.js';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { accountView } from '../../utils/userIdentity.js';

  /** @type {(lang: string) => void} */
  export let onSetLanguage = (_lang) => {};
  /** Geste de compte remonté à App : 'password'. */
  export let onAccountAction = (_id) => {};

  const LANGUAGES = [
    { code: 'fr', name: 'Français' },
    { code: 'en', name: 'English' },
  ];

  $: t = $uiText.profile;
  $: account = $uiText.account;
  $: me = accountView($auth.user, account.signedInWith);
  $: lang = $currentLanguageStore;
</script>

<div class="pf">
  <p class="pf-intro">{t.intro}</p>

  <SettingsCard title={t.identityTitle} hint={me.providerLabel} icon={IconUser}>
    <div class="pf-identity">
      <UserAvatar
        initials={me.initials}
        picture={me.picture}
        provider={me.provider}
        title={me.providerLabel}
        size={44}
      />
      <dl class="pf-fields">
        <div class="pf-field">
          <dt>{t.nameLabel}</dt>
          <dd>{me.name ?? account.guest}</dd>
        </div>
        {#if me.email}
          <div class="pf-field">
            <dt>{t.emailLabel}</dt>
            <dd>{me.email}</dd>
          </div>
        {/if}
      </dl>
    </div>
    <!-- Groupes attribués par l'administration : on les lit ici, on ne les
         change pas — la phrase le dit, pour ne pas chercher un bouton. -->
    {#if me.groups.length}
      <div class="pf-groups">
        <span class="pf-groups-label">{account.groupsLabel}</span>
        <div class="pf-groups-list">
          {#each me.groups as group (group.id)}
            <GroupChip {group} />
          {/each}
        </div>
        <span class="pf-hint">{account.groupsHint}</span>
      </div>
    {/if}
  </SettingsCard>

  <SettingsCard title={t.languageTitle} hint={t.languageHint} icon={IconGlobe}>
    <div class="pf-seg" role="group" aria-label={t.languageTitle}>
      {#each LANGUAGES as option (option.code)}
        <button
          type="button"
          class="pf-seg-btn"
          class:pf-seg-on={lang === option.code}
          aria-pressed={lang === option.code}
          lang={option.code}
          on:click={() => lang !== option.code && onSetLanguage(option.code)}
        >
          {option.name}
        </button>
      {/each}
    </div>
  </SettingsCard>

  {#if me.canChangePassword}
    <SettingsCard title={t.securityTitle} hint={t.securityHint} icon={IconKey}>
      <div class="pf-actions">
        <button type="button" class="pf-btn" on:click={() => onAccountAction('password')}>
          {account.changePasswordTitle}
        </button>
      </div>
    </SettingsCard>
  {/if}
</div>

<style>
  .pf {
    width: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    padding: 18px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
  }
  .pf-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  .pf-identity {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .pf-fields {
    flex: 1 1 240px;
    min-width: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 28px;
  }
  .pf-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pf-field dt,
  .pf-groups-label {
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-muted);
  }
  .pf-field dd {
    margin: 0;
    font-size: 0.92rem;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .pf-groups {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
  }
  .pf-groups-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .pf-hint {
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

  /* Langue : deux boutons de même poids, celui de la langue courante allumé. */
  .pf-seg {
    display: inline-flex;
    align-self: flex-start;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff;
  }
  .pf-seg-btn {
    min-height: 36px;
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    font-family: inherit;
    font-size: 0.88rem;
    color: var(--ink-soft);
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .pf-seg-btn:hover {
    background: rgb(var(--brand-rgb) / 0.06);
  }
  .pf-seg-on,
  .pf-seg-on:hover {
    background: var(--mb-bg-tabs);
    border-color: var(--mb-border-card);
    font-weight: 600;
    color: var(--ink);
    cursor: default;
  }

  .pf-actions {
    display: flex;
    justify-content: flex-start;
  }
  .pf-btn {
    min-height: 38px;
    padding: 0 0.9rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.88rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .pf-btn:hover {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }

  /* Au doigt, les cibles reprennent 44 px. */
  @media (pointer: coarse) {
    .pf-seg-btn,
    .pf-btn {
      min-height: 44px;
    }
  }
  @media (max-width: 640px) {
    .pf {
      padding: 14px 16px;
    }
  }
</style>
