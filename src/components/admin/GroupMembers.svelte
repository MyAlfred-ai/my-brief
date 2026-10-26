<script>
  /**
   * Un groupe et ses membres : qui en fait partie, en ajouter, en retirer.
   *
   * Les membres se LISENT par la liste des comptes filtrée sur le groupe
   * (`listUsers({ group })`) : même projection que l'onglet Utilisateurs, donc
   * chaque ligne connaît aussi les AUTRES groupes du compte. C'est ce qui
   * permet de dire, avant le geste, ce que « Retirer » va faire : un compte
   * qui n'a pas d'autre groupe revient dans le groupe par défaut, et un compte
   * dont le groupe par défaut est le seul groupe ne peut pas en sortir. Le
   * serveur applique la même règle ; l'écran la dit pour qu'elle ne surprenne
   * pas.
   *
   * L'ajout passe par une recherche parmi tous les comptes, avec les comptes
   * déjà membres écartés : une liste complète à cocher ne tient pas dès
   * quelques dizaines de comptes, et la recherche est le geste des autres
   * écrans d'administration.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import IconBack from '~icons/solar/arrow-left-linear';
  import IconPen from '~icons/solar/pen-linear';
  import IconClock from '~icons/solar/clock-circle-linear';
  import IconGallery from '~icons/solar/gallery-linear';
  import IconSearch from '~icons/solar/magnifer-linear';
  import IconUserPlus from '~icons/solar/user-plus-rounded-linear';
  import IconUserMinus from '~icons/solar/user-minus-rounded-linear';
  import IconUsersEmpty from '~icons/solar/users-group-two-rounded-linear';
  import GroupChip from '../ui/GroupChip.svelte';
  import { listUsers } from '../../services/adminUsersApi.js';
  import { changeGroupMembers } from '../../services/adminGroupsApi.js';
  import { groupColorVars } from '../../utils/groupColors.js';
  import { fill } from '../../utils/i18nFormat.js';

  export let texts; // $uiText.adminGroups
  export let userTexts; // $uiText.adminUsers (rôles)
  export let group;
  /** Tous les groupes, pour nommer les autres appartenances d'un membre. */
  export let groups = [];
  export let defaultId = 'default';

  const dispatch = createEventDispatcher();

  let members = [];
  let total = 0;
  let loading = true;
  let errorMessage = '';
  /** Recherche d'un compte à ajouter. */
  let query = '';
  let candidates = [];
  let searching = false;
  let searched = false;
  let searchTimer = null;
  /** Adresse dont l'ajout ou le retrait part au serveur — une seule à la fois. */
  let busyEmail = '';

  $: groupsById = new Map(groups.map((g) => [g.id, g]));
  $: defaultGroup = groupsById.get(defaultId) || null;
  $: defaultName = defaultGroup?.name || '';
  $: vars = groupColorVars(group.color);
  $: memberEmails = new Set(members.map((m) => String(m.email).toLowerCase()));
  $: addable = candidates.filter((u) => !memberEmails.has(String(u.email).toLowerCase()));

  onMount(loadMembers);

  function countLabel(n) {
    if (n === 0) return texts.membersNone;
    if (n === 1) return texts.membersOne;
    return fill(texts.membersMany, { n });
  }

  $: quotaLimited = Number.isInteger(group.meetingMinutesPerMonth);
  $: quotaText = quotaLimited
    ? fill(texts.quotaPill, { minutes: group.meetingMinutesPerMonth })
    : texts.quotaPillUnlimited;

  async function loadMembers() {
    loading = true;
    errorMessage = '';
    const res = await listUsers({ group: group.id, limit: 200 });
    loading = false;
    if (!res.ok) {
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      return;
    }
    members = res.data.users || [];
    total = res.data.total || 0;
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    if (!query.trim()) {
      candidates = [];
      searched = false;
      return;
    }
    searchTimer = setTimeout(search, 250);
  }

  async function search() {
    const term = query.trim();
    if (!term) return;
    searching = true;
    const res = await listUsers({ q: term, limit: 20 });
    searching = false;
    searched = true;
    candidates = res.ok ? res.data.users || [] : [];
  }

  /**
   * Ajout ou retrait : le serveur répond avec l'effectif à jour, qu'on
   * remonte au parent pour que la carte du groupe suive sans recharger tout
   * le catalogue.
   */
  async function change(user, changes) {
    errorMessage = '';
    busyEmail = user.email;
    const res = await changeGroupMembers(group.id, changes);
    busyEmail = '';
    if (!res.ok) {
      errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
      return;
    }
    dispatch('changed', { group: res.data.group });
    await loadMembers();
    if (query.trim()) await search();
  }

  const add = (user) => change(user, { add: [user.email] });
  const remove = (user) => change(user, { remove: [user.email] });

  /** Les groupes du membre AUTRES que celui-ci, résolus par nom. */
  function otherGroupsOf(user, byId) {
    return (user.groupIds || [])
      .filter((id) => id !== group.id)
      .map((id) => byId.get(id))
      .filter(Boolean);
  }

  /**
   * Ce que « Retirer » va faire pour ce membre : le retirer simplement,
   * le renvoyer dans le groupe par défaut, ou rien (c'est déjà son seul
   * groupe, et c'est le groupe par défaut).
   */
  function removalOf(user, byId) {
    const others = otherGroupsOf(user, byId);
    if (others.length > 0) return { allowed: true, hint: texts.removeHint };
    if (group.id === defaultId) return { allowed: false, hint: texts.removeOnlyDefaultHint };
    return { allowed: true, hint: fill(texts.removeLastHint, { default: defaultName }) };
  }

  const initialsOf = (user) => (user.name || user.email || '?').trim().slice(0, 2).toUpperCase();
