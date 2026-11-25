<script>
  // Gabarit « Atelier » — brainstorming, recherche de solutions : la question
  // travaillée, les idées en blocs-notes par thème (une jauge de votes par
  // idée), un vrai podium des idées retenues, les suites décidées.
  import Hero from './Hero.svelte';
  import Icon from './Icon.svelte';
  import GradIcon from './GradIcon.svelte';
  import SectionTitle from './SectionTitle.svelte';
  import CheckList from './CheckList.svelte';
  import { fill } from '../../utils/i18nFormat.js';
  import { formatNumber, plural, topIdeas } from '../../lib/infographic/format.js';

  export let layout;
  export let pal;
  export let L;
  export let lang = 'fr';

  /** Hauteur des marches du podium, en unités de page (`--u`), par rang. */
  const STEP = { 1: 12.5, 2: 9, 3: 6.5 };

  $: themes = layout.idees;
  $: ideaCount = themes.reduce((n, t) => n + t.idees.length, 0);
  $: maxVotes = Math.max(0, ...themes.flatMap((t) => t.idees.map((i) => i.votes ?? 0))) || 1;
  $: top = topIdeas(themes, 3).map((idee, i) => ({ ...idee, rank: i + 1 }));
  // Le premier au centre, le deuxième à gauche, le troisième à droite.
  $: podium =
    top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  $: retainedCount = themes.reduce((n, t) => n + t.idees.filter((i) => i.retenue).length, 0);
  $: stats = [
    { valeur: formatNumber(ideaCount, lang), libelle: plural(ideaCount, L.ideaOne, L.ideaMany) },
    {
      valeur: formatNumber(themes.length, lang),
      libelle: plural(themes.length, L.themeOne, L.themeMany),
    },
    ...(retainedCount
      ? [
          {
            valeur: formatNumber(retainedCount, lang),
            libelle: plural(retainedCount, L.retainedOne, L.retainedMany),
          },
        ]
      : []),
  ];
  $: cols = themes.length <= 1 ? 1 : themes.length === 3 ? 3 : 2;
  const votesLabel = (n) => fill(plural(n, L.voteOne, L.voteMany), { count: n });
  const tone = (i) => (i % 2 === 0 ? 'p' : 's');
</script>

<Hero heros={layout.heros} {pal} eyebrow={L.question} icon="ampoule" {stats} />

{#if themes.length}
  <section class="ig-section">
    <SectionTitle title={L.ideas} icon="ampoule" {pal} />
    <div class="ig-grid ig-cols-{cols}" class:ig-last-wide={cols === 2 && themes.length % 2 === 1}>
      {#each themes as theme, i (i)}
        <article class="ig-note ig-note-{tone(i)}">
          <header class="ig-note-head">
            <GradIcon name={theme.icone} tone="white" {pal} size={5} />
            <span class="ig-note-title">{theme.theme}</span>
            <span class="ig-note-count">{theme.idees.length}</span>
          </header>
          <ul class="ig-note-list">
            {#each theme.idees as idee, j (j)}
              <li class:ig-idea-retained={idee.retenue}>
                {#if idee.retenue}
                  <Icon name="etoile" color={pal.sInk} size={2.2} strokeWidth={2} />
                {:else}
                  <span class="ig-idea-dot"></span>
                {/if}
                <span class="ig-idea-text">{idee.texte}</span>
                {#if idee.votes}
                  <span class="ig-votes">
                    <span class="ig-votes-track"
                      ><i style="width:{(idee.votes / maxVotes) * 100}%"></i></span
                    >
                    <b>{idee.votes}</b>
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>
  </section>
{/if}

{#if top.length}
  <section class="ig-section">
    <SectionTitle title={L.retainedIdeas} icon="etoile" tone="s" {pal} />
    <div class="ig-podium">
      {#each podium as idee (idee.rank)}
        <div class="ig-pod ig-pod-{idee.rank}">
          <span class="ig-pod-text">{idee.texte}</span>
          <span class="ig-pod-block" style="height:calc({STEP[idee.rank]} * var(--u))">
            <span class="ig-pod-rank">{idee.rank}</span>
            {#if idee.votes}<span class="ig-pod-votes">{votesLabel(idee.votes)}</span>{/if}
          </span>
        </div>
      {/each}
    </div>
  </section>
{/if}

{#if layout.decisions.length}
  <section class="ig-section">
    <CheckList title={L.nextSteps} items={layout.decisions} icon="fusee" {pal} />
  </section>
{/if}
