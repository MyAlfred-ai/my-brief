<script>
  /**
   * Formulaire d'un tag — nom, couleur, forme — rendu dans la FICHE de « Mes
   * tags » : à la création (« Nouveau tag ») et quand on clique « Nom et
   * apparence » sur la fiche d'un tag.
   *
   * Le parent garde la main : `draft` est lié (bind), il décide de l'envoi, de
   * l'annulation et du message d'erreur. Ici on ne fait que saisir.
   *
   * ── Ce que l'œil lit d'abord ─────────────────────────────────────────────
   * À gauche les trois réglages, dans l'ordre : le nom, la couleur, la forme.
   * À droite l'APERÇU — la pastille en grand, puis telle qu'elle paraîtra dans
   * l'historique et en tête de conversation : c'est lui qui rend le résultat
   * prévisible avant d'enregistrer, d'autant qu'un tag se crée en une fois.
   *
   * La couleur montre d'abord les quatorze teintes UNIES (deux rangées de
   * sept). Les sept motifs et la couleur libre vivent sous « Plus de choix » :
   * vingt et une pastilles et deux curseurs d'un coup faisaient du choix d'une
   * couleur un exercice. Le repli s'ouvre tout seul quand le tag porte déjà un
   * motif ou une couleur libre — on ne cache pas ce qui est choisi. Un motif
   * se reconnaît à son slug COMPOSÉ (`blue-stripes`), la règle des jetons de
   * tokens.css : une teinte unie n'a pas de tiret.
   *
   * ── La couleur libre ─────────────────────────────────────────────────────
   * La pastille arc-en-ciel et ses deux curseurs — l'angle de teinte sur
   * l'arc-en-ciel, puis la clarté, du sombre au clair de la teinte réglée.
   * Chaque piste montre ce que l'autre curseur a fixé ; le pouce porte la
   * couleur obtenue. En bouger un choisit la couleur libre, sans passer par la
   * pastille ; repasser sur une teinte les laisse en place, estompés, prêts à
   * être repris. Un `<input type="color">` a été écarté : fenêtre système
   * différente sur chaque appareil, et un blanc ou un gris pâle y sont
   * possibles — ici le chroma est celui du jeton et la clarté est bornée par
   * le serveur.
   *
   * Les formes sont peintes dans la couleur en cours : on voit sa pastille,
   * pas une forme abstraite.
   */
  import { tagColorVars, tagShapeClip, tagHue } from '../stores/tags.js';
  import TagChip from './TagChip.svelte';
  import IconClose from '~icons/solar/close-circle-linear';
  import IconChevron from '~icons/solar/alt-arrow-right-linear';

  /** @type {{id?: string, label: string, color: string, shape: string}} */
  export let draft;
  /** Slugs de couleur proposés — ceux que l'API a renvoyés. */
  export let palette = [];
  /** Slugs de forme proposés — ceux que l'API a renvoyés. */
  export let shapes = [];
  /** Bornes et défaut de la clarté d'une couleur libre — ceux que l'API a renvoyés. */
  export let lightnessRange = { min: 35, max: 68, default: 60 };
  export let busy = false;
  /** Message d'erreur déjà traduit, ou chaîne vide. */
  export let error = '';
  /** Libellés `uiText.tagsPanel`. */
  export let texts;
  export let onSubmit = () => {};
  export let onCancel = () => {};

  /** Angle de départ du curseur : un bleu-vert qui n'est dans aucune pastille de la palette. */
  const HUE_DEFAULT = 195;

  /** Un motif porte un slug composé (`blue-stripes`) — cf. tokens.css. */
  const isPattern = (slug) => slug.includes('-');

  $: creating = !draft.id;
  $: solids = palette.filter((c) => !isPattern(c));
  $: patterns = palette.filter(isPattern);

  /**
   * Angle et clarté des curseurs. Gardés quand on repasse sur la palette :
   * revenir à la couleur libre retrouve les réglages qu'on avait, pas les
   * valeurs de départ.
   */
  let hue = tagHue(draft.color)?.hue ?? HUE_DEFAULT;
  let light = tagHue(draft.color)?.lightness ?? lightnessRange.default;
  $: parsed = tagHue(draft.color);
  $: custom = parsed !== null;
  // Un brouillon reçu avec une couleur libre (édition) recale les curseurs ;
  // un slug sans clarté (`hue-<angle>`) pose le curseur sur la valeur par
  // défaut, qui EST sa clarté.
  $: if (parsed) {
    hue = parsed.hue;
    light = parsed.lightness ?? lightnessRange.default;
  }

  /** Repli « Plus de choix » : ouvert d'emblée si le tag porte déjà un motif ou une couleur libre. */
  let more = custom || isPattern(draft.color || '');

  const slug = () => `hue-${hue}-${light}`;

  function pickHue(event) {
    hue = Number(event.currentTarget.value);
    draft = { ...draft, color: slug() };
  }

  function pickLightness(event) {
    light = Number(event.currentTarget.value);
    draft = { ...draft, color: slug() };
  }

  function pickCustom() {
    draft = { ...draft, color: slug() };
  }

  /** Ce que peint la pastille de la couleur en cours — les formes s'y peignent. */
  $: vars = tagColorVars(draft.color);
  $: clip = tagShapeClip(draft.shape);
  /** Couleur des pouces : angle et clarté réglés, même quand la palette est choisie. */
  $: hueTint = tagColorVars(`hue-${hue}-${light}`).dot;
  /** Nom de la couleur en cours, à côté de l'intitulé. */
  $: colorName = custom ? texts.hueField : texts.colorNames?.[draft.color] || '';
  $: shapeName = texts.shapeNames?.[draft.shape] || '';
  /** La puce telle qu'elle paraîtra ; sans nom encore, l'exemple du champ. */
  $: preview = {
    id: 'preview',
    label: draft.label.trim() || texts.labelPlaceholder,
    color: draft.color,
    shape: draft.shape,
  };

  /** Le curseur arrive dans le nom dès que la fiche s'ouvre — on vient pour écrire. */
  function focusOnMount(node) {
    node.focus();
  }
