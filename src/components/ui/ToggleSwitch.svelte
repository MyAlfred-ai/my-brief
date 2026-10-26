<script>
  /**
   * Interrupteur — le dessin qui existait en double (`.ac-switch` de l'onglet
   * Actions, `.at-switch` de l'onglet Authentification, mêmes 38×22 et même
   * `translateX(16px)`). Les deux onglets l'utilisent désormais.
   *
   * `label` est rendu pour les lecteurs d'écran seulement : la ligne qui porte
   * l'interrupteur montre déjà son intitulé, mais une case à cocher sans nom
   * accessible ne dit pas ce qu'elle commande.
   */
  export let checked = false;
  export let label = '';
  export let disabled = false;
  export let id = undefined;
  /**
   * Variante resserrée, pour une colonne d'interrupteurs dans une liste dense
   * (Administration → Utilisateurs) : à 38×22, une colonne orange pesait plus
   * lourd que les noms qu'elle accompagne. À la souris seulement — au doigt,
   * l'interrupteur garde sa taille, c'est sa zone de toucher.
   */
  export let small = false;
</script>

<!-- `on:change` est retransmis : les écrans à enregistrement immédiat
     (« Mes tags ») déclenchent leur save dessus, ceux à bouton Enregistrer
     se contentent du bind. -->
<label class="ts" class:ts-disabled={disabled} class:ts-small={small}>
  <input type="checkbox" {id} {disabled} bind:checked on:change />
  <span class="ts-track" aria-hidden="true"></span>
  <span class="ts-sr">{label}</span>
</label>

<style>
  .ts {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    cursor: pointer;
  }
  .ts-disabled {
    cursor: default;
    opacity: 0.5;
  }
  .ts input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .ts-track {
    position: relative;
    width: 38px;
    height: 22px;
    border-radius: 999px;
    background: var(--line-strong);
    transition: background 0.18s;
  }
  .ts-track::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.18s;
  }
  .ts input:checked + .ts-track {
    background: var(--brand);
  }
  .ts input:checked + .ts-track::after {
    transform: translateX(16px);
  }
  @media (pointer: fine) {
    .ts-small .ts-track {
      width: 30px;
      height: 17px;
    }
    .ts-small .ts-track::after {
      top: 2.5px;
      left: 2.5px;
      width: 12px;
      height: 12px;
    }
    .ts-small input:checked + .ts-track::after {
      transform: translateX(13px);
    }
  }
  .ts input:focus-visible + .ts-track {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .ts-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .ts-track,
    .ts-track::after {
      transition: none;
    }
  }
</style>
