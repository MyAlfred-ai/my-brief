<script>
  /**
   * Zone de transcription du direct (écran d'enregistrement), avec suivi
   * détachable : tant que l'utilisateur est en bas, chaque nouvelle phrase
   * garde la vue collée au flux ; dès qu'il remonte lire plus haut, la vue ne
   * bouge plus et une flèche « revenir au direct » apparaît en bas.
   *
   * Sorti d'App.svelte : le composant porte l'état de suivi et son bouton,
   * App (au plafond `max-lines`, cf. eslint.config.js) ne fait qu'appeler
   * `scrollToLatest()` après chaque ajout au transcript.
   */
  import EditableTranscript from './EditableTranscript.svelte';
  import IconArrowDown from '~icons/solar/alt-arrow-down-linear';

  // Historique de transcription : même forme que EditableTranscript.items
  export let items = [];
  // Transmis tel quel à EditableTranscript (étiquette du canal micro).
  export let selfName = '';
  export let waitingText = '';
  export let followLabel = '';

  let container;
  // Suivi du direct : vrai tant que la vue est (quasi) en bas. Les scrolls
  // programmés retombent à distance 0 et ne le désactivent donc jamais ;
  // seule une remontée manuelle le coupe, et revenir en bas à la main le
  // réactive (la flèche disparaît alors d'elle-même).
  let following = true;

  // Marge sous laquelle on considère la vue « en bas » : couvre les arrondis
  // de mesure et une ligne en cours qui grandit entre deux ajouts.
  const NEAR_BOTTOM_PX = 60;

  function handleScroll() {
    if (!container) return;
    following =
      container.scrollHeight - container.scrollTop - container.clientHeight <= NEAR_BOTTOM_PX;
  }

  // Menu « Qui parle ici ? » ouvert (EditableTranscript) : la vue ne suit plus
  // le direct, pour que la ligne et son menu restent sous les yeux pendant que
  // la visio parle. Refermé, la vue rejoint le direct — si elle le suivait.
  let naming = false;
  function onNaming(e) {
    naming = e.detail;
    if (!naming) scrollToLatest();
  }

  // Appelé par App après chaque ajout (post-tick). Sans `force`, ne recolle
  // la vue que si l'utilisateur n'est pas parti lire plus haut, ni en train de
  // nommer une voix.
  export function scrollToLatest(force = false) {
    if (!container || (!force && (naming || !following))) return;
    following = true;
    container.scrollTop = container.scrollHeight;
  }
</script>

<div class="live-transcript-shell">
  <div class="rec-live-transcript" bind:this={container} on:scroll={handleScroll}>
    <EditableTranscript {items} {selfName} on:edit on:speaker on:naming={onNaming} />
    {#if items.length === 0}
      <div class="rec-waiting">{waitingText}</div>
    {/if}
  </div>
  {#if !following}
    <button
      type="button"
      class="follow-live-btn"
      title={followLabel}
      aria-label={followLabel}
      on:click={() => scrollToLatest(true)}
    >
      <IconArrowDown width="22" height="22" />
    </button>
  {/if}
</div>

<style>
  .live-transcript-shell {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* .rec-live-transcript et .rec-waiting restent stylés dans style.css
     (mêmes classes qu'avant l'extraction, media queries comprises). */

  /* Au-dessus du fondu bas de .main-area (voile z 40, cf. style.css), sous le
     dock (z 50). bottom : au-dessus du dock d'enregistrement (55 px à 32 px du
     bas de .main-area, le shell s'arrêtant déjà ~20 px au-dessus du bas). */
  .follow-live-btn {
    position: absolute;
    left: 50%;
    bottom: 96px;
    transform: translateX(-50%);
    z-index: 45;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 1px solid rgb(var(--brand-rgb) / 0.3);
    background: var(--mb-bg-app, #fffefc);
    color: var(--brand-text, #4a4a4a);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.14);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .follow-live-btn:hover {
    transform: translateX(-50%) translateY(-2px);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
  }

  /* Mobile : .content-layout garde déjà ~120 px de padding bas (barre d'app,
     dock plus bas que le shell) — la flèche se pose près du bas du shell. */
  @media (max-width: 768px) {
    .follow-live-btn {
      bottom: 16px;
    }
  }
</style>