</script>

<form
  class="tgf"
  on:submit|preventDefault={onSubmit}
  aria-label={creating ? texts.add : texts.appearance}
>
  <div class="tgf-head">
    <div class="tgf-head-text">
      <h3 class="tgf-title">{creating ? texts.add : texts.appearance}</h3>
      {#if creating}<p class="tgf-hint">{texts.newHint}</p>{/if}
    </div>
    <button type="button" class="tgf-close" on:click={onCancel} aria-label={texts.close}>
      <IconClose width="20" height="20" />
    </button>
  </div>

  <div class="tgf-body">
    <div class="tgf-fields">
      <label class="tgf-field">
        <span class="tgf-label">{texts.labelField}</span>
        <input
          class="tgf-input"
          bind:value={draft.label}
          placeholder={texts.labelPlaceholder}
          maxlength="32"
          autocomplete="off"
          use:focusOnMount
        />
      </label>

      <div class="tgf-field">
        <div class="tgf-label-row">
          <span class="tgf-label" id="tgf-color-label">{texts.colorField}</span>
          <span class="tgf-current">{colorName}</span>
        </div>
        <div class="tgf-swatches" role="radiogroup" aria-labelledby="tgf-color-label">
          {#each solids as color (color)}
            <button
              type="button"
              class="tgf-swatch"
              class:tgf-swatch-on={draft.color === color}
              style="--sw: {tagColorVars(color).fill}"
              role="radio"
              aria-checked={draft.color === color}
              aria-label={texts.colorNames?.[color] || color}
              on:click={() => (draft = { ...draft, color })}
            ></button>
          {/each}
        </div>

        <button
          type="button"
          class="tgf-more"
          class:tgf-more-open={more}
          aria-expanded={more}
          aria-controls="tgf-more-panel"
          on:click={() => (more = !more)}
        >
          <IconChevron width="15" height="15" aria-hidden="true" />
          {texts.moreColors}
        </button>

        {#if more}
          <div class="tgf-more-panel" id="tgf-more-panel">
            {#if patterns.length}
              <div class="tgf-swatches" role="radiogroup" aria-label={texts.moreColors}>
                {#each patterns as color (color)}
                  <button
                    type="button"
                    class="tgf-swatch"
                    class:tgf-swatch-on={draft.color === color}
                    style="--sw: {tagColorVars(color).fill}"
                    role="radio"
                    aria-checked={draft.color === color}
                    aria-label={texts.colorNames?.[color] || color}
                    on:click={() => (draft = { ...draft, color })}
                  ></button>
                {/each}
              </div>
            {/if}
            <!-- Couleur libre : la pastille arc-en-ciel est un choix de couleur
                 comme les autres ; les curseurs règlent son angle et sa clarté. -->
            <div
              class="tgf-hue-row"
              class:tgf-hue-row-on={custom}
              style="--hue-tint: {hueTint}; --hue-h: {hue}; --hue-l: {light}%; --hue-lmin: {lightnessRange.min}%; --hue-lmax: {lightnessRange.max}%"
            >
              <button
                type="button"
                class="tgf-swatch tgf-swatch-hue"
                class:tgf-swatch-on={custom}
                role="radio"
                aria-checked={custom}
                aria-label={texts.hueField}
                title={texts.hueField}
                on:click={pickCustom}
              ></button>
              <div class="tgf-sliders">
                <input
                  type="range"
                  class="tgf-hue tgf-hue-angle"
                  min="0"
                  max="359"
                  step="1"
                  value={hue}
                  aria-label={texts.hueSlider}
                  aria-valuetext="{hue}°"
                  on:input={pickHue}
                />
                <input
                  type="range"
                  class="tgf-hue tgf-hue-light"
                  min={lightnessRange.min}
                  max={lightnessRange.max}
                  step="1"
                  value={light}
                  aria-label={texts.lightnessSlider}
                  aria-valuetext="{light} %"
                  on:input={pickLightness}
                />
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="tgf-field">
        <div class="tgf-label-row">
          <span class="tgf-label" id="tgf-shape-label">{texts.shapeField}</span>
          <span class="tgf-current">{shapeName}</span>
        </div>
        <div class="tgf-shapes" role="radiogroup" aria-labelledby="tgf-shape-label">
          {#each shapes as shape (shape)}
            <button
              type="button"
              class="tgf-shape-btn"
              class:tgf-shape-on={draft.shape === shape}
              role="radio"
              aria-checked={draft.shape === shape}
              aria-label={texts.shapeNames?.[shape] || shape}
              on:click={() => (draft = { ...draft, shape })}
            >
              <span class="tgf-shape" style="--sw: {vars.fill}; --sh: {tagShapeClip(shape)}"></span>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Aperçu : décoratif pour les lecteurs d'écran — nom, couleur et forme
         sont déjà annoncés par les champs. -->
    <aside class="tgf-preview" aria-hidden="true">
      <span class="tgf-preview-label">{texts.preview}</span>
      <div
        class="tgf-preview-hero"
        style="--pv-soft: {vars.soft}; --pv-fill: {vars.fill}; --pv-clip: {clip}"
      >
        <span class="tgf-preview-badge"><span class="tgf-preview-shape"></span></span>
        <span class="tgf-preview-name">{preview.label}</span>
      </div>
      <div class="tgf-preview-block">
        <span class="tgf-preview-caption">{texts.previewHistory}</span>
        <div class="tgf-preview-row">
          <TagChip tag={preview} compact />
          <span class="tgf-preview-meeting">{texts.previewMeeting}</span>
        </div>
      </div>
      <div class="tgf-preview-block">
        <span class="tgf-preview-caption">{texts.previewHeader}</span>
        <span class="tgf-preview-chip"><TagChip tag={preview} /></span>
      </div>
    </aside>
  </div>

  {#if error}
    <div class="tgf-error" role="alert">{error}</div>
  {/if}

  <div class="tgf-actions">
    <span class="tgf-actions-hint">{texts.editableHint}</span>
    <button type="button" class="tgf-btn" on:click={onCancel}>{texts.cancel}</button>
    <button type="submit" class="tgf-btn tgf-btn-primary" disabled={busy || !draft.label.trim()}>
      {creating ? texts.create : texts.save}
    </button>
  </div>
</form>

<style>
  .tgf {
    display: flex;
    flex-direction: column;
  }
  .tgf-head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 24px 28px 20px;
    border-bottom: 1px solid var(--line);
  }
  .tgf-head-text {
    flex: 1;
    min-width: 0;
  }
  .tgf-title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--ink);
  }
  .tgf-hint {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
  .tgf-close {
    display: inline-flex;
    padding: 8px;
    border: 1px solid var(--line-strong);
    border-radius: 11px;
    background: var(--surface);
    color: var(--ink-muted);
    cursor: pointer;
    flex-shrink: 0;
  }
  .tgf-close:hover {
    color: var(--ink);
    background: var(--surface-tint);
  }

  .tgf-body {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    padding: 24px 28px;
  }
  .tgf-fields {
    flex: 999 1 300px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .tgf-field {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tgf-label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .tgf-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .tgf-current {
    font-size: 12.5px;
    color: var(--ink-muted);
  }
  .tgf-input {
    height: 46px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--surface);
    font-family: inherit;
    font-size: 15px;
    color: var(--ink);
    width: 100%;
    box-sizing: border-box;
  }
  .tgf-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 4px rgb(var(--brand-rgb) / 0.12);
  }

  /* Sept pastilles par ligne au plus : les quatorze teintes tombent en 7 + 7,
     les sept motifs en une rangée. Un plafond plutôt qu'une grille de sept
     colonnes fixes : sur un écran trop étroit, flex-wrap replie au lieu de
     faire déborder la dernière colonne hors de la fiche. */
  .tgf-swatches,
  .tgf-hue-row,
  .tgf-shapes {
    max-width: calc(7 * 30px + 6 * 9px);
  }
  .tgf-swatches,
  .tgf-shapes {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }
  .tgf-swatch {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--sw);
    border: 2px solid transparent;
    box-shadow: 0 0 0 1px var(--line-strong);
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s;
  }
  .tgf-swatch:hover {
    transform: scale(1.08);
  }
  .tgf-swatch-on {
    border-color: var(--surface);
    box-shadow: 0 0 0 2px var(--ink);
  }
  .tgf-swatch:focus-visible,
  .tgf-shape-btn:focus-visible,
  .tgf-more:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .tgf-more {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 6px 10px 6px 4px;
    border: none;
    border-radius: 9px;
    background: none;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tgf-more:hover {
    background: var(--surface-tint);
  }
  .tgf-more :global(svg) {
    transition: transform 0.15s;
  }
  .tgf-more-open :global(svg) {
    transform: rotate(90deg);
  }
  .tgf-more-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface-tint);
    align-self: flex-start;
  }

  /* ── Couleur libre ── deux pistes, chacune peinte avec ce que l'autre
     curseur a fixé : l'arc-en-ciel aux douze angles, à la clarté en cours ;
     la rampe de clarté dans la teinte en cours, du plancher au plafond
     servis par l'API (`--hue-lmin` / `--hue-lmax`). Chroma du jeton : ce que
     montrent les pistes est exactement ce que la pastille peindra. */
  .tgf-hue-row {
    --hue-wheel:
      oklch(var(--tag-hue-l) var(--tag-hue-c) 0), oklch(var(--tag-hue-l) var(--tag-hue-c) 60),
      oklch(var(--tag-hue-l) var(--tag-hue-c) 120), oklch(var(--tag-hue-l) var(--tag-hue-c) 180),
      oklch(var(--tag-hue-l) var(--tag-hue-c) 240), oklch(var(--tag-hue-l) var(--tag-hue-c) 300),
      oklch(var(--tag-hue-l) var(--tag-hue-c) 360);
    --hue-stops:
      oklch(var(--hue-l) var(--tag-hue-c) 0), oklch(var(--hue-l) var(--tag-hue-c) 30),
      oklch(var(--hue-l) var(--tag-hue-c) 60), oklch(var(--hue-l) var(--tag-hue-c) 90),
      oklch(var(--hue-l) var(--tag-hue-c) 120), oklch(var(--hue-l) var(--tag-hue-c) 150),
      oklch(var(--hue-l) var(--tag-hue-c) 180), oklch(var(--hue-l) var(--tag-hue-c) 210),
      oklch(var(--hue-l) var(--tag-hue-c) 240), oklch(var(--hue-l) var(--tag-hue-c) 270),
      oklch(var(--hue-l) var(--tag-hue-c) 300), oklch(var(--hue-l) var(--tag-hue-c) 330),
      oklch(var(--hue-l) var(--tag-hue-c) 360);
    --light-span: calc(var(--hue-lmax) - var(--hue-lmin));
    --light-stops:
      oklch(var(--hue-lmin) var(--tag-hue-c) var(--hue-h)),
      oklch(calc(var(--hue-lmin) + var(--light-span) * 0.25) var(--tag-hue-c) var(--hue-h)),
      oklch(calc(var(--hue-lmin) + var(--light-span) * 0.5) var(--tag-hue-c) var(--hue-h)),
      oklch(calc(var(--hue-lmin) + var(--light-span) * 0.75) var(--tag-hue-c) var(--hue-h)),
      oklch(var(--hue-lmax) var(--tag-hue-c) var(--hue-h));
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .tgf-swatch-hue {
    flex-shrink: 0;
    background: conic-gradient(from 0deg, var(--hue-wheel));
  }
  .tgf-sliders {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* Les curseurs : piste arc-en-ciel puis rampe de clarté, pouce de la
     couleur réglée. Estompés tant qu'une pastille de la palette est choisie
     — ils restent actifs, en bouger un choisit la couleur libre. Blocs
     vendeur (WebKit/Blink et Gecko) : les curseurs natifs ne se stylent pas
     autrement. */
  .tgf-hue {
    --track: var(--hue-stops);
    width: 100%;
    height: 22px;
    margin: 0;
    padding: 0;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
    opacity: 0.55;
    transition: opacity 0.15s;
  }
  .tgf-hue-light {
    --track: var(--light-stops);
  }
  .tgf-hue-row-on .tgf-hue,
  .tgf-hue:hover,
  .tgf-hue:focus-visible {
    opacity: 1;
  }
  .tgf-hue:focus-visible {
    outline: none;
  }
  .tgf-hue::-webkit-slider-runnable-track {
    height: 8px;
    border-radius: 999px;
    background: linear-gradient(to right, var(--track));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
  }
  .tgf-hue::-moz-range-track {
    height: 8px;
    border-radius: 999px;
    background: linear-gradient(to right, var(--track));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
  }
  .tgf-hue::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    margin-top: -6px;
    border-radius: 50%;
    background: var(--hue-tint);
    border: 2px solid var(--surface);
    box-shadow:
      0 0 0 1px var(--line-strong),
      0 1px 3px rgb(0 0 0 / 0.25);
    cursor: grab;
  }
  .tgf-hue::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--hue-tint);
    border: 2px solid var(--surface);
    box-shadow:
      0 0 0 1px var(--line-strong),
      0 1px 3px rgb(0 0 0 / 0.25);
    cursor: grab;
  }
  .tgf-hue:focus-visible::-webkit-slider-thumb {
    box-shadow:
      0 0 0 2px var(--ink),
      0 1px 3px rgb(0 0 0 / 0.25);
  }
  .tgf-hue:focus-visible::-moz-range-thumb {
    box-shadow:
      0 0 0 2px var(--ink),
      0 1px 3px rgb(0 0 0 / 0.25);
  }

  /* ── Formes ── la forme peinte dans la couleur en cours, au centre d'un
     bouton carré arrondi : la sélection se lit comme celle d'une pastille. */
  /* Sept colonnes toujours : la septième forme ne passe jamais seule à la
     ligne. Les boutons rétrécissent avec la fiche, jusqu'au plancher tactile
     de style.css (36 px). */
  .tgf-shapes {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 40px));
    gap: 8px;
    max-width: none;
  }
  .tgf-shape-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 38px;
    border-radius: 12px;
    background: var(--surface);
    border: 2px solid transparent;
    box-shadow: 0 0 0 1px var(--line-strong);
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s;
  }
  .tgf-shape-btn:hover {
    transform: scale(1.06);
  }
  .tgf-shape-on {
    border-color: var(--surface);
    box-shadow: 0 0 0 2px var(--ink);
  }
  .tgf-shape {
    width: 18px;
    height: 18px;
    background: var(--sw);
    clip-path: var(--sh);
  }

  /* ── Aperçu ── */
  .tgf-preview {
    flex: 1 1 200px;
    min-width: 0;
    align-self: flex-start;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--surface-tint);
  }
  .tgf-preview-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .tgf-preview-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
  }
  .tgf-preview-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 76px;
    height: 76px;
    border-radius: 50%;
    background: var(--pv-soft);
    box-shadow: inset 0 0 0 5px var(--surface);
  }
  .tgf-preview-shape {
    width: 30px;
    height: 30px;
    background: var(--pv-fill);
    clip-path: var(--pv-clip);
  }
  .tgf-preview-name {
    max-width: 100%;
    font-size: 16px;
    font-weight: 600;
    text-align: center;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .tgf-preview-block {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .tgf-preview-caption {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .tgf-preview-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 11px;
    background: var(--surface);
  }
  .tgf-preview-meeting {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink-soft);
  }
  .tgf-preview-chip {
    display: inline-flex;
    max-width: 100%;
    min-width: 0;
  }

  .tgf-error {
    margin: 0 28px 16px;
    padding: 9px 12px;
    border-radius: 9px;
    font-size: 12.5px;
    color: var(--danger-text);
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
  }
  .tgf-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 28px;
    border-top: 1px solid var(--line);
    background: var(--surface-tint);
  }
  .tgf-actions-hint {
    flex: 1 1 220px;
    font-size: 12.5px;
    color: var(--ink-muted);
  }
  .tgf-btn {
    height: 42px;
    padding: 0 18px;
    border: 1px solid var(--line-strong);
    border-radius: 11px;
    background: var(--surface);
    font-family: inherit;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tgf-btn:hover:not(:disabled) {
    background: var(--surface-tint);
  }
  .tgf-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .tgf-btn-primary {
    background: var(--brand);
    border-color: var(--brand-strong);
    color: #fff;
    font-weight: 600;
    box-shadow: 0 2px 10px -3px rgb(var(--brand-rgb) / 0.55);
  }
  .tgf-btn-primary:hover:not(:disabled) {
    background: var(--brand-strong);
  }

  /* Écran tactile : style.css porte pastilles et boutons de forme à 36 px
     (cibles tactiles). Le plafond suit, et l'écart se resserre pour tenir
     7 + 7 dès 354 px de large — les téléphones Android courants font 360 px.
     Chaque curseur fait la hauteur d'une pastille, pour que le pouce reste
     saisissable. */
  @media (pointer: coarse) {
    .tgf-swatches {
      gap: 6px;
    }
    .tgf-swatches,
    .tgf-hue-row {
      max-width: calc(7 * 36px + 6 * 6px);
    }
    .tgf-sliders {
      gap: 0;
    }
    .tgf-hue {
      height: 36px;
    }
    .tgf-hue::-webkit-slider-runnable-track {
      height: 10px;
    }
    .tgf-hue::-moz-range-track {
      height: 10px;
    }
    .tgf-hue::-webkit-slider-thumb {
      width: 26px;
      height: 26px;
      margin-top: -8px;
    }
    .tgf-hue::-moz-range-thumb {
      width: 22px;
      height: 22px;
    }
  }
  @media (max-width: 760px) {
    .tgf-head,
    .tgf-body,
    .tgf-actions {
      padding-left: 18px;
      padding-right: 18px;
    }
    .tgf-error {
      margin-left: 18px;
      margin-right: 18px;
    }
    /* L'aperçu passe AU-DESSUS des réglages, ramassé sur une ligne : sur un
       téléphone, il serait sinon sous le pli, loin de ce qu'on règle. */
    .tgf-preview {
      order: -1;
      flex-basis: 100%;
      gap: 12px;
      padding: 14px 16px;
    }
    .tgf-preview-hero {
      flex-direction: row;
      gap: 14px;
      padding: 0;
    }
    .tgf-preview-badge {
      width: 52px;
      height: 52px;
      box-shadow: inset 0 0 0 4px var(--surface);
      flex-shrink: 0;
    }
    .tgf-preview-shape {
      width: 22px;
      height: 22px;
    }
    .tgf-preview-name {
      text-align: left;
    }
    .tgf-shapes {
      gap: 6px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tgf-swatch,
    .tgf-shape-btn,
    .tgf-hue,
    .tgf-more :global(svg) {
      transition: none;
    }
  }
</style>