</script>

<div class="gm-wrap" style="--gm-dot: {vars.dot}; --gm-soft: {vars.soft}">
  <button type="button" class="gm-back" on:click={() => dispatch('back')}>
    <IconBack width="13" height="13" aria-hidden="true" />
    {texts.back}
  </button>

  <!-- En-tête : le groupe, sa description, son effectif, et le raccourci
       vers sa modification. La bande de couleur est celle des cartes. -->
  <header class="gm-head">
    <span class="gm-dot" aria-hidden="true"></span>
    <div class="gm-head-text">
      <h3 class="gm-name">
        {group.name}
        {#if group.isDefault}<span class="gm-default">{texts.defaultBadge}</span>{/if}
      </h3>
      <p class="gm-desc" class:gm-desc-empty={!group.description}>
        {group.description || (group.isDefault ? texts.defaultHint : texts.noDescription)}
      </p>
    </div>
    <!-- Quota, droits, effectif et crayon : un bloc qui passe sous le titre
         quand la place manque, plutôt que d'écraser le texte (téléphone). -->
    <div class="gm-head-meta">
      <span
        class="gm-count gm-quota"
        class:gm-quota-limited={quotaLimited}
        title={texts.quotaLabel}
      >
        <IconClock width="13" height="13" aria-hidden="true" />
        {quotaText}
      </span>
      {#if group.infographicAllowed}
        <span class="gm-count gm-right" title={texts.infographicLabel}>
          <IconGallery width="13" height="13" aria-hidden="true" />
          {texts.infographicPill}
        </span>
      {/if}
      <span class="gm-count">{countLabel(total)}</span>
      <button
        type="button"
        class="gm-icon-btn"
        title={texts.editTitle}
        aria-label={texts.editTitle}
        on:click={() => dispatch('edit', group)}
      >
        <IconPen width="15" height="15" />
      </button>
    </div>
  </header>

  <!-- Ajouter : recherche parmi tous les comptes, membres écartés. -->
  <section class="gm-add">
    <label class="gm-add-label" for="gm-search">
      <IconUserPlus width="15" height="15" aria-hidden="true" />
      {texts.addMemberLabel}
    </label>
    <div class="gm-search-wrap">
      <span class="gm-search-icon" aria-hidden="true"><IconSearch width="15" height="15" /></span>
      <input
        id="gm-search"
        class="gm-search"
        type="search"
        autocomplete="off"
        placeholder={texts.addMemberPlaceholder}
        bind:value={query}
        on:input={onSearchInput}
      />
    </div>
    {#if !query.trim()}
      <p class="gm-hint">{texts.addMemberHint}</p>
    {:else if searching && !searched}
      <p class="gm-hint">{texts.loading}</p>
    {:else if searched && candidates.length === 0}
      <p class="gm-hint">{texts.addMemberNone}</p>
    {:else if searched && addable.length === 0}
      <p class="gm-hint">{texts.addMemberAllIn}</p>
    {:else if addable.length > 0}
      <ul class="gm-candidates">
        {#each addable as user (user.email)}
          <li class="gm-candidate">
            <span class="gm-avatar gm-avatar-sm" aria-hidden="true">{initialsOf(user)}</span>
            <span class="gm-candidate-text">
              <span class="gm-candidate-name">{user.name || user.email}</span>
              <span class="gm-candidate-email">{user.email}</span>
            </span>
            <button
              type="button"
              class="gm-add-btn"
              disabled={busyEmail === user.email}
              on:click={() => add(user)}
            >
              {busyEmail === user.email ? texts.adding : texts.addMemberLabel}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if errorMessage}
    <div class="gm-error" role="alert">{errorMessage}</div>
  {/if}

  <!-- Membres -->
  <section class="gm-members">
    <h4 class="gm-members-title">{texts.membersTitle}</h4>
    {#if loading}
      <div class="gm-loading">{texts.loading}</div>
    {:else if members.length === 0}
      <div class="gm-empty">
        <IconUsersEmpty width="26" height="26" aria-hidden="true" />
        <span>{texts.noMembers}</span>
      </div>
    {:else}
      <ul class="gm-list">
        {#each members as user (user.email)}
          {@const others = otherGroupsOf(user, groupsById)}
          {@const removal = removalOf(user, groupsById)}
          <li class="gm-row" class:gm-row-disabled={user.disabled}>
            <span class="gm-avatar" aria-hidden="true">{initialsOf(user)}</span>
            <div class="gm-identity">
              <div class="gm-row-name">
                {user.name || user.email}
                <span class="gm-role" class:gm-role-admin={user.role === 'admin'}>
                  {user.role === 'admin' ? userTexts.roleAdmin : userTexts.roleUser}
                </span>
                {#if user.disabled}<span class="gm-role gm-role-off">{userTexts.disabledBadge}</span
                  >{/if}
              </div>
              <div class="gm-row-email">{user.email}</div>
              {#if others.length}
                <div class="gm-others">
                  <span class="gm-others-label">{texts.otherGroups}</span>
                  {#each others as other (other.id)}
                    <GroupChip group={other} />
                  {/each}
                </div>
              {/if}
            </div>
            <button
              type="button"
              class="gm-remove"
              title={removal.hint}
              aria-label="{texts.remove} : {user.email}"
              disabled={!removal.allowed || busyEmail === user.email}
              on:click={() => remove(user)}
            >
              <IconUserMinus width="15" height="15" aria-hidden="true" />
              <span>{texts.remove}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if total > members.length}
        <p class="gm-total">{members.length} / {total}</p>
      {/if}
    {/if}
  </section>
</div>

<style>
  .gm-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .gm-back {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--brand-text);
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
    font-weight: 500;
    font-family: inherit;
  }
  .gm-back:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* ── En-tête du groupe ── */
  .gm-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.85rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: linear-gradient(180deg, var(--gm-soft), transparent 85%), var(--surface);
  }
  .gm-dot {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin-top: 0.3rem;
    border-radius: 50%;
    background: var(--gm-dot);
    box-shadow: 0 0 0 3px var(--surface);
  }
  /* Une base de 220 px : en dessous, le bloc des pastilles passe à la ligne
     au lieu de réduire le titre à une lettre par ligne. */
  .gm-head-text {
    flex: 1 1 220px;
    min-width: 0;
  }
  .gm-head-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }
  .gm-name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    font-size: 1.1rem;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .gm-default {
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    color: var(--ink-muted);
  }
  .gm-desc {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .gm-desc-empty {
    font-style: italic;
    color: var(--ink-faint);
  }
  .gm-count {
    flex: 0 0 auto;
    align-self: center;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .gm-quota {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-faint);
    font-weight: 500;
  }
  .gm-quota-limited {
    color: var(--brand-text);
    font-weight: 600;
    border-color: var(--brand-secondary-soft-18);
    background: var(--brand-secondary-soft-08);
  }
  .gm-right {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--success-text);
    border-color: var(--success-line);
    background: var(--success-bg);
  }
  .gm-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: 8px;
    padding: 0;
    cursor: pointer;
    color: var(--ink-muted);
    flex-shrink: 0;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .gm-icon-btn:hover {
    background: var(--surface-tint);
    color: var(--ink);
  }

  /* ── Ajouter un membre ── */
  .gm-add {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.9rem 1rem 1rem;
    border: 1px dashed var(--line-strong);
    border-radius: 12px;
    background: var(--surface-tint);
  }
  .gm-add-label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .gm-add-label :global(svg) {
    color: var(--brand-text);
  }
  .gm-search-wrap {
    position: relative;
    display: flex;
  }
  .gm-search-icon {
    position: absolute;
    left: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    color: var(--ink-faint);
    pointer-events: none;
  }
  .gm-search {
    flex: 1;
    min-width: 0;
    padding: 0.55rem 0.75rem 0.55rem 2.1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    font-size: 0.92rem;
    font-family: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .gm-search:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .gm-hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
  }
  .gm-candidates {
    list-style: none;
    margin: 0.2rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .gm-candidate {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .gm-candidate-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .gm-candidate-name {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .gm-candidate-email {
    font-size: 0.78rem;
    color: var(--ink-faint);
    overflow-wrap: anywhere;
  }
  .gm-add-btn {
    flex-shrink: 0;
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .gm-add-btn:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .gm-add-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .gm-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
  }

  /* ── Membres ── */
  .gm-members {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .gm-members-title {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
  .gm-loading {
    padding: 1.5rem;
    text-align: center;
    color: var(--ink-faint);
  }
  .gm-empty {
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
    line-height: 1.5;
  }
  .gm-empty :global(svg) {
    color: var(--line-faint);
  }
  .gm-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .gm-row {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }
  .gm-row-disabled {
    opacity: 0.6;
  }
  .gm-avatar {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--gm-soft);
    color: var(--ink-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.82rem;
  }
  .gm-avatar-sm {
    width: 30px;
    height: 30px;
    font-size: 0.7rem;
  }
  .gm-identity {
    flex: 1;
    min-width: 0;
  }
  .gm-row-name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-weight: 600;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .gm-role {
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--line);
    color: var(--ink-muted);
  }
  .gm-role-admin {
    background: var(--brand-secondary-soft-15);
    color: var(--brand-text-strong);
    font-weight: 600;
  }
  .gm-role-off {
    background: var(--danger-bg);
    color: var(--danger-text);
  }
  .gm-row-email {
    font-size: 0.82rem;
    color: var(--ink-faint);
    overflow-wrap: anywhere;
  }
  .gm-others {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.35rem;
  }
  .gm-others-label {
    font-size: 0.72rem;
    color: var(--ink-faint);
  }
  .gm-remove {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
  }
  .gm-remove:hover:not(:disabled) {
    background: var(--danger-bg);
    border-color: var(--danger-line);
    color: var(--danger-text);
  }
  .gm-remove:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .gm-total {
    margin: 0;
    text-align: right;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  @media (max-width: 640px) {
    .gm-remove span {
      display: none;
    }
    .gm-remove {
      padding: 0.4rem 0.5rem;
    }
  }
</style>
