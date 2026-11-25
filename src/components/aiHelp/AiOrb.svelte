<script>
  /**
   * L'orbe — le visage de l'Aide IA. Partout où l'IA est présente (carte de
   * démarrage, pastille du dock, en-tête de ses cartes), c'est lui qu'on voit,
   * dans la teinte réservée à l'IA (--ai, styles/tokens.css).
   *
   * Au centre de l'anneau, une sonnette de comptoir — celle d'un hôtel : on
   * appelle l'IA par son prénom comme on sonne à l'accueil, et elle répond.
   *
   * Quatre états, qui se lisent sans texte :
   *   off     éteinte — un anneau gris, immobile
   *   listen  à l'écoute — l'anneau tourne lentement, la sonnette respire
   *   think   elle cherche — l'anneau tourne vite
   *   speak   elle intervient — la sonnette tinte, des ondes en partent
   *
   * Purement décoratif pour un lecteur d'écran : l'état est toujours dit en
   * toutes lettres par le composant qui le porte.
   */
  /** @type {'off'|'listen'|'think'|'speak'} */
  export let state = 'listen';
  /** Diamètre, en px. */
  export let size = 32;
  /** Sur un fond plein de la teinte IA : l'orbe passe en blanc. */
  export let inverse = false;
</script>

<span
  class="ai-orb ai-orb-{state}"
  class:ai-orb-inverse={inverse}
  style:width="{size}px"
  style:height="{size}px"
  aria-hidden="true"
>
  <svg class="ai-orb-ring" viewBox="0 0 40 40">
    <circle
      cx="20"
      cy="20"
      r="17"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-dasharray="40 13.4"
      stroke-linecap="round"
    />
  </svg>
  <!-- La sonnette : le bouton, la cloche, le socle. Pleine, pour rester
       lisible à 24 px. -->
  <svg class="ai-orb-core" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5.6" r="1.7" />
    <rect x="11.1" y="6.6" width="1.8" height="2.6" />
    <path d="M3.8 17a8.2 8.2 0 0 1 16.4 0z" />
    <rect x="2.2" y="18.2" width="19.6" height="2.8" rx="1.4" />
  </svg>
</span>

<style>
  .ai-orb {
    position: relative;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ai);
  }
  .ai-orb-inverse {
    color: #fff;
  }
  .ai-orb-off {
    color: var(--ink-faint);
    opacity: 0.75;
  }
  .ai-orb-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  /* Un peu remontée : le socle pèse en bas, l'œil la voit centrée ainsi. */
  .ai-orb-core {
    position: relative;
    top: -3%;
    width: 52%;
    height: 52%;
  }

  .ai-orb-listen .ai-orb-ring {
    animation: ai-orb-spin 10s linear infinite;
  }
  .ai-orb-listen .ai-orb-core {
    animation: ai-orb-breathe 3s ease-in-out infinite;
  }
  .ai-orb-think .ai-orb-ring {
    animation: ai-orb-spin 0.9s linear infinite;
  }
  .ai-orb-think .ai-orb-core {
    animation: ai-orb-breathe 0.8s ease-in-out infinite;
  }
  .ai-orb-speak .ai-orb-ring {
    animation: ai-orb-spin 2.4s linear infinite;
  }
  /* Elle parle : la sonnette tinte — un balancement, pas une respiration. */
  .ai-orb-speak .ai-orb-core {
    transform-origin: 50% 85%;
    animation: ai-orb-ring-bell 0.7s ease-in-out infinite;
  }
  .ai-orb-speak::before,
  .ai-orb-speak::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid currentColor;
    animation: ai-orb-ripple 1.5s ease-out infinite;
  }
  .ai-orb-speak::after {
    animation-delay: 0.5s;
  }

  @keyframes ai-orb-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes ai-orb-breathe {
    0%,
    100% {
      transform: scale(0.9);
    }
    50% {
      transform: scale(1.06);
    }
  }
  @keyframes ai-orb-ring-bell {
    0%,
    100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(-9deg);
    }
    75% {
      transform: rotate(9deg);
    }
  }
  @keyframes ai-orb-ripple {
    0% {
      transform: scale(0.7);
      opacity: 0.7;
    }
    100% {
      transform: scale(1.9);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-orb-ring,
    .ai-orb-core,
    .ai-orb::before,
    .ai-orb::after {
      animation: none;
    }
    .ai-orb-speak::before,
    .ai-orb-speak::after {
      display: none;
    }
  }
</style>
