<script>
  /**
   * Carte d'un écran d'administration en TABLEAU DE BORD REPLIÉ (onglets IA,
   * Configuration, Authentification) : un en-tête serré — icône, titre, ⓘ
   * pour l'explication longue, une mesure à droite (« 2 sur 4 connectés ») —
   * et le contenu en dessous.
   *
   * Deux usages, une anatomie : le bloc d'en-tête d'un onglet (`level` 4, avec
   * son icône) et le panneau qu'une tuile déplie (`level` 5, sans icône). Les
   * trois onglets la partagent pour qu'un administrateur lise les trois de la
   * même façon — les copier une à une, c'était la dérive qu'avait corrigée
   * SettingsCard.
   *
   * L'explication passe derrière un ⓘ (InfoHint) : c'est un tableau de bord,
   * pas une page de formulaires. Ce qui demande un geste, en revanche, reste
   * écrit dans le contenu.
   */
  import InfoHint from './InfoHint.svelte';

  /** Préfixe des identifiants : le titre est `{id}-title`, qui nomme la région. */
  export let id;
  export let title = '';
  /** Icône d'un jeu d'icônes (props width/height), dans une pastille. */
  export let icon = null;
  /** 4 : bloc d'en-tête d'un onglet ; 5 : panneau déplié par une tuile. */
  export let level = 4;
  /** Mesure discrète, à droite du titre. */
  export let meta = '';
  /** Explication longue, derrière un ⓘ. */
  export let info = '';
  /** Nom de l'ⓘ pour les lecteurs d'écran ; à défaut, le titre. */
  export let infoLabel = '';
</script>

<section class="dc" aria-labelledby="{id}-title">
  <div class="dc-head">
    {#if icon}
      <span class="dc-icon" aria-hidden="true">
        <svelte:component this={icon} width="18" height="18" />
      </span>
    {/if}
    <svelte:element this={`h${level}`} class="dc-title" id="{id}-title">{title}</svelte:element>
    {#if info}<InfoHint label={infoLabel || title} text={info} />{/if}
    {#if meta}<span class="dc-meta">{meta}</span>{/if}
  </div>
  <slot />
</section>

<style>
  /* Même surface que SettingsCard, en plus serré. */
  .dc {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }
  .dc-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem 0.45rem;
    min-width: 0;
  }
  .dc-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    margin-right: 0.1rem;
    border-radius: 8px;
    background: #fff;
    border: 1px solid var(--line);
    color: var(--brand-text);
  }
  .dc-head :global(.dc-title) {
    margin: 0;
    min-width: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
  }
  .dc-meta {
    margin-left: auto;
    padding-left: 0.5rem;
    font-size: 0.8rem;
    color: var(--ink-faint);
    white-space: nowrap;
  }
  /* Carte étroite (téléphone) : la mesure passe sous le titre, alignée sur
     lui, plutôt que de le couper en deux lignes. */
  @container (max-width: 420px) {
    .dc-meta {
      flex-basis: 100%;
      order: 1;
      margin-left: 0;
      padding-left: 0;
    }
    .dc-icon ~ .dc-meta {
      padding-left: calc(30px + 0.55rem);
    }
  }
  @media (max-width: 640px) {
    .dc {
      padding: 0.8rem 0.85rem;
    }
  }
</style>
