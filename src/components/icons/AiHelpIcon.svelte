<!-- L'orbe de l'Aide IA, immobile — pour un menu ou un titre : l'anneau, et en
     son centre la sonnette de comptoir (bouton, cloche, socle). Même contrat
     qu'une icône `~icons/solar/…` : 1.2em par défaut, et tout attribut passé
     (width, height, aria-hidden, class…) va au <svg>. Sa version vivante est
     components/aiHelp/AiOrb.svelte. -->
<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" {...$$restProps}>
  <circle
    cx="12"
    cy="12"
    r="9.6"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-dasharray="22.6 7.55"
    stroke-linecap="round"
  />
  <g fill="currentColor" transform="translate(6.4 5.7) scale(0.47)">
    <circle cx="12" cy="5.6" r="1.7" />
    <rect x="11.1" y="6.6" width="1.8" height="2.6" />
    <path d="M3.8 17a8.2 8.2 0 0 1 16.4 0z" />
    <rect x="2.2" y="18.2" width="19.6" height="2.8" rx="1.4" />
  </g>
</svg>
