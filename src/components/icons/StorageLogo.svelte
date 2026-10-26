<script>
  /**
   * Logo de l'ESPACE où un document se dépose — Google Drive, OneDrive ou une
   * bibliothèque SharePoint — pour qu'on voie d'un coup d'œil ce qu'on est en
   * train de manipuler : dans « Mes tags », sur la page « Entreposer », dans la
   * fenêtre de choix de dossier et sur l'écran d'approbation.
   *
   * Un seul aiguillage, par `kind`, calculé par `libraryKind()`
   * (utils/storageVocabulary.js) : aucun écran ne choisit un logo lui-même.
   * Un `kind` inconnu ne rend RIEN — avant que /connect/status ait répondu, on
   * ne montre pas le logo d'un fournisseur que l'installation n'a pas retenu.
   *
   * Décoratif (`aria-hidden`) : le texte voisin nomme toujours la bibliothèque.
   * `data-kind` est là pour les tests, qui vérifient QUEL logo est posé.
   */
  import GoogleDriveLogo from './GoogleDriveLogo.svelte';
  import OneDriveLogo from './OneDriveLogo.svelte';
  import SharePointLogo from './SharePointLogo.svelte';

  /** @type {'google-drive'|'onedrive'|'sharepoint'|''} */
  export let kind = '';
  export let size = 16;

  const LOGOS = {
    'google-drive': GoogleDriveLogo,
    onedrive: OneDriveLogo,
    sharepoint: SharePointLogo,
  };
  $: logo = LOGOS[kind] || null;
</script>

{#if logo}
  <span class="storage-logo" data-kind={kind} aria-hidden="true" style="--logo-size: {size}px">
    <svelte:component this={logo} {size} />
  </span>
{/if}

<style>
  /* Boîte carrée de `size` : les tracés ne sont pas carrés (Drive 256×229,
     OneDrive 256×165) et sont centrés dedans — le texte s'aligne sur la boîte,
     pas sur le tracé. */
  .storage-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: var(--logo-size);
    height: var(--logo-size);
    vertical-align: -0.2em;
  }
</style>
