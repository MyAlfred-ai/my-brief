<script>
  /**
   * Liste de choix « quel tag pour cette conversation » — sans positionnement
   * ni popover : l'appelant la place où il veut (menu contextuel de la sidebar,
   * menu déroulant de l'en-tête de conversation).
   *
   * « Aucun tag » est toujours proposé, y compris quand la conversation n'en a
   * pas : c'est l'entrée qui permet de la sortir d'un rangement, et la masquer
   * obligerait à deviner comment défaire.
   *
   * Seule la liste des tags défile : la recherche et « Aucun tag » en tête,
   * « Créer » et « Gérer les tags… » en pied restent visibles quelle que soit
   * la longueur de la liste. Livrée seule, la liste se borne elle-même
   * (260 px) ; un appelant qui borne la hauteur du menu la laisse prendre la
   * place restante en posant `--tp-list-max: none` sur sa colonne flex (cf.
   * TagSelect).
   *
   * ── Trouver, créer ───────────────────────────────────────────────────────
   * Le champ du haut cherche dans le NOM et dans le CONTEXTE des tags
   * (utils/tagSearch.js) : taper le nom d'une cliente trouve le tag de son
   * projet, extrait à l'appui. Entrée pose le premier résultat. Quand le nom
   * tapé n'est celui d'aucun tag, « Créer « … » » le crée — pastille choisie
   * pour l'utilisateur (`freshTagColor`), comme après le premier résumé — et
   * le pose aussitôt : ranger une réunion dans un nouveau classeur ne demande
   * plus de passer par « Mes tags ».
   *
   * Sans recherche, à partir de RECENT_FROM tags, ceux des dernières réunions
   * viennent en tête (« Récents ») : c'est presque toujours l'un d'eux qu'on
   * pose. Sous ce seuil la liste se lit d'un coup d'œil, les sections seraient
   * du bruit.
   *
   * Le champ prend le focus à l'ouverture sur un écran à souris seulement :
   * sur un écran tactile, le clavier surgirait et recouvrirait le menu.
   *
   * Le champ vit HORS du `role="menu"` : un menu ne contient que des entrées.
   */
  import { onMount } from 'svelte';
  import { tags, tagsById, tagsMax, tagColors, upsertTag } from '../stores/tags.js';
  import { historyItems } from '../stores/history.js';
  import { uiText } from '../store.js';
  import { searchTags, recentTagIds, tagLabelKey } from '../utils/tagSearch.js';
  import { freshTagColor } from '../utils/afterSummary.js';
  import TagChip from './TagChip.svelte';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconSettings from '~icons/solar/settings-linear';
  import IconSearch from '~icons/solar/magnifer-linear';
  import IconAdd from '~icons/solar/add-circle-linear';

  /** Tag actuellement posé sur la conversation. */
  export let selectedId = null;
  /** @type {(tagId: string|null) => void} */
  export let onPick = () => {};
  /** Ouvre « Mes tags ». Omis = entrée masquée. */
  export let onManage = null;
  /** Création à la volée depuis la recherche. */
  export let allowCreate = true;

  /** Nombre de tags à partir duquel les récents passent en tête. */
  const RECENT_FROM = 6;
  const RECENT_MAX = 3;
  /** Longueur d'un nom de tag — TAG_LABEL_MAX côté serveur. */
  const LABEL_MAX = 32;

  let query = '';
  let inputEl;
  let creating = false;
  let createError = '';

  $: t = $uiText.sidebar;
  $: q = query.trim();
  $: results = searchTags($tags, query);
  $: recent =
    q || $tags.length < RECENT_FROM
      ? []
      : recentTagIds($historyItems, $tagsById, RECENT_MAX).map((id) => $tagsById.get(id));

  /** Ce que montre la liste : résultats, ou récents puis tous, ou tous. */
  $: entries = q
    ? results.map((r) => ({ key: r.tag.id, tag: r.tag, snippet: r.snippet }))
    : recent.length
      ? [
          { key: 'cap-recent', cap: t.tagRecent },
          ...recent.map((tag) => ({ key: tag.id, tag })),
          { key: 'cap-all', cap: t.tagAll },
          ...$tags.filter((tag) => !recent.includes(tag)).map((tag) => ({ key: tag.id, tag })),
        ]
      : $tags.map((tag) => ({ key: tag.id, tag }));

  $: exists = !!q && $tags.some((tag) => tagLabelKey(tag.label) === tagLabelKey(q));
  $: canCreate = allowCreate && !!q && !exists && q.length <= LABEL_MAX;
  $: atLimit = $tagsMax > 0 && $tags.length >= $tagsMax;
  $: limitText = $uiText.tagsPanel.errors.limit_reached.replace('{max}', String($tagsMax));
  // Une autre saisie efface le refus précédent : il parlait d'un autre nom.
  $: (query, (createError = ''));

  onMount(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) inputEl?.focus({ preventScroll: true });
  });

  async function create() {
    if (creating || !canCreate || atLimit) return;
    creating = true;
    const res = await upsertTag({ label: q, color: freshTagColor($tagColors, $tags) });
    creating = false;
    if (!res.ok) {
      const errors = $uiText.tagsPanel.errors;
      const max = res.error === 'label_too_long' ? LABEL_MAX : $tagsMax;
      createError = (errors[res.error] || errors.network).replace('{max}', String(max));
      return;
    }
    if (res.tag) {
      query = '';
      onPick(res.tag.id);
    }
  }

  function onSearchKey(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (results.length) onPick(results[0].tag.id);
    else create();
  }
