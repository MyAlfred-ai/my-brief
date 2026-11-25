<script>
  /**
   * Icônes de l'Aide IA — tracées ici plutôt que tirées d'un jeu d'icônes : une
   * par domaine d'intervention, les mêmes sur la carte de démarrage, dans la
   * pastille du dock et en tête de chaque carte. C'est cette constance qui fait
   * reconnaître le type d'une intervention avant d'en lire le titre.
   */
  const PATHS = {
    project:
      'M12 3.2l7 2.8v5.4c0 4.3-2.9 7.8-7 9.4-4.1-1.6-7-5.1-7-9.4V6l7-2.8zM12 8.4v4.4M12 15.9v.2',
    qa: 'M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15A2.5 2.5 0 0 1 5 12.5v-6z',
    agenda:
      'M10.5 7h8.5M10.5 12h8.5M10.5 17h8.5M4.6 6.9l1.1 1.1 2-2.2M4.6 11.9l1.1 1.1 2-2.2M4.6 16.9l1.1 1.1 2-2.2',
    ideas:
      'M9.2 18.2h5.6M10.2 21h3.6M12 3a6 6 0 0 0-3.7 10.7c.6.5 1 1.3 1.1 2.1h5.2c.1-.8.5-1.6 1.1-2.1A6 6 0 0 0 12 3z',
    question:
      'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.9M12 16.6v.1',
    bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2zM10 20.5a2 2 0 0 0 4 0',
    bellOff: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2zM10 20.5a2 2 0 0 0 4 0M4 4l16 16',
    close: 'M6 6l12 12M18 6L6 18',
    send: 'M5 12h13M13 6l6 6-6 6',
    book: 'M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5v-13zM5 18.5A1.5 1.5 0 0 0 6.5 20H19',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    chevron: 'M6 9.5l6 6 6-6',
    search: 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM16 16l4 4',
    plus: 'M12 5v14M5 12h14',
    settings:
      'M4.5 7h8M17.5 7h2M4.5 12h2M11.5 12h8M4.5 17h7M16.5 17h3M15 4.8v4.4M9 9.8v4.4M14 14.8v4.4',
    tag: 'M4 12.4V5.5A1.5 1.5 0 0 1 5.5 4h6.9a1.5 1.5 0 0 1 1.06.44l6.1 6.1a1.5 1.5 0 0 1 0 2.12l-6.9 6.9a1.5 1.5 0 0 1-2.12 0l-6.1-6.1A1.5 1.5 0 0 1 4 12.4zM8.4 8.4v.1',
    note: 'M6.5 4h8.6L19 7.9v10.6A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4zM8.5 10h7M8.5 13.5h7M8.5 17h4',
    warn: 'M12 4.5l8.5 14.5h-17L12 4.5zM12 10v4M12 16.6v.1',
    // Les gestes sur la réunion : pause, reprise, fin — et la plume d'une
    // correction de la transcription.
    pause: 'M9 5.5v13M15 5.5v13',
    play: 'M8 5.5l10.5 6.5L8 18.5v-13z',
    stop: 'M7 7h10v10H7z',
    // Un chronomètre : le minuteur qu'on lui demande.
    timer: 'M12 6.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM9.5 3.5h5M12 3.5v3M12 10v3.5l2.3 1.6',
    pen: 'M4.5 19.5l1-4.2L16.2 4.6a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.7 18.5l-4.2 1zM14.5 6.3l3.2 3.2',
    // Un micro : ce point vient de ce qui s'est DIT, pas de ce qu'on a saisi.
    voice:
      'M12 3.5A2.5 2.5 0 0 0 9.5 6v5a2.5 2.5 0 0 0 5 0V6A2.5 2.5 0 0 0 12 3.5zM6.5 11a5.5 5.5 0 0 0 11 0M12 16.5v4',
  };

  /** Le type d'une intervention → l'icône de son domaine. */
  const KIND_ICONS = {
    alert: 'project',
    answer: 'qa',
    agenda: 'agenda',
    idea: 'ideas',
    reminder: 'bell',
  };

  /** @type {keyof typeof PATHS | 'alert' | 'answer' | 'idea'} */
  export let name;
  export let size = 18;
  export let strokeWidth = 1.8;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[KIND_ICONS[name] || name] || ''} />
</svg>
