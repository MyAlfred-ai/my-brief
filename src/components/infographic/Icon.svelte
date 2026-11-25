<script>
  // Pictogramme d'infographie. La couleur est une valeur LITTÉRALE (palette.js)
  // posée en attribut : à l'export PNG, html2canvas sérialise ce <svg> en image
  // isolée, où ni classe ni variable CSS n'existent plus. La taille vient de la
  // boîte qui l'entoure (classe `ig-ico` + `size`), le <svg> la remplit.
  import { iconPaths } from '../../lib/infographic/icons.js';

  /** Nom du pictogramme (icons.js) — `point` s'il est inconnu. */
  export let name = 'point';
  /** Couleur du trait, en hexadécimal. */
  export let color = '#1b1e24';
  /**
   * Côté de la boîte : un NOMBRE d'unités de page (`--u`, 1 % de la largeur
   * de la feuille, à l'échelle de l'ajustement A4), ou une longueur CSS.
   */
  export let size = '1em';
  export let strokeWidth = 1.8;

  $: paths = iconPaths(name);
  $: side = typeof size === 'number' ? `calc(${size} * var(--u))` : size;
</script>

<span class="ig-ico" style="width:{side};height:{side}" aria-hidden="true">
  <svg
    viewBox="0 0 24 24"
    width="100%"
    height="100%"
    fill="none"
    stroke={color}
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {#each paths as d, i (i)}
      <path {d} />
    {/each}
  </svg>
</span>
