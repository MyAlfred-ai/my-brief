<script>
  /**
   * Couleur et forme d'un tag, en un clic, depuis sa fiche — enregistrées
   * aussitôt, comme tout le reste de la fiche.
   *
   * Le formulaire complet (TagForm) demandait d'ouvrir « Nom et apparence »,
   * de choisir, puis « Enregistrer » : trois gestes pour changer une couleur,
   * et un régime d'enregistrement différent du reste de la fiche. Ici les
   * quatorze teintes unies et les sept formes, peintes dans la couleur en
   * cours ; les motifs et la couleur libre restent dans le formulaire complet
   * (« Motifs et couleur libre… »), plus rares et plus longs à régler.
   *
   * Composant de présentation : il dit le choix (`onPick`), le parent écrit.
   */
  import { tagColorVars, tagShapeClip } from '../../stores/tags.js';

  export let color = '';
  export let shape = '';
  /** Teintes unies proposées (slugs servis par l'API, sans motif). */
  export let colors = [];
  /** Formes proposées (slugs servis par l'API). */
  export let shapes = [];
  /** Libellés `uiText.tagsPanel`. */
  export let texts;
  /** @type {(choice: {color: string, shape: string}) => void} */
  export let onPick = () => {};
  export let onMore = () => {};

  $: fill = tagColorVars(color).fill;
</script>

<div class="tpp" role="dialog" aria-label={texts.pastille}>
  <span class="tpp-cap" id="tpp-colors">{texts.colorField}</span>
  <div class="tpp-swatches" role="radiogroup" aria-labelledby="tpp-colors">
    {#each colors as slug (slug)}
      <button
        type="button"
        class="tpp-sw"
        class:tpp-on={slug === color}
        role="radio"
        aria-checked={slug === color}
        aria-label={texts.colorNames?.[slug] || slug}
        title={texts.colorNames?.[slug] || slug}
        style="--sw: {tagColorVars(slug).dot}"
        on:click={() => onPick({ color: slug, shape })}
      ></button>
    {/each}
  </div>

  <span class="tpp-cap" id="tpp-shapes">{texts.shapeField}</span>
  <div class="tpp-shapes" role="radiogroup" aria-labelledby="tpp-shapes">
    {#each shapes as slug (slug)}
      <button
        type="button"
        class="tpp-shape"
        class:tpp-on={slug === shape}
        role="radio"
        aria-checked={slug === shape}
        aria-label={texts.shapeNames?.[slug] || slug}
        title={texts.shapeNames?.[slug] || slug}
        on:click={() => onPick({ color, shape: slug })}
      >
        <span style="--fill: {fill}; --clip: {tagShapeClip(slug)}"></span>
      </button>
    {/each}
  </div>

  <button type="button" class="tpp-more" on:click={onMore}>{texts.pastilleMore}</button>
</div>

<style>
  .tpp {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 304px;
    max-width: calc(100vw - 48px);
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid var(--line-strong);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: 0 22px 44px -20px color-mix(in srgb, var(--ink) 45%, transparent);
  }
  .tpp-cap {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .tpp-swatches,
  .tpp-shapes {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
    justify-items: center;
  }
  .tpp-sw {
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--sw);
    cursor: pointer;
    transition: transform 0.12s;
  }
  .tpp-sw:hover {
    transform: scale(1.1);
  }
  .tpp-sw.tpp-on {
    box-shadow:
      0 0 0 3px var(--surface),
      0 0 0 5px var(--sw);
  }
  .tpp-shape {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1.5px solid var(--line);
    border-radius: 9px;
    background: var(--surface);
    cursor: pointer;
  }
  .tpp-shape span {
    width: 16px;
    height: 16px;
    background: var(--fill);
    clip-path: var(--clip);
  }
  .tpp-shape.tpp-on {
    border-color: var(--tag-dot, var(--brand));
    background: var(--surface-tint);
  }
  .tpp-sw:focus-visible,
  .tpp-shape:focus-visible,
  .tpp-more:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .tpp-more {
    align-self: flex-start;
    padding: 4px 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--brand-text);
    cursor: pointer;
  }
  @media (pointer: coarse) {
    .tpp-sw,
    .tpp-shape {
      width: 36px;
      height: 36px;
    }
  }
</style>
