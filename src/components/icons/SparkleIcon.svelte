<!-- Étincelle de génération (asset Figma, 8 rayons) — animée par la classe
     globale `.tab-sparkle` (style.css). Extraite d'App.svelte, qui est à son
     plafond `max-lines` (cf. eslint.config.js) et ne peut plus grossir.
     Le trait est posé en CSS et non en attribut `stroke` : un attribut de
     présentation n'accepte pas var(), et la couleur doit suivre la couleur
     primaire réglée dans l'administration. -->
<svg class="tab-sparkle" width="15" height="15" viewBox="0 0 19 19" fill="none" aria-hidden="true">
  <path d="M9.03156 4.71015L9.03155 0.614369" stroke-width="1.22873" stroke-linecap="round" />
  <path d="M9.03156 17.4617L9.03155 13.366" stroke-width="1.22873" stroke-linecap="round" />
  <path d="M13.3663 9.03183H17.4621" stroke-width="1.22873" stroke-linecap="round" />
  <path d="M0.61438 9.03183H4.71016" stroke-width="1.22873" stroke-linecap="round" />
  <path d="M12.0938 5.97358L14.9899 3.07742" stroke-width="1.22873" stroke-linecap="round" />
  <path d="M3.07681 14.9907L5.97297 12.0945" stroke-width="1.22873" stroke-linecap="round" />
  <path d="M12.1029 12.0942L14.9991 14.9904" stroke-width="1.22873" stroke-linecap="round" />
  <path d="M3.08578 3.07774L5.98194 5.97389" stroke-width="1.22873" stroke-linecap="round" />
</svg>

<style>
  path {
    stroke: var(--mb-orange);
  }
</style>
