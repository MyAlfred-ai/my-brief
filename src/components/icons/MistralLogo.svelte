<script>
  /**
   * Logo Mistral (le « M » en pavés, une bande de couleur par rangée, du jaune
   * au rouge), inline comme [MicrosoftLogo](./MicrosoftLogo.svelte). Il
   * identifie le fournisseur dans Administration → IA.
   *
   * Les couleurs sont celles de la marque Mistral, pas de l'interface : elles
   * ne passent donc pas par tokens.css, comme celles des logos Microsoft et
   * Google.
   */
  export let size = 18;

  /** Rangées du « M », de haut en bas : couleur, puis colonnes pleines (sur 5). */
  const ROWS = [
    ['#FFD800', [0, 4]],
    ['#FFAF00', [0, 1, 3, 4]],
    ['#FF8205', [0, 1, 2, 3, 4]],
    ['#FA500F', [0, 2, 4]],
    ['#E10500', [0, 4]],
  ];
</script>

<svg
  class="provider-logo"
  viewBox="0 0 20 20"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
>
  {#each ROWS as [color, columns], row (row)}
    {#each columns as column (column)}
      <rect x={column * 4} y={row * 4} width="4" height="4" fill={color} />
    {/each}
  {/each}
</svg>

<style>
  .provider-logo {
    flex: 0 0 auto;
    display: block;
  }
</style>
