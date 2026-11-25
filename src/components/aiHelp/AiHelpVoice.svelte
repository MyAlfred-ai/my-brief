<script>
  /**
   * La voix de l'Aide IA pendant une réunion — un composant sans rien à
   * l'écran, monté avec la scène (AiHelpStage).
   *
   * Le store choisit QUOI lire (`aiHelpSpeech`, d'après les préférences et le
   * son de la réunion) ; ce composant en fait des PHRASES — il a les libellés :
   * « Contradiction. … », « C'est l'heure du rappel : … », les points restés
   * en suspens — et lib/aiHelp/voice.js les dit, une à la fois.
   *
   * Il arme aussi le déverrouillage du son (utils/chime.js) : le premier clic
   * ou la première touche dans la page rend la parole à l'Aide IA, même si la
   * réunion a démarré sans un clic (extension, `#record`).
   */
  import { onMount } from 'svelte';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { aiHelp, aiHelpSpeech, takeAiHelpSpeech } from '../../stores/aiHelp.js';
  import { armAiHelpAudio, aiHelpAudioLocked } from '../../utils/chime.js';
  import { queueSpeech } from '../../lib/aiHelp/voice.js';

  $: T = $uiText.aiHelp;

  onMount(() => armAiHelpAudio());

  /** Une intervention → la phrase qu'on dit. '' : rien à dire. */
  function sentenceOf(item) {
    const parts = (...texts) =>
      texts
        .map((text) => String(text || '').trim())
        .filter(Boolean)
        .join('. ');
    if (item.kind === 'answer') return String(item.body || '');
    if (item.kind === 'reminder') return `${T.reminderTitle} : ${item.title || ''}`;
    if (item.event === 'closing') {
      const left = (Array.isArray(item.points) ? item.points : [])
        .filter((point) => point?.state !== 'done')
        .map((point) => point.label);
      return parts(
        T.agendaEvents.closing,
        left.length ? fill(T.voicePointsLeft, { points: left.join(', ') }) : '',
      );
    }
    if (item.kind === 'alert') return parts(T.kinds.alert, item.title, item.body);
    return parts(item.title, item.body);
  }

  async function say(items) {
    const { voice } = $aiHelp.preferences;
    for (const item of items) {
      const text = sentenceOf(item);
      if (!text) continue;
      queueSpeech(text, voice, {
        language: $currentLanguageStore,
        meetingId: $aiHelp.meetingId || undefined,
      }).then((res) => {
        if (res.error === 'voice_blocked') aiHelpAudioLocked.set(true);
      });
    }
  }

  $: if ($aiHelpSpeech.length) say(takeAiHelpSpeech());
</script>
