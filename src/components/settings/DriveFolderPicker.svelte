<script>
  /**
   * Fenêtre de navigation dans le stockage du compte relié.
   *
   * Elle ne rend pas un identifiant mais un CHEMIN (« Clients/Acme ») et, quand
   * le fournisseur en a plusieurs, la bibliothèque qui le porte. C'est ce que le
   * réglage `storage.folder` a toujours stocké : tout le dépôt continue de
   * fonctionner sans rien connaître de cette fenêtre, et qui préfère taper son
   * chemin le peut encore.
   *
   * Le protocole est celui de l'API : chaque entrée porte un `cursor` opaque
   * qu'on renvoie pour descendre, et le client accumule les NOMS traversés pour
   * composer le chemin (cf. services/api/routes/actions/storage.js).
   */
  import { onMount } from 'svelte';
  import IconFolder from '~icons/solar/folder-linear';
  import TagChip from '../TagChip.svelte';
  import StorageLogo from '../icons/StorageLogo.svelte';
  import { libraryKind } from '../../utils/storageVocabulary.js';
  import {
    fetchStorageDrives,
    fetchStorageFolders,
    fetchStoragePath,
    createStorageFolder,
  } from '../../services/actionsApi.js';

  /** uiText.configActions, déjà dans la langue courante. */
  export let texts;
  /**
   * Tag dont on choisit la destination, ou null pour le dossier de base. La
   * fenêtre le NOMME, avec sa couleur : deux fenêtres identiques ouvertes
   * pour deux tags différents ne se distinguaient que par le souvenir du clic.
   */
  export let tag = null;
  /** Chemin et bibliothèque actuellement enregistrés — la fenêtre s'y ouvre. */
  export let initialDriveId = '';
  /** @type {(selection: {folder: string, driveId: string, driveName: string}) => void} */
  export let onSelect = () => {};
  export let onClose = () => {};

  let drives = [];
  let multiDrive = false;
  /** `google` ou `microsoft`, désigné par le serveur — décide du vocabulaire. */
  let provider = '';
  /**
   * La liste des bibliothèques est TRONQUÉE faute de scope — pas vide. Sans le
   * dire, l'écran affirmerait qu'il n'y a pas de Drive partagé (ou de site
   * SharePoint) là où il y en a, et personne ne devinerait qu'une reconnexion
   * les ferait apparaître.
   */
  let sharedDrivesMissing = false;
  let driveId = initialDriveId;
  let cursor = '';
  /**
   * Page suivante du niveau affiché, telle que le serveur la rend — opaque
   * ici. Sans elle, un dossier de plus de cent entrées (Google) ou deux cents
   * (Graph) montrait sa première page comme si c'était tout.
   */
  let nextPageToken = '';
  let loadingMore = false;
  /**
   * Ce qu'on a traversé : un nom ET le curseur du niveau, pour que « Remonter »
   * revienne vraiment d'un cran. Sans le curseur, remonter chez Google — qui
   * descend par identifiant et ne sait pas remonter — obligerait à repartir de
   * la racine.
   */
  let trail = [];
  let folders = [];
  let loading = true;
  let error = '';
  let search = '';
  let searching = false;
  let newFolder = '';
  let creating = false;

  $: driveName = drives.find((d) => d.id === driveId)?.name || '';
  $: driveSite = drives.find((d) => d.id === driveId)?.site || '';
  $: currentPath = trail.map((step) => step.name).join('/');
  $: fullDriveName = driveSite ? `${driveSite} / ${driveName}` : driveName;
  /** Logo de la bibliothèque affichée — SharePoint dès qu'un site la porte. */
  $: driveKind = libraryKind(provider, fullDriveName);
  /**
   * Même drapeau serveur, deux réalités : des Drive partagés chez Google, des
   * bibliothèques SharePoint chez Microsoft. Le texte nomme la bonne.
   */
  $: sharedMissingText =
    provider === 'microsoft'
      ? texts.pickerSharedSitesMissing || ''
      : texts.pickerSharedDrivesMissing || '';

  /**
   * Charge un niveau (ou une recherche). Avec `pageToken`, la page suivante du
   * MÊME niveau s'ajoute à la liste au lieu de la remplacer.
   */
  async function load({ term = '', pageToken = '' } = {}) {
    if (pageToken) loadingMore = true;
    else loading = true;
    error = '';
    const res = await fetchStorageFolders({ driveId, cursor, search: term, pageToken });
    loading = false;
    loadingMore = false;
    if (!res.data?.ok) {
      error = texts.browseErrors?.[res.data?.error] || texts.browseErrors?.browse_failed || '';
      if (!pageToken) {
        folders = [];
        nextPageToken = '';
      }
      return;
    }
    const page = res.data.folders || [];
    folders = pageToken ? [...folders, ...page] : page;
    nextPageToken = res.data.nextPageToken || '';
  }

  function loadMore() {
    if (!nextPageToken || loading || loadingMore) return;
    load({ term: searching ? search.trim() : '', pageToken: nextPageToken });
  }

  async function boot() {
    const res = await fetchStorageDrives();
    if (res.data?.drives) {
      drives = res.data.drives;
      provider = res.data.provider || '';
      multiDrive = !!res.data.multiDrive;
      sharedDrivesMissing = !!res.data.sharedDrivesMissing;
      // Bibliothèque enregistrée devenue inaccessible : on retombe sur la
      // première plutôt que de laisser une fenêtre vide sans explication.
      if (!drives.some((d) => d.id === driveId)) driveId = drives[0]?.id || '';
    } else if (res.data?.error) {
      error = texts.browseErrors?.[res.data.error] || texts.browseErrors?.browse_failed || '';
      loading = false;
      return;
    }
    await load();
  }

  function open(folder) {
    // Un résultat de recherche n'a pas été traversé : son chemin vient du
    // serveur, sans quoi on enregistrerait « Acme » sans savoir lequel.
    if (searching) {
      resolveSearchPath(folder);
      return;
    }
    trail = [...trail, { name: folder.name, cursor: folder.cursor }];
    cursor = folder.cursor;
    load();
  }

  async function resolveSearchPath(folder) {
    loading = true;
    const res = await fetchStoragePath({ driveId, cursor: folder.cursor });
    loading = false;
    if (!res.data?.ok) {
      error = texts.browseErrors?.browse_failed || '';
      return;
    }
    searching = false;
    search = '';
    // Seul le dernier niveau a un curseur connu : les ancêtres n'ont été que
    // nommés par le serveur. « Remonter » depuis là repart donc de la racine,
    // ce que le fil d'Ariane rend visible.
    const names = res.data.path ? res.data.path.split('/') : [];
    trail = names.map((name, index) => ({
      name,
      cursor: index === names.length - 1 ? folder.cursor : '',
    }));
    cursor = folder.cursor;
    load();
  }

  function up() {
    if (trail.length === 0) return;
    trail = trail.slice(0, -1);
    cursor = trail.at(-1)?.cursor || '';
    load();
  }

  function toRoot() {
    searching = false;
    search = '';
    trail = [];
    cursor = '';
    load();
  }

  function runSearch() {
    const term = search.trim();
    if (!term) {
      toRoot();
      return;
    }
    searching = true;
    load({ term });
  }

  async function create() {
    const name = newFolder.trim();
    if (!name) return;
    creating = true;
    const res = await createStorageFolder({ driveId, cursor, name });
    creating = false;
    if (!res.data?.ok) {
      error = texts.browseErrors?.[res.data?.error] || texts.browseErrors?.browse_failed || '';
      return;
    }
    newFolder = '';
    open(res.data.folder);
  }

  function changeDrive(event) {
    driveId = event.currentTarget.value;
    toRoot();
  }

  function choose() {
    onSelect({ folder: currentPath, driveId, driveName: fullDriveName });
  }

  function keydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  onMount(boot);
