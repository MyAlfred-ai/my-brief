<script>
  /**
   * Barre d'app mobile, TOUJOURS visible : à gauche le menu (le tiroir de
   * l'historique) puis le logo ; à droite le « + » (nouvelle réunion) et
   * l'avatar, cerclé du crédit de temps du mois (ui/CreditAvatar.svelte).
   *
   * L'avatar ouvre le menu de compte, qui porte tout ce qui touche au compte :
   * « Ce mois-ci », Configuration, Administration (administrateurs), la langue,
   * la sortie. La roue crantée et le bouclier avaient leur icône dans la barre :
   * trois icônes de 44 px à côté du « + » serraient le nom dès 360 px, et le
   * menu de compte en vaut désormais le détour. Le tiroir, lui, ne garde que la
   * navigation (sa capsule de compte est masquée ≤ 768 px, Sidebar.svelte).
   *
   * Le logo et son nom ramènent à l'écran d'accueil (action `welcome`) — le
   * réflexe de n'importe quel site, et le même geste que le logo de la Sidebar
   * sur ordinateur. C'est App qui décide de ce qu'« accueil » veut dire
   * pendant un enregistrement.
   *
   * Extraite d'App.svelte pour la même raison que ToastHost : App est à son
   * plafond `max-lines` (cf. eslint.config.js) et ne peut plus grossir d'une
   * ligne. Le parent possède l'ouverture du drawer, la barre ne fait que la
   * basculer ; toutes les autres actions remontent par `onMenuAction`, le
   * même aiguillage que celles de la Sidebar. Seul état propre : le menu de
   * compte ouvert ou non.
   *
   * Le « + » : sur téléphone, « Démarrer » n'existe que dans le dock, et le
   * dock s'efface dès qu'une réunion rangée ou résumée est ouverte — il ne
   * restait alors que « Nouvelle réunion », caché dans le menu. Ce disque de
   * marque est le raccourci permanent — mais seulement quand il a un sens
   * (`canStart`) : jamais pendant une réunion (enregistrement ou pause), ni
   * pendant l'accès au micro, sinon un second départ écraserait la réunion en
   * cours. Il fait exactement ce que fait « Nouvelle réunion ».
   *
   * Montée sur tout écran, affichée ≤ 768 px seulement : son CSS vit dans
   * style.css (.mobile-appbar) avec l'échelle de z-index mobile.
   *
   * Pastilles de configuration (stores/configChecks.js) : sur les lignes
   * Configuration et Administration du menu, et réunies sur l'avatar pour se
   * voir menu fermé. Lues dans le store : App.svelte n'a pas à les
   * transmettre.
   */
  import logoUrl from '../logo.png';
  import IconMenu from '~icons/solar/hamburger-menu-linear';
  import AccountMenu from './AccountMenu.svelte';
  import CreditAvatar from './ui/CreditAvatar.svelte';
  import ConfigAlertDot from './ui/ConfigAlertDot.svelte';
  import { auth } from '../stores/auth.js';
  import { configChecks } from '../stores/configChecks.js';
  import { summaryAlert, mergeAlerts } from '../utils/configAlerts.js';
  import { accountView } from '../utils/userIdentity.js';
  import { uiText } from '../store.js';

  export let menuOpen = false;
  export let onToggleMenu = () => {};
  /** 'welcome' | 'stats' | 'config' | 'admin' | 'password' | 'logout' — cf. App. */
  export let onMenuAction = (_id) => {};
  export let onSetLanguage = (_lang) => {};
  /** Une réunion peut démarrer : aucune en cours, micro pas en cours d'accès. */
  export let canStart = false;
  export let startLabel = 'Nouvelle réunion';
  export let onStart = () => {};
  /**
   * Quota de minutes atteint : le disque s'éteint mais reste tactile — App
   * explique au tap, avec le mois de renouvellement. Un « + » disparu
   * ressemblerait à une réunion en cours (cf. `canStart`).
   */
  export let startBlocked = false;

  $: me = accountView($auth.user, $uiText.account.signedInWith);
  $: checkTexts = $uiText.configChecks;
  $: configAlert = summaryAlert($configChecks.account, checkTexts, {
    title: checkTexts.configTitle,
  });
  $: adminAlert = me.isAdmin
    ? summaryAlert($configChecks.organization, checkTexts, { title: checkTexts.adminTitle })
    : null;
  // Menu fermé, l'avatar porte les deux : le plus grave décide de la couleur.
  $: avatarAlert = mergeAlerts([configAlert, adminAlert]);

  let accountOpen = false;
  function act(id) {
    accountOpen = false;
    onMenuAction(id);
  }
</script>

<svelte:window
  on:click={() => (accountOpen = false)}
  on:keydown={(e) => e.key === 'Escape' && (accountOpen = false)}
/>

<header class="mobile-appbar">
  <button
    type="button"
    class="mobile-appbar-menu"
    on:click={onToggleMenu}
    aria-label={$uiText.ariaLabels.openMenu}
    aria-expanded={menuOpen}
  >
    <IconMenu width="22" height="22" />
  </button>
  <button
    type="button"
    class="mobile-appbar-home"
    on:click={() => act('welcome')}
    aria-label={$uiText.sidebar.backHome}
    title={$uiText.sidebar.backHome}
  >
    <img src={logoUrl} alt="" class="mobile-appbar-logo" />
    <span class="mobile-appbar-name">MyBrief</span>
  </button>
  <div class="mobile-appbar-actions">
    {#if canStart}
      <button
        type="button"
        class="mobile-appbar-start"
        class:mobile-appbar-start-blocked={startBlocked}
        on:click={onStart}
        aria-label={startLabel}
        title={startLabel}
      >
        <span class="mobile-appbar-start-disc" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 2.5v11M2.5 8h11"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
        </span>
      </button>
    {/if}
    <button
      type="button"
      class="mobile-appbar-icon mobile-appbar-avatar"
      on:click|stopPropagation={() => (accountOpen = !accountOpen)}
      aria-label={$uiText.account.menuLabel}
      aria-haspopup="menu"
      aria-expanded={accountOpen}
    >
      <CreditAvatar
        initials={me.initials}
        picture={me.picture}
        provider={me.provider}
        title={me.providerLabel}
        size={30}
      />
      {#if avatarAlert}
        <ConfigAlertDot {...avatarAlert} placement="corner" />
      {/if}
    </button>
  </div>
  {#if accountOpen}
    <!-- Sous la barre, aligné à droite : la barre (position: fixed) est le
         bloc conteneur. -->
    <div class="mobile-appbar-account-menu" role="menu" on:click|stopPropagation>
      <AccountMenu
        onAction={act}
        onSetLanguage={(lang) => {
          accountOpen = false;
          onSetLanguage(lang);
        }}
        withConfig
        {configAlert}
        {adminAlert}
      />
    </div>
  {/if}
</header>
