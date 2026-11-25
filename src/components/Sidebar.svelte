<script>
  import { tick } from 'svelte';
  import { uiText, currentLanguageStore } from '../store.js';
  import { auth } from '../stores/auth.js';
  import {
    historyItems,
    selectedMeetingId,
    isLoadingHistory,
    renameMeeting,
    meetingIdOf,
  } from '../stores/history.js';
  import { tags, tagsById, tagMeeting } from '../stores/tags.js';
  import { activePanel, panelNav, selectPanelSection } from '../stores/panels.js';
  import TagChip from './TagChip.svelte';
  import CreditAvatar from './ui/CreditAvatar.svelte';
  import AccountActions from './AccountActions.svelte';
  import WhatsNewBadge from './WhatsNewBadge.svelte';
  import TagPicker from './TagPicker.svelte';
  import { searchTags } from '../utils/tagSearch.js';
  import ConfigAlertDot from './ui/ConfigAlertDot.svelte';
  import { configChecks, refreshConfigChecks } from '../stores/configChecks.js';
  import { quota, quotaNow } from '../stores/quota.js';
  import { formatMinutes, periodMonths } from '../utils/quotaFormat.js';
  import { summaryAlert, mergeAlerts } from '../utils/configAlerts.js';
  import { accountView } from '../utils/userIdentity.js';
  import {
    isRecordingStore as isRecording,
    isPausedStore as isPaused,
    liveMeetingIdStore,
  } from '../stores/recording.js';
  import logoUrl from '../logo.webp';
  import { groupHistory } from '../utils/historyGroups.js';
  // Apparence réglée dans l'administration : logo et phrase d'accueil
  // personnalisés — les valeurs intégrées restent le repli.
  import { branding, brandingTagline } from '../stores/branding.js';
  import IconSidebarToggle from '~icons/solar/sidebar-minimalistic-linear';
  import IconSearch from '~icons/solar/magnifer-linear';
  import IconChevron from '~icons/solar/alt-arrow-right-linear';
  import IconChevronLeft from '~icons/solar/alt-arrow-left-linear';
  import IconChevronDown from '~icons/solar/alt-arrow-down-linear';
  import IconPen from '~icons/solar/pen-linear';
  import IconTrash from '~icons/solar/trash-bin-trash-linear';
  import IconTag from '~icons/solar/tag-linear';
  import IconHome from '~icons/solar/home-2-linear';
  import IconExternal from '~icons/solar/square-arrow-right-up-linear';
  import SparkleIcon from './icons/SparkleIcon.svelte';
  import { isDrawerWidth } from '../stores/sidebar.js';
  import SettingsSearchField from './settings/SettingsSearchField.svelte';
  import SettingsSearchResults from './settings/SettingsSearchResults.svelte';
  import { settingsQuery } from '../stores/settingsSearch.js';
  import { generatingMeetingIds } from '../stores/summaryGeneration.js';
  import { fill } from '../utils/i18nFormat.js';
  export let onNewMeeting = () => {};
  export let onSelectHistory = () => {};
  export let onDeleteHistory = () => {};
  export let onGoToLive = () => {};
  export let screen = 'welcome';
  export let isOpen = true;
  export let onToggle = () => {};
  // Aiguillage unique des gestes de la colonne : 'config' | 'admin' (les deux
  // boutons de la carte du compte), 'tags', 'home', 'welcome', 'logout'.
  export let onMenuAction = (_id) => {};
  // Dérivés du store auth (plus de props) : rôle admin lu du serveur, nom,
  // initiales, photo et fournisseur de connexion (utils/userIdentity.js — la
  // même lecture que la barre d'app mobile et la carte du compte).
  $: me = accountView($auth.user, $uiText.account.signedInWith);
  $: isAdminUser = me.isAdmin;
  $: userName = me.name;

  // ── Pastilles de configuration ──────────────────────────────────────────
  // Relues à chaque changement de compte ou de rôle, et à chaque ouverture ou
  // fermeture d'un panneau : c'est là qu'on vient de corriger quelque chose.
  // La Sidebar s'en charge parce qu'elle est montée partout et lit déjà les
  // deux (App.svelte, plafonné, ne peut pas grossir). Le serveur mémorise ses
  // vérifications : relire ne coûte presque rien.
  $: checksKey = $auth.user?.email ? `${$auth.user.email}|${isAdminUser}` : '';
  $: checksTrigger = checksKey && `${checksKey}|${$activePanel || ''}`;
  $: if (checksTrigger) refreshConfigChecks({ admin: isAdminUser });
  $: checkTexts = $uiText.configChecks;
  // « Réglages » et « Admin » : un récapitulatif du périmètre que chacun ouvre.
  $: configAlert = summaryAlert($configChecks.account, checkTexts, {
    title: checkTexts.configTitle,
  });
  $: adminAlert = isAdminUser
    ? summaryAlert($configChecks.organization, checkTexts, { title: checkTexts.adminTitle })
    : null;

  // ── Carte du compte ─────────────────────────────────────────────────────
  // Sous le nom, ce qu'il reste du crédit de temps du mois — la carte « Temps
  // de réunion » qui occupait le bas de la colonne s'y est résumée, l'anneau
  // de l'avatar la dessine. Le reste seul : avec le mois, la ligne se coupait
  // dès la largeur par défaut ; le mois est dans l'infobulle, le détail dans
  // « Usage & crédits ». Sans quota, l'adresse : la carte dit au moins QUEL
  // compte est ouvert.
  $: quotaTexts = $uiText.quota;
  $: quotaMonths = periodMonths($quota.period, $currentLanguageStore);
  $: creditOut = $quotaNow.limited && $quotaNow.tone === 'out';
  $: capsuleLine = !$quotaNow.limited
    ? me.email || ''
    : creditOut
      ? quotaTexts.blockedShort
      : fill($uiText.account.capsuleRemaining, {
          remaining: formatMinutes($quotaNow.remainingMinutes, quotaTexts),
        });
  // L'infobulle garde ce que disait la carte : le groupe qui donne le quota,
  // et le renouvellement.
  $: capsuleTitle = $quotaNow.limited
    ? [
        `${capsuleLine}.`,
        $quota.group
          ? fill(quotaTexts.groupHint, {
              group: $quota.group.name,
              limit: formatMinutes($quota.limitMinutes, quotaTexts),
            })
          : '',
        fill(quotaTexts.renewal, { month: quotaMonths.renewal }),
      ]
        .filter(Boolean)
        .join(' ')
    : $uiText.sidebar.profile;

  let search = '';

  // Resize state
  const SIDEBAR_WIDTH_KEY = 'mybrief_sidebar_width';
  const MIN_W = 220;
  const MAX_W = 480;
  let sidebarWidth = (() => {
    try {
      const v = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) || '', 10);
      if (Number.isFinite(v) && v >= MIN_W && v <= MAX_W) return v;
    } catch {}
    return 280;
  })();
  let resizing = false;

  function startResize(e) {
    e.preventDefault();
    resizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onResize);
    window.addEventListener('mouseup', endResize);
  }

  function onResize(e) {
    if (!resizing) return;
    const w = Math.min(MAX_W, Math.max(MIN_W, e.clientX));
    sidebarWidth = w;
  }

  function endResize() {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResize);
    window.removeEventListener('mouseup', endResize);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {}
  }

  // Context menu state — la cible est un meetingId, pas une position : la liste
  // affichée ici est FILTRÉE, ses index ne veulent rien dire ailleurs.
  let menuOpen = false;
  let menuX = 0;
  let menuY = 0;
  let menuId = null;
  // Le sélecteur de tag remplace le contenu du menu au lieu d'ouvrir un
  // sous-menu flottant : pas de second positionnement à tenir près des bords.
  let menuTagView = false;

  // Inline rename state
  let renamingId = null;
  let renameValue = '';
  let renameInput;

  function openMenu(event, id) {
    event.preventDefault();
    menuId = id;
    menuTagView = false;
    // Clamp position to viewport — le sélecteur de tag est plus haut que les
    // trois entrées de base, la réserve tient compte du plus grand des deux.
    const menuW = 190,
      menuH = 150;
    // Activation clavier du bouton ⋯ : pas de coordonnées → ancrer sur le bouton.
    let x = event.clientX,
      y = event.clientY;
    if (!x && !y && event.currentTarget?.getBoundingClientRect) {
      const r = event.currentTarget.getBoundingClientRect();
      x = r.left;
      y = r.bottom;
    }
    menuX = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
    menuY = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));
    menuOpen = true;
  }

  function closeMenu() {
    menuOpen = false;
    menuId = null;
    menuTagView = false;
  }

  /** Range depuis le menu contextuel. L'échec est silencieux ici : `tagMeeting`
   *  a déjà rétracté la pastille, et l'utilisateur voit le tag ne pas tenir. */
  async function pickTagFromMenu(tagId) {
    const id = menuId;
    closeMenu();
    if (id) await tagMeeting(id, tagId);
  }

  function manageTagsFromMenu() {
    closeMenu();
    onMenuAction('tags');
  }

  async function startRename() {
    const id = menuId;
    const item = id && filteredHistory.find((m) => meetingIdOf(m) === id);
    if (!item) return closeMenu();
    renamingId = id;
    renameValue = item.title || item.name || '';
    closeMenu();
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      renameMeeting(renamingId, trimmed);
    }
    renamingId = null;
    renameValue = '';
  }

  function cancelRename() {
    renamingId = null;
    renameValue = '';
  }

  function handleRenameKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  }

  function deleteFromMenu() {
    const id = menuId;
    closeMenu();
    if (id) onDeleteHistory(id);
  }

  /**
   * Geste de la colonne (boutons de la carte du compte, « Se déconnecter ») :
   * c'est App qui aiguille. Plus de popover derrière le nom : l'identité, la
   * langue et le mot de passe sont la page « Mon profil » des réglages, la
   * sortie ferme leur colonne.
   */
  function menuAction(id) {
    onMenuAction(id);
  }

  // ── Mode réglages ─────────────────────────────────────────────────────────
  // Un panneau à sections est ouvert (« Réglages », Administration) :
  // ses sections s'affichent ICI, à la place de l'historique — une seule
  // colonne de navigation, au même endroit quel que soit l'écran. « Nouvelle
  // réunion » et la ligne profil restent visibles : en sortir ne demande pas
  // de savoir où l'on est. Le panneau enregistre sa liste dans
  // stores/panels.js ; la garde sur `owner` couvre la transition config ⇄
  // admin, où l'ancien panneau n'est pas encore démonté.
  $: settingsNav = $activePanel && $panelNav.owner === $activePanel ? $panelNav : null;
  // Les entrées LIEN (« Aide ») et GESTE (« Se déconnecter ») sortent de la
  // liste d'onglets : ni l'un ni l'autre n'est un onglet, et un lecteur
  // d'écran en compterait de trop. Leur intertitre suit la même règle, en
  // reprenant là où les onglets s'arrêtent ; sans groupe, un filet les sépare.
  $: navSections = settingsNav
    ? settingsNav.items.filter((item) => !item.href && !item.action)
    : [];
  $: navExtras = settingsNav ? settingsNav.items.filter((item) => item.href || item.action) : [];
  $: navExtraGroups = navExtras.map((entry, i) => {
    const prev = i ? navExtras[i - 1] : navSections[navSections.length - 1];
    return entry.group && entry.group !== prev?.group ? entry.group : '';
  });

  // Sections rangées par groupe, dans l'ordre de la liste — un groupe s'ouvre
  // quand la valeur CHANGE (cf. stores/panels.js). Deux rendus pour la même
  // structure : des intertitres (Réglages), ou des RUBRIQUES qu'on replie
  // (Administration, `collapsible`) — son icône sur la rubrique, ses pages en
  // retrait dessous, comme dans MIA.
  $: navCollapsible = !!settingsNav?.collapsible;
  $: navGroups = navSections.reduce((groups, item) => {
    const key = item.groupId || item.group || '';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: item.group || '', icon: item.groupIcon, items: [item] });
    return groups;
  }, []);
  // Une section SANS groupe en fin de liste (« Outils » des réglages) descend
  // en pied de colonne : le filet passe au-dessus d'elle, et les liens la
  // suivent sans rupture. Sous « Ma bibliothèque » sans rien pour l'en
  // détacher, elle aurait eu l'air d'en faire partie.
  $: navFoot = !navCollapsible && navGroups.length > 1 && !navGroups[navGroups.length - 1].key;
  // Rubrique repliée : sa pastille réunit celles de ses pages, qu'on ne voit
  // plus. Dépliée, chaque page porte la sienne — la doubler ferait du bruit.
  $: navGroupAlerts = Object.fromEntries(
    navGroups.map((group) => [group.key, mergeAlerts(group.items.map((item) => item.alert))]),
  );

  // Le pli est mémorisé par appareil : on replie ce dont on ne se sert pas.
  const NAV_FOLDS_KEY = 'mybrief_nav_folds';
  let foldedRubrics = (() => {
    try {
      const stored = JSON.parse(localStorage.getItem(NAV_FOLDS_KEY) || '[]');
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  })();
  function setFolds(next) {
    foldedRubrics = next;
    try {
      localStorage.setItem(NAV_FOLDS_KEY, JSON.stringify([...next]));
    } catch {}
  }
  function toggleRubric(key) {
    const next = new Set(foldedRubrics);
    if (!next.delete(key)) next.add(key);
    setFolds(next);
  }
  // Arriver sur une page déplie SA rubrique (ouverture du panneau, lien d'un
  // autre écran, pastille) : la page affichée ne peut pas être introuvable
  // dans la colonne. Une fois sur la page, la replier reste permis — d'où la
  // mémoire de la dernière page dépliée, sans laquelle le pli se rouvrirait
  // sous le doigt.
  let unfoldedFor = '';
  $: if (!navCollapsible) unfoldedFor = '';
  $: if (navCollapsible && settingsNav.active !== unfoldedFor) {
    unfoldedFor = settingsNav.active;
    const rubric = navGroups.find((group) => group.items.some((item) => item.id === unfoldedFor));
    if (rubric && foldedRubrics.has(rubric.key)) {
      const next = new Set(foldedRubrics);
      next.delete(rubric.key);
      setFolds(next);
    }
  }

  function pickSection(id) {
    selectPanelSection(id);
    // Tiroir (téléphone, tablette) : la section choisie s'affiche DERRIÈRE —
    // même règle que l'historique et le menu profil, il se referme.
    if (isDrawerWidth(window.innerWidth) && isOpen) onToggle();
  }

  // ── Recherche dans les réglages ──────────────────────────────────────────
  // En mode réglages, la pilule sous « Nouvelle réunion » cherche un réglage
  // au lieu d'une réunion, et ses résultats prennent la place des sections
  // (stores/settingsSearch.js). Ctrl K (⌘ K) y mène de partout : il ouvre
  // « Réglages » au besoin, et déplie le rail replié.
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const searchShortcut = isMac ? '⌘ K' : 'Ctrl K';
  let settingsField;
  let wantSearchFocus = false;
  $: if (wantSearchFocus && settingsField && settingsNav && isOpen) {
    wantSearchFocus = false;
    tick().then(() => settingsField?.focus());
  }
  function openSettingsSearch() {
    if (!isOpen) onToggle();
    wantSearchFocus = true;
  }
  async function onSearchShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (event.key?.toLowerCase() !== 'k' || event.defaultPrevented) return;
    event.preventDefault();
    if (!settingsNav) {
      // App referme le tiroir en ouvrant un panneau : on attend qu'il l'ait
      // fait (isOpen à jour) avant de le rouvrir sur la recherche.
      onMenuAction('config');
      await tick();
    }
    openSettingsSearch();
  }
  /** Un résultat choisi : dans le tiroir, la page s'affiche derrière. */
  function afterSettingPick() {
    if (isDrawerWidth(window.innerWidth) && isOpen) onToggle();
  }

  /** Retour à l'écran principal (ferme le panneau ouvert côté App). Le tiroir,
   *  c'est App qui le referme, comme pour toute action du menu : le refermer
   *  aussi ICI le rouvrait — `isOpen` n'est pas encore à jour dans ce tick, et
   *  onToggle inversait la fermeture qu'App venait de faire. */
  function goHome() {
    onMenuAction('home');
  }
  /** Logo : l'écran d'accueil lui-même — App referme aussi la réunion affichée
   *  (jamais celle qui enregistre). Même règle de tiroir que goHome. */
  function goWelcome() {
    onMenuAction('welcome');
  }

  // ── Filtre par tag ────────────────────────────────────────────────────────
  // '' = tous · UNTAGGED = sans tag · sinon un tagId. Persisté : c'est une
  // façon de travailler ("je suis sur le client X"), pas un geste ponctuel.
  const TAG_FILTER_KEY = 'mybrief_tag_filter';
  const UNTAGGED = '__untagged__';

  let tagFilter = (() => {
    try {
      return localStorage.getItem(TAG_FILTER_KEY) || '';
    } catch {
      return '';
    }
  })();

  $: {
    try {
      if (tagFilter) localStorage.setItem(TAG_FILTER_KEY, tagFilter);
      else localStorage.removeItem(TAG_FILTER_KEY);
    } catch {}
  }

  /**
   * Un tagId qui n'est plus au catalogue (tag supprimé depuis un autre onglet,
   * filtre resté en localStorage) est traité comme « tous » : sinon la liste
   * resterait vide sans que rien à l'écran n'explique pourquoi.
   */
  function filterHistory(items, query, tag, byId) {
    const needle = query.trim().toLowerCase();
    const active = tag === UNTAGGED || byId.has(tag) ? tag : '';
    return items.filter((m) => {
      if (needle && !(m.title || m.name || '').toLowerCase().includes(needle)) return false;
      if (active === UNTAGGED) return !m.tagId;
      if (active) return m.tagId === active;
      return true;
    });
  }

  $: filteredHistory = filterHistory($historyItems, search, tagFilter, $tagsById);
  $: activeTagFilter = tagFilter === UNTAGGED || $tagsById.has(tagFilter) ? tagFilter : '';
  $: activeTag = $tagsById.get(activeTagFilter) || null;

  /**
   * Le filtre se choisit dans un MENU, pas dans une rangée de puces : au-delà
   * de trois tags, la rangée débordait de la colonne et se faisait couper en
   * plein milieu d'une puce. Le bouton porte la sélection en cours — un filtre
   * actif reste donc visible même sur l'écran le plus étroit.
   */
  let tagMenuOpen = false;
  /**
   * Recherche du menu de filtre, dès sept tags — le seuil de « Mes tags » :
   * en dessous, le menu se lit d'un coup d'œil. Même règle que le sélecteur
   * (utils/tagSearch.js) : un nom, ou ce que cite le contexte d'un tag.
   */
  const TAG_FILTER_SEARCH_FROM = 7;
  let tagFilterQuery = '';
  $: if (!tagMenuOpen) tagFilterQuery = '';
  $: filterTags = tagFilterQuery.trim()
    ? searchTags($tags, tagFilterQuery).map((r) => r.tag)
    : $tags;

  /** Recliquer la valeur déjà active revient à « Tous » — même geste qu'avant. */
  function pickTagFilter(value) {
    tagFilter = value && tagFilter === value ? '' : value;
    tagMenuOpen = false;
  }

  /**
   * Liste sous recherche mais SANS filtre de tag : c'est la base des compteurs
   * du menu et du bandeau — chaque entrée annonce ce qu'elle laisserait à
   * l'écran, recherche comprise.
   */
  $: searchScoped = filterHistory($historyItems, search, '', $tagsById);
  $: untaggedCount = searchScoped.filter((m) => !m.tagId).length;
  $: tagCounts = searchScoped.reduce((acc, m) => {
    if (m.tagId) acc.set(m.tagId, (acc.get(m.tagId) || 0) + 1);
    return acc;
  }, new Map());

  /**
   * Combien de réunions le TAG seul retire — la recherche est exclue du compte :
   * elle est visible dans son champ, contrairement au filtre.
   *
   * Le filtre par tag est persisté : rouvert des jours plus tard (app native,
   * PWA — leurs localStorage sont distincts), il tronque la liste sans geste
   * récent qui l'explique. Une réunion neuve naissant sans tag, elle
   * n'apparaît jamais — « je ne récupère pas mes dernières réunions ». Le
   * bandeau annonce ce que le filtre masque et porte la sortie en un clic.
   */
  $: hiddenByTag = activeTagFilter ? searchScoped.length - filteredHistory.length : 0;

  // Groupes par ancienneté, dans la langue du lecteur (utils/historyGroups.js) :
  // le `weekLabel` de /history est rédigé en français.
  $: weekGroups = groupHistory(filteredHistory, $currentLanguageStore, $uiText.sidebar);

  /**
   * Réunion dont l'enregistrement tourne — sa ligne s'affiche en italique.
   *
   * L'identifiant seul ne suffit pas : il reste posé le temps que l'arrêt se
   * termine côté réseau. C'est la conjonction avec l'état d'enregistrement qui
   * fait foi, sinon une ligne resterait en italique après la fin de la réunion.
   */
  $: liveId = $isRecording || $isPaused ? $liveMeetingIdStore : null;

  // Indexé sur la CLÉ du groupe, pas son libellé : un groupe replié le reste
  // au changement de langue.
  let openWeeks = {};
  function toggleWeek(key) {
    const current = openWeeks[key] !== false; // open by default
    openWeeks = { ...openWeeks, [key]: !current };
  }
