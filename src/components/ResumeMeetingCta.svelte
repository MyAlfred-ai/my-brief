<script>
  /**
   * « Reprendre l'enregistrement », au bout de la transcription d'une réunion
   * terminée — là même où la suite s'écrira.
   *
   * Pourquoi ici : une réunion rouverte depuis l'historique, ou déjà résumée,
   * n'a plus de dock (la barre des documents le remplace, cf. App.svelte →
   * dockOffered). Ajouter un quatrième bouton à cette barre ne tenait pas à
   * 360 px, et « reprendre » n'y concerne pas le document affiché. Le fil de
   * la transcription, lui, dit exactement ce que fait le geste : continuer à
   * partir de la dernière ligne. Un seul endroit à la fois : tant que le dock
   * propose « Reprendre » (réunion tout juste arrêtée), ce bouton se tait.
   *
   * Visible sans défiler : le bouton flotte en bas de la zone de transcription
   * (`position: sticky`) tant que la fin n'est pas à l'écran, puis se pose
   * dans la trouée du trait de fin. Le trait, lui, ne flotte pas : à travers
   * le texte, il barrerait des lignes. Sa trouée est mesurée par un fantôme
   * du bouton (même classe, même libellé, invisible) — exacte en FR comme en
   * EN, sans JavaScript ni ResizeObserver.
   *
   * Quand il flotte (`stuck`), un fondu à la couleur du panneau passe sous lui
   * : les lignes s'y effacent au lieu de dépasser de part et d'autre. Posé, ce
   * fondu s'éteint — il masquerait le trait. « Flotte » = le bouton est
   * au-dessus de sa place, la trouée ; mesuré au défilement plutôt que par un
   * IntersectionObserver, qui devrait connaître le rembourrage du conteneur.
   *
   * Le geste et ses effets sont dans App.svelte (`resumeFinishedMeeting`) et
   * utils/meetingResume.js ; ce composant ne fait que le proposer.
   */
  import { uiText } from '../store.js';
  import { onMount } from 'svelte';
  import IconMic from '~icons/solar/microphone-2-linear';

  export let onResume = () => {};
  /** Micro en cours de demande : le bouton attend, il ne disparaît pas. */
  export let busy = false;

  let endRow;
  let floatRow;
  let stuck = false;

  function measure() {
    if (!endRow || !floatRow) return;
    stuck = floatRow.getBoundingClientRect().top < endRow.getBoundingClientRect().top - 0.5;
  }

  /** Le conteneur qui défile : ce composant ne présume pas de sa classe. */
  function scrollParent(node) {
    for (let el = node?.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
    }
    return null;
  }

  onMount(() => {
    const root = scrollParent(endRow);
    const frame = requestAnimationFrame(measure);
    root?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      root?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  });
</script>

<!-- Trait de fin, troué à la largeur exacte du bouton. -->
<div class="rmc-end" aria-hidden="true" bind:this={endRow}>
  <span class="rmc-rule"></span>
  <span class="rmc-btn rmc-ghost">
    <IconMic width="15" height="15" />
    <span>{$uiText.meetingResume.cta}</span>
  </span>
  <span class="rmc-rule"></span>
</div>
<div class="rmc-float" class:stuck bind:this={floatRow}>
  <button
    type="button"
    class="rmc-btn"
    on:click={onResume}
    disabled={busy}
    aria-busy={busy}
    title={$uiText.meetingResume.ctaTitle}
  >
    <IconMic width="15" height="15" aria-hidden="true" />
    <span>{$uiText.meetingResume.cta}</span>
  </button>
</div>

<style>
  /* Un trait de suite, coupé par le bouton : « la transcription continue ». */
  .rmc-end {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 22px;
  }
  .rmc-rule {
    flex: 1;
    min-width: 16px;
    border-top: 1px dashed var(--mb-border-card);
  }
  .rmc-ghost {
    visibility: hidden;
  }

  /* Remonté sur la trouée (marge négative = hauteur du bouton), collé au bas
     de la zone qui défile. z-index 45 : au-dessus du fondu de bas de page
     (.main-area::after, z 40) qui le délaverait, sous le dock (z 50) — comme
     .transcript-footer. Marge basse : en fin de défilement, les dernières
     lignes et le bouton posé sortent de ce fondu. Le conteneur laisse passer
     les clics : seul le bouton en prend, pas la bande où il flotte. */
  .rmc-float {
    position: sticky;
    bottom: 16px;
    z-index: 45;
    display: flex;
    justify-content: center;
    margin: -36px 0 88px;
    pointer-events: none;
  }
  /* Le fondu sous le bouton flottant, dans la largeur du texte (au-delà, le
     conteneur défilerait de côté). z-index -1 : dans le contexte du
     .rmc-float, derrière le bouton, devant les lignes. */
  .rmc-float::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -30px;
    bottom: -40px;
    z-index: -1;
    background: linear-gradient(to bottom, transparent, var(--mb-bg-surface) 50%);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .rmc-float.stuck::before {
    opacity: 1;
  }
  .rmc-btn {
    height: 36px;
    padding: 0 16px 0 13px;
    border-radius: 999px;
    border: 1px solid var(--mb-border-card);
    background: var(--surface);
    color: var(--brand-text);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    flex: none;
    box-sizing: border-box;
    white-space: nowrap;
    cursor: pointer;
    pointer-events: auto;
    /* Il flotte sur le texte : une ombre qui le détache des lignes. */
    box-shadow: 0 6px 20px -8px rgb(var(--brand-rgb) / 0.45);
    transition:
      background 0.15s,
      box-shadow 0.15s,
      transform 0.15s;
  }
  .rmc-btn :global(svg) {
    color: var(--brand);
    flex: none;
  }
  .rmc-btn:hover {
    background: var(--mb-bg-warm);
    box-shadow: 0 8px 22px -8px rgb(var(--brand-rgb) / 0.55);
  }
  .rmc-btn:active {
    transform: scale(0.97);
  }
  .rmc-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  /* Le contenu pâlit, pas le fond : le bouton peut flotter sur du texte. */
  .rmc-btn:disabled {
    cursor: wait;
  }
  .rmc-btn:disabled > :global(*) {
    opacity: 0.55;
  }
</style>
