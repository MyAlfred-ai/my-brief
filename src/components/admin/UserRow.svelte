<script>
  /**
   * Une ligne de la liste des utilisateurs. Purement présentationnel : il
   * n'appelle aucune API, il émet des évènements.
   *
   * Une ligne par compte, pas une carte : les libellés (« Actif »,
   * « Dernière connexion ») vivent une seule fois dans l'en-tête de la liste
   * (UsersTab), et seules les exceptions s'affichent — la pastille « Admin »,
   * pas « Utilisateur » sur chaque ligne ; « SSO uniquement » passe dans la
   * fiche, car sur une installation SSO il aurait été sur toutes les lignes.
   * Les colonnes viennent de `--au-cols`, posée par UsersTab, pour que
   * l'en-tête et les lignes (deux composants) restent alignés. Les groupes
   * n'y ont leur colonne que s'il en existe plus d'un (`showGroups`).
   *
   * Toute la ligne ouvre la fiche du compte ; le nom est le vrai bouton (clavier,
   * lecteur d'écran). Réinitialiser et supprimer sont dans la fiche, et en
   * raccourci au survol sur ordinateur.
   */
  import { createEventDispatcher } from 'svelte';
  import IconKey from '~icons/solar/key-minimalistic-linear';
  import IconTrash from '~icons/solar/trash-bin-trash-linear';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import GroupChip from '../ui/GroupChip.svelte';
  import { formatSince, formatDateTime } from '../../utils/relativeTime.js';

  export let user;
  export let texts; // $uiText.adminUsers
  export let lang = 'fr';
  export let isSelf = false;
  /** Un aller-retour serveur est en cours pour CETTE ligne. */
  export let busy = false;
  /** Catalogue des groupes (id → groupe) : la ligne ne connaît que des identifiants. */
  export let groupsById = new Map();
  export let showGroups = false;

  const dispatch = createEventDispatcher();

  // L'interrupteur montre l'état SOUHAITÉ (actif), pas le champ stocké
  // (`disabled`) : « Actif » se lit, « Désactivé décoché » ne se lit pas.
  $: activeHint = isSelf
    ? texts.activeSelfHint
    : user.disabled
      ? texts.activeHintOff
      : texts.activeHintOn;
  // Un identifiant sans groupe au catalogue (supprimé entre-temps) ne s'affiche
  // pas : mieux vaut une puce de moins qu'un nom inventé.
  $: userGroups = (user.groupIds || [])
    .map((id) => groupsById.get(id))
    .filter(Boolean)
    // Les groupes particuliers d'abord : « Défaut », que presque tout le monde
    // partage, est celui qui cède sa place quand la colonne manque.
    .sort((a, b) => Number(!!a.isDefault) - Number(!!b.isDefault));
  $: groupNames = userGroups.map((g) => g.name).join(', ');
  $: since = formatSince(user.lastConnecion, lang);
  $: exactDate = formatDateTime(user.lastConnecion, lang);

  /**
   * Clic ailleurs que sur un contrôle : même effet que le bouton du nom. Les
   * contrôles gardent leur geste, et une sélection de texte (copier une
   * adresse) n'ouvre pas la fiche.
   */
  function openFromRow(event) {
    if (event.target.closest('button, input, label, a')) return;
    if (window.getSelection?.()?.toString()) return;
    dispatch('edit', user);
  }
</script>

<!-- Le clic sur la ligne n'est qu'un raccourci de souris : le clavier et les
     lecteurs d'écran passent par le bouton du nom. -->
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<li
  class="au-row"
  class:au-row-off={user.disabled}
  class:au-row-groups={showGroups}
  on:click={openFromRow}
