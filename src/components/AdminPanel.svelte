<script>
  /**
   * Administration — l'espace de l'ORGANISATION, ouvert par le bouton « Admin »
   * de la carte du compte. Coquille PanelShell ; sections dans la sidebar
   * (desktop) et dans le déroulant PanelTabs (mobile), via stores/panels.js.
   *
   * Un TABLEAU DE BORD pour accueil (ce qui reste à régler, et où), puis cinq
   * RUBRIQUES repliables, celles de MIA, à la place de onze onglets à plat qui
   * mêlaient ce qu'on règle une fois, ce qu'on gère et ce qu'on consulte :
   * Personnes, Modèles IA, Capacités, Coûts, Organisation. Les identifiants
   * des pages sont ceux sous lesquels le diagnostic du serveur
   * (lib/configChecks.js) range ses constats : `ai` est « Clés API »,
   * `branding` « Marque & apparence », `company` « Entreprise ».
   *
   * Depuis la Phase 5 du
   * refactoring, la gestion des templates transverses passe par le composant
   * partagé TemplateEditor (le même que « Mes templates » — l'ancienne copie
   * locale de ~600 lignes dupliquait tout, et n'inspectait pas la réponse
   * 200 + {ok:false} de routes/templates.js : un `value_invalid` s'affichait
   * « sauvegardé » alors que rien n'était écrit).
   *
   * Les autres pages sont autonomes : elles portent leur propre chargement,
   * leurs erreurs et leurs appels API. Deux composants servent chacun deux
   * pages, par leur prop `view` : AiTab (« Clés API », « Modèles ») et
   * BrandingTab (« Entreprise », « Marque & apparence »).
   */
  import IconShield from '~icons/solar/shield-user-linear';
  import IconTemplates from '~icons/solar/clipboard-list-linear';
  import IconUsers from '~icons/solar/users-group-rounded-linear';
  import IconGroups from '~icons/solar/users-group-two-rounded-linear';
  import IconKey from '~icons/solar/key-minimalistic-linear';
  import IconMagic from '~icons/solar/magic-stick-3-linear';
  import IconShare from '~icons/solar/square-share-line-linear';
  import IconChart from '~icons/solar/chart-2-linear';
  import IconPalette from '~icons/solar/palette-linear';
  import IconClock from '~icons/solar/clock-circle-linear';
  import IconCapabilities from '~icons/solar/widget-add-linear';
  import IconCosts from '~icons/solar/wallet-money-linear';
  import IconOrganization from '~icons/solar/buildings-2-linear';
  import IconDashboard from '~icons/solar/widget-5-linear';
  import IconCompany from '~icons/solar/notebook-linear';
  import IconModels from '~icons/solar/cpu-bolt-linear';
  import IconBrain from './icons/BrainIcon.svelte';
  import IconAiHelp from './icons/AiHelpIcon.svelte';
  import AiHelpTab from './admin/AiHelpTab.svelte';
  import DashboardTab from './admin/DashboardTab.svelte';

  import { onDestroy } from 'svelte';

  import { forceReauth } from '../utils/httpErrorHandler.js';
  import { get as apiGet, post as apiPost } from '../services/apiClient.js';
  import PanelShell from './PanelShell.svelte';
  import PanelTabs from './PanelTabs.svelte';
  import {
    panelNav,
    registerPanelNav,
    selectPanelSection,
    clearPanelNav,
  } from '../stores/panels.js';
  import TemplateEditor from './TemplateEditor.svelte';
  import { DEFAULT_EDITABLE_TEMPLATES } from '../config/templates.js';
  import { ADMIN_RUBRICS, ADMIN_SECTIONS } from '../config/adminSections.js';
  import UsersTab from './admin/UsersTab.svelte';
  import GroupsTab from './admin/GroupsTab.svelte';
  import AuthTab from './admin/AuthTab.svelte';
  import AiTab from './admin/AiTab.svelte';
  import BrandingTab from './admin/BrandingTab.svelte';
  import ActionsTab from './admin/ActionsTab.svelte';
  import StatsTab from './admin/StatsTab.svelte';
  import CreditsTab from './admin/CreditsTab.svelte';
  import MyBrainTab from './admin/MyBrainTab.svelte';
  import { auth } from '../stores/auth.js';
  import { configChecks } from '../stores/configChecks.js';
  import { alertsBySection } from '../utils/configAlerts.js';
  import { uiText } from '../store.js';

  export let onClose = () => {};
  // userInfo provient de /api/init (header X-User-Email injecté par OIDC).
  export let userInfo = null;

  // SEULE source : le rôle du document `user`, tel que le serveur le renvoie.
  // Toute autre règle d'affichage (domaine de l'email, par exemple) ouvrirait
  // le panneau à quelqu'un que les routes /api/admin refusent ensuite, et
  // l'écran ne saurait afficher que des 403.
  $: authenticated = $auth.user?.role === 'admin';

  // Les pages, leurs rubriques et leurs raisons vivent dans
  // config/adminSections.js (la recherche des réglages les lit aussi). Ne
  // restent ici que les icônes.
  const RUBRIC_ICONS = {
    people: IconUsers,
    models: IconMagic,
    capabilities: IconCapabilities,
    costs: IconCosts,
    organization: IconOrganization,
  };
  const SECTION_ICONS = {
    dashboard: IconDashboard,
    users: IconUsers,
    groups: IconGroups,
    ai: IconKey,
    'ai-models': IconModels,
    templates: IconTemplates,
    actions: IconShare,
    aihelp: IconAiHelp,
    mybrain: IconBrain,
    credits: IconClock,
    stats: IconChart,
    company: IconCompany,
    branding: IconPalette,
    auth: IconKey,
  };
  // Pastille de chaque section : ce que le diagnostic d'organisation y trouve à
  // régler (stores/configChecks.js). La sidebar et le déroulant mobile la rendent.
  $: alerts = alertsBySection($configChecks.organization, $uiText.configChecks);
  // Une page sans rubrique (le tableau de bord) n'a ni groupe ni icône de
  // groupe : la colonne la rend comme une entrée simple, au-dessus des autres.
  $: TABS = ADMIN_SECTIONS.map(({ id, rubric, label }) => ({
    id,
    label: label($uiText),
    icon: SECTION_ICONS[id],
    groupId: rubric || '',
    group: rubric ? ADMIN_RUBRICS[rubric].label($uiText) : '',
    groupIcon: rubric ? RUBRIC_ICONS[rubric] : null,
    alert: alerts[id] || null,
  }));
  const HOME_TAB = 'dashboard';
  // Sections rendues par la SIDEBAR (desktop) et le déroulant PanelTabs
  // (mobile) — voir stores/panels.js. Enregistrées seulement pour un admin :
  // pour tout autre compte, ce panneau n'affiche qu'un refus, et un menu de
  // sections à gauche promettrait des écrans inaccessibles.
  $: if (authenticated) {
    registerPanelNav('admin', {
      title: $uiText.buttons.administration,
      items: TABS,
      active: HOME_TAB,
      collapsible: true,
    });
  }
  $: activeTab =
    $panelNav.owner === 'admin' && TABS.some((t) => t.id === $panelNav.active)
      ? $panelNav.active
      : HOME_TAB;
  onDestroy(() => clearPanelNav('admin'));

  const templatesApi = {
    list: () => apiGet('/templates'),
    save: (payload) => apiPost('/templates/save', payload),
    remove: (value) => apiPost('/templates/delete', { value }),
  };

  // Textes de l'éditeur : dans le dictionnaire comme les autres onglets (FR et
  // EN). Le libellé FR reste la langue d'ÉDITION principale (`lang="fr"`) :
  // les templates transverses sont ceux de l'organisation, pas de l'interface.
  $: templatesTexts = $uiText.adminTemplates;
