<script>
  /**
   * Santé de l'adoption : les comptes ouverts du périmètre, répartis en quatre
   * statuts — réguliers, occasionnels, en sommeil, jamais démarré (règles dans
   * services/api/lib/stats.js). LA question d'un responsable : « l'outil
   * est-il vraiment utilisé, et par qui ne l'est-il pas ? ».
   *
   * Une barre empilée pour la proportion, une légende chiffrée pour la valeur :
   * la couleur n'est jamais seule à porter un nombre. Chaque statut de la
   * légende est un bouton qui filtre le tableau par utilisateur (`select`) —
   * de « 7 comptes en sommeil » à leurs noms, en un clic.
   */
  import { createEventDispatcher } from 'svelte';
  import { fill } from '../../../utils/i18nFormat.js';
  import { formatCount, formatPercent } from './format.js';
  import { ADOPTION_COLORS, adoptionItems, regularShareOf } from './statsView.js';

  export let adoption = null;
  export let texts;
  export let lang = 'fr';

  const dispatch = createEventDispatcher();

  $: items = adoptionItems(adoption);
  $: total = items.reduce((sum, item) => sum + item.count, 0);
  $: lead = total ? fill(texts.adoptionLead, { share: regularShareOf(adoption, lang) }) : '';
  $: barLabel = items
    .map((item) => `${texts.adoptionStatuses[item.status]} : ${formatCount(item.count, lang)}`)
    .join(', ');
</script>

<section class="ad-card">
  <header class="ad-head">
    <h4>{texts.adoptionTitle}</h4>
    <p class="ad-hint">{texts.adoptionHint}</p>
  </header>

  {#if total === 0}
    <p class="ad-empty">{texts.adoptionEmpty}</p>
  {:else}
    <p class="ad-lead">{lead}</p>

    <div class="ad-bar" role="img" aria-label={barLabel}>
      {#each items as item (item.status)}
        {#if item.count}
          <span
            class="ad-seg"
            style="flex-grow: {item.count}; background: {ADOPTION_COLORS[item.status]}"
            title="{texts.adoptionStatuses[item.status]} : {formatCount(item.count, lang)}"
          ></span>
        {/if}
      {/each}
    </div>

    <ul class="ad-legend">
      {#each items as item (item.status)}
        <li>
          <button
            type="button"
            class="ad-item"
            disabled={!item.count}
            title={item.count ? texts.adoptionSee : null}
            on:click={() => dispatch('select', item.status)}
          >
            <span class="ad-name">
              <span class="ad-dot" style="background: {ADOPTION_COLORS[item.status]}"></span>
              {texts.adoptionStatuses[item.status]}
            </span>
            <span class="ad-figures">
              <span class="ad-count">{formatCount(item.count, lang)}</span>
              <span class="ad-share">{formatPercent(item.share, lang)}</span>
            </span>
            <span class="ad-def">{texts.adoptionDefinitions[item.status]}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .ad-card {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 1rem 1.1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    min-width: 0;
  }
  .ad-head h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .ad-hint {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .ad-empty {
    margin: 0;
    padding: 1.2rem 0;
    text-align: center;
    font-size: 0.84rem;
    color: var(--ink-faint);
  }
  .ad-lead {
    margin: 0;
    font-size: 0.92rem;
    color: var(--ink-soft);
    line-height: 1.45;
  }

  /* Un filet blanc entre deux segments : deux statuts voisins restent
     distincts même pour un œil qui confond leurs teintes. */
  .ad-bar {
    display: flex;
    gap: 2px;
    height: 14px;
    border-radius: 7px;
    overflow: hidden;
    background: var(--viz-track);
  }
  .ad-seg {
    flex-basis: 0;
    min-width: 6px;
  }

  .ad-legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .ad-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    width: 100%;
    height: 100%;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface);
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .ad-item:hover:not(:disabled) {
    border-color: var(--line-strong);
    background: var(--surface-tint);
  }
  .ad-item:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .ad-name {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .ad-dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .ad-figures {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }
  .ad-count {
    font-size: 1.35rem;
    font-weight: 650;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .ad-share {
    font-size: 0.78rem;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }
  .ad-def {
    font-size: 0.72rem;
    color: var(--ink-faint);
    line-height: 1.35;
  }

  @media (max-width: 720px) {
    .ad-legend {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
