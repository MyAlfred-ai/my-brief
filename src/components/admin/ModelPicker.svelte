<script>
  /**
   * Choix d'un modèle d'IA, le prix sous les yeux : une ligne par modèle, avec
   * son niveau de prix en « € » et ce qu'il coûte en euros. Il remplace un
   * <select>, qui ne sait montrer ni l'un ni l'autre, alors que c'est ce qui
   * départage deux modèles proches.
   *
   * De vrais boutons radio dans un <fieldset> : les flèches du clavier passent
   * d'un modèle à l'autre, et un lecteur d'écran annonce le NOM du modèle
   * (aria-labelledby), puis sa description et son prix (aria-describedby),
   * plutôt que tout le texte de la ligne d'un seul bloc.
   *
   * Composant de présentation : les montants arrivent formatés et les niveaux
   * calculés (utils/modelPrices.js). Il servira tel quel aux autres choix de
   * modèle de l'onglet IA le jour où ils montreront leur prix.
   */
  import { PRICE_LEVELS } from '../../utils/modelPrices.js';

  /** Nom du groupe de boutons radio, et préfixe des identifiants. */
  export let name;
  export let legend = '';
  /** Le modèle choisi (bind:value). */
  export let value = '';
  /** @type {Array<{id: string, description?: string, tier: number|null, price?: string}>} */
  export let options = [];
  /** Le modèle en service, marqué de `currentLabel`. */
  export let current = '';
  export let currentLabel = '';
  /** Ce qui suit le montant : « /h ». */
  export let unit = '';
  /** Le niveau, dit à un lecteur d'écran : « Niveau de prix : {tier} sur {levels} ». */
  export let levelLabel = '';
  /** Pour un modèle sans tarif connu ; vide, rien ne s'affiche. */
  export let unknownLabel = '';

  const GLYPHS = Array.from({ length: PRICE_LEVELS }, (_, index) => index + 1);

  /** Ce que décrit la ligne, au-delà du nom : les éléments présents seulement. */
  function describedBy(option, id) {
    return [
      option.id === current && currentLabel && `${id}-current`,
      option.description && `${id}-desc`,
      `${id}-price`,
    ]
      .filter(Boolean)
      .join(' ');
  }
</script>

<fieldset class="mp">
  <legend class="mp-legend">{legend}</legend>
  <div class="mp-list">
    {#each options as option, index (option.id)}
      {@const id = `${name}-${index}`}
      <label class="mp-option" class:mp-selected={option.id === value}>
        <input
          type="radio"
          {name}
          value={option.id}
          bind:group={value}
          aria-labelledby="{id}-name"
          aria-describedby={describedBy(option, id)}
        />
        <span class="mp-text">
          <span class="mp-head">
            <span class="mp-name" id="{id}-name">{option.id}</span>
            {#if option.id === current && currentLabel}
              <span class="mp-current" id="{id}-current">{currentLabel}</span>
            {/if}
          </span>
          {#if option.description}
            <span class="mp-desc" id="{id}-desc">{option.description}</span>
          {/if}
        </span>
        <span class="mp-price" id="{id}-price">
          {#if option.tier}
            <span
              class="mp-tier"
              class:mp-low={option.tier === 1}
              class:mp-high={option.tier === PRICE_LEVELS - 1}
              class:mp-top={option.tier === PRICE_LEVELS}
              aria-hidden="true"
            >
              {#each GLYPHS as glyph (glyph)}<span class:mp-on={glyph <= option.tier}>€</span
                >{/each}
            </span>
            <span class="mp-hidden"
              >{levelLabel.replace('{tier}', option.tier).replace('{levels}', PRICE_LEVELS)}</span
            >
            {#if option.price}
              <span class="mp-amount">{option.price}<span class="mp-unit">{unit}</span></span>
            {/if}
          {:else if unknownLabel}
            <span class="mp-unknown">{unknownLabel}</span>
          {/if}
        </span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .mp {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  /* Une légende flottante se comporte en bloc ordinaire : sans ce flottement,
     le navigateur la pose SUR la bordure du fieldset et ignore sa marge. */
  .mp-legend {
    float: left;
    width: 100%;
    margin: 0 0 0.4rem;
    padding: 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .mp-list {
    clear: both;
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
  }

  .mp-option {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.35rem 0.75rem;
    padding: 0.7rem 0.9rem;
    cursor: pointer;
    transition:
      background 0.15s,
      box-shadow 0.15s;
  }
  .mp-option + .mp-option {
    border-top: 1px solid var(--line);
  }
  .mp-option:hover {
    background: var(--surface-tint);
  }
  .mp-selected,
  .mp-selected:hover {
    background: color-mix(in srgb, var(--brand) 6%, var(--surface));
    box-shadow: inset 3px 0 0 var(--brand);
  }
  .mp-option:has(input:focus-visible) {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .mp-option input {
    width: 1.05rem;
    height: 1.05rem;
    margin: 0;
    accent-color: var(--brand);
    cursor: pointer;
  }

  .mp-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .mp-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .mp-name {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .mp-current {
    padding: 0.05rem 0.5rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ink-soft);
    background: var(--surface);
  }
  .mp-desc {
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--ink-faint);
  }

  .mp-price {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1rem;
    white-space: nowrap;
  }
  /* L'échelle entière reste visible, ses « € » éteints en gris : « €€·· » se
     lit comme un niveau sur quatre, sans légende. La couleur ne fait que
     redoubler le nombre de « € » (vert le plus économique, rouge le plus
     cher). */
  .mp-tier {
    --mp-tier: var(--ink-soft);
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--line-strong);
  }
  .mp-low {
    --mp-tier: var(--success-text);
  }
  .mp-high {
    --mp-tier: var(--warn-text);
  }
  .mp-top {
    --mp-tier: var(--danger-text);
  }
  .mp-on {
    color: var(--mp-tier);
  }
  .mp-amount {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .mp-unit {
    margin-left: 0.1rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--ink-faint);
  }
  .mp-unknown {
    font-size: 0.78rem;
    font-style: italic;
    color: var(--ink-faint);
  }
  .mp-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* Cadre étroit (téléphone) : le prix passe sous la description, sur une
     ligne, plutôt que de rogner le nom du modèle. */
  @container (max-width: 400px) {
    .mp-option {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .mp-price {
      grid-column: 2;
      flex-direction: row;
      align-items: baseline;
      gap: 0.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mp-option {
      transition: none;
    }
  }
</style>
