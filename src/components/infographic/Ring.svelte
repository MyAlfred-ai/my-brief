<script context="module">
  // Identifiant unique de chaque dégradé SVG : plusieurs anneaux cohabitent
  // sur une feuille, et la feuille elle-même peut être rendue deux fois
  // (miniature et visionneuse).
  let seq = 0;
</script>

<script>
  // Anneau de proportion — une part d'un tout, à l'échelle. Couleurs
  // LITTÉRALES (dégradé SVG compris) : html2canvas sérialise le <svg> en image
  // isolée à l'export PNG. Le contenu du centre est du HTML, posé par-dessus.

  /** Rapport 0..1. */
  export let ratio = 0;
  /** Diamètre, en unités de page (`--u`). */
  export let size = 16;
  export let track = '#e2e5ea';
  export let from = '#000000';
  export let to = '#000000';
  /** Épaisseur du trait, en unités du viewBox (100). */
  export let thickness = 12;

  const id = `ig-ring-${(seq += 1)}`;
  $: r = 50 - thickness / 2 - 1;
  $: dash = Math.max(0.5, Math.min(1, ratio) * 100);
</script>

<span class="ig-ring" style="width:calc({size} * var(--u));height:calc({size} * var(--u))">
  <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
    <defs>
      <linearGradient {id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color={from} />
        <stop offset="1" stop-color={to} />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" {r} fill="none" stroke={track} stroke-width={thickness} />
    <circle
      cx="50"
      cy="50"
      {r}
      fill="none"
      stroke="url(#{id})"
      stroke-width={thickness}
      stroke-linecap="round"
      pathLength="100"
      stroke-dasharray="{dash} 100"
      transform="rotate(-90 50 50)"
    />
  </svg>
  <span class="ig-ring-center"><slot /></span>
</span>