>
  <button type="button" class="au-name" on:click={() => dispatch('edit', user)}>
    <span class="au-sr">{texts.editTitle} :</span>
    <!-- « (vous) » dans le même texte que le nom : quand la place manque,
         c'est lui qui passe en points de suspension, pas le nom. -->
    <span class="au-name-text"
      >{user.name || user.email}{#if isSelf}<span class="au-self">{' '}({texts.you})</span
        >{/if}</span
    >
    {#if user.role === 'admin'}<span class="au-pill au-pill-admin">{texts.adminBadge}</span>{/if}
    {#if user.disabled}<span class="au-pill">{texts.disabledBadge}</span>{/if}
  </button>

  <span class="au-email">{user.email}</span>

  {#if showGroups}
    <!-- Une puce s'affiche entière ou pas du tout : celles qui ne tiennent
         plus cèdent la place à « … » en fin de cellule (text-overflow sur des
         éléments en ligne), l'infobulle et la fiche les donnent toutes. -->
    <span class="au-groups" title={groupNames || undefined}>
      <span class="au-sr">{texts.groupsLabel} :</span>
      {#each userGroups as group (group.id)}<GroupChip {group} />{/each}
    </span>
  {/if}

  <span class="au-seen" class:au-never={!since} title={exactDate || undefined}>
    <span class="au-sr">{texts.lastConnection}</span>
    {since || texts.neverConnected}
  </span>

  <!-- Son propre compte reste hors de portée : le serveur refuse déjà
       (`self_target`), autant ne pas proposer le geste. -->
  <span class="au-active" title={activeHint}>
    <ToggleSwitch
      small
      checked={!user.disabled}
      disabled={isSelf || busy}
      label="{texts.activeToggle} — {user.email}"
      on:change={(e) => dispatch('toggleActive', { user, disabled: !e.target.checked })}
    />
  </span>

  <span class="au-quick">
    <button
      type="button"
      class="au-btn"
      on:click={() => dispatch('reset', user)}
      title={texts.resetPassword}
      aria-label="{texts.resetPassword} — {user.email}"
    >
      <IconKey width="15" height="15" />
    </button>
    {#if !isSelf}
      <button
        type="button"
        class="au-btn au-btn-danger"
        on:click={() => dispatch('delete', user)}
        title={texts.deleteButton}
        aria-label="{texts.deleteButton} — {user.email}"
      >
        <IconTrash width="15" height="15" />
      </button>
    {/if}
  </span>
</li>

<style>
  .au-row {
    display: grid;
    grid-template-columns: var(--au-cols);
    align-items: center;
    column-gap: 0.75rem;
    min-height: 2.25rem;
    padding: 0.2rem 0.5rem;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    transition: background 0.12s;
  }
  .au-row:hover {
    background: var(--brand-secondary-soft-08);
  }
  .au-row:focus-within {
    background: var(--brand-secondary-soft-08);
  }

  /* Le nom est un bouton qui se lit comme du texte. */
  .au-name {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    text-align: left;
    color: var(--ink);
    cursor: pointer;
  }
  .au-name:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 3px;
    border-radius: 4px;
  }
  .au-name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .au-self {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--ink-faint);
  }
  .au-pill {
    flex-shrink: 0;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: var(--line);
    color: var(--ink-muted);
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
  }
  .au-pill-admin {
    background: var(--brand-secondary-soft-15);
    color: var(--brand-text);
  }

  .au-email,
  .au-seen {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.82rem;
    color: var(--ink-muted);
  }
  .au-never {
    color: var(--ink-faint);
  }
  /* Des puces EN LIGNE, pas en flex : rétrécies ensemble, elles tombaient
     toutes à « D… » ; en ligne, celles qui débordent sont masquées d'un bloc
     derrière les points de suspension. */
  .au-groups {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--ink-faint);
  }
  .au-groups > :global(.gc + .gc) {
    margin-left: 0.3rem;
  }
  /* Désactivé : l'identité s'efface, l'interrupteur et les raccourcis restent
     nets — ce sont eux qu'on vient chercher sur cette ligne. */
  .au-row-off .au-name-text,
  .au-row-off .au-email,
  .au-row-off .au-groups,
  .au-row-off .au-seen {
    opacity: 0.55;
  }

  .au-active {
    display: flex;
    justify-content: center;
  }

  /* Raccourcis de la fiche : invisibles au repos, ils apparaissent au survol
     ou au clavier. La place reste réservée — une ligne ne doit pas bouger
     sous la souris. Sans survol (tactile), ils restent visibles, discrets. */
  .au-quick {
    display: flex;
    justify-content: flex-end;
    gap: 0.15rem;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .au-row:hover .au-quick,
  .au-row:focus-within .au-quick {
    opacity: 1;
  }
  @media (hover: none) {
    .au-quick {
      opacity: 0.75;
    }
  }
  .au-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s;
  }
  .au-btn:hover {
    background: var(--line);
    color: var(--ink);
  }
  .au-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .au-btn-danger:hover {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  .au-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* Liste étroite (téléphone, fenêtre réduite) : deux lignes par compte — le
     nom, puis l'adresse et la dernière connexion — et l'interrupteur à droite.
     Les raccourcis s'effacent : la fiche, à un toucher, porte les mêmes gestes.
     Le conteneur `au` est la liste (UsersTab), pas l'écran : dans le panneau
     d'administration, la largeur utile dépend aussi de la barre latérale. */
  @container au (max-width: 559px) {
    .au-row {
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-areas:
        'name name active'
        'email seen active';
      row-gap: 0.1rem;
      padding: 0.5rem 0.25rem;
    }
    .au-name {
      grid-area: name;
    }
    .au-email {
      grid-area: email;
    }
    .au-seen {
      grid-area: seen;
      font-size: 0.78rem;
    }
    .au-active {
      grid-area: active;
      padding-left: 0.5rem;
    }
    .au-quick {
      display: none;
    }
  }
  /* Avec les groupes, six colonnes ne tiennent plus sous 680 px : deux
     niveaux — le nom et ses puces, puis l'adresse et la dernière connexion —,
     et trois sous 560 px, où les puces passent sous l'adresse. Le reste suit
     la disposition ci-dessus : ces blocs doivent rester d'accord. */
  @container au (max-width: 679px) {
    .au-row-groups {
      grid-template-columns: minmax(0, 1fr) fit-content(40%) auto;
      grid-template-areas:
        'name groups active'
        'email seen active';
      row-gap: 0.1rem;
      padding: 0.5rem 0.25rem;
    }
    .au-row-groups .au-name {
      grid-area: name;
    }
    .au-row-groups .au-email {
      grid-area: email;
    }
    /* Étirée sur sa piste, alignée à droite par le texte : placée par
       `justify-self`, la cellule prendrait pour largeur minimale sa ligne de
       puces entière (`nowrap`) et déborderait sur le nom. */
    .au-row-groups .au-groups {
      grid-area: groups;
      text-align: right;
    }
    .au-row-groups .au-seen {
      grid-area: seen;
      justify-self: end;
      font-size: 0.78rem;
    }
    .au-row-groups .au-active {
      grid-area: active;
      padding-left: 0.5rem;
    }
    .au-row-groups .au-quick {
      display: none;
    }
  }
  @container au (max-width: 559px) {
    .au-row-groups {
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-areas:
        'name name active'
        'email seen active'
        'groups groups active';
      padding: 0.45rem 0.25rem;
    }
    .au-row-groups .au-groups {
      text-align: left;
      padding-top: 0.15rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .au-row,
    .au-quick {
      transition: none;
    }
  }
</style>
