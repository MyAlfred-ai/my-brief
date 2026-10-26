<script>
  /**
   * Colonne « Utilisateurs » de l'onglet Groupes : les comptes à poser sur une
   * carte de groupe pour l'y ajouter.
   *
   * Présentationnel : aucun appel d'API. GroupsTab possède la liste, la
   * recherche, le compte « en main » et l'ajout ; ici on affiche et on signale.
   *
   * Deux gestes pour le même résultat :
   *   - glisser une ligne sur une carte (souris, trackpad) ;
   *   - la SÉLECTIONNER (clic, Entrée ou Espace, toucher), puis choisir la
   *     carte, qui affiche alors « Ajouter … ici ».
   * Le second n'est pas un secours de confort : le glisser-déposer HTML ne
   * fonctionne ni au clavier ni au doigt sur la plupart des téléphones.
   *
   * La ligne est un `div role="button"` et non un <button> : Firefox ne démarre
   * pas un glisser depuis un bouton.
   *
   * `pick` porte `{ user, keyboard }` : sélectionné au clavier, le compte
   * envoie le focus sur le premier groupe qui peut l'accueillir (GroupsTab),
   * sans quoi il faudrait traverser toute la colonne à la tabulation.
   */
  import { createEventDispatcher } from 'svelte';
  import IconSearch from '~icons/solar/magnifer-linear';
  import IconClose from '~icons/solar/close-circle-linear';
  import { fill } from '../../utils/i18nFormat.js';
  import { groupColorVars } from '../../utils/groupColors.js';

  export let texts; // $uiText.adminGroups
  /** Comptes affichés, déjà filtrés par la recherche. */
  export let people = [];
  /** Comptes chargés, et comptes sur l'installation : « 200 / 340 » si la liste est tronquée. */
  export let loaded = 0;
  export let total = 0;
  /** Recherche (liée par le parent). */
  export let query = '';
  /** Premier chargement en cours : des lignes fantômes plutôt que « Aucun compte ». */
  export let loading = false;
  /** Catalogue des groupes : les pastilles de chaque ligne. */
  export let groupsById = new Map();
  /** Le compte en main (glissé ou sélectionné), ou null. */
  export let held = null;
  /** Vrai si le compte en main a été SÉLECTIONNÉ (et non glissé). */
  export let picking = false;

  const dispatch = createEventDispatcher();

  const displayName = (user) => user.name || user.email;
  // Même règle que la liste des comptes et les membres d'un groupe : un
  // compte garde les mêmes initiales d'un écran d'administration à l'autre.
  const initials = (user) => (user.name || user.email || '?').trim().slice(0, 2).toUpperCase();

  /** Les groupes du compte, dans l'ordre du catalogue, sans identifiant mort. */
  function groupsOf(user, byId) {
    return (user.groupIds || []).map((id) => byId.get(id)).filter(Boolean);
  }

  function onDragStart(event, user) {
    const data = event.dataTransfer;
    if (data) {
      data.effectAllowed = 'copy';
      // Firefox ne démarre pas un glisser sans donnée attachée.
      data.setData('text/plain', user.email);
    }
    dispatch('dragstart', user);
  }

  function onKeydown(event, user) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    dispatch('pick', { user, keyboard: true });
  }
</script>

