<script>
  /**
   * Une carte de l'onglet Groupes : le bandeau à la couleur du groupe, sa
   * description, ses membres (pile d'avatars et effectif), son quota et les
   * gestes rares (modifier, supprimer).
   *
   * Tant qu'un compte est « en main » (glissé ou sélectionné depuis la
   * colonne Utilisateurs), la carte devient une CIBLE qui dit ce qu'elle
   * fera : « Déposer ici », « Ajouter … ici », ou « Déjà dans ce groupe ».
   * Ses boutons sortent alors du jeu (`inert`) : un clic ne doit pas ouvrir
   * les membres quand on croit choisir un groupe.
   *
   * Présentationnelle : GroupsTab décide qui est en main, qui est membre et
   * ce qui part au serveur ; la carte affiche et signale.
   */
  import { createEventDispatcher } from 'svelte';
  import IconPen from '~icons/solar/pen-linear';
  import IconTrash from '~icons/solar/trash-bin-trash-linear';
  import IconUsers from '~icons/solar/users-group-rounded-linear';
  import IconClock from '~icons/solar/clock-circle-linear';
  import IconUserPlus from '~icons/solar/user-plus-rounded-linear';
  import IconUserCheck from '~icons/solar/user-check-rounded-linear';
  import IconGallery from '~icons/solar/gallery-linear';
  import { groupColorVars } from '../../utils/groupColors.js';
  import { fill } from '../../utils/i18nFormat.js';

  export let texts; // $uiText.adminGroups
  export let group;
  /** Avatars montrés et reste de l'effectif : { shown, more }. */
  export let stack = { shown: [], more: 0 };
  /** Adresse du dernier compte ajouté ici : son avatar entre avec un rebond. */
  export let newest = '';
  /** Le compte en main, ou null. */
  export let held = null;
  /** Vrai si le compte en main a été SÉLECTIONNÉ ; faux s'il est glissé. */
  export let picking = false;
  /** Le compte en main est déjà dans ce groupe. */
  export let member = false;
  /** L'ajout vers ce groupe est parti au serveur. */
  export let adding = false;
  /** Un glisser que la carte accepte la survole. */
  export let over = false;
  /** La carte vient de recevoir quelqu'un : un éclat dans sa couleur. */
  export let flash = false;

  const dispatch = createEventDispatcher();

  $: vars = groupColorVars(group.color);
  $: covered = !!held || adding;
  $: accepts = !!held && !member && !adding;
  $: heldName = held ? held.name || held.email : '';
  $: quotaLimited = Number.isInteger(group.meetingMinutesPerMonth);

  function countLabel(n) {
    if (n === 0) return texts.membersNone;
    if (n === 1) return texts.membersOne;
    return fill(texts.membersMany, { n });
  }

  // Une seule lettre dans la pile, comme sur MIA : les avatars se chevauchent,
  // une deuxième lettre serait rognée par le suivant. Le nom est en infobulle.
  const initialOf = (user) => (user.name || user.email || '?').trim().charAt(0).toUpperCase();

  /**
   * Annuler l'événement, c'est accepter le dépôt : une carte dont le compte
   * est déjà membre le laisse passer, et le navigateur montre « interdit ».
   * `dragenter` aussi, comme le demande la spécification.
   */
  function onDragOver(event) {
    if (picking || !accepts) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dispatch('dragover');
  }

  function onDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    dispatch('dragleave');
  }

  function onDrop(event) {
    // Sans quoi Firefox « ouvre » le texte déposé : l'adresse du compte.
    event.preventDefault();
    if (accepts && !picking) dispatch('drop');
  }
</script>

<!-- La carte entière reçoit le dépôt. Le glisser est un geste de souris :
     au clavier et au doigt, le même ajout passe par « Ajouter … ici ». -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<li
  class="gc"
  class:gc-target={accepts}
  class:gc-member={held && member}
  class:gc-over={over}
  class:gc-dragging={held && !picking}
  class:gc-flash={flash}
  style="--card-dot: {vars.dot}; --card-soft: {vars.soft}"
  on:dragenter={onDragOver}
  on:dragover={onDragOver}
  on:dragleave={onDragLeave}
  on:drop={onDrop}
