<script>
  // Gabarit « Synthèse » — point d'équipe, réunion d'information, réunion
  // mixte : le repli de tous les autres. L'essentiel en grand, une carte par
  // sujet (tuiles en dégradé, primaire et secondaire en alternance), les
  // décisions sur un ruban.
  import Hero from './Hero.svelte';
  import GradIcon from './GradIcon.svelte';
  import SectionTitle from './SectionTitle.svelte';
  import { formatQuantity } from '../../lib/infographic/format.js';

  export let layout;
  export let pal;
  export let L;
  export let lang = 'fr';

  $: stats = layout.chiffres.slice(0, 3).map((c) => ({
    valeur: formatQuantity(c.valeur, c.unite, lang),
    libelle: c.libelle,
  }));
  $: count = layout.sujets.length;
  // Colonnes qui se remplissent : 1, 2, 3, 2×2, 2+3 (la première en vedette), 3×2.
  $: cols = count <= 1 ? 1 : count === 2 || count === 4 || count === 5 ? 2 : 3;
  const tone = (i) => (i % 2 === 0 ? 'p' : 's');
</script>

<Hero heros={layout.heros} {pal} eyebrow={L.essential} {stats} />

{#if count}
  <section class="ig-section">
    <SectionTitle title={L.topics} icon="document" {pal} />
    <div class="ig-grid ig-cols-{cols}" class:ig-first-wide={count === 5}>
      {#each layout.sujets as sujet, i (i)}
        <article class="ig-card ig-card-{tone(i)}">
          <header class="ig-card-head">
            <GradIcon name={sujet.icone} tone={tone(i)} {pal} size={cols === 3 ? 5.4 : 6.2} />
            <span class="ig-card-title">{sujet.titre}</span>
          </header>
          <ul class="ig-bullets ig-bullets-{tone(i)}">
            {#each sujet.points as point, j (j)}<li>{point}</li>{/each}
          </ul>
        </article>
      {/each}
    </div>
  </section>
{/if}

{#if layout.decisions.length}
  <section class="ig-section">
    <div class="ig-ribbon">
      <p class="ig-ribbon-title">
        <GradIcon name="coche" tone="white" {pal} size={4.4} shape="round" />{L.decisions}
      </p>
      <ul class="ig-ribbon-list" class:ig-ribbon-two={layout.decisions.length > 2}>
        {#each layout.decisions as decision, i (i)}
          <li>
            <GradIcon name="check" tone="white" {pal} size={3.4} shape="round" /><span
              >{decision}</span
            >
          </li>
        {/each}
      </ul>
    </div>
  </section>
{/if}
