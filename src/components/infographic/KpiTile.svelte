<script context="module">
  let seq = 0;
</script>

<script>
  // Un chiffre et SA forme : anneau pour une part, barre épaisse pour une
  // progression, jauge en demi-cercle pour un objectif, colonnes comparées pour
  // une évolution, nombre seul sinon. La forme est choisie par l'IA (elle sait
  // ce que le chiffre veut dire), validée par le serveur (une forme sans sa
  // donnée redevient un nombre), dessinée ici à l'échelle.
  //
  // `featured` : la première tuile du tableau de bord, sur le dégradé du
  // bandeau — ses tracés passent alors en couleur de texte du bandeau.
  import Icon from './Icon.svelte';
  import Ring from './Ring.svelte';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    evolutionOf,
    formatPercent,
    formatQuantity,
    formatSignedPercent,
    kpiRatio,
    objectiveScale,
  } from '../../lib/infographic/format.js';

  /** @type {{libelle: string, valeur: number, unite: string, cible: number|null,
   *          precedent: number|null, forme: string, note: string}} */
  export let kpi;
  export let pal;
  export let lang = 'fr';
  /** Libellés de la feuille (uiText.infographic.sheet). */
  export let L;
  export let featured = false;

  const gid = `ig-gauge-${(seq += 1)}`;

  $: ratio = kpiRatio(kpi);
  $: value = formatQuantity(kpi.valeur, kpi.unite, lang);
  $: scale = kpi.forme === 'objectif' ? objectiveScale(kpi) : null;
  $: evo = kpi.forme === 'evolution' ? evolutionOf(kpi) : null;
  $: evoMax = evo ? Math.max(Math.abs(kpi.valeur), Math.abs(kpi.precedent)) || 1 : 1;
  // Tracés : couleurs littérales (export PNG), selon le fond de la tuile.
  $: track = featured ? pal.heroTrack : pal.pSoft;
  $: from = featured ? pal.onHero : pal.pLight;
  $: to = featured ? pal.onHero : pal.pDeep;
  $: tick = featured ? pal.onHero : pal.ink;
  $: caption =
    kpi.note ||
    ((kpi.forme === 'progression' || (kpi.forme === 'part' && kpi.unite !== '%')) &&
    ratio !== null &&
    kpi.cible > 0
      ? fill(L.ofTarget, {
          pct: formatPercent(ratio, lang),
          target: formatQuantity(kpi.cible, kpi.unite, lang),
        })
      : '');
  // Jauge en demi-cercle : angle du repère de l'objectif.
  $: angle = scale ? Math.PI * (1 - scale.targetPos) : 0;
  $: tickIn = { x: 50 + Math.cos(angle) * 31, y: 50 - Math.sin(angle) * 31 };
  $: tickOut = { x: 50 + Math.cos(angle) * 49, y: 50 - Math.sin(angle) * 49 };
</script>

<div class="ig-kpi" class:ig-kpi-featured={featured}>
  <span class="ig-kpi-label">{kpi.libelle}</span>

  {#if kpi.forme === 'part' && ratio !== null}
    <div class="ig-kpi-row">
      <Ring {ratio} size={featured ? 15 : 11.5} {track} {from} {to} thickness={13}>
        <span class="ig-kpi-ring-value">{formatPercent(ratio, lang)}</span>
      </Ring>
      <div class="ig-kpi-side">
        <span class="ig-kpi-value">{value}</span>
        {#if caption}<span class="ig-kpi-note">{caption}</span>{/if}
      </div>
    </div>
  {:else if scale}
    <div class="ig-gauge">
      <svg viewBox="0 0 100 56" width="100%" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color={from} />
            <stop offset="1" stop-color={to} />
          </linearGradient>
        </defs>
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          stroke={track}
          stroke-width="11"
          stroke-linecap="round"
        />
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          stroke="url(#{gid})"
          stroke-width="11"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="{Math.max(0.5, scale.valuePos * 100)} 100"
        />
        <line
          x1={tickIn.x}
          y1={tickIn.y}
          x2={tickOut.x}
          y2={tickOut.y}
          stroke={tick}
          stroke-width="2.6"
          stroke-linecap="round"
        />
      </svg>
      <span class="ig-gauge-value">{value}</span>
    </div>
    <span class="ig-kpi-note">
      {fill(L.targetLabel, { value: formatQuantity(kpi.cible, kpi.unite, lang) })}
    </span>
  {:else if evo}
    <div class="ig-kpi-row">
      <div class="ig-kpi-side">
        <span class="ig-kpi-value">{value}</span>
        <span class="ig-evo-chip" class:ig-evo-down={!evo.up}>
          <Icon
            name={evo.up ? 'hausse' : 'baisse'}
            color={featured ? pal.heroFrom : pal.paper}
            size={2.2}
            strokeWidth={2.4}
          />
          {evo.pct === null
            ? formatQuantity(evo.delta, kpi.unite, lang)
            : formatSignedPercent(evo.pct, lang)}
        </span>
      </div>
      <div class="ig-evo-cols">
        <span class="ig-evo-col">
          <i
            class="ig-evo-bar ig-evo-before"
            style="height:{(Math.abs(kpi.precedent) / evoMax) * 100}%"
          ></i>
          <small>{L.before}</small>
        </span>
        <span class="ig-evo-col">
          <i class="ig-evo-bar" style="height:{(Math.abs(kpi.valeur) / evoMax) * 100}%"></i>
          <small>{L.now}</small>
        </span>
      </div>
    </div>
    <span class="ig-kpi-note">
      {L.before} · {formatQuantity(kpi.precedent, kpi.unite, lang)}{#if kpi.note}
        — {kpi.note}{/if}
    </span>
  {:else}
    <span class="ig-kpi-value ig-kpi-value-xl">{value}</span>
    {#if kpi.forme === 'progression' && ratio !== null}
      <div class="ig-track">
        <span class="ig-track-fill" style="width:{ratio * 100}%"></span>
        <span class="ig-track-goal"
          ><Icon name="drapeau" color={tick} size={2.6} strokeWidth={2.2} /></span
        >
      </div>
    {/if}
    {#if caption}<span class="ig-kpi-note">{caption}</span>{/if}
  {/if}
</div>