>
  <!-- Toute la tête ouvre les membres : c'est ce qu'on vient voir. -->
  <button
    type="button"
    class="gc-head"
    inert={covered}
    aria-label={fill(texts.openMembers, { name: group.name })}
    on:click={() => dispatch('open')}
  >
    <span class="gc-dot" aria-hidden="true"></span>
    <span class="gc-name">{group.name}</span>
    {#if group.isDefault}
      <span class="gc-default">{texts.defaultBadge}</span>
    {/if}
  </button>

  <div class="gc-body">
    <div class="gc-content" inert={covered}>
      <p class="gc-desc" class:gc-desc-empty={!group.description}>
        {group.description || (group.isDefault ? texts.defaultHint : texts.noDescription)}
      </p>
      <!-- Les visages avant le nombre, comme sur MIA : un groupe se
           reconnaît à ses membres. -->
      <button type="button" class="gc-members" on:click={() => dispatch('open')}>
        {#if stack.shown.length > 0}
          <span class="gc-stack" aria-hidden="true">
            {#each stack.shown as person (person.email)}
              <span
                class="gc-avatar"
                class:gc-avatar-new={newest === person.email}
                title={person.name || person.email}>{initialOf(person)}</span
              >
            {/each}
            {#if stack.more > 0}
              <span class="gc-avatar gc-avatar-more">+{stack.more}</span>
            {/if}
          </span>
        {:else}
          <IconUsers width="15" height="15" aria-hidden="true" />
        {/if}
        <span class="gc-count">{countLabel(group.memberCount)}</span>
      </button>
      <div class="gc-foot">
        <!-- Le quota : limité en clair, « Illimité » en retrait. Puis les
             droits que le groupe donne : une pastille par droit accordé. -->
        <div class="gc-pills">
          <span class="gc-quota" class:gc-quota-limited={quotaLimited} title={texts.quotaLabel}>
            <IconClock width="13" height="13" aria-hidden="true" />
            {quotaLimited
              ? fill(texts.quotaPill, { minutes: group.meetingMinutesPerMonth })
              : texts.quotaPillUnlimited}
          </span>
          {#if group.infographicAllowed}
            <span class="gc-right" title={texts.infographicLabel}>
              <IconGallery width="13" height="13" aria-hidden="true" />
              {texts.infographicPill}
            </span>
          {/if}
        </div>
        <div class="gc-actions">
          <button
            type="button"
            class="gc-icon-btn"
            title={texts.editTitle}
            aria-label="{texts.editTitle} : {group.name}"
            on:click={() => dispatch('edit')}
          >
            <IconPen width="15" height="15" />
          </button>
          {#if !group.isDefault}
            <button
              type="button"
              class="gc-icon-btn gc-icon-danger"
              title={texts.deleteButton}
              aria-label="{texts.deleteButton} : {group.name}"
              on:click={() => dispatch('delete')}
            >
              <IconTrash width="15" height="15" />
            </button>
          {/if}
        </div>
      </div>
    </div>

    {#if covered}
      <!-- La cible : ce que la carte fera du compte en main. Sur le corps,
           sous la tête qui garde le nom et la couleur en vue. -->
      {#if adding}
        <div class="gc-drop gc-drop-busy">
          <span class="gc-drop-label">
            <span class="gc-spinner" aria-hidden="true"></span>
            {texts.adding}
          </span>
        </div>
      {:else if member}
        <div class="gc-drop gc-drop-member">
          <span class="gc-drop-label">
            <IconUserCheck width="15" height="15" aria-hidden="true" />
            <span class="gc-sr">{group.name} :</span>
            {texts.dropAlready}
          </span>
        </div>
      {:else if picking}
        <button
          type="button"
          class="gc-drop gc-drop-add"
          aria-label={fill(texts.dropAddTo, { name: heldName, group: group.name })}
          on:click={() => dispatch('add')}
        >
          <span class="gc-drop-label">
            <IconUserPlus width="15" height="15" aria-hidden="true" />
            {fill(texts.dropAdd, { name: heldName })}
          </span>
        </button>
      {:else}
        <div class="gc-drop" aria-hidden="true">
          <span class="gc-drop-label">
            <IconUserPlus width="15" height="15" aria-hidden="true" />
            {over ? texts.dropRelease : texts.dropHere}
          </span>
        </div>
      {/if}
    {/if}
  </div>
</li>

<style>
  .gc {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    overflow: hidden;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 4%, transparent);
    outline: 2px solid transparent;
    outline-offset: 3px;
    transition:
      border-color 0.15s,
      box-shadow 0.15s,
      outline-color 0.15s,
      opacity 0.15s;
  }
  .gc:hover {
    border-color: var(--line-strong);
    box-shadow: 0 8px 22px -12px color-mix(in srgb, var(--ink) 28%, transparent);
  }
  /* Compte en main : la carte qui l'accepte se signale en pointillé, dans sa
     couleur ; celle qu'on survole passe en trait plein. */
  .gc-target {
    outline: 2px dashed color-mix(in srgb, var(--card-dot) 55%, transparent);
  }
  .gc-over {
    outline-style: solid;
    outline-color: var(--card-dot);
    border-color: var(--card-dot);
    box-shadow: 0 14px 30px -14px color-mix(in srgb, var(--card-dot) 75%, transparent);
  }
  .gc-member {
    opacity: 0.72;
  }
  /* Pendant un glisser, la carte seule reçoit les événements : sinon chaque
     passage d'un enfant à l'autre ferait clignoter la cible. */
  .gc-dragging > * {
    pointer-events: none;
  }
  .gc-flash {
    animation: gc-flash 1.4s ease-out;
  }
  @keyframes gc-flash {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--card-dot) 60%, transparent);
    }
    100% {
      box-shadow: 0 0 0 14px color-mix(in srgb, var(--card-dot) 0%, transparent);
    }
  }

  /* Bandeau : la carte porte la couleur de son groupe. */
  .gc-head {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    border: none;
    border-bottom: 1px solid var(--line);
    background: var(--card-soft);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: filter 0.15s;
  }
  .gc-head:hover {
    filter: brightness(0.97);
  }
  .gc-head:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .gc-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--card-dot);
    box-shadow: 0 0 0 2px var(--surface);
    flex-shrink: 0;
  }
  .gc-name {
    flex: 1;
    min-width: 0;
    font-size: 14.5px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .gc-default {
    flex-shrink: 0;
    font-size: 0.66rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    color: var(--ink-muted);
  }
  .gc-body {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .gc-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    padding: 12px 14px;
  }
  .gc-desc {
    margin: 0;
    flex: 1;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
    /* Trois lignes au plus : la carte reste une carte, la fiche dit le reste. */
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .gc-desc-empty {
    font-style: italic;
    color: var(--ink-faint);
  }

  /* Membres : la pile d'avatars, puis l'effectif. */
  .gc-members {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 3px 12px 3px 4px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface-tint);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  .gc-members:hover {
    border-color: var(--brand);
    color: var(--brand-text);
  }
  .gc-members:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .gc-members > :global(svg) {
    margin-left: 6px;
    color: var(--card-dot);
  }
  .gc-stack {
    display: inline-flex;
    align-items: center;
  }
  .gc-avatar {
    box-sizing: border-box;
    width: 26px;
    height: 26px;
    margin-left: -8px;
    border-radius: 50%;
    border: 2px solid var(--surface-tint);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--card-dot) 18%, var(--surface));
    color: color-mix(in srgb, var(--card-dot) 60%, var(--ink));
    font-size: 11px;
    font-weight: 700;
  }
  .gc-avatar:first-child {
    margin-left: 0;
  }
  .gc-avatar-more {
    background: var(--surface);
    color: var(--ink-muted);
    font-size: 9.5px;
  }
  .gc-avatar-new {
    animation: gc-pop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.35);
  }
  @keyframes gc-pop {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .gc-foot {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    padding-top: 10px;
    border-top: 1px dashed var(--line);
  }
  .gc-pills {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    margin-right: auto;
    min-width: 0;
  }
  .gc-right {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--success-text);
    background: var(--success-bg);
  }
  .gc-quota {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--ink-faint);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .gc-quota-limited {
    background: var(--brand-secondary-soft-08);
    color: var(--brand-text);
    font-weight: 600;
  }
  .gc-actions {
    display: flex;
    gap: 3px;
    margin-left: auto;
  }
  .gc-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    padding: 0;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;
  }
  .gc-icon-btn:hover {
    background: var(--surface-tint);
    border-color: var(--line);
    color: var(--ink);
  }
  .gc-icon-danger:hover {
    color: var(--danger-strong);
    background: var(--danger-bg);
    border-color: var(--danger-line);
  }

  /* ── Cible de dépôt ── */
  .gc-drop {
    position: absolute;
    inset: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    margin: 0;
    border: 1.5px dashed color-mix(in srgb, var(--card-dot) 65%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--surface) 84%, transparent);
    backdrop-filter: blur(2px);
    font-family: inherit;
    text-align: center;
    animation: gc-drop-in 0.16s ease-out;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  @keyframes gc-drop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .gc-drop-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    padding: 7px 14px 7px 11px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--card-dot) 40%, var(--line));
    background: var(--surface);
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
    box-shadow: 0 6px 16px -10px color-mix(in srgb, var(--ink) 45%, transparent);
    transition: transform 0.15s;
  }
  .gc-drop-label :global(svg) {
    flex-shrink: 0;
    color: var(--card-dot);
  }
  .gc-drop-add {
    cursor: pointer;
  }
  .gc-over .gc-drop,
  .gc-drop-add:hover,
  .gc-drop-add:focus-visible {
    border-style: solid;
    border-color: var(--card-dot);
    background: color-mix(in srgb, var(--card-soft) 85%, transparent);
  }
  .gc-over .gc-drop-label,
  .gc-drop-add:hover .gc-drop-label {
    transform: scale(1.04);
  }
  .gc-drop-add:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .gc-drop-member {
    border-style: solid;
    border-color: var(--line);
    background: color-mix(in srgb, var(--surface) 90%, transparent);
  }
  .gc-drop-member .gc-drop-label {
    color: var(--ink-muted);
    background: var(--surface-tint);
    border-color: var(--line);
    box-shadow: none;
  }
  .gc-drop-member .gc-drop-label :global(svg) {
    color: var(--success-text);
  }
  .gc-drop-busy .gc-drop-label {
    color: var(--ink-muted);
  }
  .gc-spinner {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--card-dot) 30%, transparent);
    border-top-color: var(--card-dot);
    animation: gc-spin 0.8s linear infinite;
  }
  @keyframes gc-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .gc-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .gc-flash,
    .gc-avatar-new,
    .gc-drop {
      animation: none;
    }
    .gc-spinner {
      animation-duration: 2.4s;
    }
    .gc-drop-label {
      transition: none;
    }
    .gc-over .gc-drop-label,
    .gc-drop-add:hover .gc-drop-label {
      transform: none;
    }
  }
</style>
