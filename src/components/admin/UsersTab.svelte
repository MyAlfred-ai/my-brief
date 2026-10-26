<script>
  /**
   * Onglet « Utilisateurs » du panneau d'administration.
   *
   * Autonome : il porte son propre chargement, son propre état d'erreur et ses
   * propres appels API. AdminPanel se contente de le monter — il n'orchestre
   * rien.
   *
   * Une liste dense plutôt que des cartes : une ligne par compte, les libellés
   * une seule fois dans l'en-tête, la fiche (UserForm) pour tout le reste. Les
   * cartes de 141 px n'en montraient que quatre par écran, une sur téléphone.
   */
  import { onMount } from 'svelte';
  import IconSearch from '~icons/solar/magnifer-linear';
  import IconUserPlus from '~icons/solar/user-plus-rounded-linear';
  import IconKey from '~icons/solar/key-minimalistic-linear';
  import IconUsersEmpty from '~icons/solar/users-group-rounded-linear';
  import UserRow from './UserRow.svelte';
  import UserForm from './UserForm.svelte';
  import DeleteUserDialog from './DeleteUserDialog.svelte';
  import { listUsers, resetUserPassword, updateUser } from '../../services/adminUsersApi.js';
  import { listGroups } from '../../services/adminGroupsApi.js';
  import { auth } from '../../stores/auth.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { DEFAULT_MIN_LENGTH } from '../../utils/passwordPolicy.js';

  let users = [];
  let total = 0;
  let query = '';
  let loading = false;
  let loadingMore = false;
  let errorMessage = '';
  let view = 'list'; // 'list' | 'create' | 'edit'
  let editing = null;
  let deleting = null;
  /** Mot de passe généré à afficher UNE fois — il n'est stocké que haché. */
  let generated = null;
  let copied = false;
  let searchTimer = null;
  /** Email de la ligne dont l'activation part au serveur — une seule à la fois. */
  let togglingEmail = '';
  /**
   * Catalogue des groupes (onglet Groupes) : pour nommer ceux de chaque ligne,
   * proposer les cases de la fiche, et filtrer la liste. Chargé une fois au
   * montage — un groupe créé entre-temps apparaîtra à la prochaine ouverture.
   */
  let groups = [];
  let defaultId = 'default';
  /** '' = tous les groupes, sinon l'identifiant d'un groupe. */
  let groupFilter = '';
  /**
   * Numéro de la dernière lecture lancée. La recherche relit la liste à chaque
   * pause de frappe : une réponse plus lente que la suivante ne doit pas
   * remplacer des résultats plus récents.
   */
  let requestSeq = 0;

  $: texts = $uiText.adminUsers;
  $: policyTexts = $uiText.passwordPolicy;
  $: minLength = $auth.capabilities.passwordPolicy?.minLength || DEFAULT_MIN_LENGTH;
  $: currentEmail = String($auth.user?.email || '').toLowerCase();
  $: groupsById = new Map(groups.map((g) => [g.id, g]));
  // Une colonne de puces seulement s'il y a de quoi distinguer : avec le seul
  // groupe par défaut, elle répéterait « Défaut » sur chaque ligne. Même règle
  // que le filtre par groupe.
  $: showGroups = groups.length > 1;
  $: lang = $currentLanguageStore;
  $: countText =
    users.length < total
      ? fill(texts.countPartial, { shown: users.length, total })
      : total === 1
        ? texts.countOne
        : fill(texts.countMany, { count: total });

  onMount(() => {
    load();
    loadGroups();
  });

  async function load() {
    const seq = ++requestSeq;
    loading = true;
    errorMessage = '';
    const res = await listUsers({ q: query, group: groupFilter });
    if (seq !== requestSeq) return;
    loading = false;
    if (!res.ok) {
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      return;
    }
    users = res.data.users || [];
    total = res.data.total || 0;
  }

  /** Un échec ici n'est pas bloquant : la liste vit sans puces de groupe. */
  async function loadGroups() {
    const res = await listGroups();
    if (!res.ok) return;
    groups = res.data.groups || [];
    defaultId = res.data.defaultId || 'default';
  }

  /**
   * Page suivante, ajoutée à la liste. Dédoublonnée par email : un compte créé
   * entre deux pages décale la fenêtre du serveur, qui renverrait sinon la
   * dernière ligne une seconde fois — et `{#each}` keyé refuse les doublons.
   */
  async function loadMore() {
    const seq = requestSeq;
    loadingMore = true;
    const res = await listUsers({ q: query, group: groupFilter, skip: users.length });
    loadingMore = false;
    if (seq !== requestSeq) return;
    if (!res.ok) {
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      return;
    }
    const known = new Set(users.map((u) => u.email));
    users = [...users, ...(res.data.users || []).filter((u) => !known.has(u.email))];
    total = res.data.total || total;
  }

  function onSearchInput() {
    // Anti-rebond : la liste est rechargée côté serveur à chaque frappe sinon.
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  }

  function onSaved(event) {
    view = 'list';
    editing = null;
    if (event.detail.generatedPassword) {
      generated = { email: event.detail.user.email, password: event.detail.generatedPassword };
      copied = false;
    }
    load();
  }

  async function onReset(user) {
    if (!window.confirm(fill(texts.resetConfirm, { email: user.email }))) return;
    errorMessage = '';
    const res = await resetUserPassword({ email: user.email });
    if (!res.ok) {
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      return;
    }
    generated = { email: user.email, password: res.data.generatedPassword };
    copied = false;
    // Depuis la fiche : elle reste ouverte, et doit savoir que le compte a
    // maintenant un mot de passe (« SSO uniquement » disparaît).
    if (editing?.email === user.email) editing = res.data.user || editing;
    load();
  }

  /**
   * Activation/désactivation depuis la liste, sans passer par le formulaire.
   *
   * Le serveur reste seul juge : il refuse de désactiver son propre compte
   * (`self_target`) et le dernier administrateur actif (`last_admin`). En cas
   * de refus, rien n'a bougé en base — on réaffecte `users` pour que
   * l'interrupteur, déjà basculé par le navigateur, revienne à l'état réel.
   */
  async function onToggleActive(event) {
    const { user, disabled } = event.detail;
    errorMessage = '';
    togglingEmail = user.email;
    const res = await updateUser({ email: user.email, disabled });
    togglingEmail = '';
    if (!res.ok) {
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      users = [...users];
      return;
    }
    // Remplacement par identité (jamais de mutation en place) : `{#each}` keyé
    // ne redessine la ligne que si le tableau change.
    users = users.map((u) => (u.email === user.email ? res.data.user : u));
  }

  async function copyGenerated() {
    try {
      await navigator.clipboard.writeText(generated.password);
      copied = true;
    } catch (_) {
      copied = false;
    }
  }
