<script>
  /**
   * Choix d'un modèle d'IA, le prix sous les yeux : UNE LIGNE par modèle — son
   * nom, son fournisseur, son niveau de prix en « € » et ce qu'il coûte. Il
   * remplace un <select>, qui ne sait montrer ni le prix ni le niveau, alors
   * que c'est ce qui départage deux modèles proches.
   *
   * Compact par construction : la description ne s'affiche pas dans la ligne
   * (l'écran montre celle du modèle choisi sous la liste) ; elle reste lue par
   * les lecteurs d'écran et au survol. Le fournisseur est une étiquette de
   * texte, pas un logo : le logo complet de Speechmatics ne tient pas dans une
   * ligne et ne se recadre pas (cf. icons/SpeechmaticsLogo.svelte).
   *
   * De vrais boutons radio dans un <fieldset> : les flèches du clavier passent
   * d'un modèle à l'autre, et un lecteur d'écran annonce le NOM du modèle
   * (aria-labelledby), puis le reste (aria-describedby). Un modèle `locked`
   * (la clé de son fournisseur manque) reste visible, prix compris, mais son
   * bouton est inactif ; le modèle en service ne l'est jamais — l'écran doit
   * pouvoir le montrer coché.
   *
   * Composant de présentation : les montants arrivent formatés et les niveaux
   * calculés (utils/modelPrices.js).
   */
  import IconLock from '~icons/solar/lock-keyhole-minimalistic-linear';
  import { PRICE_LEVELS } from '../../utils/modelPrices.js';

  /** Nom du groupe de boutons radio, et préfixe des identifiants. */
  export let name;
  export let legend = '';
  /** Masque la légende à l'écran (l'en-tête du panneau la dit déjà). */
  export let hideLegend = false;
  /** Le modèle choisi (bind:value). */
  export let value = '';
  /**
   * `name` : nom lisible (l'identifiant passe dans l'infobulle) ;
   * `provider` : étiquette du fournisseur, vide pour la taire (liste filtrée).
   * @type {Array<{id: string, name?: string, provider?: string, description?: string,
   *   tier: number|null, price?: string, locked?: boolean}>}
   */
  export let options = [];
  /** Le modèle en service, marqué de `currentLabel`. */
  export let current = '';
  export let currentLabel = '';
  /** Dit d'un modèle verrouillé, aux lecteurs d'écran. */
  export let lockedLabel = '';
  /** Ce qui suit le montant : « /h ». */
  export let unit = '';
  /** Le niveau, dit à un lecteur d'écran : « Niveau de prix : {tier} sur {levels} ». */
  export let levelLabel = '';
  /** Pour un modèle sans tarif connu ; vide, rien ne s'affiche. */
  export let unknownLabel = '';
  /**
   * Ce que chiffre la colonne des prix, au-dessus d'elle (« Coût estimé ·
   * réunion d'une heure ») — quand le montant est une estimation, la liste le
   * dit sans qu'il faille ouvrir l'infobulle. Vide, rien ne s'affiche.
   */
  export let caption = '';

  const GLYPHS = Array.from({ length: PRICE_LEVELS }, (_, index) => index + 1);

  const isLocked = (option) => !!option.locked && option.id !== current;

  /** Ce que décrit la ligne, au-delà du nom : les éléments présents seulement. */
  function describedBy(option, id) {
    return [
      option.provider && `${id}-provider`,
      option.id === current && currentLabel && `${id}-current`,
      isLocked(option) && lockedLabel && `${id}-locked`,
      option.description && `${id}-desc`,
      `${id}-price`,
    ]
      .filter(Boolean)
      .join(' ');
  }
</script>

<fieldset class="mp">
  <legend class="mp-legend" class:mp-hidden={hideLegend}>{legend}</legend>
  {#if caption}<p class="mp-caption">{caption}</p>{/if}
  <div class="mp-list">
    {#each options as option, index (option.id)}
      {@const id = `${name}-${index}`}
      {@const locked = isLocked(option)}
      <label
        class="mp-option"
        class:mp-selected={option.id === value}
        class:mp-locked={locked}
        title={[option.name ? option.id : '', option.description].filter(Boolean).join(' — ')}
      >
        <input
          type="radio"
          {name}
          value={option.id}
          bind:group={value}
          disabled={locked}
          aria-labelledby="{id}-name"
          aria-describedby={describedBy(option, id)}
        />
        <span class="mp-head">
          <span class="mp-name" id="{id}-name">{option.name || option.id}</span>
          {#if option.provider}
            <span class="mp-provider" id="{id}-provider">{option.provider}</span>
          {/if}
          {#if option.id === current && currentLabel}
            <span class="mp-current" id="{id}-current">{currentLabel}</span>
          {/if}
          {#if locked}
            <IconLock class="mp-lock" width="14" height="14" aria-hidden="true" />
            {#if lockedLabel}<span class="mp-hidden" id="{id}-locked">{lockedLabel}</span>{/if}
          {/if}
          {#if option.description}
            <span class="mp-hidden" id="{id}-desc">{option.description}</span>
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
  .mp-caption {
    clear: both;
    margin: 0 0 0.3rem;
    padding: 0 0.85rem;
    font-size: 0.72rem;
    color: var(--ink-faint);
    text-align: right;
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

  /* Une ligne : bouton, nom et étiquettes, prix — ~40 px. */
  .mp-option {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.6rem;
    min-height: 40px;
    padding: 0.4rem 0.85rem;
    box-sizing: border-box;
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
    width: 1rem;
    height: 1rem;
    margin: 0;
    accent-color: var(--brand);
    cursor: pointer;
  }

  .mp-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.45rem;
    min-width: 0;
  }
  .mp-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .mp-provider {
    font-size: 0.75rem;
    color: var(--ink-faint);
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

  /* Verrouillé : la ligne reste lisible (on veut voir ce qu'on gagnerait),
     mais se retire — encre pâle, cadenas. */
  .mp-locked {
    cursor: not-allowed;
  }
  .mp-locked:hover {
    background: transparent;
  }
  .mp-locked .mp-name,
  .mp-locked .mp-amount {
    color: var(--ink-muted);
  }
  .mp-locked input {
    cursor: not-allowed;
  }
  .mp-head :global(.mp-lock) {
    color: var(--ink-faint);
  }

  .mp-price {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    white-space: nowrap;
  }
  /* L'échelle entière reste visible, ses « € » éteints en gris : « €€·· » se
     lit comme un niveau sur quatre, sans légende. La couleur ne fait que
     redoubler le nombre de « € » (vert le plus économique, rouge le plus
     cher). */
  .mp-tier {
    --mp-tier: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
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
    min-width: 4.2rem;
    text-align: right;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .mp-unit {
    margin-left: 0.1rem;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--ink-faint);
  }
  .mp-unknown {
    font-size: 0.78rem;
    font-style: italic;
    color: var(--ink-faint);
  }
  /* Liste étroite (téléphone) : l'échelle en « € » cède sa place au nom, qui
     tient alors sur une ligne ; le montant reste, et le niveau est toujours
     dit aux lecteurs d'écran. */
  @container (max-width: 420px) {
    .mp-tier {
      display: none;
    }
    .mp-option {
      padding: 0.4rem 0.7rem;
    }
    .mp-amount {
      min-width: 0;
    }
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
</style>