</script>

<svelte:window on:keydown={keydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="fp-backdrop"
  on:click={(e) => e.target === e.currentTarget && onClose()}
  role="presentation"
>
  <div class="fp-box" role="dialog" aria-modal="true" aria-labelledby="fp-title">
    <header class="fp-head">
      <div class="fp-title">
        <h3 id="fp-title">{texts.pickerTitle}</h3>
        {#if tag}<TagChip {tag} />{/if}
      </div>
      <button type="button" class="fp-close" on:click={onClose} aria-label={texts.pickerClose}
        >✕</button
      >
    </header>

    {#if multiDrive && drives.length > 1}
      <label class="fp-drive">
        <span class="fp-drive-label">
          <StorageLogo kind={driveKind} size={14} />
          {texts.pickerLibrary}
        </span>
        <select value={driveId} on:change={changeDrive}>
          {#each drives as drive (drive.id)}
            <option value={drive.id}
              >{drive.site ? `${drive.site} / ${drive.name}` : drive.name}</option
            >
          {/each}
        </select>
      </label>
    {:else if fullDriveName}
      <!-- Une seule bibliothèque : pas de choix à faire, mais on dit laquelle
           on parcourt — avec son logo, comme quand il y en a plusieurs. -->
      <p class="fp-drive-single">
        <StorageLogo kind={driveKind} size={16} />
        <span>{fullDriveName}</span>
      </p>
    {/if}

    {#if sharedDrivesMissing && sharedMissingText}
      <p class="fp-note">{sharedMissingText}</p>
    {/if}

    <div class="fp-bar">
      <button type="button" class="fp-btn" on:click={toRoot} disabled={loading}>
        {texts.pickerRoot}
      </button>
      <button type="button" class="fp-btn" on:click={up} disabled={loading || trail.length === 0}>
        {texts.pickerUp}
      </button>
      <form class="fp-search" on:submit|preventDefault={runSearch}>
        <input
          type="search"
          bind:value={search}
          placeholder={texts.pickerSearch}
          aria-label={texts.pickerSearch}
        />
        <button type="submit" class="fp-btn" disabled={loading}>{texts.pickerSearchGo}</button>
      </form>
    </div>

    <p class="fp-path">
      {searching ? texts.pickerSearchResults : currentPath || texts.pickerRoot}
    </p>

    <div class="fp-list">
      {#if error}
        <p class="fp-empty fp-error">{error}</p>
      {:else if loading}
        <p class="fp-empty">{texts.pickerLoading}</p>
      {:else if folders.length === 0}
        <p class="fp-empty">{searching ? texts.pickerNoResult : texts.pickerEmpty}</p>
      {:else}
        <ul>
          {#each folders as folder (folder.cursor)}
            <li>
              <button type="button" class="fp-item" on:click={() => open(folder)}>
                <IconFolder width="16" height="16" />
                <span>{folder.name}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if nextPageToken}
          <button type="button" class="fp-more" on:click={loadMore} disabled={loadingMore}>
            {loadingMore ? texts.pickerLoading : texts.pickerMore}
          </button>
        {/if}
      {/if}
    </div>

    {#if !searching}
      <form class="fp-create" on:submit|preventDefault={create}>
        <input
          type="text"
          bind:value={newFolder}
          maxlength="120"
          placeholder={texts.pickerNewFolder}
          aria-label={texts.pickerNewFolder}
        />
        <button type="submit" class="fp-btn" disabled={creating || !newFolder.trim()}>
          {texts.pickerCreate}
        </button>
      </form>
    {/if}

    <footer class="fp-foot">
      <span class="fp-selection">
        {texts.pickerSelection}
        <strong>{currentPath || texts.pickerRoot}</strong>
      </span>
      <button type="button" class="fp-confirm" on:click={choose} disabled={searching || loading}>
        {texts.pickerConfirm}
      </button>
    </footer>
  </div>
</div>

<style>
  .fp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10055;
    background: color-mix(
      in srgb,
      color-mix(in srgb, var(--brand-secondary) 6%, #0c0c0c) 45%,
      transparent
    );
    backdrop-filter: blur(6px);
    display: flex;
    justify-content: center;
    /* margin:auto + overflow (cf. ChangePasswordModal) : boutons atteignables
       clavier ouvert sur mobile, encoche/geste iOS respectés. */
    padding: max(24px, var(--safe-top, 0px)) 24px max(24px, var(--safe-bottom, 0px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .fp-box {
    width: 100%;
    max-width: 460px;
    margin: auto;
    /* dvh : 82vh déborde sous la barre d'URL iOS (viewport « large »). */
    max-height: 82dvh;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 10px;
    padding: 18px 20px;
    box-shadow: 0 24px 60px
      color-mix(in srgb, color-mix(in srgb, var(--brand-secondary) 6%, #0c0c0c) 22%, transparent);
    color: var(--ink);
  }
  .fp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .fp-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .fp-head h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  .fp-close {
    border: 1px solid var(--line, var(--line));
    background: #fff;
    border-radius: 999px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    color: color-mix(in srgb, var(--brand-secondary) 10.9%, #4b4b4b);
  }
  .fp-drive {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.78rem;
    color: var(--ink-faint);
    margin-bottom: 10px;
  }
  .fp-drive select {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line, var(--line));
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.88rem;
    background: #fff;
  }
  .fp-drive-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .fp-drive-single {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
    word-break: break-word;
  }
  .fp-bar {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .fp-search {
    display: flex;
    gap: 6px;
    flex: 1 1 180px;
  }
  .fp-search input,
  .fp-create input {
    flex: 1;
    min-width: 0;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--line, var(--line));
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.85rem;
  }
  .fp-btn {
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--line, var(--line));
    background: #fff;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.83rem;
    cursor: pointer;
    white-space: nowrap;
    color: color-mix(in srgb, var(--brand-secondary) 17.5%, #121212);
  }
  .fp-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .fp-path {
    margin: 10px 0 6px;
    font-size: 0.78rem;
    color: var(--ink-faint);
    word-break: break-word;
  }
  .fp-note {
    margin: 8px 0 0;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px dashed var(--line-strong, color-mix(in srgb, var(--brand-secondary) 8.6%, #dcdcdc));
    background: var(--surface-tint, color-mix(in srgb, var(--brand-secondary) 2.6%, #fbfbfb));
    font-size: 0.75rem;
    line-height: 1.5;
    color: color-mix(in srgb, var(--brand-secondary) 14.9%, #505050);
  }
  .fp-list {
    flex: 1;
    overflow-y: auto;
    min-height: 150px;
    border: 1px solid var(--line, color-mix(in srgb, var(--brand-secondary) 4.4%, #eeeeee));
    border-radius: 8px;
    padding: 6px;
  }
  .fp-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .fp-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0.45rem 0.55rem;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.88rem;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
  }
  .fp-item:hover {
    background: color-mix(in srgb, var(--brand-secondary) 4.4%, #f9f9f9);
  }
  .fp-empty {
    margin: 12px 6px;
    font-size: 0.83rem;
    color: color-mix(in srgb, var(--brand-secondary) 11.8%, #828282);
  }
  /* Page suivante du même niveau : un lien discret sous la liste, pas un
     bouton de plus dans la barre — il n'existe que quand il y a une suite. */
  .fp-more {
    display: block;
    width: 100%;
    margin-top: 4px;
    padding: 0.5rem;
    border: 1px dashed var(--line-strong, color-mix(in srgb, var(--brand-secondary) 8.6%, #dcdcdc));
    border-radius: 8px;
    background: transparent;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--brand-text, var(--brand));
    cursor: pointer;
  }
  .fp-more:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 4.4%, #f9f9f9);
  }
  .fp-more:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .fp-error {
    color: oklch(45% 0.16 25);
  }
  .fp-create {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }
  .fp-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .fp-selection {
    font-size: 0.78rem;
    color: var(--ink-faint);
    word-break: break-word;
  }
  .fp-confirm {
    padding: 0.55rem 1.1rem;
    border: none;
    border-radius: 8px;
    background: var(--brand, var(--brand));
    color: #fff;
    font-weight: 600;
    font-family: inherit;
    font-size: 0.88rem;
    cursor: pointer;
  }
  .fp-confirm:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
