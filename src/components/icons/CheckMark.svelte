<script>
  /**
   * Coche simple, au trait — la marque « choisi » des cartes et des pastilles
   * de la fenêtre « Et maintenant ? ». Le jeu Solar n'en a pas de nue : ses
   * coches sont dans un cercle, un carré, ou doublées (« lu »), et une double
   * coche se lisait « envoyé » sur une action qui n'était encore que choisie.
   */
  export let size = 15;
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width="2.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M5 12.5l4.5 4.5L19 7.5" />
</svg>
