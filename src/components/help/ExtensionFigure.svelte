<script>
  /**
   * Schéma du menu de l'extension Chrome — ce qu'on voit en cliquant l'icône.
   *
   * Dessiné plutôt que capturé : le menu prend le logo de l'installation, une
   * capture montrerait celui d'une autre entreprise. Le schéma reste juste
   * partout, et suit la langue.
   */
  export let labels = {};

  $: status = labels.status || 'Connecté';
  $: primary = labels.primary || 'Nouvelle réunion';
  $: secondary = labels.secondary || 'Ouvrir MyBrief';
  $: links = labels.links || ['Historique', 'Ma configuration'];
</script>

<svg class="exf" viewBox="0 0 300 208" role="img" aria-label={labels.alt || ''}>
  <title>{labels.alt || ''}</title>

  <!-- Barre du navigateur, avec l'icône épinglée -->
  <rect x="0" y="0" width="300" height="30" class="exf-bar" />
  <rect x="10" y="8" width="212" height="14" rx="7" class="exf-url" />
  <rect x="236" y="7" width="16" height="16" rx="4" class="exf-icon" />
  <path d="M244 11.5v5.5a2.2 2.2 0 0 1-4.4 0v-5.5a2.2 2.2 0 0 1 4.4 0z" class="exf-icon-mic" />
  <circle cx="244" cy="15" r="11" class="exf-icon-ring" />
  <rect x="264" y="8" width="14" height="14" rx="3" class="exf-url" />

  <!-- Le menu -->
  <g transform="translate(96, 38)">
    <rect width="196" height="164" rx="10" class="exf-popup" />
    <rect x="14" y="14" width="22" height="22" rx="6" class="exf-logo" />
    <text x="44" y="24" class="exf-title">MyBrief</text>
    <text x="44" y="36" class="exf-host">mybrief.entreprise.fr</text>
    <circle cx="19" cy="55" r="3" class="exf-dot" />
    <text x="27" y="58" class="exf-status">{status}</text>

    <rect x="14" y="70" width="168" height="30" rx="8" class="exf-btn exf-btn-brand" />
    <rect x="31" y="80" width="5" height="9" rx="2.5" class="exf-mic" />
    <path d="M28 87 a5.5 5.5 0 0 0 11 0" class="exf-mic-arc" />
    <text x="46" y="89" class="exf-btn-label exf-btn-label-brand">{primary}</text>

    <rect x="14" y="106" width="168" height="28" rx="8" class="exf-btn" />
    <text x="98" y="124" text-anchor="middle" class="exf-btn-label">{secondary}</text>

    <text x="14" y="154" class="exf-link">{links[0]}</text>
    <text x="182" y="154" text-anchor="end" class="exf-link">{links[1]}</text>
  </g>
</svg>

<style>
  .exf {
    display: block;
    width: 100%;
    max-width: 300px;
    height: auto;
    margin: 0 auto;
    font-family: inherit;
  }
  .exf-bar {
    fill: var(--surface-tint);
  }
  .exf-url {
    fill: var(--line);
  }
  .exf-icon {
    fill: var(--brand);
  }
  .exf-icon-mic {
    fill: #fff;
  }
  .exf-icon-ring {
    fill: none;
    stroke: var(--brand);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }
  .exf-popup {
    fill: var(--surface);
    stroke: var(--line-strong);
    stroke-width: 1;
    filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.12));
  }
  .exf-logo {
    fill: var(--brand);
  }
  .exf-title {
    font-size: 11px;
    font-weight: 700;
    fill: var(--ink);
  }
  .exf-host {
    font-size: 8px;
    fill: var(--ink-faint);
  }
  .exf-dot {
    fill: #2e9e5b;
  }
  .exf-status {
    font-size: 8.5px;
    fill: var(--ink-muted);
  }
  .exf-btn {
    fill: var(--surface-tint);
    stroke: var(--line-strong);
    stroke-width: 1;
  }
  .exf-btn-brand {
    fill: var(--brand);
    stroke: none;
  }
  .exf-btn-label {
    font-size: 9.5px;
    font-weight: 600;
    fill: var(--ink);
  }
  .exf-btn-label-brand {
    fill: #fff;
  }
  .exf-mic {
    fill: #fff;
  }
  .exf-mic-arc {
    fill: none;
    stroke: #fff;
    stroke-width: 1.4;
  }
  .exf-link {
    font-size: 8.5px;
    fill: var(--brand-text);
    text-decoration: underline;
  }
</style>
