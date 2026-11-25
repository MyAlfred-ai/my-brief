/**
 * Réglages → Aide IA (settings/AiHelpSection).
 *
 * Ce qui compte ici : la page part des préférences du compte et n'envoie que
 * ce qu'on a changé, d'un seul « Enregistrer » ; chaque son s'écoute ; un
 * moteur de voix n'est proposé que s'il a été essayé par le serveur, et un
 * moteur enregistré qui ne l'est plus est signalé — on ne l'enregistre pas
 * allumé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';
import { tick } from 'svelte';

const ALL = { project: true, qa: true, agenda: true, ideas: true };

vi.mock('../../services/aiHelpApi.js', () => ({
  fetchAiHelp: vi.fn(),
  saveAiHelpSession: vi.fn(),
  watchAiHelp: vi.fn(),
  askAiHelp: vi.fn(),
  saveAiHelpItemState: vi.fn(),
  searchAiHelpProjects: vi.fn(),
  saveAiHelpPreferences: vi.fn(async (body) => ({
    ok: true,
    status: 200,
    data: { preferences: body },
  })),
  fetchAiHelpVoices: vi.fn(),
  speakAiHelp: vi.fn(),
}));
vi.mock('../../utils/chime.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    playChime: vi.fn(),
    playBell: vi.fn(),
    playAck: vi.fn(),
    playTimerMelody: vi.fn(),
    aiHelpAudioLocked: writable(false),
    armAiHelpAudio: vi.fn(),
    unlockAiHelpAudio: vi.fn(async () => true),
    readyAudioContext: vi.fn(async () => null),
  };
});
vi.mock('../../lib/aiHelp/voice.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    aiHelpSpeaking: writable(false),
    stopSpeaking: vi.fn(),
    recentSpeech: vi.fn(() => []),
    browserSpeechSupported: vi.fn(() => true),
    browserVoices: vi.fn(async () => [
      { id: 'fr-denise', label: 'Denise', lang: 'fr-FR', local: false },
      { id: 'en-ava', label: 'Ava', lang: 'en-US', local: true },
    ]),
    speakNow: vi.fn(async () => ({ ok: true })),
  };
});

const api = await import('../../services/aiHelpApi.js');
const chime = await import('../../utils/chime.js');
const voice = await import('../../lib/aiHelp/voice.js');
const { uiTextData } = await import('../../config/uiText.js');
const store = await import('../../stores/aiHelp.js');
const AiHelpSection = (await import('./AiHelpSection.svelte')).default;

const t = uiTextData.fr.aiHelp;
const P = t.prefs;

const OPENAI = {
  id: 'openai',
  models: [
    {
      id: 'gpt-4o-mini-tts',
      retiresAt: '2027-01-06',
      voices: [
        { id: 'marin', label: 'Marin', languages: [] },
        { id: 'alloy', label: 'Alloy', languages: [] },
      ],
    },
    {
      id: 'tts-1',
      retiresAt: '2027-01-06',
      voices: [{ id: 'alloy', label: 'Alloy', languages: [] }],
    },
  ],
};

async function page({ preferences = {}, providers = [] } = {}) {
  const base = store.defaultAiHelpPreferences();
  store.aiHelp.update((s) => ({
    ...s,
    loaded: true,
    available: true,
    allowed: { ...ALL, project: false },
    wakeWord: 'Alfred',
    preferences: {
      ...base,
      ...preferences,
      voice: { ...base.voice, ...preferences.voice },
    },
  }));
  api.fetchAiHelpVoices.mockResolvedValue({ ok: true, status: 200, data: { providers } });
  const view = render(AiHelpSection);
  // Fin du chargement des voix (onMount), que leur section soit affichée ou
  // non. Attendre sa note par `findByText` coûtait 1 s en vain quand elle
  // ne l'est pas : la chaîne de promesses se vide avant la macrotâche suivante.
  await vi.waitFor(() => expect(api.fetchAiHelpVoices).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
  return view;
}

const saveButton = () => screen.getByRole('button', { name: P.save });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiHelpSection — démarrage et sons', () => {
  it('les domaines permis seulement, et un seul Enregistrer pour ce qu’on a changé', async () => {
    await page();
    const user = userEvent.setup();
    expect(screen.queryByLabelText(t.domains.project.title)).toBeNull();
    expect(saveButton().disabled).toBe(true);

    await user.click(screen.getByLabelText(t.domains.ideas.title));
    await user.click(screen.getByLabelText(P.sounds.actions.label));
    await user.click(saveButton());

    const sent = api.saveAiHelpPreferences.mock.calls[0][0];
    expect(sent.start.domains.ideas).toBe(false);
    expect(sent.sounds).toEqual({ alerts: true, ideas: true, actions: false, timer: true });
    expect(await screen.findByText(P.saved)).toBeTruthy();
    expect(get(store.aiHelp).preferences.sounds.actions).toBe(false);
  });

  it('éteinte au démarrage : les domaines s’effacent, la page dit comment l’allumer', async () => {
    await page();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(P.startSwitch));
    expect(screen.queryByLabelText(t.domains.ideas.title)).toBeNull();
    expect(screen.getByText(P.startOff)).toBeTruthy();
  });

  it('chaque son s’écoute, dans le geste qui déverrouille l’audio', async () => {
    await page();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: P.listenTo.replace('{label}', P.sounds.ideas.label) }),
    );
    expect(chime.unlockAiHelpAudio).toHaveBeenCalled();
    expect(chime.playBell).toHaveBeenCalledTimes(1);
  });
});

describe('AiHelpSection — la voix', () => {
  it('sans moteur essayé : le navigateur seul, ses voix de la langue en tête', async () => {
    await page({ preferences: { voice: { enabled: true } } });
    const engines = screen.getAllByRole('radio');
    expect(engines.map((radio) => radio.value)).toEqual(['browser']);
    const select = screen.getByLabelText(P.voiceLabel);
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options[0]).toBe(P.voiceDefault);
    expect(options[1]).toBe('Denise');
    expect(options[2]).toContain('Ava');
  });

  it('OpenAI essayé : proposé, sa meilleure voix choisie, l’arrêt annoncé', async () => {
    await page({ preferences: { voice: { enabled: true } }, providers: [OPENAI] });
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: new RegExp(P.engines.openai.label) }));
    expect(screen.getByLabelText(P.modelLabel).value).toBe('gpt-4o-mini-tts');
    expect(screen.getByLabelText(P.voiceLabel).value).toBe('marin');
    expect(screen.getByText(/OpenAI arrête ces modèles le/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: P.listen }));
    expect(voice.speakNow).toHaveBeenCalledWith(
      expect.stringContaining('Alfred'),
      expect.objectContaining({ provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'marin' }),
      { language: 'fr' },
    );
    expect(await screen.findByText(P.sampleDone)).toBeTruthy();
  });

  it('un échec de l’écoute est dit avec ses mots', async () => {
    voice.speakNow.mockResolvedValueOnce({ ok: false, error: 'voice_blocked' });
    await page({ preferences: { voice: { enabled: true } } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: P.listen }));
    expect(await screen.findByText(P.errors.voice_blocked)).toBeTruthy();
  });

  it('un moteur enregistré qui n’est plus proposé : signalé, et pas enregistrable allumé', async () => {
    await page({
      preferences: {
        voice: { enabled: true, provider: 'mistral', model: 'voxtral-mini-tts-3-0', voice: 'x' },
      },
    });
    expect(await screen.findByText(P.engineGone)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(P.sounds.ideas.label));
    expect(saveButton().disabled).toBe(true);

    // Éteinte, elle se range sur le navigateur, et s'enregistre.
    await user.click(screen.getByLabelText(P.voiceSwitch));
    await user.click(saveButton());
    expect(api.saveAiHelpPreferences.mock.calls[0][0].voice).toMatchObject({
      enabled: false,
      provider: 'browser',
      model: '',
      voice: '',
    });
  });
});
