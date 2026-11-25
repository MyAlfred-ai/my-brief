<script>
  // Carte « essentiel » : LE chiffre, la décision ou l'objectif de la réunion,
  // sur une carte blanche qui chevauche la vague de la couverture. Commune aux
  // six gabarits — une infographie se lit d'abord au même endroit.
  //
  // Une valeur qui est une part (« 94 % », « 8/10 ») se dessine en ANNEAU,
  // la valeur au centre ; une variation signée (« +12 % ») reste un nombre.
  // `variant="seal"` (gabarit Décision) : un sceau coché à la place.
  import Icon from './Icon.svelte';
  import GradIcon from './GradIcon.svelte';
  import Ring from './Ring.svelte';
  import { heroRatio } from '../../lib/infographic/format.js';

  /** @type {{valeur: string, libelle: string, icone: string}} */
  export let heros;
  export let pal;
  export let eyebrow = '';
  /** Pictogramme imposé par le gabarit ; sinon celui que l'IA a choisi. */
  export let icon = '';
  /** Chiffres d'appui, à droite : [{ valeur, libelle }] déjà mis en forme. */
  export let stats = [];
  /** `default` | `seal` */
  export let variant = 'default';

  $: ratio = variant === 'seal' ? null : heroRatio(heros?.valeur);
  $: shown = !!heros?.valeur || !!heros?.libelle;
</script>

{#if shown || stats.length}
  <section class="ig-hero ig-hero-{variant}" class:ig-hero-stats-only={!shown}>
    <span class="ig-hero-deco ig-hero-deco-a"></span>
    <span class="ig-hero-deco ig-hero-deco-b"></span>
    {#if shown}
      <div class="ig-hero-visual">
        {#if variant === 'seal'}
          <span class="ig-seal">
            <Icon name="check" color={pal.iconOnP} size={6.4} strokeWidth={2.6} />
          </span>
        {:else if ratio !== null}
          <Ring {ratio} size={14} track={pal.pSoft} from={pal.pLight} to={pal.pDeep} thickness={12}>
            <span class="ig-hero-ring-value">{heros.valeur}</span>
          </Ring>
        {:else}
          <GradIcon name={icon || heros.icone} {pal} size={11} shape="round" />
        {/if}
      </div>
      <div class="ig-hero-main">
        {#if eyebrow}<span class="ig-hero-eyebrow">{eyebrow}</span>{/if}
        {#if variant === 'seal'}
          {#if heros.valeur}<span class="ig-hero-pill">{heros.valeur}</span>{/if}
          <span class="ig-hero-statement">{heros.libelle || heros.valeur}</span>
        {:else if heros.valeur && ratio === null}
          <span class="ig-hero-value">{heros.valeur}</span>
          {#if heros.libelle}<span class="ig-hero-label">{heros.libelle}</span>{/if}
        {:else}
          <span class="ig-hero-statement">{heros.libelle || heros.valeur}</span>
        {/if}
      </div>
    {/if}
    {#if stats.length}
      <ul class="ig-hero-stats">
        {#each stats as stat, i (i)}
          <li><b>{stat.valeur}</b><span>{stat.libelle}</span></li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
