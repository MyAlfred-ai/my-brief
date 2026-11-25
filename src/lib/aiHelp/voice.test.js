/**
 * La voix de l'Aide IA (lib/aiHelp/voice.js) — faux `speechSynthesis`, fausse
 * API, faux contexte audio.
 *
 * Garanties tenues ici :
 *   - on lit un texte d'écran sans son Markdown ni ses adresses, coupé à une
 *     fin de phrase s'il est long ;
 *   - la voix choisie est celle qui parle ; une phrase à la fois ;
 *   - se taire coupe la phrase en cours ET celles qui attendaient ;
 *   - ce qu'elle vient de dire est gardé, pour en reconnaître l'écho ;
 *   - un audio verrouillé ou un refus du serveur est dit, jamais levé.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../../services/aiHelpApi.js', () => ({ speakAiHelp: vi.fn() }));
vi.mock('../../utils/chime.js', () => ({ readyAudioContext: vi.fn() }));

const api = await import('../../services/aiHelpApi.js');
const { readyAudioContext } = await import('../../utils/chime.js');
const voice = await import('./voice.js');

/** Un `speechSynthesis` qui parle quand on le lui dit (`finish`). */
function fakeSynthesis() {
  const spoken = [];
  const synth = {
    spoken,
    getVoices: () => [
      { voiceURI: 'fr-denise', name: 'Denise', lang: 'fr-FR', localService: false },
      { voiceURI: 'fr-thomas', name: 'Thomas', lang: 'fr-FR', localService: true },
    ],
    speak: (utterance) => spoken.push(utterance),
    cancel: vi.fn(() => {
      spoken.forEach((utterance) => utterance.onerror?.({ error: 'interrupted' }));
    }),
    finish: (index = spoken.length - 1) => spoken[index].onend?.(),
  };
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  vi.stubGlobal('window', { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance });
  return synth;
}

beforeEach(() => {
  vi.clearAllMocks();
  voice.stopSpeaking();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('voice — le texte qu’on lit', () => {
  it('sans Markdown, sans adresse', () => {
    expect(
      voice.speechTextOf(
        '## Synthèse\n- **Budget** validé\n- Voir [la fiche](https://cerveau.test/x) https://x.y',
      ),
    ).toBe('Synthèse Budget validé Voir la fiche');
  });

  it('long : coupé à une fin de phrase', () => {
    const sentence = 'Une phrase de réunion assez longue pour compter. ';
    const text = voice.speechTextOf(sentence.repeat(40));
    expect(text.length).toBeLessThanOrEqual(voice.SPEECH_MAX_CHARS);
    expect(text.endsWith('compter.')).toBe(true);
  });
});

describe('voice — le navigateur', () => {
  it('parle avec la voix choisie, et garde ce qu’il a dit', async () => {
    const synth = fakeSynthesis();
    const done = voice.speakNow('Le budget est validé.', {
      provider: 'browser',
      voice: 'fr-thomas',
    });
    expect(synth.spoken[0].voice.name).toBe('Thomas');
    expect(synth.spoken[0].lang).toBe('fr-FR');
    expect(get(voice.aiHelpSpeaking)).toBe(true);
    expect(voice.recentSpeech()).toEqual(['Le budget est validé.']);
    synth.finish();
    expect(await done).toEqual({ ok: true });
    expect(get(voice.aiHelpSpeaking)).toBe(false);
  });

  it('une phrase à la fois ; se taire coupe aussi celles qui attendaient', async () => {
    const synth = fakeSynthesis();
    const first = voice.queueSpeech('Première.', { provider: 'browser' });
    const second = voice.queueSpeech('Deuxième.', { provider: 'browser' });
    await Promise.resolve();
    expect(synth.spoken.map((u) => u.text)).toEqual(['Première.']);
    synth.finish();
    await first;
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(2));
    synth.finish();
    await second;

    const third = voice.queueSpeech('Troisième.', { provider: 'browser' });
    const fourth = voice.queueSpeech('Quatrième.', { provider: 'browser' });
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(3));
    voice.stopSpeaking();
    expect(await third).toMatchObject({ ok: true, stopped: true });
    expect(await fourth).toMatchObject({ stopped: true });
    expect(synth.spoken).toHaveLength(3);
  });

  it('refusée par le navigateur : dit, jamais levé', async () => {
    const synth = fakeSynthesis();
    const done = voice.speakNow('Bonjour.', { provider: 'browser' });
    synth.spoken[0].onerror({ error: 'not-allowed' });
    expect(await done).toEqual({ ok: false, error: 'voice_blocked' });
  });

  it('sans synthèse vocale : indisponible', async () => {
    vi.stubGlobal('window', {});
    expect(await voice.speakNow('Bonjour.', { provider: 'browser' })).toEqual({
      ok: false,
      error: 'voice_unavailable',
    });
  });
});

describe('voice — OpenAI et Mistral', () => {
  function fakeContext() {
    const sources = [];
    return {
      sources,
      destination: {},
      decodeAudioData: vi.fn(async () => ({ duration: 1.2 })),
      createBufferSource() {
        const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        sources.push(source);
        return source;
      },
    };
  }

  it('joue l’audio du serveur, réunion et langue jointes', async () => {
    const ctx = fakeContext();
    readyAudioContext.mockResolvedValue(ctx);
    api.speakAiHelp.mockResolvedValue({ ok: true, status: 200, data: new ArrayBuffer(8) });
    const done = voice.speakNow(
      'Bonjour.',
      { provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'marin' },
      { language: 'fr', meetingId: 'm1' },
    );
    await vi.waitFor(() => expect(ctx.sources).toHaveLength(1));
    expect(api.speakAiHelp).toHaveBeenCalledWith({
      text: 'Bonjour.',
      provider: 'openai',
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      language: 'fr',
      meetingId: 'm1',
    });
    expect(ctx.sources[0].start).toHaveBeenCalled();
    ctx.sources[0].onended();
    expect(await done).toEqual({ ok: true });
  });

  it('audio verrouillé : rien n’est demandé au serveur', async () => {
    readyAudioContext.mockResolvedValue(null);
    expect(
      await voice.speakNow('Bonjour.', { provider: 'mistral', model: 'm', voice: 'v' }),
    ).toEqual({ ok: false, error: 'voice_blocked' });
    expect(api.speakAiHelp).not.toHaveBeenCalled();
  });

  it('un refus du serveur est rendu tel quel', async () => {
    readyAudioContext.mockResolvedValue(fakeContext());
    api.speakAiHelp.mockResolvedValue({ ok: false, status: 429, error: 'too_many_requests' });
    expect(
      await voice.speakNow('Bonjour.', { provider: 'openai', model: 'tts-1', voice: 'alloy' }),
    ).toEqual({ ok: false, error: 'too_many_requests' });
  });
});
