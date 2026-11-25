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
  import { tick } from 'svelte';
  import { uiText } from '../store.js';
  import { fill } from '../utils/i18nFormat.js';
  import { wakeWordSpan } from '../utils/wakeWord.js';
  import { aiHelp, aiHelpCalledLines, aiHelpLineKey } from '../stores/aiHelp.js';
  import { aiHelpTimer } from '../stores/aiHelpTimer.js';
  import EditableTranscript from './EditableTranscript.svelte';
  import AiHelpStage from './aiHelp/AiHelpStage.svelte';
  import AiHelpTimer from './aiHelp/AiHelpTimer.svelte';
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

  // Onglet caché — le cas courant : l'utilisateur est dans l'onglet de sa
  // visio, ou l'app mobile est en arrière-plan. Personne ne voit la liste :
  // elle reste figée (ni rendu ni défilement à chaque delta, et pas de mise
  // en page forcée par `scrollHeight`), puis rattrape le direct d'un coup au
  // retour. `visibilityState`, pas `document.hidden` : un document en
  // « prerender » n'est pas caché.
  const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  let hidden = isHidden();
  let shown = items;
  $: if (!hidden) shown = items;
  async function onVisibilityChange() {
    hidden = isHidden();
    if (hidden) return;
    await tick();
    scrollToLatest();
  }

  // Appelé par App après chaque ajout (post-tick). Sans `force`, ne recolle
  // la vue que si l'utilisateur n'est pas parti lire plus haut, ni en train de
  // nommer une voix.
  export function scrollToLatest(force = false) {
    if (!container || hidden || (!force && (naming || !following))) return;
    following = true;
    container.scrollTop = container.scrollHeight;
  }

  // Le prénom qui a déclenché l'Aide IA s'écrit dans SA teinte : on voit qu'elle
  // a pris la phrase pour elle. La fonction est REFAITE dès qu'une de ses
  // dépendances change — la liste des lignes, le mot d'appel, la langue — :
  // la réactivité de Svelte ne voit pas ce qu'une fonction lit en dedans.
  $: aiMark = aiMarker($aiHelpCalledLines, $aiHelp.wakeWord, $uiText.aiHelp.wakeMark);
  function aiMarker(called, wakeWord, label) {
    if (!called.size || !wakeWord) return null;
    return (item) => {
      if (item.isDelta || !called.has(aiHelpLineKey(item))) return null;
      const text = String(item.text || '');
      const span = wakeWordSpan(text, wakeWord);
      if (!span) return null;
      return {
        before: text.slice(0, span.start),
        word: text.slice(span.start, span.end),
        after: text.slice(span.end),
        label: fill(label, { name: wakeWord }),
      };
    };
  }

  // Scène de l'Aide IA (AiHelpStage) : elle se pose sur le bas de la
  // transcription. Les dernières lignes remontent de sa hauteur, pour que ce
  // qui vient d'être dit reste lisible au-dessus de la carte.
  const STAGE_GAP_PX = 16;
  let stageRoom = 0;
  async function onStageResize(e) {
    stageRoom = e.detail ? e.detail + STAGE_GAP_PX : 0;
    await tick();
    scrollToLatest();
  }

  // Le minuteur de l'Aide IA (AiHelpTimer) prend une rangée au-dessus de la
  // liste, qui raccourcit d'autant : la vue se recolle au direct quand il
  // apparaît ou s'en va — sinon la dernière phrase passait sous le bas.
  $: timerShown = !!$aiHelp.meetingId && !!$aiHelpTimer;
  $: onTimerRow(timerShown);
  async function onTimerRow() {
    await tick();
    scrollToLatest();
  }
</script>

<svelte:document on:visibilitychange={onVisibilityChange} />

<div class="live-transcript-shell">
  <!-- Le minuteur demandé à l'IA : sa propre rangée, au-dessus de la liste. -->
  <AiHelpTimer />
  <div class="rec-live-transcript" bind:this={container} on:scroll={handleScroll}>
    <EditableTranscript items={shown} {selfName} {aiMark} on:edit on:speaker on:naming={onNaming} />
    {#if items.length === 0}
      <div class="rec-waiting">{waitingText}</div>
    {/if}
    <!-- `flex: none` : la liste est une colonne flex, qui écraserait cette
         réserve au lieu de défiler (mesuré : 148 px rendus pour 253 demandés). -->
    <div style:height="{stageRoom}px" style:flex="none" aria-hidden="true"></div>
  </div>
  <!-- `on:edit` : une correction de la transcription demandée à l'IA remonte à
       App par le même événement qu'une ligne corrigée à la main. -->
  <AiHelpStage {items} {selfName} on:resize={onStageResize} on:edit />
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
