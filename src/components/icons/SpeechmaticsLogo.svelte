<script>
  /**
   * Logo de Speechmatics — le logo COMPLET (symbole et nom), seul fichier que
   * publie sa page de marque (speechmatics.com/brand, `logo_speechmatics_black.svg`,
   * relevé le 2026-10-28). Sa charte interdit de le recadrer : il s'affiche donc
   * en entier, À LA PLACE du nom (ProviderKey, ModelPicker), et non dans la
   * pastille carrée des autres marques.
   *
   * Fichier tel quel, servi comme image : c'est un PNG enveloppé dans un SVG,
   * qu'aucun tracé ne permettrait d'inliner.
   *
   * Interface des marques « logo complet » : `height`, la largeur suit. Le nom
   * reste porté par le texte voisin, masqué à l'écran : l'image est décorative.
   */
  import logoUrl from './speechmatics-logo.svg';

  export let height = 18;
</script>

<img class="provider-wordmark" src={logoUrl} alt="" {height} />

<style>
  .provider-wordmark {
    flex: 0 0 auto;
    display: block;
    width: auto;
  }
</style>