</script>

<div class="au-tab">
  {#if view === 'create' || view === 'edit'}
    <UserForm
      {texts}
      {policyTexts}
      {minLength}
      {groups}
      {defaultId}
      {lang}
      user={view === 'edit' ? editing : null}
      isSelf={view === 'edit' && String(editing?.email).toLowerCase() === currentEmail}
      on:cancel={() => {
        view = 'list';
        editing = null;
      }}
      on:saved={onSaved}
      on:reset={(e) => onReset(e.detail)}
      on:delete={(e) => {
        deleting = e.detail;
      }}
    />
  {:else}
    <p class="au-intro">{texts.intro}</p>
    <div class="au-toolbar">
      <div class="au-search-wrap">
        <span class="au-search-icon" aria-hidden="true"><IconSearch width="15" height="15" /></span>
        <input
          class="au-search"
          type="search"
          placeholder={texts.searchPlaceholder}
          bind:value={query}
          on:input={onSearchInput}
        />
      </div>
      <!-- Filtre par groupe : seulement quand il y a de quoi filtrer — avec le
           seul groupe par défaut, la liste entière est déjà « tous ». -->
      {#if groups.length > 1}
        <select
          class="au-group-filter"
          aria-label={texts.groupFilterLabel}
          bind:value={groupFilter}
          on:change={load}
        >
          <option value="">{texts.groupFilterAll}</option>
          {#each groups as group (group.id)}
            <option value={group.id}>{group.name}</option>
          {/each}
        </select>
      {/if}
      <button
        type="button"
        class="au-create"
        title={texts.createButton}
        on:click={() => {
          view = 'create';
        }}
      >
        <IconUserPlus width="16" height="16" aria-hidden="true" />
        <span class="au-create-label">{texts.createButton}</span>
      </button>
    </div>

    {#if errorMessage}
      <div class="au-error" role="alert">{errorMessage}</div>
    {/if}

    {#if loading && users.length === 0}
      <div class="au-loading">…</div>
    {:else if users.length === 0}
      <div class="au-empty">
        <IconUsersEmpty width="26" height="26" aria-hidden="true" />
        <span>{groupFilter ? texts.emptyForGroup : texts.empty}</span>
      </div>
    {:else}
      <!-- Une relecture (recherche, filtre) garde la liste en place, en
           retrait : la remplacer par « … » à chaque frappe la ferait clignoter. -->
      <div class="au-table" class:au-table-busy={loading} class:au-with-groups={showGroups}>
        <!-- En-tête visuel : chaque ligne porte déjà ses libellés pour les
             lecteurs d'écran (nom accessible de l'interrupteur, texte masqué
             devant la date et les groupes). -->
        <div class="au-head" aria-hidden="true">
          <span>{texts.colName}</span>
          <span>{texts.colEmail}</span>
          {#if showGroups}<span>{texts.groupsLabel}</span>{/if}
          <span>{texts.colLastConnection}</span>
          <span class="au-head-center">{texts.activeLabel}</span>
          <span></span>
        </div>
        <ul class="au-list">
          {#each users as user (user.email)}
            <UserRow
              {user}
              {texts}
              {lang}
              {groupsById}
              {showGroups}
              isSelf={String(user.email).toLowerCase() === currentEmail}
              busy={togglingEmail === user.email}
              on:toggleActive={onToggleActive}
              on:edit={(e) => {
                editing = e.detail;
                view = 'edit';
              }}
              on:reset={(e) => onReset(e.detail)}
              on:delete={(e) => {
                deleting = e.detail;
              }}
            />
          {/each}
        </ul>
        <div class="au-foot">
          <span>{countText}</span>
          {#if users.length < total}
            <button type="button" class="au-more" disabled={loadingMore} on:click={loadMore}>
              {texts.showMore}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if generated}
  <div class="au-generated" role="dialog" aria-modal="true" aria-label={texts.generatedTitle}>
    <div class="au-generated-panel">
      <h3><IconKey width="17" height="17" aria-hidden="true" /> {texts.generatedTitle}</h3>
      <p class="au-generated-email">{generated.email}</p>
      <code class="au-generated-value">{generated.password}</code>
      <p class="au-generated-note">{texts.generatedMessage}</p>
      <div class="au-generated-actions">
        <button type="button" class="au-secondary" on:click={copyGenerated}>
          {copied ? texts.copied : texts.copy}
        </button>
        <button
          type="button"
          class="au-primary"
          on:click={() => {
            generated = null;
          }}>{texts.close}</button
        >
      </div>
    </div>
  </div>
{/if}

{#if deleting}
  <DeleteUserDialog
    {texts}
    user={deleting}
    on:cancel={() => {
      deleting = null;
    }}
    on:deleted={() => {
      deleting = null;
      // Supprimé depuis la fiche : elle n'a plus d'objet.
      view = 'list';
      editing = null;
      load();
    }}
  />
{/if}

<style>
  /* Conteneur de requête `au` : la liste bascule en deux lignes par compte
     selon SA largeur (UserRow), pas celle de l'écran — dans le panneau, la
     barre latérale en prend une part variable. */
  .au-tab {
    container: au / inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  /* Même phrase d'intro que les autres onglets : dire ce qu'on règle ici. */
  .au-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .au-toolbar {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .au-search-wrap {
    position: relative;
    flex: 1;
    min-width: 180px;
    display: flex;
  }
  .au-search-icon {
    position: absolute;
    left: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    color: color-mix(in srgb, var(--brand-secondary) 11.9%, #8c8c8c);
    pointer-events: none;
  }
  .au-search {
    flex: 1;
    min-width: 0;
    padding: 0.55rem 0.75rem 0.55rem 2.1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.92rem;
    font-family: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .au-search:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .au-group-filter {
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-soft);
    font-size: 0.88rem;
    font-family: inherit;
    max-width: 220px;
    cursor: pointer;
  }
  .au-group-filter:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .au-create {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 1rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
    transition: background 0.15s;
  }
  .au-create:hover {
    background: var(--brand-strong);
  }

  /* Colonnes partagées par l'en-tête et les lignes (UserRow) : nom, email,
     dernière connexion, interrupteur, raccourcis. Des largeurs fixes plutôt
     qu'un <table> : la bascule en deux lignes des petites largeurs réordonne
     les cellules, ce qu'une table ne sait pas faire sans perdre sa sémantique
     dans Safari. */
  .au-table {
    --au-cols: minmax(0, 1.15fr) minmax(0, 1fr) 7.75rem 3rem 3.75rem;
    transition: opacity 0.15s;
  }
  /* Colonne des groupes entre l'adresse et la dernière connexion. */
  .au-with-groups {
    --au-cols: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.85fr) 7.75rem 3rem 3.75rem;
  }
  .au-table-busy {
    opacity: 0.6;
  }
  /* Collé en haut de la zone qui défile : sur une longue liste, « Actif » et
     « Dernière connexion » restent lisibles au-dessus des lignes. `sticky`
     s'arrête au bord du padding de cette zone (AdminPanel, `.ap-body`) : sans
     la remontée, les lignes défilaient visibles au-dessus de l'en-tête. */
  .au-head {
    position: sticky;
    top: calc(-1 * var(--ap-body-pad-top, 0px));
    z-index: 1;
    display: grid;
    grid-template-columns: var(--au-cols);
    column-gap: 0.75rem;
    padding: 0.4rem 0.5rem;
    background: var(--surface);
    border-bottom: 1px solid var(--line-strong);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink-faint);
  }
  .au-head > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .au-head-center {
    text-align: center;
  }
  .au-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .au-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.6rem 0.5rem 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  .au-more {
    padding: 0.35rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .au-more:hover:not(:disabled) {
    background: var(--brand-secondary-soft-08);
  }
  .au-more:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .au-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: oklch(95% 0.05 25);
    color: oklch(38% 0.14 25);
    font-size: 0.9rem;
  }
  .au-loading {
    padding: 1.5rem;
    text-align: center;
    color: var(--ink-faint);
  }
  .au-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 2rem 1.5rem;
    text-align: center;
    color: var(--ink-faint);
    background: var(--surface-tint);
    border: 1px dashed var(--line);
    border-radius: 10px;
    font-size: 0.85rem;
  }
  .au-empty :global(svg) {
    color: var(--line-faint);
  }

  /* Six colonnes demandent plus de place : avec les groupes, les lignes passent
     sur plusieurs niveaux plus tôt (UserRow), et l'en-tête s'efface avec. */
  @container au (max-width: 679px) {
    .au-with-groups .au-head {
      display: none;
    }
  }
  /* Liste étroite : pas d'en-tête (les lignes passent sur deux niveaux), et le
     bouton de création réduit à son icône pour rester à côté de la recherche. */
  @container au (max-width: 559px) {
    .au-head {
      display: none;
    }
    .au-create {
      padding: 0.55rem 0.75rem;
    }
    .au-create-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  }

  .au-generated {
    position: fixed;
    inset: 0;
    z-index: 10003;
    display: flex;
    justify-content: center;
    background: rgba(20, 18, 15, 0.45);
    padding: max(1rem, var(--safe-top, 0px)) 1rem max(1rem, var(--safe-bottom, 0px));
    /* margin:auto + overflow : les boutons Copier/Fermer du mot de passe
       généré restent atteignables sur petit écran. */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .au-generated-panel {
    margin: auto;
    background: #fffefc;
    border-radius: 10px;
    padding: 1.5rem;
    max-width: 380px;
    width: 100%;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.25);
  }
  .au-generated-panel h3 {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.4rem;
    font-size: 1.05rem;
  }
  .au-generated-panel h3 :global(svg) {
    color: var(--brand-text);
    flex-shrink: 0;
  }
  .au-generated-email {
    margin: 0 0 0.75rem;
    color: #777;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  .au-generated-value {
    display: block;
    padding: 0.7rem 0.85rem;
    background: color-mix(in srgb, var(--brand-secondary) 4.2%, #f5f5f5);
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 1rem;
    overflow-wrap: anywhere;
  }
  .au-generated-note {
    margin: 0.6rem 0 0;
    font-size: 0.82rem;
    color: #999;
  }
  .au-generated-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1.1rem;
  }
  .au-primary {
    padding: 0.55rem 1.1rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .au-primary:hover {
    background: var(--brand-strong);
  }
  .au-secondary {
    padding: 0.55rem 1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .au-secondary:hover {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
</style>
