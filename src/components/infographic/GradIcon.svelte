<script>
  // Pictogramme dans sa tuile en dégradé — la signature visuelle des gabarits :
  // chaque sujet, thème ou colonne s'annonce par elle. La couleur du trait est
  // choisie par la palette pour rester visible sur le dégradé (palette.js).
  import Icon from './Icon.svelte';

  export let name = 'point';
  /** `p` | `s` | `ok` | `warn` (dégradés) · `glass` (sur le bandeau) · `white` (pastille blanche) */
  export let tone = 'p';
  /** Côté de la tuile, en unités de page (`--u`, 1 % de la largeur). */
  export let size = 8;
  /** `square` (coins arrondis) ou `round`. */
  export let shape = 'square';
  export let pal;

  $: color =
    tone === 's'
      ? pal.iconOnS
      : tone === 'ok' || tone === 'warn'
        ? pal.paper
        : tone === 'glass'
          ? pal.onHero
          : tone === 'white'
            ? pal.pInk
            : pal.iconOnP;
</script>

<span
  class="ig-tile ig-tile-{tone} ig-tile-{shape}"
  style="width:calc({size} * var(--u));height:calc({size} * var(--u))"
  aria-hidden="true"
>
  <Icon {name} {color} size={size * 0.52} strokeWidth={1.9} />
</span>
