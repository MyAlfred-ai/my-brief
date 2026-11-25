<script>
  // Gabarit « Bilan » — rétrospective, retour d'expérience : le verdict en
  // grand, puis trois piliers à en-tête en dégradé — ce qui a marché (vert),
  // ce qui a coincé (ambre), ce qu'on essaiera (marque). Une colonne vide
  // disparaît, les autres s'élargissent.
  import Hero from './Hero.svelte';
  import Icon from './Icon.svelte';
  import { formatQuantity } from '../../lib/infographic/format.js';

  export let layout;
  export let pal;
  export let L;
  export let lang = 'fr';

  $: stats = layout.chiffres.slice(0, 2).map((c) => ({
    valeur: formatQuantity(c.valeur, c.unite, lang),
    libelle: c.libelle,
  }));
  $: columns = [
    { key: 'ok', title: L.worked, icon: 'pouce', color: pal.paper, items: layout.bilan.reussites },
    {
      key: 'warn',
      title: L.struggled,
      icon: 'outil',
      color: pal.paper,
      items: layout.bilan.difficultes,
    },
    { key: 'p', title: L.tryNext, icon: 'fiole', color: pal.onHero, items: layout.bilan.essais },
  ].filter((col) => col.items.length);
</script>

<Hero heros={layout.heros} {pal} eyebrow={L.verdict} icon="boucle" {stats} />

{#if columns.length}
  <section class="ig-section">
    <div class="ig-grid ig-cols-{columns.length} ig-pillars">
      {#each columns as col (col.key)}
        <article class="ig-pillar ig-pillar-{col.key}">
          <header class="ig-pillar-head">
            <span class="ig-pillar-disc">
              <Icon name={col.icon} color={col.color} size={3.9} strokeWidth={1.9} />
            </span>
            <span class="ig-pillar-title">{col.title}</span>
            <span class="ig-pillar-count">{col.items.length}</span>
          </header>
          <ul class="ig-bullets ig-bullets-{col.key}">
            {#each col.items as item, i (i)}<li>{item}</li>{/each}
          </ul>
        </article>
      {/each}
    </div>
  </section>
{/if}
