<script>
  /**
   * Le bouton du son de l'Aide IA, pendant une réunion — dans la pastille du
   * dock (`variant="pill"`) et en tête du pupitre (`variant="desk"`, le seul
   * accès au téléphone).
   *
   * Trois états, une seule icône :
   *   - son allumé (cloche) : un clic COUPE tout pour cette réunion — les
   *     sons et la voix, qui se tait aussitôt ;
   *   - son coupé (cloche barrée) : un clic le rétablit ;
   *   - son VERROUILLÉ par le navigateur (cloche, point d'alerte) : la page n'a
   *     reçu aucun geste et Chrome la tient muette (utils/chime.js). Le clic
   *     est ce geste : il déverrouille, sans rien couper.
   * Ce qui se règle pour toutes les réunions vit dans Réglages → Aide IA.
   */
  import { createEventDispatcher } from 'svelte';
  import { uiText } from '../../store.js';
  import { aiHelp, setAiHelpSound } from '../../stores/aiHelp.js';
  import { aiHelpAudioLocked, unlockAiHelpAudio } from '../../utils/chime.js';
  import AiIcon from './AiIcon.svelte';

  /** @type {'pill' | 'desk'} */
  export let variant = 'pill';

  const dispatch = createEventDispatcher();

  $: T = $uiText.aiHelp;
  $: on = $aiHelp.sound;
  $: locked = on && $aiHelpAudioLocked;
  $: label = locked ? T.soundLocked : on ? T.soundMute : T.soundUnmute;

  async function click() {
    if (locked) {
      if (await unlockAiHelpAudio()) dispatch('say', T.soundUnlocked);
      return;
    }
    setAiHelpSound(!on);
    dispatch('say', on ? T.soundMuted : T.soundBack);
  }
</script>

<button
  type="button"
  class="aisb aisb-{variant}"
  class:aisb-off={!on}
  aria-pressed={!on}
  aria-label={label}
  title={label}
  on:click={click}
>
  <AiIcon name={on ? 'bell' : 'bellOff'} size={variant === 'pill' ? 16 : 17} />
  {#if locked}<span class="aisb-dot" aria-hidden="true"></span>{/if}
</button>

<style>
  .aisb {
    position: relative;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .aisb-pill {
    width: 32px;
    height: 32px;
    color: var(--ink-faint);
  }
  .aisb-desk {
    width: 34px;
    height: 34px;
    color: var(--mb-text-secondary);
  }
  .aisb:hover {
    background: var(--ai-soft-strong);
    color: var(--ai-ink);
  }
  /* Coupé : la cloche barrée reste lisible, mais en retrait. */
  .aisb-off {
    color: var(--ink-faint);
    opacity: 0.8;
  }
  .aisb:focus-visible {
    outline: 2px solid var(--ai-ink);
    outline-offset: 2px;
  }
  /* Verrouillé par le navigateur : un point dans la teinte d'avertissement. */
  .aisb-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 8px;
    height: 8px;
    box-sizing: border-box;
    border: 1.5px solid var(--surface);
    border-radius: 50%;
    background: var(--warn-text);
  }
  @media (pointer: coarse) {
    .aisb-desk {
      width: 44px;
      height: 44px;
    }
  }
</style>
