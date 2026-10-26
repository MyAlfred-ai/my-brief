<!-- Une personne à l'écran, casque sur les oreilles — « Réunion avec visio »
     (MeetingTypeModal, rappel de la modale de bienvenue). Dessiné en paire avec
     InPersonMeetingIcon : même grille (64), même trait, mêmes deux tons en
     `currentColor`. Les écouteurs sont pleins : c'est le détail qui dit
     « casque » quand l'icône est petite.
     Même contrat qu'une icône `~icons/solar/…` : 1.2em par défaut, et tout
     attribut passé (width, height, aria-hidden, class…) va au <svg>. -->
<svg viewBox="0 0 64 64" width="1.2em" height="1.2em" {...$$restProps}>
  <g
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="2.5"
  >
    <!-- Écran et pied -->
    <rect x="5" y="7" width="54" height="39" rx="5" fill="currentColor" fill-opacity=".14" />
    <path d="M32 46v11m-10 0h20" />
    <!-- La personne, coupée par le bas de l'écran comme une vignette de visio -->
    <circle cx="32" cy="21.5" r="6" />
    <path d="M18.5 46c0-7.8 6-12 13.5-12s13.5 4.2 13.5 12" />
    <!-- Le casque : arceau, écouteurs, micro -->
    <path d="M21.5 21.5a10.5 10.5 0 0 1 21 0" />
    <rect x="19" y="19" width="5" height="8.5" rx="2.5" fill="currentColor" stroke="none" />
    <rect x="40" y="19" width="5" height="8.5" rx="2.5" fill="currentColor" stroke="none" />
    <path d="M21.5 27c0 2.4 1.8 3.6 5 3.6" />
    <circle cx="27.8" cy="30.6" r="1.7" fill="currentColor" stroke="none" />
  </g>
</svg>
