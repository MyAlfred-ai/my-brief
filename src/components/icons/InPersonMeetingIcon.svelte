<!-- Micro sur pied — « Réunion en présentiel » (MeetingTypeModal). Dessiné en
     paire avec VisioMeetingIcon, même grille (64) et même trait : les deux
     boutons du choix doivent peser pareil. Solar n'a pas de personnage en visio,
     d'où la paire maison plutôt qu'un micro Solar à côté d'un dessin.
     Deux tons en `currentColor` (trait plein, aplat à 14 %) : l'icône suit la
     couleur de son parent, donc la couleur primaire réglée en administration.
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
    <rect x="22" y="6" width="20" height="32" rx="10" fill="currentColor" fill-opacity=".14" />
    <path d="M28 16h8M28 22h8" />
    <path d="M14 28v2a18 18 0 0 0 36 0v-2" />
    <path d="M32 48v9m-8 0h16" />
  </g>
</svg>
