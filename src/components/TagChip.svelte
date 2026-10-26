<script>
  /**
   * Rendu d'un tag — pastille de couleur + nom, ou pastille seule (`compact`).
   *
   * Un seul composant pour les trois emplacements où le tag s'affiche en
   * ligne (sidebar, menu contextuel, en-tête de conversation) : c'est la seule
   * garantie que le même tag se reconnaisse d'un endroit à l'autre. La carte
   * de « Mes tags » est le seul autre rendu — plus grand — et tire sa couleur
   * et sa forme des mêmes `tagColorVars` / `tagShapeClip`.
   *
   * La couleur passe par `tagColorVars` : un slug sans jeton CSS retombe sur le
   * repli au lieu de peindre une pastille transparente. La pastille peint
   * `fill` — le motif d'une couleur texturée —, le fond de la puce reste une
   * teinte unie : un motif sous du texte le rendrait illisible. La forme passe
   * par `tagShapeClip` : un clip-path, le rond compris — la pastille n'a pas de
   * border-radius, qui s'intersecterait avec les autres formes.
   */
  import { tagColorVars, tagShapeClip, tagColors, tagShapes } from '../stores/tags.js';

  /** @type {{id: string, label: string, color: string, shape?: string}|null} */
  export let tag = null;
  /** Pastille seule, sans le nom — pour les listes denses. */
  export let compact = false;

  // $tagColors / $tagShapes en dépendances explicites : les deux helpers lisent
  // leur store de façon impérative, sans quoi couleur et forme ne se
  // recalculeraient pas après /tags.
  $: vars = ($tagColors, tagColorVars(tag?.color));
  $: clip = ($tagShapes, tagShapeClip(tag?.shape));
</script>

{#if tag}
  <span
    class="tag-chip"
    class:tag-chip-compact={compact}
    style="--chip-fill: {vars.fill}; --chip-soft: {vars.soft}; --chip-shape: {clip}"
    title={compact ? tag.label : null}
  >
    <span class="tag-dot" aria-hidden="true"></span>
    {#if !compact}<span class="tag-label">{tag.label}</span>{/if}
    {#if compact}<span class="tag-sr">{tag.label}</span>{/if}
  </span>
{/if}

<style>
  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    /* 4 px à gauche : la pastille de 12 px est concentrique au bout arrondi. */
    padding: 2px 8px 2px 4px;
    border-radius: 999px;
    background: var(--chip-soft);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--ink-soft);
    vertical-align: middle;
  }
  .tag-chip-compact {
    padding: 0;
    background: none;
    gap: 0;
  }
  /* 12 px et non 8 : sous 12 px, rayures et taches se fondent en aplat — deux
     tags « Bleu » et « Bleu rayé » se confondraient dans l'historique. Le
     créneau de la sidebar (.sb-item-tag) fait déjà 12 px de large. La forme
     est un clip-path (rond compris), pas un border-radius. */
  .tag-dot {
    width: 12px;
    height: 12px;
    clip-path: var(--chip-shape);
    background: var(--chip-fill);
    flex-shrink: 0;
  }
  .tag-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Le nom reste lisible par les lecteurs d'écran en mode pastille seule. */
  .tag-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