</script>

<PanelShell
  title={$uiText.buttons.administration}
  icon={IconShield}
  {onClose}
  closeLabel={$uiText.buttons.close}
>
  <svelte:fragment slot="title-extra">
    {#if authenticated && userInfo?.email}
      <span class="ap-whoami" title={userInfo.email}>{userInfo.email}</span>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="tabs">
    {#if authenticated}
      <!-- Mobile uniquement : sur desktop, les sections vivent dans la sidebar. -->
      <PanelTabs
        tabs={TABS}
        active={activeTab}
        onSelect={selectPanelSection}
        ariaLabel={$uiText.adminPanel.sectionsLabel}
      />
    {/if}
  </svelte:fragment>

  {#if !authenticated}
    <!-- Accès réservé : la garde est le rôle `admin` du compte, vérifié côté
         serveur sur chaque route /api/admin. -->
    <div class="ap-login">
      <p>{$uiText.adminPanel.restricted}</p>
      {#if userInfo?.email}
        <span class="ap-err">{$uiText.adminPanel.noAccess.replace('{email}', userInfo.email)}</span>
      {:else}
        <span class="ap-err">{$uiText.adminPanel.signInRequired}</span>
      {/if}
      <button class="ap-btn-primary" on:click={onClose}>{$uiText.buttons.close}</button>
    </div>
  {:else if activeTab === 'dashboard'}
    <div class="ap-body"><DashboardTab pages={TABS} /></div>
  {:else if activeTab === 'stats'}
    <div class="ap-body"><StatsTab /></div>
  {:else if activeTab === 'templates'}
    <!-- Une phrase d'intro comme les autres onglets, puis le maître-détail
         qui prend tout le reste de la hauteur. -->
    <div class="ap-templates">
      <p class="ap-intro">{templatesTexts.intro}</p>
      <!-- defaultTemplates : les 7 templates par défaut du code, fusionnés
           dans la liste et modifiables — la sauvegarde crée en base un
           template de même `value`, qui prend le pas partout. -->
      <TemplateEditor
        api={templatesApi}
        texts={templatesTexts}
        lang="fr"
        onAuthRedirect={forceReauth}
        refetchAfterSave={true}
        defaultTemplates={DEFAULT_EDITABLE_TEMPLATES}
      />
    </div>
  {:else if activeTab === 'users'}
    <div class="ap-body"><UsersTab /></div>
  {:else if activeTab === 'groups'}
    <div class="ap-body"><GroupsTab /></div>
  {:else if activeTab === 'credits'}
    <div class="ap-body"><CreditsTab /></div>
  {:else if activeTab === 'auth'}
    <div class="ap-body"><AuthTab /></div>
  {:else if activeTab === 'ai'}
    <div class="ap-body"><AiTab view="keys" /></div>
  {:else if activeTab === 'ai-models'}
    <div class="ap-body"><AiTab view="models" /></div>
  {:else if activeTab === 'actions'}
    <div class="ap-body"><ActionsTab /></div>
  {:else if activeTab === 'company'}
    <div class="ap-body"><BrandingTab view="company" /></div>
  {:else if activeTab === 'branding'}
    <div class="ap-body"><BrandingTab view="look" /></div>
  {:else if activeTab === 'mybrain'}
    <div class="ap-body"><MyBrainTab /></div>
  {:else if activeTab === 'aihelp'}
    <div class="ap-body"><AiHelpTab /></div>
  {/if}
</PanelShell>

<style>
  .ap-whoami {
    font-size: 11.5px;
    color: var(--ink-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Login ── */
  .ap-login {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 56px 24px;
  }
  .ap-login p {
    color: var(--ink-muted);
    margin: 0;
    font-size: 14px;
  }
  .ap-err {
    color: var(--danger-strong);
    font-size: 12px;
  }
  .ap-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 18px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
    letter-spacing: 0.01em;
    transition:
      background 0.15s,
      box-shadow 0.15s;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
  }
  .ap-btn-primary:hover {
    background: var(--brand-strong);
  }

  /* ── Tabs : voir PanelTabs.svelte (pastilles desktop, déroulant mobile) ── */

  /* ── Body des onglets autonomes ── */
  /* L'onglet Templates empile une ligne d'intro et un maître-détail qui doit
     prendre tout le reste : `min-height: 0` sans quoi le contenu interne
     (liste scrollable) impose sa hauteur et déborde du panneau. */
  .ap-templates {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  /* Même tête de section que « Mes templates » (TemplatesSection) : un filet
     la sépare du maître-détail, qui a ses propres colonnes. */
  .ap-intro {
    margin: 0;
    padding: 16px 22px 12px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .ap-body {
    /* Lu par l'en-tête collant de la liste des utilisateurs (UsersTab) : un
       élément `sticky` s'arrête au bord du padding de la zone qui défile, pas
       à son bord — il remonte d'autant pour ne pas laisser passer les lignes
       au-dessus de lui. */
    --ap-body-pad-top: 18px;
    width: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    padding: var(--ap-body-pad-top) 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
  }

  @media (max-width: 640px) {
    .ap-body {
      --ap-body-pad-top: 14px;
      padding: var(--ap-body-pad-top) 16px 14px;
    }
    .ap-intro {
      padding: 14px 16px 10px;
    }
  }
</style>
