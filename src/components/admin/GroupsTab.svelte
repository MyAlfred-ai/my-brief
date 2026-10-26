<script>
  /**
   * Onglet « Groupes » du panneau d'administration.
   *
   * Autonome comme UsersTab : il porte son chargement, ses erreurs et ses
   * appels API. Trois vues, l'une remplaçant l'autre dans le corps de
   * l'onglet, comme la fiche d'un compte remplace la liste dans Utilisateurs :
   *   - `list`    : la colonne des comptes (GroupPeople) et une CARTE par
   *                 groupe (couleur, nom, description, membres, quota) ;
   *   - `form`    : création ou modification (GroupForm) ;
   *   - `members` : le groupe et ses membres, ajout et retrait (GroupMembers).
   *
   * Mettre quelqu'un dans un groupe se fait depuis la liste : on glisse le
   * compte de la colonne sur la carte, ou on le sélectionne puis on choisit
   * la carte (clavier, écran tactile, où le glisser HTML ne marche pas).
   * Tant qu'un compte est en main, chaque carte dit ce qu'elle fera :
   * « Déposer ici », ou « Déjà dans ce groupe ». L'ajout part sans
   * confirmation : il se défait d'un geste depuis les membres du groupe.
   *
   * La carte reste le point d'entrée des membres : c'est ce qu'on vient
   * regarder, « qui est dans quel groupe ». Modifier et supprimer sont des
   * gestes rares, en icônes.
   *
   * Le groupe par défaut est une carte comme les autres, marquée « Par
   * défaut » et sans corbeille : il se renomme, il ne se supprime pas (cf.
   * services/api/lib/repositories/groups.js pour l'invariant qu'il porte).
   */
  import { onDestroy, onMount, tick } from 'svelte';
  import IconPlus from '~icons/solar/add-circle-linear';
  import IconGroupsEmpty from '~icons/solar/users-group-two-rounded-linear';
  import IconWarn from '~icons/solar/danger-triangle-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import GroupCard from './GroupCard.svelte';
  import GroupForm from './GroupForm.svelte';
  import GroupMembers from './GroupMembers.svelte';
  import GroupPeople from './GroupPeople.svelte';
  import { listGroups, deleteGroup, changeGroupMembers } from '../../services/adminGroupsApi.js';
  import { listUsers } from '../../services/adminUsersApi.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { uiText } from '../../store.js';

  /** Comptes chargés dans la colonne : le plafond de la route, par adresse. */
  const PEOPLE_LIMIT = 200;
  /** Avatars sur une carte avant le « +n ». */
  const STACK_SIZE = 5;
  /** Éclat de la carte qui vient de recevoir quelqu'un, puis durée de l'annonce. */
  const FLASH_MS = 1400;
  const STATUS_MS = 4500;

  let groups = [];
  let palette = [];
  let max = 0;
  let defaultId = 'default';
  let loading = false;
  let errorMessage = '';
  let view = 'list'; // 'list' | 'form' | 'members'
  /** Groupe en cours de modification (form), ou null = création. */
  let editing = null;
  /** Groupe ouvert (members). */
  let selected = null;
  /** Vue à retrouver en quittant le formulaire : la liste, ou les membres du groupe modifié. */
  let returnTo = 'list';
  let deleting = null;
  let deleteState = 'idle'; // 'idle' | 'deleting'

  // ── Colonne « Utilisateurs » et ajout par glisser-déposer ──
  let people = [];
  let peopleTotal = 0;
  let peopleLoading = false;
  let peopleQuery = '';
  /** Réponse du serveur à la recherche `term`, quand la colonne est tronquée. */
  let searched = null;
  let searchTimer = null;
  /** Compte sélectionné (clic, clavier, toucher), en attente de son groupe. */
  let picked = null;
  /** Compte en cours de glisser. */
  let dragged = null;
  /** Carte survolée par un glisser qu'elle accepte. */
  let dropTarget = '';
  /** Cartes dont l'ajout est parti au serveur. */
  let busy = new Set();
  let flashGroupId = '';
  let flashTimer = null;
  /** Ajouts de cette visite, par groupe, le plus récent d'abord : ils mènent la pile d'avatars. */
  let recent = {};
  /** Annonce du dernier ajout, ou de son échec : { message, tone }. */
  let status = null;
  let statusTimer = null;
  let boardEl;

  $: texts = $uiText.adminGroups;
  $: userTexts = $uiText.adminUsers;
  $: limitReached = max > 0 && groups.length >= max;
  $: defaultGroup = groups.find((g) => g.id === defaultId) || null;
  $: groupsById = new Map(groups.map((g) => [g.id, g]));
  $: held = dragged || picked;
  $: membersByGroup = indexMembers(people);
  $: truncated = peopleTotal > people.length;
  $: scheduleSearch(peopleQuery, truncated);
  $: shownPeople = filterPeople(people, searched, peopleQuery);

  onMount(() => {
    load();
    loadPeople();
  });

  onDestroy(() => {
    clearTimeout(searchTimer);
    clearTimeout(flashTimer);
    clearTimeout(statusTimer);
  });

  const displayName = (user) => user.name || user.email;
  const isMemberOf = (user, group) => !!user && (user.groupIds || []).includes(group.id);

  async function load() {
    loading = true;
    errorMessage = '';
    const res = await listGroups();
    loading = false;
    if (!res.ok) {
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      return;
    }
    groups = res.data.groups || [];
    palette = res.data.colors || [];
    max = res.data.max || 0;
    defaultId = res.data.defaultId || 'default';
    // Le groupe ouvert suit le catalogue (renommage, effectif).
    if (selected) selected = groups.find((g) => g.id === selected.id) || null;
    if (!selected && view === 'members') view = 'list';
  }

  /**
   * Les comptes de la colonne, et avec eux les avatars des cartes. Relus au
   * retour des membres d'un groupe et après une suppression : les
   * appartenances ont pu changer ailleurs que par un dépôt.
   */
  async function loadPeople() {
    peopleLoading = true;
    const res = await listUsers({ limit: PEOPLE_LIMIT });
    peopleLoading = false;
    if (!res.ok) {
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      return;
    }
    people = res.data.users || [];
    peopleTotal = res.data.total || people.length;
    searched = null;
    recent = {};
  }

  /** Les comptes de chaque groupe, dans l'ordre de la colonne. */
  function indexMembers(list) {
    const byGroup = new Map();
    for (const user of list) {
      for (const id of user.groupIds || []) {
        if (!byGroup.has(id)) byGroup.set(id, []);
        byGroup.get(id).push(user);
      }
    }
    return byGroup;
  }

  /**
   * La pile d'avatars d'une carte : les ajouts de la visite d'abord, puis la
   * colonne dans son ordre. Le « +n » part de l'effectif du SERVEUR, pas des
   * comptes chargés : une colonne tronquée ne fait pas mentir la carte.
   */
  function stackOf(group, byGroup, added) {
    const members = byGroup.get(group.id) || [];
    const first = added[group.id] || [];
    const ordered = [
      ...first.map((email) => members.find((u) => u.email === email)).filter(Boolean),
      ...members.filter((u) => !first.includes(u.email)),
    ];
    const shown = ordered.slice(0, STACK_SIZE);
    return { shown, more: Math.max(0, (group.memberCount || 0) - shown.length) };
  }

  function filterPeople(list, remote, query) {
    const term = query.trim().toLowerCase();
    if (!term) return list;
    if (remote?.term === term) return remote.users;
    return list.filter((u) => `${u.name || ''} ${u.email}`.toLowerCase().includes(term));
  }

  /**
   * Colonne tronquée : la recherche interroge aussi le serveur, sans quoi un
   * compte au-delà des premiers chargés ne pourrait pas être glissé. En
   * attendant sa réponse, le filtre local montre déjà ce qu'il trouve.
   */
  function scheduleSearch(query, isTruncated) {
    clearTimeout(searchTimer);
    const term = query.trim().toLowerCase();
    if (!term || !isTruncated) return;
    searchTimer = setTimeout(async () => {
      const res = await listUsers({ q: term, limit: 50 });
      if (res.ok) searched = { term, users: res.data.users || [] };
    }, 250);
  }

  // ── Compte en main ──

  /** Sélection (ou désélection) d'un compte. Au clavier, le focus part vers les cartes. */
  function onPick(event) {
    const { user, keyboard } = event.detail;
    const same = picked?.email === user.email;
    picked = same ? null : user;
    if (!same && keyboard) focusFirstTarget();
  }

  /** Sans ce saut, il faudrait traverser toute la colonne à la tabulation. */
  async function focusFirstTarget() {
    await tick();
    boardEl?.querySelector('.gc-drop-add')?.focus();
  }

  /** Rend le focus à la ligne du compte, après un ajout ou une annulation. */
  async function focusPerson(email) {
    await tick();
    const rows = boardEl ? [...boardEl.querySelectorAll('.gp-person')] : [];
    rows.find((row) => row.dataset.email === email)?.focus({ preventScroll: true });
  }

  /** Lâcher le compte en main, sans bruit : on change de vue. */
  function releaseHold() {
    picked = null;
    dragged = null;
    dropTarget = '';
  }

  /** Annuler la sélection (bouton ou Échap) : le focus revient au compte. */
  function cancelHold() {
    const email = picked?.email;
    releaseHold();
    if (email) focusPerson(email);
  }

  function onWindowKeydown(event) {
    if (event.key !== 'Escape' || !picked) return;
    event.preventDefault();
    cancelHold();
  }

  function onDragStart(event) {
    picked = null;
    dragged = event.detail;
  }

  function onDragEnd() {
    dragged = null;
    dropTarget = '';
  }

  /** Une carte accepte le glisser qui la survole (cf. GroupCard). */
  function onCardDragOver(group) {
    dropTarget = group.id;
  }

  function onCardDragLeave(group) {
    if (dropTarget === group.id) dropTarget = '';
  }

  function onCardDrop(group) {
    const user = dragged;
    releaseHold();
    if (user) addToGroup(user, group);
  }

  /**
   * L'ajout lui-même. L'effectif renvoyé par le serveur remplace celui de la
   * carte, et les groupes du compte suivent dans la colonne, sans relecture.
   */
  async function addToGroup(user, group) {
    if (!user || isMemberOf(user, group) || busy.has(group.id)) return;
    // Sélectionné, le compte récupère le focus : le bouton de la carte va
    // disparaître, et le clavier doit pouvoir enchaîner, succès ou échec.
    if (picked?.email === user.email) focusPerson(user.email);
    picked = null;
    busy = new Set(busy).add(group.id);
    const res = await changeGroupMembers(group.id, { add: [user.email] });
    const next = new Set(busy);
    next.delete(group.id);
    busy = next;
    if (!res.ok) {
      announce(texts.errors[res.data.error] || texts.errors.unknown, 'error');
      return;
    }
    const fresh = res.data.group;
    if (fresh) groups = groups.map((g) => (g.id === fresh.id ? { ...g, ...fresh } : g));
    const join = (u) =>
      u.email === user.email
        ? { ...u, groupIds: [...new Set([...(u.groupIds || []), group.id])] }
        : u;
    people = people.map(join);
    if (searched) searched = { ...searched, users: searched.users.map(join) };
    const before = (recent[group.id] || []).filter((email) => email !== user.email);
    recent = { ...recent, [group.id]: [user.email, ...before] };
    flash(group.id);
    announce(fill(texts.addedTo, { name: displayName(user), group: group.name }));
  }

  function flash(groupId) {
    clearTimeout(flashTimer);
    flashGroupId = groupId;
    flashTimer = setTimeout(() => {
      flashGroupId = '';
    }, FLASH_MS);
  }

  /**
   * L'annonce vit en bas de la zone visible, là où l'on vient de déposer : un
   * message en tête d'onglet serait hors de vue dès qu'on a fait défiler.
   */
  function announce(message, tone = 'ok') {
    clearTimeout(statusTimer);
    status = { message, tone };
    statusTimer = setTimeout(() => {
      status = null;
    }, STATUS_MS);
  }

  // ── Navigation entre les vues ──

  function startCreate() {
    if (limitReached) return;
    releaseHold();
    editing = null;
    returnTo = 'list';
    view = 'form';
  }

  function startEdit(group, from = 'list') {
    releaseHold();
    editing = group;
    returnTo = from;
    view = 'form';
  }

  function openMembers(group) {
    releaseHold();
    selected = group;
    view = 'members';
  }

  /** Retour des membres d'un groupe : les appartenances ont pu changer, la colonne se relit. */
  function backToList() {
    view = 'list';
    loadPeople();
  }

  function leaveForm() {
    view = returnTo === 'members' && selected ? 'members' : 'list';
    editing = null;
  }

  /**
   * Après enregistrement : le catalogue est relu (effectifs, ordre par nom),
   * et un groupe tout juste créé s'ouvre sur ses membres — c'est la suite
   * naturelle : on crée un groupe pour y mettre des gens.
   */
  async function onSaved(event) {
    const saved = event.detail.group;
    editing = null;
    await load();
    if (event.detail.created) {
      selected = groups.find((g) => g.id === saved.id) || saved;
      view = 'members';
      return;
    }
    leaveForm();
  }

  /** L'effectif renvoyé par le serveur remplace celui de la carte, sans relecture. */
  function onMembersChanged(event) {
    const fresh = event.detail.group;
    if (!fresh) return;
    groups = groups.map((g) => (g.id === fresh.id ? { ...g, ...fresh } : g));
    if (selected?.id === fresh.id) selected = { ...selected, ...fresh };
  }

  async function confirmDelete() {
    const group = deleting;
    if (!group) return;
    deleteState = 'deleting';
    errorMessage = '';
    const res = await deleteGroup(group.id);
    deleteState = 'idle';
    if (!res.ok) {
      deleting = null;
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      return;
    }
    deleting = null;
    if (selected?.id === group.id) {
      selected = null;
      view = 'list';
    }
    // Ses membres sans autre groupe sont revenus dans le groupe par défaut.
    load();
    loadPeople();
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<div class="ag-tab">
  {#if view === 'form'}
    <GroupForm {texts} {palette} group={editing} on:cancel={leaveForm} on:saved={onSaved} />
  {:else if view === 'members' && selected}
    <GroupMembers
      {texts}
      {userTexts}
      group={selected}
      {groups}
      {defaultId}
      on:back={backToList}
      on:edit={(e) => startEdit(e.detail, 'members')}
      on:changed={onMembersChanged}
    />
  {:else}
    <p class="ag-intro">{texts.intro}</p>
    <div class="ag-toolbar">
      <span class="ag-counter" class:ag-counter-max={limitReached}>
        {fill(texts.counter, { count: groups.length, max: max || '—' })}
      </span>
      <button
        type="button"
        class="ag-create"
        disabled={limitReached}
        title={limitReached ? fill(texts.errors.limit_reached, { max }) : null}
        on:click={startCreate}
      >
        <IconPlus width="16" height="16" aria-hidden="true" />
        {texts.createButton}
      </button>
    </div>

    {#if errorMessage}
      <div class="ag-error" role="alert">{errorMessage}</div>
    {/if}

    {#if loading && groups.length === 0}
      <div class="ag-grid" aria-hidden="true">
        <div class="ag-skeleton"></div>
        <div class="ag-skeleton"></div>
        <div class="ag-skeleton"></div>
      </div>
    {:else if groups.length === 0}
      <div class="ag-empty">
        <IconGroupsEmpty width="26" height="26" aria-hidden="true" />
        <span>{texts.empty}</span>
      </div>
    {:else}
      <div class="ag-board" bind:this={boardEl}>
        <div class="ag-board-grid">
          <div class="ag-people">
            <GroupPeople
              {texts}
              people={shownPeople}
              loaded={people.length}
              total={peopleTotal}
              loading={peopleLoading}
              bind:query={peopleQuery}
              {groupsById}
              {held}
              picking={!!picked}
              on:pick={onPick}
              on:dragstart={onDragStart}
              on:dragend={onDragEnd}
              on:cancel={cancelHold}
            />
          </div>

          <ul class="ag-grid">
            {#each groups as group (group.id)}
              <GroupCard
                {texts}
                {group}
                stack={stackOf(group, membersByGroup, recent)}
                newest={recent[group.id]?.[0] || ''}
                {held}
                picking={!!picked}
                member={isMemberOf(held, group)}
                adding={busy.has(group.id)}
                over={dropTarget === group.id}
                flash={flashGroupId === group.id}
                on:open={() => openMembers(group)}
                on:edit={() => startEdit(group)}
                on:delete={() => {
                  deleting = group;
                }}
                on:add={() => addToGroup(picked, group)}
                on:dragover={() => onCardDragOver(group)}
                on:dragleave={() => onCardDragLeave(group)}
                on:drop={() => onCardDrop(group)}
              />
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  {/if}

  <!-- Annonce de l'ajout : collée en bas de la zone visible. Toujours dans le
       DOM, pour que les lecteurs d'écran l'entendent changer. -->
  <div class="ag-toast-dock">
    <div
      class="ag-toast"
      class:ag-toast-on={status}
      class:ag-toast-error={status?.tone === 'error'}
      role="status"
    >
      {#if status}
        {#if status.tone === 'error'}
          <IconWarn width="16" height="16" aria-hidden="true" />
        {:else}
          <IconCheck width="16" height="16" aria-hidden="true" />
        {/if}
        <span>{status.message}</span>
      {/if}
    </div>
  </div>
</div>

{#if deleting}
  <div class="ag-overlay" role="dialog" aria-modal="true" aria-label={texts.deleteTitle}>
    <button
      type="button"
      class="ag-backdrop"
      aria-label={texts.cancel}
      on:click={() => {
        deleting = null;
      }}
    ></button>
    <div class="ag-panel">
      <h3 class="ag-panel-title">
        <IconWarn width="17" height="17" aria-hidden="true" />
        {texts.deleteTitle}
      </h3>
      <p class="ag-panel-message">
        {fill(texts.deleteMessage, { name: deleting.name, default: defaultGroup?.name || '' })}
      </p>
      <div class="ag-panel-actions">
        <button
          type="button"
          class="ag-secondary"
          disabled={deleteState === 'deleting'}
          on:click={() => {
            deleting = null;
          }}
        >
          {texts.cancel}
        </button>
        <button
          type="button"
          class="ag-danger"
          disabled={deleteState === 'deleting'}
          on:click={confirmDelete}
        >
          {texts.deleteConfirm}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ag-tab {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  /* Même phrase d'intro que les autres onglets : dire ce qu'on règle ici. */
  .ag-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
    max-width: 78ch;
  }
  .ag-toolbar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .ag-counter {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--brand-text);
    background: var(--brand-secondary-soft-08);
    border: 1px solid var(--brand-secondary-soft-18);
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
  }
  .ag-counter-max {
    color: var(--danger-strong);
    background: var(--danger-bg);
    border-color: var(--danger-line);
  }
  .ag-create {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
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
  .ag-create:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .ag-create:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }
  .ag-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
  }
  .ag-empty {
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
  .ag-empty :global(svg) {
    color: var(--line-faint);
  }

  /* ── Tableau : la colonne des comptes, puis les cartes ───────────────────
     Requête de CONTENEUR, pas de média : le panneau n'a pas la largeur de
     l'écran (historique ouvert à côté, fenêtre étroite). En dessous de
     720 px, la colonne devient une bande au-dessus des cartes (GroupPeople
     interroge le même conteneur). Svelte 4 perd la parenthèse d'un
     `@container (…){` collé : garder l'espace avant l'accolade. */
  .ag-board {
    container: ag-board / inline-size;
  }
  .ag-board-grid {
    display: grid;
    grid-template-columns: minmax(220px, 272px) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  /* La colonne reste en vue pendant qu'on fait défiler les groupes : un
     compte se glisse sur une carte du bas sans se perdre. */
  .ag-people {
    position: sticky;
    top: 0;
    z-index: 2;
    min-width: 0;
  }
  @container ag-board (max-width: 720px) {
    .ag-board-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .ag-people {
      position: static;
    }
  }

  /* ── Grille de cartes ─────────────────────────────────────────────────────
     auto-fill : une colonne sur mobile, deux à trois sur un écran de bureau,
     sans qu'une carte seule ne s'étire sur toute la ligne. */
  .ag-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
    gap: 14px;
  }
  .ag-skeleton {
    min-height: 150px;
    border: 1px dashed var(--line);
    border-radius: 12px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: ag-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes ag-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }

  /* ── Annonce ──────────────────────────────────────────────────────────────
     Un bandeau de hauteur nulle collé au bas de la zone qui défile ; l'annonce
     flotte au-dessus, centrée. */
  .ag-toast-dock {
    position: sticky;
    bottom: 0;
    z-index: 6;
    height: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .ag-toast {
    position: absolute;
    bottom: max(14px, var(--safe-bottom, 0px));
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: min(92%, 460px);
    padding: 9px 16px 9px 12px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--surface);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.35;
    box-shadow: 0 12px 28px -12px color-mix(in srgb, var(--ink) 60%, transparent);
    opacity: 0;
    transform: translateY(8px);
    transition:
      opacity 0.2s,
      transform 0.2s;
  }
  .ag-toast-on {
    opacity: 1;
    transform: none;
  }
  .ag-toast :global(svg) {
    flex-shrink: 0;
    color: var(--success-line);
  }
  .ag-toast-error {
    background: var(--danger-strong);
    color: #fff;
  }
  .ag-toast-error :global(svg) {
    color: #fff;
  }

  /* ── Confirmation de suppression ── */
  .ag-overlay {
    position: fixed;
    inset: 0;
    z-index: 10003;
    display: flex;
    padding: max(1rem, var(--safe-top, 0px)) 1rem max(1rem, var(--safe-bottom, 0px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .ag-backdrop {
    position: fixed;
    inset: 0;
    border: none;
    padding: 0;
    background: color-mix(in srgb, var(--ink) 40%, transparent);
    cursor: pointer;
  }
  .ag-panel {
    position: relative;
    margin: auto;
    width: 100%;
    max-width: 420px;
    background: var(--surface);
    border-radius: 10px;
    padding: 1.5rem;
    box-shadow: 0 18px 48px color-mix(in srgb, var(--ink) 25%, transparent);
  }
  .ag-panel-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.6rem;
    font-size: 1.1rem;
    color: var(--danger-text);
  }
  .ag-panel-title :global(svg) {
    flex-shrink: 0;
  }
  .ag-panel-message {
    margin: 0 0 1.1rem;
    color: var(--ink-soft);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .ag-panel-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .ag-danger {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 8px;
    background: var(--danger-strong);
    color: #fff;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
  }
  .ag-danger:disabled,
  .ag-secondary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ag-secondary {
    padding: 0.6rem 1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    cursor: pointer;
  }
  @media (prefers-reduced-motion: reduce) {
    .ag-skeleton {
      animation: none;
    }
    .ag-toast {
      transition: none;
    }
  }
</style>
