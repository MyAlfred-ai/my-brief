<script>
  /**
   * Ce que le modèle choisi changerait à la dépense, dit AVANT d'enregistrer :
   * vert s'il fait économiser, ambre s'il coûte plus.
   *
   * Toujours présente, masquée tant qu'elle est vide : une zone d'annonce doit
   * exister AVANT son texte pour qu'un lecteur d'écran dise l'écart au moment
   * du choix.
   */
  import { formatEuros } from './stats/format.js';
  import { fill } from '../../utils/i18nFormat.js';

  /** Écart en euros (utils/modelPrices.js `priceDelta`) ; `null`, rien à dire. */
  export let delta = null;
  /**
   * En deçà, « même prix » : un écart que personne ne verrait. Il suit l'unité
   * — un demi-centime sur une heure de transcription, bien moins sur un
   * compte rendu qui en coûte quelques-uns.
   */
  export let epsilon = 0.005;
  /** Phrases, `{amount}` = l'écart. */
  export let less = '';
  export let more = '';
  export let same = '';
  export let lang = 'fr';

  $: tone = delta === null ? '' : delta <= -epsilon ? 'less' : delta >= epsilon ? 'more' : 'same';
  $: text =
    tone === ''
      ? ''
      : tone === 'same'
        ? same
        : fill(tone === 'less' ? less : more, { amount: formatEuros(Math.abs(delta), lang) });
</script>

<p
  class="pd"
  class:pd-less={tone === 'less'}
  class:pd-more={tone === 'more'}
  class:pd-empty={!text}
  role="status"
>
  {text}
</p>

<style>
  .pd {
    margin: 0.35rem 0 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .pd-less {
    border-color: var(--success-line);
    background: var(--success-bg);
    color: var(--success-text);
  }
  .pd-more {
    border-color: var(--warn-line);
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  .pd-empty {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