</script>

<div class="tp">
  <label class="tp-search">
    <IconSearch width="14" height="14" aria-hidden="true" />
    <input
      bind:this={inputEl}
      bind:value={query}
      type="search"
      placeholder={allowCreate ? t.tagSearchCreate : t.tagSearch}
      aria-label={t.tagSearch}
      autocomplete="off"
      on:keydown={onSearchKey}
    />
  </label>

  <div class="tp-menu" role="menu">
    <button
      class="tp-item"
      class:tp-item-active={!selectedId}
      role="menuitemradio"
      aria-checked={!selectedId}
      on:click={() => onPick(null)}
    >
      <span class="tp-none">{t.tagNone}</span>
      {#if !selectedId}<IconCheck width="13" height="13" class="tp-check" />{/if}
    </button>

    <!-- Une liste vide ne s'affiche pas : sous une recherche sans résultat, il
         ne reste que « Créer », ou la phrase qui dit que rien ne correspond. -->
    {#if entries.length}
      <div class="tp-sep"></div>
      <div class="tp-list">
        {#each entries as entry (entry.key)}
          {#if entry.cap}
            <div class="tp-cap" role="presentation">{entry.cap}</div>
          {:else}
            <button
              class="tp-item"
              class:tp-item-active={selectedId === entry.tag.id}
              role="menuitemradio"
              aria-checked={selectedId === entry.tag.id}
              on:click={() => onPick(entry.tag.id)}
            >
              <span class="tp-found">
                <TagChip tag={entry.tag} />
                {#if entry.snippet}
                  <span class="tp-snippet"
                    >{entry.snippet.before}<mark>{entry.snippet.match}</mark>{entry.snippet
                      .after}</span
                  >
                {/if}
              </span>
              {#if selectedId === entry.tag.id}<IconCheck
                  width="13"
                  height="13"
                  class="tp-check"
                />{/if}
            </button>
          {/if}
        {/each}
      </div>
    {:else if q && !canCreate}
      <div class="tp-empty">{t.tagNoMatch}</div>
    {:else if !q}
      <div class="tp-empty">{t.tagNoneYet}</div>
    {/if}

    {#if canCreate}
      <div class="tp-sep"></div>
      <button
        class="tp-item tp-item-create"
        role="menuitem"
        disabled={creating || atLimit}
        on:click={create}
      >
        <IconAdd width="14" height="14" aria-hidden="true" />
        <span class="tp-create-label">{t.tagCreate.replace('{label}', q)}</span>
      </button>
      {#if createError || atLimit}
        <div class="tp-error" role="alert">{createError || limitText}</div>
      {/if}
    {/if}

    {#if onManage}
      <div class="tp-sep"></div>
      <button class="tp-item tp-item-manage" role="menuitem" on:click={onManage}>
        <IconSettings width="13" height="13" />
        {t.tagManage}
      </button>
    {/if}
  </div>
</div>

<style>
  /* Largeur FIXE : TagSelect cale le menu dans la fenêtre d'après sa taille
     mesurée à l'ouverture. Une largeur qui suivrait le contenu changerait
     après coup (extrait trouvé, police chargée) et le menu dépasserait. */
  .tp {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    width: 260px;
    max-width: 100%;
  }
  .tp-menu {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
  .tp-search {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 7px;
    height: 32px;
    margin: 2px 2px 4px;
    padding: 0 9px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: var(--surface);
    color: var(--ink-faint);
    cursor: text;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .tp-search:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft-15);
  }
  .tp-search input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 12.5px;
    color: var(--ink);
  }
  .tp-search input::placeholder {
    color: var(--ink-faint);
  }
  /* La croix native de WebKit, bleue, jure avec la palette : vider le champ
     se fait au clavier. */
  .tp-search input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }
  /* La SEULE zone qui défile : tête et pied du menu ne bougent pas. */
  .tp-list {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    max-height: var(--tp-list-max, 260px);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--line-faint) transparent;
  }
  /* WebKit (Safari) ignore scrollbar-color et hériterait de l'ascenseur
     orange épais global de style.css — trop lourd pour un menu. */
  .tp-list::-webkit-scrollbar {
    width: 6px;
  }
  .tp-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .tp-list::-webkit-scrollbar-thumb {
    background: var(--line-faint);
    border-radius: 3px;
  }
  .tp-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-soft);
    text-align: left;
  }
  .tp-item:hover:not(:disabled) {
    background: var(--brand-secondary-soft-08);
  }
  .tp-item-active {
    color: var(--ink);
  }
  .tp-item :global(.tp-check) {
    color: var(--brand-text);
    flex-shrink: 0;
  }
  .tp-found {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    min-width: 0;
  }
  .tp-snippet {
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink-muted);
  }
  .tp-snippet mark {
    padding: 0 2px;
    border-radius: 3px;
    background: var(--brand-soft-18);
    color: var(--ink);
  }
  .tp-cap {
    flex-shrink: 0;
    padding: 8px 10px 3px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .tp-none {
    color: var(--ink-muted);
    font-weight: 500;
  }
  .tp-item-active .tp-none {
    color: var(--ink);
  }
  .tp-empty {
    flex-shrink: 0;
    padding: 8px 10px;
    font-size: 11px;
    color: var(--ink-faint);
  }
  .tp-sep {
    flex-shrink: 0;
    height: 1px;
    background: var(--line);
    margin: 4px 0;
  }
  .tp-item-create {
    justify-content: flex-start;
    gap: 7px;
    font-weight: 500;
    color: var(--brand-text);
  }
  .tp-item-create:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .tp-create-label {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .tp-error {
    flex-shrink: 0;
    padding: 2px 10px 6px;
    font-size: 11px;
    color: var(--danger-text);
  }
  .tp-item-manage {
    gap: 7px;
    justify-content: flex-start;
    color: var(--ink-muted);
    font-size: 11.5px;
  }
  /* Écran tactile : des cibles à la taille du doigt, et un champ à 16 px —
     en dessous, Safari iOS zoome toute la page au focus. */
  @media (pointer: coarse) {
    .tp-search {
      height: 40px;
    }
    .tp-search input {
      font-size: 16px;
    }
    .tp-item {
      min-height: 40px;
    }
  }
</style>