</script>

<aside
  class="sb"
  class:sb-closed={!isOpen}
  class:sb-resizing={resizing}
  style={isOpen ? `width:${sidebarWidth}px; --sb-open-w:${sidebarWidth}px` : ''}
>
  <!-- Brand header : logo + wordmark (copié du Side Container Figma).
       Le bloc est CLIQUABLE : retour à l'écran d'accueil (panneau de réglages
       et réunion affichée refermés) — même réflexe que sur n'importe quel site. -->
  <div class="sb-header">
    <button
      class="sb-home-btn"
      on:click={goWelcome}
      title={$uiText.sidebar.backHome}
      aria-label={$uiText.sidebar.backHome}
    >
      <img src={$branding.logo || logoUrl} alt="MyBrief" class="sb-logo" />
      <span class="sb-brand">
        <span class="sb-wordmark">MyBrief</span>
        <span class="sb-subtitle"
          >{brandingTagline($branding, $currentLanguageStore) || $uiText.sidebar.tagline}</span
        >
      </span>
    </button>
    <button
      class="sb-archive-btn"
      title={isOpen ? $uiText.buttons.close : $uiText.buttons.open}
      aria-label={isOpen ? $uiText.buttons.close : $uiText.buttons.open}
      on:click={onToggle}
    >
      <IconSidebarToggle width="18" height="18" />
    </button>
  </div>

  <!-- Nouvelle Réunion + Search : deux pills connectées (Side Inner Container).
       Mode réglages : la recherche fouille les réglages au lieu de
       l'historique — même place, même geste. -->
  <div class="sb-pillstack">
    {#if screen !== 'recording'}
      <button class="sb-new-btn" on:click={onNewMeeting}>
        <span class="sb-new-icon">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M6 1.5v9M1.5 6h9"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <span class="sb-new-label">{$uiText.sidebar.newMeeting}</span>
      </button>
    {/if}
    {#if settingsNav}
      <SettingsSearchField
        bind:this={settingsField}
        idPrefix="sb-settings-search"
        shortcut={searchShortcut}
        onPicked={afterSettingPick}
      />
    {:else}
      <div class="sb-search">
        <IconSearch width="14" height="14" class="sb-search-icon" />
        <input
          bind:value={search}
          placeholder={$uiText.sidebar.searchPlaceholder}
          class="sb-search-input"
          aria-label={$uiText.ariaLabels.searchMeeting}
        />
      </div>
    {/if}
  </div>

  <!-- Active meeting pill — visible only when a meeting is actually in progress -->
  {#if $isRecording || $isPaused}
    <div class="sb-active-wrap">
      <button
        class="sb-active-pill"
        on:click={onGoToLive}
        aria-label={$uiText.ariaLabels.goToLiveTranscription}
      >
        <span class="sb-active-name"
          >{userName
            ? $uiText.sidebar.meetingOf.replace('{name}', userName)
            : $uiText.sidebar.liveLabel}</span
        >
        <div class="sb-live-dot" aria-label={$uiText.ariaLabels.recordingInProgress}></div>
      </button>
    </div>
  {/if}

  {#if settingsNav}
    <!-- Sections du panneau ouvert — la colonne troque l'historique contre le
         menu des réglages. Rail replié : icônes seules, libellés en title. -->
    <nav class="sb-nav" aria-label={settingsNav.title}>
      <!-- Sortie EXPLICITE en tête de colonne : revenir à l'historique et à la
           transcription sans chercher le bouton fermer du panneau. Un lien
           court au-dessus du titre (« ‹ Accueil ») plutôt qu'un gros bouton
           orange : il se lit comme un fil d'Ariane, et rend 50 px aux
           sections. Rail replié : la maison seule. -->
      <button
        class="sb-nav-back"
        title={$uiText.sidebar.backHome}
        aria-label={$uiText.sidebar.backHome}
        on:click={goHome}
      >
        <IconChevronLeft width="13" height="13" class="sb-nav-back-chevron" aria-hidden="true" />
        <IconHome width="18" height="18" class="sb-nav-back-home" aria-hidden="true" />
        <span class="sb-nav-label">{$uiText.sidebar.home}</span>
      </button>
      <div class="sb-nav-head">{settingsNav.title}</div>
      <!-- Rail replié : la pilule de recherche est masquée, une loupe la
           remplace — elle déplie la colonne et donne le focus au champ. -->
      <button
        class="sb-nav-item sb-nav-search"
        title="{$uiText.settingsSearch.open} ({searchShortcut})"
        aria-label={$uiText.settingsSearch.open}
        on:click={openSettingsSearch}
      >
        <span class="sb-nav-icon" aria-hidden="true">
          <IconSearch width="16" height="16" />
        </span>
      </button>
      {#if isOpen && $settingsQuery.trim()}
        <!-- Une recherche en cours : ses résultats à la place des sections
             (pas sur le rail replié, trop étroit : les icônes y restent). -->
        <SettingsSearchResults idPrefix="sb-settings-search" onPicked={afterSettingPick} />
      {:else}
        <!-- Réglages : une liste d'onglets sous des intertitres. Administration
           (`collapsible`) : des rubriques qu'on replie — plus une liste
           d'onglets au sens de l'ARIA (un bouton de rubrique n'est pas un
           onglet), la page ouverte se dit par `aria-current`. -->
        <div
          class="sb-nav-items"
          role={navCollapsible ? undefined : 'tablist'}
          aria-orientation={navCollapsible ? undefined : 'vertical'}
          aria-label={navCollapsible ? undefined : settingsNav.title}
        >
          {#each navGroups as group, groupIndex (group.key)}
            <!-- Une entrée SANS rubrique (le tableau de bord de l'administration)
               reste une entrée simple, avec son icône, au-dessus des rubriques. -->
            {@const rubric = navCollapsible && !!group.key}
            {@const folded = rubric && foldedRubrics.has(group.key)}
            {#if rubric}
              <button
                class="sb-nav-rubric"
                aria-expanded={!folded}
                aria-controls="sb-rubric-{group.key}"
                on:click={() => toggleRubric(group.key)}
              >
                <span class="sb-nav-icon" aria-hidden="true">
                  <svelte:component this={group.icon} width="16" height="16" />
                </span>
                <span class="sb-nav-label">{group.label}</span>
                {#if folded && navGroupAlerts[group.key]}
                  <ConfigAlertDot
                    level={navGroupAlerts[group.key].level}
                    items={navGroupAlerts[group.key].items}
                  />
                {/if}
                <IconChevronDown width="13" height="13" class="sb-nav-chevron" aria-hidden="true" />
              </button>
            {:else if group.label}
              <!-- Intertitre à chaque CHANGEMENT de groupe : l'ordre des entrées
                 reste la seule source de vérité, aucun groupe ne peut être
                 vide ni orphelin. -->
              <div class="sb-nav-group">{group.label}</div>
            {:else if navFoot && groupIndex === navGroups.length - 1}
              <!-- Pied de colonne : le filet, puis la section sans groupe. -->
              <div class="sb-nav-rule" role="presentation"></div>
            {/if}
            <!-- `role="none"` hors rubriques : l'enveloppe ne s'interpose pas
               entre la liste d'onglets et ses onglets. -->
            <div
              id={rubric ? `sb-rubric-${group.key}` : undefined}
              class="sb-nav-sub"
              class:sb-nav-sub-rubric={rubric}
              class:sb-nav-sub-folded={folded}
              role={rubric ? 'group' : 'none'}
              aria-label={rubric ? group.label : undefined}
            >
              {#each group.items as item (item.id)}
                <button
                  class="sb-nav-item"
                  class:sb-nav-item-active={settingsNav.active === item.id}
                  class:sb-nav-item-alert={!!item.alert}
                  role={navCollapsible ? undefined : 'tab'}
                  aria-selected={navCollapsible ? undefined : settingsNav.active === item.id}
                  aria-current={navCollapsible && settingsNav.active === item.id
                    ? 'page'
                    : undefined}
                  title={item.alert ? undefined : item.label}
                  on:click={() => pickSection(item.id)}
                >
                  <span class="sb-nav-icon" aria-hidden="true">
                    <svelte:component this={item.icon} width="16" height="16" />
                  </span>
                  <span class="sb-nav-text">
                    <span class="sb-nav-label">{item.label}</span>
                    <!-- Écran tactile, pas de survol pour ouvrir la bulle : la
                       phrase la plus grave s'écrit sous le libellé. Masquée
                       aux lecteurs d'écran, qui l'ont déjà en description. -->
                    {#if item.alert}
                      <span class="sb-nav-alert-text" aria-hidden="true"
                        >{item.alert.items[0].text}</span
                      >
                    {/if}
                  </span>
                  {#if item.alert}
                    <!-- Rail replié : plus de libellé à l'écran, la bulle le porte. -->
                    <ConfigAlertDot
                      level={item.alert.level}
                      items={item.alert.items}
                      title={isOpen ? '' : item.label}
                      placement={isOpen ? 'inline' : 'corner'}
                    />
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        </div>
        {#if navExtras.length}
          <!-- Liens (nouvel onglet) et gestes (« Se déconnecter »), hors de la
             liste d'onglets. Sans groupe, un filet les sépare des sections. -->
          <div
            class="sb-nav-items sb-nav-links"
            class:sb-nav-links-ruled={!navExtras[0].group && !navFoot}
          >
            {#each navExtras as entry, i (entry.id)}
              {#if navExtraGroups[i]}
                <div class="sb-nav-group">{navExtraGroups[i]}</div>
              {/if}
              {#if entry.href}
                <a
                  class="sb-nav-item sb-nav-link"
                  href={entry.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={entry.label}
                  aria-label="{entry.label} ({$uiText.ariaLabels.newTab})"
                >
                  <span class="sb-nav-icon" aria-hidden="true">
                    <svelte:component this={entry.icon} width="16" height="16" />
                  </span>
                  <span class="sb-nav-label">{entry.label}</span>
                  <span class="sb-nav-ext" aria-hidden="true">
                    <IconExternal width="13" height="13" />
                  </span>
                </a>
              {:else}
                <button
                  class="sb-nav-item"
                  class:sb-nav-danger={entry.danger}
                  title={entry.label}
                  aria-label={entry.label}
                  on:click={() => menuAction(entry.action)}
                >
                  <span class="sb-nav-icon" aria-hidden="true">
                    <svelte:component this={entry.icon} width="16" height="16" />
                  </span>
                  <span class="sb-nav-label">{entry.label}</span>
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      {/if}
    </nav>
  {:else}
    <!-- Filtre par tag — masqué tant qu'aucun tag n'existe : un filtre vide
       n'apprend rien et vole une ligne à l'historique. Menu déroulant plutôt
       qu'une rangée de puces : elle débordait de la colonne dès trois tags. -->
    {#if $tags.length > 0}
      <div class="sb-tagbar">
        <button
          class="sb-tagmenu-btn"
          class:sb-tagmenu-btn-on={!!activeTagFilter}
          class:sb-tagmenu-btn-open={tagMenuOpen}
          on:click|stopPropagation={() => (tagMenuOpen = !tagMenuOpen)}
          aria-haspopup="menu"
          aria-expanded={tagMenuOpen}
          aria-label={$uiText.sidebar.filterLabel}
        >
          {#if activeTag}
            <TagChip tag={activeTag} />
          {:else if activeTagFilter === UNTAGGED}
            <IconTag width="14" height="14" aria-hidden="true" />
            <span class="sb-tagmenu-current">{$uiText.sidebar.filterUntagged}</span>
          {:else}
            <IconTag width="14" height="14" aria-hidden="true" />
            <span class="sb-tagmenu-current">{$uiText.sidebar.filterLabel}</span>
          {/if}
          <IconChevronDown width="13" height="13" class="sb-tagmenu-caret" aria-hidden="true" />
        </button>

        {#if tagMenuOpen}
          <div class="sb-tagmenu" on:click|stopPropagation role="menu">
            {#if $tags.length >= TAG_FILTER_SEARCH_FROM}
              <label class="sb-tagmenu-search">
                <IconSearch width="14" height="14" aria-hidden="true" />
                <input
                  type="search"
                  bind:value={tagFilterQuery}
                  placeholder={$uiText.sidebar.tagSearch}
                  aria-label={$uiText.sidebar.tagSearch}
                  autocomplete="off"
                />
              </label>
            {/if}
            <button
              class="sb-tagmenu-item"
              class:sb-tagmenu-on={!activeTagFilter}
              role="menuitemradio"
              aria-checked={!activeTagFilter}
              on:click={() => pickTagFilter('')}
            >
              <span class="sb-tagmenu-label">{$uiText.sidebar.filterAll}</span>
              <span class="sb-tagmenu-count">{searchScoped.length}</span>
            </button>
            {#each filterTags as tag (tag.id)}
              <button
                class="sb-tagmenu-item"
                class:sb-tagmenu-on={activeTagFilter === tag.id}
                role="menuitemradio"
                aria-checked={activeTagFilter === tag.id}
                on:click={() => pickTagFilter(tag.id)}
              >
                <TagChip {tag} />
                <span class="sb-tagmenu-count">{tagCounts.get(tag.id) || 0}</span>
              </button>
            {:else}
              <span class="sb-tagmenu-empty">{$uiText.sidebar.tagNoMatch}</span>
            {/each}
            <div class="sb-tagmenu-sep"></div>
            <button
              class="sb-tagmenu-item"
              class:sb-tagmenu-on={activeTagFilter === UNTAGGED}
              role="menuitemradio"
              aria-checked={activeTagFilter === UNTAGGED}
              on:click={() => pickTagFilter(UNTAGGED)}
            >
              <span class="sb-tagmenu-label">{$uiText.sidebar.filterUntagged}</span>
              <span class="sb-tagmenu-count">{untaggedCount}</span>
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Bandeau de filtre actif : dit ce que le filtre masque et porte la
       sortie en un clic — le bouton du menu, lui, ne dit pas les conséquences. -->
    {#if activeTagFilter && hiddenByTag > 0}
      <div class="sb-filterbar">
        <span class="sb-filterbar-text">
          {hiddenByTag === 1
            ? $uiText.sidebar.filterHiddenOne
            : ($uiText.sidebar.filterHiddenMany ?? '').replace('{n}', String(hiddenByTag))}
        </span>
        <button class="sb-filterbar-reset" on:click={() => (tagFilter = '')}>
          {$uiText.sidebar.filterReset}
        </button>
      </div>
    {/if}

    <!-- Meeting list -->
    <div class="sb-list">
      {#if $isLoadingHistory && $historyItems.length === 0}
        <div class="sb-loading" role="status" aria-live="polite">
          <div class="sb-spinner" aria-hidden="true"></div>
          <span>{$uiText.sidebar.loading}</span>
        </div>
      {:else if weekGroups.length === 0}
        <div class="sb-empty">
          {activeTagFilter ? $uiText.sidebar.noMeetingsForTag : $uiText.sidebar.noMeetings}
        </div>
      {:else}
        {#each weekGroups as { key, label, meetings } (key)}
          <div class="sb-week">
            <button class="sb-week-btn" on:click={() => toggleWeek(key)}>
              <IconChevron
                width="11"
                height="11"
                class="sb-chevron {openWeeks[key] !== false ? 'sb-chevron-open' : ''}"
              />
              <span class="sb-week-label">{label}</span>
              <div class="sb-week-line"></div>
            </button>
            {#if openWeeks[key] !== false}
              <div class="sb-week-items">
                {#each meetings as item (meetingIdOf(item) || filteredHistory.indexOf(item))}
                  {@const id = meetingIdOf(item)}
                  {@const writing = id != null && $generatingMeetingIds.has(id)}
                  <div
                    class="sb-item"
                    class:sb-item-selected={id != null && $selectedMeetingId === id}
                    class:sb-item-live={id != null && id === liveId}
                    class:sb-item-writing={writing}
                    on:click={() => {
                      if (renamingId !== id) onSelectHistory(id);
                    }}
                    on:contextmenu={(e) => openMenu(e, id)}
                    on:keydown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && renamingId !== id)
                        onSelectHistory(id);
                    }}
                    role="button"
                    tabindex="0"
                  >
                    {#if renamingId != null && renamingId === id}
                      <input
                        class="sb-item-rename"
                        bind:this={renameInput}
                        bind:value={renameValue}
                        on:keydown={handleRenameKey}
                        on:blur={commitRename}
                        on:click|stopPropagation
                        maxlength="120"
                      />
                    {:else}
                      {#if item.tagId && $tagsById.has(item.tagId)}
                        <span class="sb-item-tag">
                          <TagChip tag={$tagsById.get(item.tagId)} compact />
                        </span>
                      {/if}
                      <!-- Jamais `item.name` en repli : c'est le nom du COMPTE, et
                           toutes les réunions sans titre porteraient le même
                           libellé. Le titre arrive déjà replié sur « Réunion
                           JJ-MM-AAAA HH:MM » (stores/history.js →
                           resolveHistoryTitle). -->
                      <span
                        class="sb-item-name"
                        title={writing
                          ? `${item.title || ''} — ${$uiText.sidebar.summaryWriting}`
                          : item.title || ''}
                        >{item.title || $uiText.sidebar.defaultMeetingTitle}</span
                      >
                      {#if writing}
                        <!-- Compte rendu en cours de rédaction : le reflet qui
                             traverse le titre (CSS) ne se lit pas — ce libellé,
                             hors écran, le dit aux lecteurs d'écran. -->
                        <span class="sb-item-writing-label">{$uiText.sidebar.summaryWriting}</span>
                      {/if}
                      {#if item.titlePending}
                        <!-- Titre en cours de génération (« Enregistrer » sans
                             résumé, ou compte rendu en cours) : la même
                             étincelle que l'onglet de résumé en attente. Le
                             libellé daté reste lisible dessous, le vrai titre le
                             remplace à la chute du drapeau (pollHistoryUntilMeetingReady). -->
                        <span
                          class="sb-item-naming"
                          role="img"
                          aria-label={$uiText.sidebar.titlePending}
                          title={$uiText.sidebar.titlePending}
                        >
                          <SparkleIcon />
                        </span>
                      {/if}
                    {/if}
                    <span class="sb-item-date">{item.date || ''}</span>
                    <!-- Tactile : renommer/tag/supprimer n'existent qu'au clic droit
                       et au survol — ce bouton ouvre le même menu au doigt. -->
                    <button
                      type="button"
                      class="sb-item-menu"
                      on:click|stopPropagation={(e) => openMenu(e, id)}
                      aria-label={$uiText.ariaLabels.openMenu}
                    >
                      ⋯
                    </button>
                    <button
                      type="button"
                      class="sb-item-delete"
                      on:click|stopPropagation={() => onDeleteHistory(id)}
                      aria-label={$uiText.ariaLabels.deleteThisMeeting}
                    >
                      <IconTrash width="13" height="13" style="color: rgb(210,60,60)" />
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Carte du compte (bas de la colonne) : l'avatar cerclé du crédit de
       temps, le nom, ce qu'il reste du mois — puis les deux boutons qui mènent
       aux deux espaces, « Réglages » et « Admin » (AccountActions). La carte
       elle-même ne s'ouvre pas : ce qu'elle déroulait (identité, langue, mot
       de passe, « Ce mois-ci ») est devenu des pages des réglages. Sur
       téléphone (≤ 768 px), masquée : la barre d'app (MobileAppBar) porte
       l'avatar et les mêmes boutons, le tiroir ne garde que la navigation. -->
  <div class="sb-user">
    <div class="sb-user-details" title={capsuleTitle}>
      <CreditAvatar
        initials={me.initials}
        picture={me.picture}
        provider={me.provider}
        title={me.providerLabel}
        size={32}
      />
      <span class="sb-user-text">
        <span class="sb-user-name">{userName ?? $uiText.account.guest}</span>
        {#if capsuleLine}
          <span class="sb-user-line" class:sb-user-line-out={creditOut}>{capsuleLine}</span>
        {/if}
      </span>
    </div>
    <AccountActions onAction={menuAction} {configAlert} {adminAlert} compact={!isOpen} />
  </div>

  <!-- « Quoi de neuf ? » et le numéro de version, sur téléphone seulement, à
       la place de la ligne de compte (masquée) : le badge du coin y recouvrait
       « Terminer » et les boutons du bas. WhatsNewBadge masque l'un ou l'autre
       selon la largeur. -->
  <WhatsNewBadge placement="drawer" />

  {#if isOpen}
    <div
      class="sb-resize-handle"
      on:mousedown={startResize}
      on:dblclick={() => {
        sidebarWidth = 280;
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, '280');
        } catch {}
      }}
      role="separator"
      aria-orientation="vertical"
      aria-label={$uiText.sidebar.resizeLabel}
      title={$uiText.sidebar.resizeHint}
    ></div>
  {/if}
</aside>

<svelte:window
  on:click={() => {
    if (menuOpen) closeMenu();
    if (tagMenuOpen) tagMenuOpen = false;
  }}
  on:keydown={(e) => {
    if (e.key === 'Escape') {
      if (menuOpen) closeMenu();
      if (tagMenuOpen) tagMenuOpen = false;
    }
    onSearchShortcut(e);
  }}
/>

{#if menuOpen}
  <div class="ctx-menu" style="left:{menuX}px;top:{menuY}px" on:click|stopPropagation role="menu">
    {#if menuTagView}
      <button class="ctx-item ctx-item-back" on:click={() => (menuTagView = false)}>
        <IconChevron width="12" height="12" class="ctx-chevron-back" />
        {$uiText.sidebar.tagBack}
      </button>
      <div class="ctx-sep"></div>
      <TagPicker
        selectedId={$historyItems.find((m) => meetingIdOf(m) === menuId)?.tagId ?? null}
        onPick={pickTagFromMenu}
        onManage={manageTagsFromMenu}
      />
    {:else}
      <button class="ctx-item" on:click={startRename}>
        <IconPen width="14" height="14" />
        {$uiText.sidebar.rename}
      </button>
      <button class="ctx-item" on:click={() => (menuTagView = true)}>
        <IconTag width="14" height="14" />
        {$uiText.sidebar.tagMenu}
        <IconChevron width="12" height="12" class="ctx-chevron" />
      </button>
      <button class="ctx-item ctx-item-danger" on:click={deleteFromMenu}>
        <IconTrash width="14" height="14" />
        {$uiText.sidebar.delete}
      </button>
    {/if}
  </div>
{/if}

<style>
  .sb {
    width: 280px;
    flex-shrink: 0;
    height: 100vh;
    /* 100dvh : sinon la barre d'adresse mobile recouvre la ligne user
       (profil, langue, réglages) en bas du drawer. */
    height: 100dvh;
    background: var(--mb-bg-app);
    border-right: 1px solid var(--mb-border-card); /* Separator 1:292 Figma */
    display: flex;
    flex-direction: column;
    font-family: 'Lexend', sans-serif;
    overflow: hidden;
    transition:
      width 0.3s cubic-bezier(0.33, 1, 0.68, 1),
      opacity 0.25s cubic-bezier(0.33, 1, 0.68, 1),
      transform 0.3s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .sb-closed {
    width: 64px;
    opacity: 1;
    overflow: visible;
  }

  /* Rail replié : toggle en haut, avatar + réglages en bas — reste masqué */
  .sb-closed .sb-pillstack,
  .sb-closed .sb-active-wrap,
  .sb-closed .sb-list {
    display: none;
  }

  /* Rail replié + mode réglages : les sections restent atteignables en
     icônes seules (title = libellé) — sans elles, panneau ouvert sur rail
     replié n'aurait PLUS AUCUN sélecteur de section sur desktop. */
  .sb-closed .sb-nav {
    padding: 12px 0;
  }
  .sb-closed .sb-nav-head,
  .sb-closed .sb-nav-label {
    display: none;
  }
  .sb-closed .sb-nav-back {
    align-self: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    margin-bottom: 4px;
    color: var(--mb-orange);
  }
  .sb-closed .sb-nav-back :global(.sb-nav-back-chevron) {
    display: none;
  }
  .sb-closed .sb-nav-back :global(.sb-nav-back-home) {
    display: inline-flex;
  }
  .sb-closed .sb-nav-items {
    align-items: center;
  }
  .sb-closed .sb-nav-item {
    width: 40px;
    min-height: 40px;
    padding: 0;
    justify-content: center;
  }
  /* Rubriques : sur le rail, toutes leurs pages restent là, en icônes — le
     bouton de rubrique n'est plus qu'un filet, comme un intertitre. */
  .sb-closed .sb-nav-rubric {
    min-height: 0;
    width: 22px;
    height: 1px;
    padding: 0;
    margin: 8px auto;
    border: none;
    border-radius: 0;
    background: var(--mb-border-default);
    overflow: hidden;
    pointer-events: none;
  }
  .sb-closed .sb-nav-rubric > :global(*) {
    display: none;
  }
  .sb-closed .sb-nav-sub-rubric {
    margin: 0;
    padding: 0;
    border: none;
    align-items: center;
  }
  .sb-closed .sb-nav-links-ruled {
    border-top: none;
    margin-top: 0;
    padding-top: 0;
  }

  .sb-closed .sb-header {
    position: relative;
    flex-direction: column;
    /* header expanded : padding-top 22px + logo 49px centré par align-items,
       bouton 28px => son bord haut est à 22 + (49-28)/2 = 32.5px. Reproduit ici
       pour que le bouton reste à la même hauteur, replié ou déplié. gap 0 : le
       bouton d'accueil, vide ici (logo en absolu, texte masqué), repoussait
       sinon le bouton de 12px sous le logo qu'il remplace au survol. */
    gap: 0;
    padding: 32.5px 0 4px;
  }

  .sb-closed .sb-brand {
    display: none;
  }

  /* Rail replié : logo statique par défaut, icône toggle (sb-archive-btn) au
     survol du bouton — même emplacement, l'un remplace l'autre. Le logo est en
     position:absolute donc il peint au-dessus du bouton : il doit disparaître
     au survol, sinon les deux icônes se superposent. */
  .sb-closed .sb-logo {
    display: block;
    position: absolute;
    /* centré sur le bouton : 32.5 + (28-30)/2 */
    top: 31.5px;
    left: 50%;
    transform: translateX(-50%);
    width: 26px;
    height: 30px;
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.15s;
  }

  .sb-closed .sb-header:has(.sb-archive-btn:hover) .sb-logo,
  .sb-closed .sb-header:has(.sb-archive-btn:focus-visible) .sb-logo {
    opacity: 0;
  }

  .sb-closed .sb-archive-btn :global(svg) {
    opacity: 0;
    transition: opacity 0.15s;
  }

  .sb-closed .sb-archive-btn:hover :global(svg),
  .sb-closed .sb-archive-btn:focus-visible :global(svg) {
    opacity: 1;
  }

  /* Au doigt, pas de survol pour révéler le bouton : l'icône prend la place du
     logo en permanence. Le rail est l'état de départ d'une tablette en portrait
     (stores/sidebar.js) — sans elle, rien n'y dit comment rouvrir l'historique. */
  @media (hover: none) {
    .sb-closed .sb-logo {
      opacity: 0;
    }
    .sb-closed .sb-archive-btn :global(svg) {
      opacity: 1;
    }
  }

  /* Rail replié : la carte se réduit à l'avatar cerclé, les deux boutons en
     icônes au-dessus. */
  .sb-closed .sb-user {
    margin: auto 0 18px;
    padding: 0;
    border: none;
    background: transparent;
    flex-direction: column-reverse;
    align-items: center;
    gap: 8px;
  }

  .sb-closed .sb-user-details {
    flex: none;
    padding: 2px;
  }

  .sb-closed .sb-user-text {
    display: none;
  }

  /* Mobile: drawer overlay */
  @media (max-width: 768px) {
    .sb {
      position: fixed;
      top: 0;
      left: 0;
      /* !important : la largeur redimensionnée au drag (style inline,
         persistée jusqu'à 480px) déborderait sinon d'un petit écran et
         pousserait les boutons (fermer, langue, réglages) hors champ. */
      width: min(85vw, 320px) !important;
      /* Échelle mobile (voir .mobile-appbar dans style.css) : au-dessus du
         backdrop (8600) et de la barre d'app, sous les modales (9999+). */
      z-index: 8700;
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
      transform: translateX(0);
      /* Encoche + indicateur home (viewport-fit=cover / contentInset never) :
         sans ces marges, le header et la ligne profil passent dessous. */
      padding-top: var(--safe-top, 0px);
      padding-bottom: var(--safe-bottom, 0px);
      padding-left: var(--safe-left, 0px);
    }

    .sb-closed {
      width: min(85vw, 320px) !important;
      opacity: 1;
      transform: translateX(-100%);
      box-shadow: none;
    }
  }

  /* Tablette en portrait, fenêtre étroite (769–1100 px, SIDEBAR_DRAWER_MAX_WIDTH
     de config/constants.js) : rail par défaut ; ouverte, la barre passe
     PAR-DESSUS la page au lieu de la pousser. La marge négative ne lui laisse
     occuper que la place du rail dans le flex d'.app-layout : la zone centrale
     garde sa largeur, et largeur et marge glissent du même pas — le bord de la
     page ne bouge pas pendant l'ouverture. Poussée, à 820 px, elle laissait
     ~150 px au document. Le voile : .sidebar-backdrop (style.css). */
  @media (min-width: 769px) and (max-width: 1100px) {
    .sb {
      /* Même échelle que le tiroir du téléphone : au-dessus du voile (8600),
         sous les modales (9999+). Positionnée : règle ≥ 769 px plus bas. */
      z-index: 8700;
      transition:
        width 0.3s cubic-bezier(0.33, 1, 0.68, 1),
        margin-right 0.3s cubic-bezier(0.33, 1, 0.68, 1),
        box-shadow 0.3s ease;
    }

    .sb:not(.sb-closed) {
      margin-right: calc(64px - var(--sb-open-w, 280px));
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.12);
    }
  }

  /* ── Brand header : logo mark + wordmark ── */
  .sb-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 22px 18px 4px;
  }

  .sb-logo {
    width: 43px;
    height: 49px;
    object-fit: contain;
    flex-shrink: 0;
    user-select: none;
  }

  /* Bloc logo+wordmark cliquable : reset de bouton, survol discret. */
  .sb-home-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 4px;
    margin: -4px;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: background 0.15s;
  }
  .sb-home-btn:hover {
    background: var(--mb-orange-10);
  }

  .sb-brand {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.05;
  }

  /* Wordmark — spec : Congenial Medium (propriétaire) ; fallback Lexend 500 */
  .sb-wordmark {
    font-family: 'Congenial', 'Lexend', sans-serif;
    font-weight: 500;
    font-size: 22px;
    color: #000;
    letter-spacing: -0.3px;
  }

  .sb-subtitle {
    font-family: 'Lexend', sans-serif;
    font-weight: 200;
    font-size: 11px;
    color: #000;
    margin-top: 1px;
  }

  .sb-archive-btn {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--mb-orange);
    flex-shrink: 0;
    transition:
      background 0.15s,
      opacity 0.15s;
  }

  .sb-archive-btn:hover {
    background: var(--mb-orange-10);
  }

  /* ── Search + Nouvelle Réunion : pills connectées ── */
  .sb-pillstack {
    display: flex;
    flex-direction: column;
    padding: 14px 18px 0;
  }

  .sb-search {
    position: relative;
    height: 40px;
    margin-top: -1px;
    border-radius: 0 0 var(--mb-radius-pill) var(--mb-radius-pill);
    background: rgba(255, 255, 255, 0.48);
    border: 1px solid rgba(162, 162, 162, 0.2);
    display: flex;
    align-items: center;
    padding-left: 34px;
  }

  .sb-search :global(.sb-search-icon) {
    position: absolute;
    left: 12px;
    pointer-events: none;
    color: var(--mb-text-placeholder);
  }

  .sb-search-input {
    background: transparent;
    border: none;
    outline: none;
    font-family: 'Lexend', sans-serif;
    font-weight: 300;
    font-size: 14px;
    color: #000;
    width: 100%;
  }

  .sb-search-input::placeholder {
    color: var(--mb-text-placeholder);
    font-weight: 300;
  }

  .sb-new-btn {
    width: 100%;
    height: 42px;
    border-radius: var(--mb-radius-pill) var(--mb-radius-pill) 0 0;
    background: var(--mb-orange-10);
    border: 1px solid var(--mb-orange-20);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    font-family: 'Lexend', sans-serif;
    font-size: 15px;
    font-weight: 400;
    color: var(--mb-orange);
    transition: background 0.15s;
  }

  /* Cercle orange plein + glyphe clair (Tag Icon Container Figma) */
  .sb-new-btn .sb-new-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--mb-orange);
    color: var(--mb-bg-warm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sb-new-btn:hover {
    background: var(--mb-orange-20);
  }

  /* Loupe de la recherche des réglages : sur le rail replié seulement — colonne
     ouverte, la pilule sous « Nouvelle réunion » la porte. */
  .sb:not(.sb-closed) .sb-nav-search {
    display: none;
  }
  .sb-closed .sb-nav-search {
    align-self: center;
    margin-bottom: 4px;
  }

  /* ── Mode réglages : sections du panneau ouvert ── */
  .sb-nav {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 14px 12px 16px;
  }
  /* « ‹ Accueil » : la sortie, en lien court au-dessus du titre. */
  .sb-nav-back {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 8px;
    border: none;
    border-radius: 6px;
    background: none;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    color: var(--brand-text);
    cursor: pointer;
    transition: background 0.15s;
  }
  .sb-nav-back:hover {
    background: var(--mb-orange-10);
  }
  .sb-nav-back :global(.sb-nav-back-home) {
    display: none;
  }
  .sb-nav-head {
    font-size: 15px;
    font-weight: 600;
    color: #000;
    padding: 2px 10px 2px;
  }
  .sb-nav-items {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  /* Liens (« Aide ») : hors de la liste d'onglets, au même pas qu'elle. */
  .sb-nav-links {
    margin-top: 1px;
  }
  /* Sans intertitre (« Aide », « Se déconnecter ») : un filet les détache des
     sections, comme le séparateur du menu « Mon compte » de MIA. */
  .sb-nav-links-ruled {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--mb-border-subtle);
  }
  /* Le même filet, quand une section sans groupe ouvre le pied de colonne :
     il passe au-dessus d'elle, au même pas que celui des liens. */
  .sb-nav-rule {
    flex-shrink: 0;
    height: 1px;
    margin: 9px 0;
    background: var(--mb-border-subtle);
  }
  .sb-closed .sb-nav-rule {
    width: 22px;
    margin: 8px auto;
    background: var(--mb-border-default);
  }
  .sb-nav-link {
    box-sizing: border-box;
    text-decoration: none;
  }
  /* « Se déconnecter » : le rouge des gestes qui mettent fin à quelque chose. */
  .sb-nav-danger,
  .sb-nav-danger .sb-nav-icon {
    color: var(--danger-strong);
  }
  .sb-nav-danger:hover {
    background: var(--danger-bg);
  }
  /* La flèche annonce le nouvel onglet ; rail replié, l'icône seule suffit. */
  .sb-nav-ext {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--mb-text-muted);
  }
  .sb-closed .sb-nav-ext {
    display: none;
  }
  .sb-nav-group {
    padding: 12px 10px 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--ink-muted);
  }
  /* Rail replié : un filet remplace l'intertitre — il garde la respiration
     entre les groupes là où le libellé ne tiendrait pas. */
  .sb-closed .sb-nav-group {
    padding: 0;
    margin: 8px auto;
    width: 22px;
    height: 1px;
    background: var(--mb-border-default);
    overflow: hidden;
    text-indent: -999px;
  }
  /* Enveloppe d'un groupe : invisible sous un intertitre (les onglets restent
     les enfants directs de la liste), en retrait sous une rubrique. */
  .sb-nav-sub {
    display: contents;
  }
  .sb-nav-sub-rubric {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0 0 4px 18px;
    padding-left: 8px;
    border-left: 1px solid var(--mb-border-default);
  }
  .sb:not(.sb-closed) .sb-nav-sub-folded {
    display: none;
  }
  /* L'icône est sur la rubrique : ses pages n'en portent pas, colonne ouverte. */
  .sb:not(.sb-closed) .sb-nav-sub-rubric .sb-nav-icon {
    display: none;
  }
  /* Rubrique repliable (Administration) : une rangée comme les autres, son
     chevron à droite. */
  .sb-nav-rubric {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 34px;
    margin-top: 2px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: #000;
    font-family: inherit;
    font-size: 13.5px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }
  .sb-nav-rubric:hover {
    background: rgb(var(--brand-rgb) / 0.06);
  }
  .sb-nav-rubric :global(.sb-nav-chevron) {
    flex-shrink: 0;
    color: var(--mb-text-muted);
    transition: transform 0.15s;
  }
  .sb-nav-rubric[aria-expanded='false'] :global(.sb-nav-chevron) {
    transform: rotate(-90deg);
  }
  @media (pointer: coarse) {
    .sb:not(.sb-closed) .sb-nav-rubric {
      min-height: 44px;
    }
  }
  .sb-nav-item {
    /* Repère de la pastille « coin » sur le rail replié. */
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: #000;
    font-family: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .sb-nav-item:hover {
    background: rgb(var(--brand-rgb) / 0.06);
  }
  /* Au doigt, la rangée reprend une cible de 44 px. Ici et pas dans la liste
     de style.css : la règle scopée ci-dessus, plus spécifique, l'emporterait. */
  @media (pointer: coarse) {
    .sb:not(.sb-closed) .sb-nav-item {
      min-height: 44px;
    }
  }
  .sb-nav-item-active,
  .sb-nav-item-active:hover {
    background: var(--mb-bg-tabs);
    border-color: var(--mb-border-card);
    font-weight: 600;
  }
  /* L'icône seule, sans tuile : la tuile de 28 px faisait des rangées de
     45 px, et le groupe « Outils » passait sous le pli à 800 px de haut. */
  .sb-nav-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--mb-orange);
    flex-shrink: 0;
  }
  .sb-nav-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Libellé + phrase de la pastille (écran tactile seulement), l'un sous
     l'autre ; la pastille elle-même reste en bout de ligne. */
  .sb-nav-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .sb-nav-alert-text {
    display: none;
    font-size: 11.5px;
    font-weight: 400;
    line-height: 1.35;
    color: var(--mb-text-secondary);
    white-space: normal;
  }
  @media (hover: none) {
    .sb-nav-alert-text {
      display: block;
      padding: 1px 0 6px;
    }
    /* Entrée à phrase (colonne dépliée) : tuile d'icône et pastille à la
       hauteur du LIBELLÉ — celle d'une entrée d'une ligne —, pas au milieu du
       bloc de texte, où elles tombaient en face de la phrase. */
    .sb:not(.sb-closed) .sb-nav-item-alert {
      align-items: flex-start;
      padding-top: 12px;
    }
    .sb:not(.sb-closed) .sb-nav-item-alert > :global(.cad) {
      margin-top: 5px;
    }
  }
  .sb-closed .sb-nav-text {
    display: none;
  }

  .sb-active-wrap {
    padding: 10px 20px 0;
  }

  .sb-active-pill {
    width: 100%;
    height: 36px;
    border-radius: 6px;
    background: var(--mb-orange);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border: none;
    cursor: pointer;
    box-sizing: border-box;
  }

  .sb-active-pill:hover {
    background: var(--brand-strong);
  }

  .sb-active-name {
    font-family: 'Lexend', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sb-live-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgb(255, 60, 60);
    border: 2px solid rgb(196, 0, 0);
    flex-shrink: 0;
    animation: pulse-dot 1.5s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.15);
    }
  }

  .sb-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px 20px;
    scrollbar-width: thin;
  }

  .sb-empty {
    font-family: 'Lexend', sans-serif;
    font-size: 12px;
    color: rgb(180, 180, 180);
    text-align: center;
    padding-top: 24px;
  }

  .sb-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding-top: 32px;
    font-family: 'Lexend', sans-serif;
    font-size: 12px;
    color: color-mix(in srgb, var(--brand-secondary) 15%, #575757);
  }
  .sb-spinner {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--brand-secondary) 25.7%, #dadada);
    border-top-color: var(--brand);
    animation: sb-spin 0.8s linear infinite;
  }
  @keyframes sb-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .sb-week {
    margin-bottom: 8px;
  }

  .sb-week-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
    margin-bottom: 4px;
  }

  .sb-week-btn :global(.sb-chevron) {
    flex-shrink: 0;
    transition: transform 0.2s;
    transform: rotate(0deg);
    color: var(--mb-text-placeholder);
  }

  .sb-week-btn :global(.sb-chevron-open) {
    transform: rotate(90deg);
  }

  .sb-week-label {
    font-family: 'Lexend', sans-serif;
    font-size: 10px;
    font-weight: 400;
    color: var(--mb-orange);
    white-space: nowrap;
  }

  .sb-week-line {
    flex: 1;
    height: 1px;
    background: var(--mb-border-default);
  }

  .sb-week-items {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sb-item {
    width: 100%;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    background: transparent;
    transition: background 0.15s;
  }

  .sb-item:hover {
    background: rgb(var(--brand-rgb) / 0.06);
  }

  .sb-item-selected {
    background: var(--mb-bg-tabs) !important;
    border-radius: 10px !important;
  }

  .sb-item-name {
    font-family: 'Lexend', sans-serif;
    font-size: 13px;
    color: #000;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    flex: 1;
  }

  /* Réunion en cours d'enregistrement : titre en italique. Le seul signal —
     pas de couleur ni de pastille sur la ligne : la pastille « Réunion en
     cours » en haut de colonne porte déjà l'alerte, et le point rouge répété
     ici ferait deux fois le même message. */
  .sb-item-live .sb-item-name {
    font-style: italic;
  }

  /* Compte rendu en cours de rédaction : un reflet de la couleur de marque
     traverse le titre, de gauche à droite, et recommence — la ligne « écrit ».
     Posé sur le texte lui-même (background-clip) : rien ne s'ajoute à la ligne,
     le titre garde sa place et sa coupe. Le libellé hors écran
     (.sb-item-writing-label) porte le sens pour les lecteurs d'écran.
     La boîte se resserre sur le texte (max-content) : avec `flex: 1`, le
     dégradé se mesurait sur toute la ligne et le reflet passait l'essentiel du
     cycle au-dessus du vide, à droite d'un titre court — mesuré au harnais. La
     marge auto rend ce vide, la date reste à sa place. */
  .sb-item-writing .sb-item-name {
    max-width: max-content;
    margin-right: auto;
    color: transparent;
    background-image: linear-gradient(
      100deg,
      #000 0%,
      #000 35%,
      var(--mb-orange) 50%,
      #000 65%,
      #000 100%
    );
    background-size: 240% 100%;
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    animation: sb-writing 2.4s linear infinite;
  }

  @keyframes sb-writing {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0% 0;
    }
  }

  .sb-item-writing-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .sb-item-writing .sb-item-name {
      animation: none;
      background-image: none;
      color: var(--mb-orange);
    }
  }

  /* Étincelle « titre en cours » : ancre positionnée pour l'icône (.tab-sparkle
     est en position absolue, cf. style.css), largeur fixe pour ne pas faire
     sauter la date. */
  .sb-item-naming {
    position: relative;
    display: inline-flex;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--mb-orange);
  }

  /* Pastille de tag devant le titre : largeur fixe, et 6 px avant le titre —
     l'écart pastille-libellé de TagChip, et de l'aperçu « Dans l'historique »
     du formulaire de tag (TagForm). Collée, elle se lisait comme une lettre
     du titre. */
  .sb-item-tag {
    display: inline-flex;
    align-items: center;
    width: 12px;
    margin-right: 6px;
    flex-shrink: 0;
  }

  /* ── Filtre par tag ──────────────────────────────────────────────────────
     Menu déroulant plutôt qu'une rangée de puces : elle débordait de la
     colonne dès trois tags, coupée en pleine puce, et 20 tags en défilement
     caché rendaient les derniers introuvables.
     Bouton PLEINE LARGEUR aligné sur les pills du dessus : la version
     mini-chip se perdait entre la recherche et l'historique. */
  .sb-tagbar {
    position: relative;
    display: flex;
    align-items: center;
    padding: 10px 18px 2px;
    flex-shrink: 0;
  }
  .sb-closed .sb-tagbar {
    display: none;
  }
  .sb-tagmenu-btn {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 38px;
    padding: 6px 12px;
    border: 1px solid var(--mb-border-default);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.65);
    cursor: pointer;
    font-family: 'Lexend', sans-serif;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink-muted);
    transition:
      border-color 0.15s,
      background 0.15s,
      color 0.15s;
  }
  .sb-tagmenu-btn:hover {
    border-color: var(--mb-orange-20);
    background: #fff;
    color: var(--ink);
  }
  .sb-tagmenu-btn-on {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
    color: var(--brand-text);
  }
  .sb-tagmenu-current {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sb-tagmenu-btn :global(.sb-tagmenu-caret) {
    flex-shrink: 0;
    margin-left: auto;
    opacity: 0.6;
    transition: transform 0.18s;
  }
  .sb-tagmenu-btn-open :global(.sb-tagmenu-caret) {
    transform: rotate(180deg);
  }
  /* Le TagChip du bouton doit pouvoir rétrécir pour que l'ellipse joue. */
  .sb-tagmenu-btn :global(.tag-chip) {
    min-width: 0;
  }
  .sb-tagmenu {
    position: absolute;
    top: calc(100% + 4px);
    left: 18px;
    right: 18px;
    max-height: min(52dvh, 380px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: #fff;
    border: 1px solid var(--mb-border-card);
    border-radius: 10px;
    box-shadow:
      var(--mb-shadow-card),
      0 14px 36px rgba(0, 0, 0, 0.14);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    /* Au-dessus de tout le contenu de la colonne (liste, bandeau de filtre,
       ligne profil) — un menu ouvert ne doit jamais passer dessous. */
    z-index: 400;
    font-family: 'Lexend', sans-serif;
    animation: sb-tagmenu-pop 0.14s cubic-bezier(0.5, 0, 0.2, 1.2);
    transform-origin: top center;
  }
  @keyframes sb-tagmenu-pop {
    from {
      opacity: 0;
      transform: scale(0.97) translateY(-3px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
  .sb-tagmenu-search {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 7px;
    height: 34px;
    margin-bottom: 4px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--ink-faint);
    cursor: text;
  }
  .sb-tagmenu-search:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft-15);
  }
  .sb-tagmenu-search input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink);
  }
  .sb-tagmenu-search input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }
  .sb-tagmenu-empty {
    padding: 8px 10px;
    font-size: 12px;
    color: var(--ink-faint);
  }
  @media (pointer: coarse) {
    .sb-tagmenu-search {
      height: 40px;
    }
    .sb-tagmenu-search input {
      font-size: 16px;
    }
  }
  .sb-tagmenu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    border: none;
    background: transparent;
    text-align: left;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    padding: 7px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .sb-tagmenu-item:hover {
    background: rgb(var(--brand-rgb) / 0.06);
  }
  .sb-tagmenu-on {
    background: var(--brand-secondary-soft-08);
    color: var(--brand-text);
    font-weight: 600;
  }
  .sb-tagmenu-on:hover {
    background: var(--brand-secondary-soft-15, var(--brand-secondary-soft-08));
  }
  .sb-tagmenu-item :global(.tag-chip) {
    min-width: 0;
  }
  .sb-tagmenu-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sb-tagmenu-count {
    flex-shrink: 0;
    min-width: 22px;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--mb-text-muted);
    font-variant-numeric: tabular-nums;
    background: rgba(0, 0, 0, 0.045);
    border-radius: 999px;
    padding: 2px 7px;
  }
  .sb-tagmenu-on .sb-tagmenu-count {
    background: rgb(var(--brand-rgb) / 0.12);
    color: var(--brand-text);
  }
  .sb-tagmenu-sep {
    height: 1px;
    background: var(--mb-border-subtle);
    margin: 4px 8px;
  }
  /* Bandeau de filtre actif : ne défile pas, contrairement à .sb-tagbar —
     c'est tout son intérêt. `flex-shrink: 0` pour qu'il ne soit jamais écrasé
     par la liste, et `white-space: nowrap` sur le bouton de sortie. */
  .sb-filterbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 18px 0;
    padding: 5px 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
    flex-shrink: 0;
  }
  .sb-closed .sb-filterbar {
    display: none;
  }
  .sb-filterbar-text {
    flex: 1;
    min-width: 0;
    font-family: 'Lexend', sans-serif;
    font-size: 11px;
    color: var(--ink-muted);
  }
  .sb-filterbar-reset {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-family: 'Lexend', sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: var(--accent, var(--ink));
    text-decoration: underline;
    white-space: nowrap;
    flex-shrink: 0;
  }
  /* Badge date dégradé (Date Background Figma) : fond chaud fondu sur le bord
     gauche, texte orange 60 %. Le dégradé masque la fin du titre en douceur. */
  .sb-item-date {
    font-family: 'Lexend', sans-serif;
    font-size: 12px;
    color: rgb(var(--brand-rgb) / 0.6);
    flex-shrink: 0;
    margin-left: -14px;
    padding: 4px 8px 4px 18px;
    border-radius: 8px;
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--mb-bg-app) 0%, transparent) 0%,
      color-mix(in srgb, var(--mb-bg-app) 80%, transparent) 13%,
      var(--mb-bg-app) 23%,
      var(--mb-bg-app) 100%
    );
    pointer-events: none;
  }

  /* Item sélectionné : le badge date se fond dans --mb-bg-tabs au lieu du
     crème par défaut. */
  .sb-item-selected .sb-item-date {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--mb-bg-tabs) 0%, transparent) 0%,
      color-mix(in srgb, var(--mb-bg-tabs) 80%, transparent) 13%,
      var(--mb-bg-tabs) 23%,
      var(--mb-bg-tabs) 100%
    );
  }

  .sb-item-delete {
    display: none;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: 6px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
    line-height: 0;
  }

  .sb-item-delete:hover {
    background: rgba(210, 60, 60, 0.1);
  }

  .sb-item:hover .sb-item-date {
    display: none;
  }

  .sb-item:hover .sb-item-delete {
    display: flex;
  }

  /* Bouton ⋯ : équivalent tactile du clic droit (renommer / tag / supprimer).
     Masqué sur desktop où le survol et le clic droit couvrent déjà tout. */
  .sb-item-menu {
    display: none;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: 4px;
    min-width: 36px;
    min-height: 36px;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    color: rgba(120, 113, 108, 0.85);
  }

  .sb-item-menu:active {
    background: rgb(var(--brand-rgb) / 0.12);
  }

  @media (hover: none), (max-width: 768px) {
    .sb-item-menu {
      display: flex;
    }
    /* Le survol n'existe pas au doigt : la date céderait sa place à la
       corbeille au premier tap — on garde la date, le ⋯ porte la suppression. */
    .sb-item:hover .sb-item-date {
      display: inline;
    }
    .sb-item:hover .sb-item-delete {
      display: none;
    }
  }

  /* ── Carte du compte (bas de la colonne) ── */
  .sb-user {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: auto 12px 14px;
    padding: 8px;
    border: 1px solid var(--mb-border-card);
    border-radius: 14px;
    background: var(--mb-bg-surface);
    flex-shrink: 0;
  }

  /* L'identité se lit, elle ne se clique pas : les deux boutons sont dessous. */
  .sb-user-details {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 0 2px;
  }

  .sb-user-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .sb-user-name {
    font-family: 'Lexend', sans-serif;
    font-weight: 500;
    font-size: 13px;
    color: #000;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sb-user-line {
    font-size: 11px;
    color: var(--mb-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .sb-user-line-out {
    color: var(--danger-text);
    font-weight: 500;
  }

  /* Téléphone : la carte du compte s'ouvre depuis l'avatar de la barre d'app
     (MobileAppBar), le tiroir ne garde que la navigation. APRÈS la règle de
     base de .sb-user : à spécificité égale, l'ordre décide. */
  @media (max-width: 768px) {
    .sb-user {
      display: none;
    }
  }

  /* Resize handle (desktop only — mobile sb is position:fixed for drawer) */
  @media (min-width: 769px) {
    .sb {
      position: relative;
    }
  }
  .sb-resize-handle {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
    user-select: none;
    background: transparent;
    transition: background 0.15s;
  }
  .sb-resize-handle:hover {
    background: color-mix(
      in srgb,
      color-mix(in srgb, var(--brand) 42.4%, #ffffff) 25%,
      transparent
    );
  }
  .sb-resize-handle::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 40px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-secondary) 20.7%, #afafaf);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .sb-resize-handle:hover::after,
  .sb-resizing .sb-resize-handle::after {
    opacity: 1;
  }
  .sb-resizing {
    transition: none !important;
  }
  @media (max-width: 768px) {
    .sb-resize-handle {
      display: none;
    }
  }

  /* Inline rename */
  .sb-item-rename {
    flex: 1;
    min-width: 0;
    font-family: 'Lexend', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: color-mix(in srgb, var(--brand-secondary) 12.8%, #000000);
    background: white;
    border: 1px solid color-mix(in srgb, var(--brand) 42.4%, #ffffff);
    border-radius: 6px;
    padding: 4px 8px;
    outline: none;
    box-shadow: 0 0 0 3px
      color-mix(in srgb, color-mix(in srgb, var(--brand) 42.4%, #ffffff) 18%, transparent);
  }

  /* Context menu */
  :global(.ctx-menu) {
    position: fixed;
    z-index: 9999;
    min-width: 180px;
    background: white;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px;
    box-shadow:
      0 10px 30px -8px rgb(var(--brand-rgb) / 0.25),
      0 4px 12px -2px rgba(0, 0, 0, 0.08);
    font-family: 'Lexend', sans-serif;
    animation: ctx-pop 0.14s cubic-bezier(0.5, 0, 0.2, 1.2);
    transform-origin: top left;
  }
  @keyframes ctx-pop {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  :global(.ctx-item) {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    background: none;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: color-mix(in srgb, var(--brand-secondary) 12.8%, #000000);
    text-align: left;
    transition:
      background 0.12s,
      color 0.12s;
  }
  :global(.ctx-item:hover) {
    background: color-mix(in srgb, var(--brand-secondary) 6.6%, #f7f7f7);
    color: var(--brand);
  }
  :global(.ctx-item-danger) {
    color: oklch(50% 0.22 27);
  }
  :global(.ctx-item-danger:hover) {
    background: oklch(96% 0.04 27);
    color: oklch(45% 0.22 27);
  }
  /* Chevron « ouvre le sélecteur de tag », poussé à droite de l'entrée. */
  .ctx-item :global(.ctx-chevron) {
    margin-left: auto;
    color: var(--ink-faint);
  }
  .ctx-item-back {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .ctx-item-back :global(.ctx-chevron-back) {
    transform: rotate(180deg);
  }
  .ctx-sep {
    height: 1px;
    background: var(--line);
    margin: 4px 0;
  }
</style>