<aside class="gp" aria-labelledby="gp-title">
  <h4 id="gp-title" class="gp-title">
    {texts.peopleTitle}
    <span class="gp-count">{total || loaded}</span>
  </h4>

  <!-- Mode sélection : le bandeau se pose SUR l'aide et la recherche, qui ne
       servent plus tant qu'un compte est en main. Inséré au-dessus de la
       liste, il la décalerait sous le doigt, juste après le toucher. -->
  <div class="gp-tools">
    <div class="gp-tools-inner" inert={!!(held && picking)}>
      <p id="gp-help" class="gp-help">{texts.peopleHint}</p>
      <div class="gp-search">
        <span class="gp-search-icon" aria-hidden="true"><IconSearch width="14" height="14" /></span>
        <input
          class="gp-search-input"
          type="search"
          autocomplete="off"
          placeholder={texts.peopleSearch}
          aria-label={texts.peopleSearch}
          bind:value={query}
        />
      </div>
    </div>
    {#if held && picking}
      <div class="gp-held" role="status">
        <span class="gp-held-text">{fill(texts.pickedHint, { name: displayName(held) })}</span>
        <button type="button" class="gp-held-cancel" on:click={() => dispatch('cancel')}>
          <IconClose width="14" height="14" aria-hidden="true" />
          {texts.cancel}
        </button>
      </div>
    {/if}
  </div>

  {#if loading && people.length === 0}
    <ul class="gp-list" aria-hidden="true">
      {#each [0, 1, 2, 3] as row (row)}
        <li class="gp-item"><div class="gp-person gp-person-skeleton"></div></li>
      {/each}
    </ul>
  {:else if people.length === 0}
    <p class="gp-empty">{query.trim() ? texts.addMemberNone : texts.peopleEmpty}</p>
  {:else}
    <ul class="gp-list">
      {#each people as user (user.email)}
        <li class="gp-item">
          <div
            class="gp-person"
            class:gp-person-held={held?.email === user.email}
            role="button"
            tabindex="0"
            draggable="true"
            aria-pressed={picking && held?.email === user.email}
            aria-describedby="gp-help"
            data-email={user.email}
            on:click={() => dispatch('pick', { user, keyboard: false })}
            on:keydown={(event) => onKeydown(event, user)}
            on:dragstart={(event) => onDragStart(event, user)}
            on:dragend={() => dispatch('dragend')}
          >
            <span class="gp-grip" aria-hidden="true"></span>
            <span class="gp-avatar" aria-hidden="true">{initials(user)}</span>
            <span class="gp-text">
              <span class="gp-name">{displayName(user)}</span>
              <span class="gp-email">{user.email}</span>
            </span>
            <span class="gp-dots" aria-hidden="true">
              {#each groupsOf(user, groupsById) as group (group.id)}
                <span
                  class="gp-dot"
                  style="--dot: {groupColorVars(group.color).dot}"
                  title={group.name}
                ></span>
              {/each}
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if total > loaded}
    <p class="gp-more">{fill(texts.peopleTruncated, { shown: loaded, total })}</p>
  {/if}
</aside>

<style>
  .gp {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface-tint);
  }
  .gp-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .gp-count {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--line);
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .gp-tools {
    position: relative;
  }
  .gp-tools-inner {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gp-help {
    margin: -4px 0 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink-faint);
  }
  .gp-search {
    position: relative;
    display: flex;
  }
  .gp-search-icon {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    color: var(--ink-faint);
    pointer-events: none;
  }
  .gp-search-input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px 7px 29px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    font-family: inherit;
    font-size: 12.5px;
    color: var(--ink);
  }
  .gp-search-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }

  /* Compte en main (mode sélection) : couvre l'aide et la recherche. */
  .gp-held {
    position: absolute;
    inset: -4px -4px 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--brand-secondary) 10%, var(--surface));
    border: 1px solid var(--brand-secondary-soft-18);
    font-size: 12.5px;
    color: var(--brand-text-strong);
    animation: gp-held-in 0.16s ease-out;
  }
  @keyframes gp-held-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .gp-held-text {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    line-height: 1.35;
  }
  .gp-held-cancel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 4px 9px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .gp-held-cancel:hover {
    border-color: var(--brand);
    color: var(--brand-text);
  }

  .gp-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    /* Bornée : la colonne reste collée en haut du panneau pendant qu'on fait
       défiler les groupes, elle doit tenir entière à l'écran. */
    max-height: min(56vh, 520px);
    overflow-y: auto;
    /* Place pour l'anneau du compte en main, que le défilement rognerait. */
    padding: 4px;
    margin: -4px;
  }
  .gp-person {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 9px 7px 6px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--surface);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 5%, transparent);
    cursor: grab;
    user-select: none;
    transition:
      border-color 0.15s,
      box-shadow 0.15s,
      transform 0.15s,
      background 0.15s;
  }
  .gp-person:hover {
    border-color: var(--line-strong);
    box-shadow: 0 6px 16px -10px color-mix(in srgb, var(--ink) 35%, transparent);
    transform: translateY(-1px);
  }
  .gp-person:active {
    cursor: grabbing;
  }
  .gp-person:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .gp-person-held {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .gp-person-skeleton {
    height: 44px;
    box-sizing: border-box;
    cursor: default;
    background: linear-gradient(
      90deg,
      var(--surface) 25%,
      color-mix(in srgb, var(--brand-secondary) 5%, var(--surface)) 37%,
      var(--surface) 63%
    );
    background-size: 400% 100%;
    animation: gp-shimmer 1.4s ease-in-out infinite;
  }
  .gp-person-skeleton:hover {
    border-color: transparent;
    transform: none;
  }
  @keyframes gp-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  /* Poignée : deux colonnes de trois points, le signe universel du « glissable ». */
  .gp-grip {
    flex-shrink: 0;
    width: 6px;
    height: 14px;
    opacity: 0.45;
    background-image: radial-gradient(circle, var(--ink-muted) 1.2px, transparent 1.4px);
    background-size: 3px 4.7px;
  }
  .gp-person:hover .gp-grip,
  .gp-person-held .gp-grip {
    opacity: 0.8;
  }
  .gp-avatar {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--brand-secondary-soft-15);
    color: var(--brand-text-strong);
    font-size: 11px;
    font-weight: 700;
  }
  .gp-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .gp-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gp-email {
    font-size: 11px;
    color: var(--ink-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gp-dots {
    display: inline-flex;
    flex-shrink: 0;
    gap: 3px;
  }
  .gp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot);
    box-shadow: 0 0 0 1.5px var(--surface);
  }
  .gp-empty,
  .gp-more {
    margin: 0;
    font-size: 11.5px;
    color: var(--ink-faint);
    text-align: center;
  }
  .gp-empty {
    padding: 14px 6px;
  }

  /* Colonne étroite (téléphone, panneau serré) : une bande horizontale de
     comptes compacts, au-dessus des groupes. Le geste devient « toucher le
     compte, puis toucher le groupe ». */
  @container ag-board (max-width: 720px) {
    .gp-list {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      max-height: none;
      gap: 6px;
      padding-bottom: 6px;
      scroll-snap-type: x proximity;
    }
    .gp-item {
      flex: 0 0 auto;
      scroll-snap-align: start;
    }
    .gp-person {
      padding: 6px 10px 6px 6px;
      max-width: 190px;
    }
    .gp-person-skeleton {
      width: 130px;
    }
    .gp-email,
    .gp-grip {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .gp-person {
      transition: none;
    }
    .gp-person-skeleton,
    .gp-held {
      animation: none;
    }
    .gp-person:hover {
      transform: none;
    }
  }
</style>
