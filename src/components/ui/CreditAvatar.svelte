<script>
  /**
   * Avatar cerclé du crédit de temps : UserAvatar entouré d'un anneau qui se
   * vide au fil du mois. Il a remplacé la carte « Temps de réunion » du bas de
   * la colonne de gauche — le reste du mois se lit en un coup d'œil, là où l'on
   * cherche déjà son compte, sans 75 px de carte permanente.
   *
   * L'anneau se remplit de ce qui RESTE (plein au début du mois, vide à la
   * fin), dans les tons de `creditTone` : la même couleur que la jauge de
   * « Mes statistiques » et que les anneaux d'Administration → Crédit de temps.
   * La couleur n'est jamais seule à le dire : la capsule et le menu de compte
   * écrivent le reste en toutes lettres.
   *
   * Sans quota (ou avant la réponse du serveur), pas d'anneau — mais la boîte
   * garde sa taille : l'avatar ne saute pas quand le quota arrive.
   *
   * Décoratif pour les lecteurs d'écran : le bouton qui le porte se nomme
   * lui-même.
   */
  import UserAvatar from './UserAvatar.svelte';
  import { quotaNow } from '../../stores/quota.js';

  export let initials = '';
  export let picture = '';
  export let provider = '';
  export let title = '';
  /** Diamètre du rond, en px ; l'anneau l'entoure de 4 px. */
  export let size = 32;

  const STROKE = 2.5;

  $: box = size + 8;
  $: center = box / 2;
  $: radius = (box - STROKE) / 2;
  $: circumference = 2 * Math.PI * radius;
  $: offset = circumference * (1 - $quotaNow.remainingRatio);
</script>

<span class="cav cav-{$quotaNow.tone || 'none'}" style="--cav-box: {box}px">
  {#if $quotaNow.limited}
    <svg class="cav-ring" viewBox="0 0 {box} {box}" aria-hidden="true">
      <circle class="cav-track" cx={center} cy={center} r={radius} />
      <circle
        class="cav-fill"
        cx={center}
        cy={center}
        r={radius}
        style="stroke-dasharray: {circumference}; stroke-dashoffset: {offset}"
      />
    </svg>
  {/if}
  <UserAvatar {initials} {picture} {provider} {title} {size} />
</span>

<style>
  .cav {
    --cav-accent: var(--credit-high);
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--cav-box);
    height: var(--cav-box);
    flex-shrink: 0;
  }
  .cav-mid {
    --cav-accent: var(--credit-mid);
  }
  .cav-low {
    --cav-accent: var(--credit-low);
  }
  .cav-out {
    --cav-accent: var(--credit-out);
  }

  .cav-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .cav-track {
    fill: none;
    stroke: var(--viz-track);
    stroke-width: 2.5;
  }
  /* Épuisé : plus rien à remplir, la piste elle-même vire au rouge. */
  .cav-out .cav-track {
    stroke: var(--danger-line);
  }
  .cav-fill {
    fill: none;
    stroke: var(--cav-accent);
    stroke-width: 2.5;
    stroke-linecap: round;
    transition:
      stroke-dashoffset 0.6s cubic-bezier(0.33, 1, 0.68, 1),
      stroke 0.3s;
  }
  /* Un trait de longueur nulle à bouts ronds se dessine en point. */
  .cav-out .cav-fill {
    stroke-linecap: butt;
  }
  @media (prefers-reduced-motion: reduce) {
    .cav-fill {
      transition: none;
    }
  }
</style>
