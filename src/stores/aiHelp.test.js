/**
 * Aide IA d'une réunion, côté écran (stores/aiHelp.js) — API simulée, horloge
 * simulée.
 *
 * Garanties tenues ici :
 *   - rien ne part au serveur tant que la réunion n'existe pas, ni si l'Aide IA
 *     est éteinte ;
 *   - une phrase n'est lue qu'une fois, reconnue par son identifiant — jamais
 *     par sa position dans la liste, qui peut rétrécir ;
 *   - les lignes déjà là quand l'observation commence ne déclenchent rien ;
 *   - une lecture attend deux phrases, puis vingt secondes avant la suivante ;
 *   - une lecture en échec n'efface pas le passage : il repart avec le suivant ;
 *   - un geste sur la réunion (pause, fin, compte rendu, correction de la
 *     transcription) n'est jamais fait par le store : il est posé dans une
 *     file, pour le composant qui tient la fonction — et il meurt avec la
 *     réunion ;
 *   - une ligne corrigée est relue en place, sans rien déclencher ;
 *   - un son par sens : le carillon pour l'urgent, la sonnette pour une idée,
 *     deux touches pour un geste FAIT — chacun selon les préférences, et rien
 *     quand le son de la réunion est coupé ;
 *   - couper le son ne part pas au serveur, et fait taire la voix ;
 *   - le minuteur demandé décompte à l'écran et joue sa mélodie à zéro ; une
 *     page rechargée le retrouve, un autre onglet qui l'arrête l'arrête ici,
 *     et une session partie avant qu'on le lance ne l'efface pas ;
 *   - ne se lit à voix haute que ce que les préférences demandent, et jamais
 *     l'écho de sa propre voix revenu par le micro.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../services/aiHelpApi.js', () => ({
  fetchAiHelp: vi.fn(),
  saveAiHelpSession: vi.fn(),
  watchAiHelp: vi.fn(),
  askAiHelp: vi.fn(),
  saveAiHelpItemState: vi.fn(),
  searchAiHelpProjects: vi.fn(),
  saveAiHelpPreferences: vi.fn(),
  fetchAiHelpVoices: vi.fn(),
}));
vi.mock('../utils/chime.js', () => ({
  playChime: vi.fn(),
  playBell: vi.fn(),
  playAck: vi.fn(),
  playTimerMelody: vi.fn(),
}));
// La voix : on ne vérifie que ce que le store lui demande.
vi.mock('../lib/aiHelp/voice.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    aiHelpSpeaking: writable(false),
    stopSpeaking: vi.fn(),
    recentSpeech: vi.fn(() => []),
  };
});
// Poser un tag passe par stores/tags.js (et son API) : ici, on ne vérifie que l'appel.
vi.mock('./tags.js', () => ({ tagMeeting: vi.fn(async () => ({ ok: true })) }));
// store.js lit `localStorage` à l'import : absent hors navigateur.
vi.mock('../store.js', async () => {
  const { writable } = await import('svelte/store');
  return { currentLanguageStore: writable('fr') };
});

const api = await import('../services/aiHelpApi.js');
const { playChime, playBell, playAck, playTimerMelody } = await import('../utils/chime.js');
const { aiHelpTimer, aiHelpTimerLeft } = await import('./aiHelpTimer.js');
const voice = await import('../lib/aiHelp/voice.js');
const { tagMeeting } = await import('./tags.js');
const { liveMeetingIdStore, isPausedStore } = await import('./recording.js');
const { activePanel } = await import('./panels.js');
const store = await import('./aiHelp.js');
const {
  AI_HELP_WATCH_DEBOUNCE_MS,
  AI_HELP_WATCH_MIN_INTERVAL_MS,
  AI_HELP_WATCH_BACKOFF_MS,
  AI_HELP_ARMED_MS,
  AI_HELP_REQUEST_QUIET_MS,
  AI_HELP_REQUEST_OPEN_MS,
  AI_HELP_REQUEST_GESTURE_MS,
} = await import('../config/constants.js');

const ALL = { project: true, qa: true, agenda: true, ideas: true };
const ok = (data) => ({ ok: true, status: 200, data });
const session = (over = {}) => ({
  enabled: true,
  domains: ALL,
  agenda: '',
  agendaState: [],
  project: null,
  projectDeclined: false,
  items: [],
  ...over,
});
const line = (itemId, text, extra = {}) => ({ itemId, text, isDelta: false, ...extra });
/** Le compte s'appelle Camille : c'est l'étiquette de son micro. */
const observe = (items) => store.observeAiHelpTranscript(items, 'Camille');

/**
 * Charge un compte qui a tout. `enabled` et `domains` sont le réglage de LA
 * RÉUNION, tel que le serveur le rendra à son ouverture — par défaut tout
 * allumé, comme une réunion neuve ; autre chose : une réunion où on a coupé.
 */
async function ready({ enabled = true, domains = ALL, sound = true, voice } = {}) {
  api.fetchAiHelp.mockResolvedValue(
    ok({
      available: true,
      myBrain: true,
      domains: ALL,
      wakeWord: 'Alfred',
      myBrainUrl: 'https://cerveau.example.test',
      myBrainReason: 'ok',
      defaults: { enabled: true, domains: ALL },
      // `sound: false` : un compte qui a coupé tous ses sons.
      preferences: {
        sounds: { alerts: sound, ideas: sound, actions: sound, timer: sound },
        ...(voice ? { voice } : {}),
      },
    }),
  );
  api.saveAiHelpSession.mockResolvedValue(
    ok({ session: session({ enabled, domains }), candidates: [] }),
  );
  await store.loadAiHelp();
}

/** Laisse aboutir les appels en chaîne (relecture des droits, puis réglage). */
async function settle() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

/** Ouvre la réunion et laisse partir le réglage. */
async function openMeeting(id = 'm1') {
  liveMeetingIdStore.set(id);
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  activePanel.set(null);
  liveMeetingIdStore.set(null);
  isPausedStore.set(false);
  store.resetAiHelp();
  store.setAiHelpTemplates([]);
  api.saveAiHelpSession.mockResolvedValue(ok({ session: session(), candidates: [] }));
  api.watchAiHelp.mockResolvedValue(
    ok({ items: [], agenda: [], project: null, candidates: [], notice: '' }),
  );
  api.saveAiHelpItemState.mockResolvedValue(ok({ ok: true }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('aiHelp — avant la réunion', () => {
  it('tout est allumé d’office, sans rien envoyer ; les préférences comblées', async () => {
    await ready({ sound: false });
    expect(get(store.aiHelp)).toMatchObject({
      loaded: true,
      available: true,
      wakeWord: 'Alfred',
      enabled: true,
      // Le son de la réunion : toujours allumé au départ.
      sound: true,
      domains: ALL,
      preferences: {
        sounds: { alerts: false, ideas: false, actions: false, timer: false },
        // Ce que le serveur n'a pas dit est comblé : jamais de trou.
        voice: { enabled: false, provider: 'browser', read: { answers: true } },
      },
    });
    expect(api.saveAiHelpSession).not.toHaveBeenCalled();
  });

  it('un domaine que le compte ne peut pas utiliser ne s’allume pas', async () => {
    api.fetchAiHelp.mockResolvedValue(
      ok({
        available: true,
        myBrain: false,
        myBrainReason: 'no_group_right',
        domains: { ...ALL, project: false },
        wakeWord: 'Alfred',
        last: { enabled: true, domains: { ...ALL, project: false }, sound: true },
      }),
    );
    await store.loadAiHelp();
    store.toggleAiHelpDomain('project');
    expect(get(store.aiHelp).domains.project).toBe(false);
    // La raison suit, telle que le serveur la donne : l'écran la traduit.
    expect(get(store.aiHelp).myBrainReason).toBe('no_group_right');
  });
});

describe('aiHelp — la réunion qui s’ouvre', () => {
  it('relit le réglage de la réunion dès qu’elle existe, sans rien lui imposer, et l’adopte', async () => {
    await ready();
    await openMeeting();
    // Une lecture : le serveur pose le réglage de départ si la réunion est neuve.
    expect(api.saveAiHelpSession).toHaveBeenCalledWith({ meetingId: 'm1' });
    expect(get(store.aiHelp)).toMatchObject({ enabled: true, domains: ALL });

    // Une réunion où l'on avait coupé (page rechargée) : rien n'est rallumé.
    vi.clearAllMocks();
    liveMeetingIdStore.set(null);
    store.resetAiHelp();
    await ready({ enabled: false, domains: { ...ALL, ideas: false } });
    await openMeeting('m2');
    expect(api.saveAiHelpSession).toHaveBeenCalledWith({ meetingId: 'm2' });
    expect(get(store.aiHelp)).toMatchObject({
      enabled: false,
      domains: { ideas: false, qa: true },
    });
    expect(get(store.aiHelpOrb)).toBe('off');
  });

  it('une réunion démarrée sans rien avoir chargé relit droits et réglage', async () => {
    // Le « + » du téléphone : rien n'a été chargé avant.
    api.fetchAiHelp.mockResolvedValue(
      ok({
        available: true,
        myBrain: false,
        domains: { ...ALL, project: false },
        wakeWord: 'Alfred',
        defaults: { enabled: true, domains: { ...ALL, project: false }, sound: true },
      }),
    );
    api.saveAiHelpSession.mockResolvedValue(
      ok({ session: session({ domains: { ...ALL, project: false } }), candidates: [] }),
    );
    await openMeeting('m9');
    expect(get(store.aiHelp)).toMatchObject({
      available: true,
      enabled: true,
      meetingId: 'm9',
      domains: { project: false, qa: true, agenda: true, ideas: true },
    });
    expect(api.saveAiHelpSession).toHaveBeenCalledWith({ meetingId: 'm9' });
  });

  it('un droit donné dans l’administration apparaît à sa fermeture, sans recharger la page', async () => {
    api.fetchAiHelp.mockResolvedValue(
      ok({ available: false, myBrain: false, domains: {}, last: {} }),
    );
    await store.loadAiHelp();
    expect(get(store.aiHelp).available).toBe(false);

    activePanel.set('admin');
    await ready({ enabled: false });
    api.fetchAiHelp.mockClear();
    store.resetAiHelp(); // l'écran ne sait encore rien du droit qui vient d'être donné
    activePanel.set(null);
    await settle();

    expect(api.fetchAiHelp).toHaveBeenCalledTimes(1);
    expect(get(store.aiHelp)).toMatchObject({ loaded: true, available: true });
  });

  it('un domaine basculé pendant la réunion part aussitôt', async () => {
    await ready();
    await openMeeting();
    api.saveAiHelpSession.mockClear();
    store.toggleAiHelpDomain('ideas');
    expect(api.saveAiHelpSession).toHaveBeenCalledWith({
      meetingId: 'm1',
      domains: { ...ALL, ideas: false },
    });
  });

  it('le droit retiré en cours de route éteint l’Aide IA sans bruit', async () => {
    await ready();
    api.saveAiHelpSession.mockResolvedValue({
      ok: false,
      status: 409,
      data: { error: 'ai_help_not_allowed' },
    });
    await openMeeting();
    expect(get(store.aiHelp)).toMatchObject({ available: false, enabled: false });
  });
});

describe('aiHelp — le mot d’appel', () => {
  beforeEach(() => {
    api.askAiHelp.mockResolvedValue(
      ok({
        item: { id: 'a'.repeat(32), kind: 'answer', body: 'Le 15 mars.', state: 'open' },
        notice: '',
      }),
    );
  });

  it('les lignes déjà là ne déclenchent rien ; une nouvelle question part une seule fois', async () => {
    await ready();
    await openMeeting();
    const old = line('l1', 'Alfred, une vieille question ?');
    observe([old]);
    expect(api.askAiHelp).not.toHaveBeenCalled();

    const asked = line('l2', 'Alfred, rappelle-moi la date de livraison ?', {
      source: 'remote',
      speaker: 'Hugo',
    });
    observe([old, { itemId: 'l3', text: 'Alfred, en cours…', isDelta: true }, asked]);
    // La liste rétrécit (déduplication d'écho) puis la même ligne revient : rien de plus.
    observe([asked]);
    observe([old, asked]);
    // Rien ne part tant que la personne peut encore parler.
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS - 1);
    expect(api.askAiHelp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(api.askAiHelp).toHaveBeenCalledTimes(1);
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: 'm1',
        question: 'rappelle-moi la date de livraison ?',
        voice: true,
        transcript:
          'Camille : Alfred, une vieille question ?\nHugo : Alfred, rappelle-moi la date de livraison ?',
      }),
    );
    expect(get(store.aiHelp).items).toMatchObject([{ kind: 'answer', fresh: true }]);
  });

  it('deux phrases dites d’une traite partagent leur segment : les deux sont lues', async () => {
    // Le modèle par défaut boucle une ligne à chaque fin de phrase, sans
    // changer de segment : la seconde ligne porte le MÊME `itemId`. Reconnue
    // par lui seul, elle écrasait la première et n'était jamais lue.
    await ready();
    await openMeeting();
    observe([]);
    const first = line('seg', 'On avance bien.', { timestamp: '10:00:01', time: '00:00:05' });
    const second = line('seg', 'Alfred, où en est le lot 2 ?', {
      timestamp: '10:00:03',
      time: '00:00:07',
    });
    observe([first]);
    observe([first, second]);
    observe([first, second]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    expect(api.askAiHelp).toHaveBeenCalledTimes(1);
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'où en est le lot 2 ?',
        transcript: 'Camille : On avance bien.\nCamille : Alfred, où en est le lot 2 ?',
      }),
    );
  });

  it('nées dans la même seconde, deux lignes du même segment restent deux lignes', async () => {
    await ready();
    await openMeeting();
    observe([]);
    const stamp = { timestamp: '10:00:01', time: '00:00:05' };
    const twins = [line('seg', 'Oui.', stamp), line('seg', 'Très bien.', stamp)];
    observe(twins);
    observe(twins);
    await store.askAiHelp('Qu’a-t-on dit ?');
    expect(api.askAiHelp).toHaveBeenLastCalledWith(
      expect.objectContaining({ transcript: 'Camille : Oui.\nCamille : Très bien.' }),
    );
  });

  it('une demande en deux phrases part entière, une fois la personne tue', async () => {
    await ready();
    await openMeeting();
    observe([]);
    const intro = line('l1', 'Alfred, j’ai une question.');
    observe([intro]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    expect(api.askAiHelp).not.toHaveBeenCalled();
    observe([intro, line('l2', 'Est-ce que le budget du lot 2 a été validé ?')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    expect(api.askAiHelp).toHaveBeenCalledTimes(1);
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'j’ai une question. Est-ce que le budget du lot 2 a été validé ?',
      }),
    );
  });

  it('« Alfred ? » seul arme l’écoute : la phrase suivante est la question, si elle vient vite', async () => {
    await ready();
    await openMeeting();
    observe([]);
    const said = [line('l1', 'Alfred ?'), line('l2', 'Où en est le budget ?')];
    observe(said.slice(0, 1));
    observe(said);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Où en est le budget ?', voice: true }),
    );

    api.askAiHelp.mockClear();
    said.push(line('l3', 'Alfred ?'));
    observe(said);
    await vi.advanceTimersByTimeAsync(AI_HELP_ARMED_MS + 1);
    observe([...said, line('l4', 'Bon, on continue.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_OPEN_MS);
    expect(api.askAiHelp).not.toHaveBeenCalled();
  });

  it('questions-réponses coupées : le prénom part quand même — le geste demandé reste possible', async () => {
    await ready({ domains: { ...ALL, qa: false } });
    await openMeeting();
    api.askAiHelp.mockResolvedValue(
      ok({ item: null, notice: '', actions: [{ type: 'tag', tagId: 't1' }], reminders: [] }),
    );
    observe([]);
    const said = [line('l1', 'Alfred, ajoute le tag Atlas.')];
    observe(said);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'ajoute le tag Atlas.', voice: true }),
    );
    expect((await store.askAiHelp('Mets la réunion en pause')).ok).toBe(true);

    // « Alfred, ferme » : fait sur place, sans le modèle — comme avec les questions.
    api.askAiHelp.mockClear();
    store.aiHelpDeskOpen.set(true);
    observe([...said, line('l2', 'Alfred, ferme.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    expect(get(store.aiHelpDeskOpen)).toBe(false);
    expect(api.askAiHelp).not.toHaveBeenCalled();
  });

  it('une question refusée parce que coupée : la scène le dit, le pupitre aussi', async () => {
    await ready({ domains: { ...ALL, qa: false } });
    await openMeeting();
    const refused = { ok: false, status: 409, data: { error: 'ai_help_domain_off' } };
    api.askAiHelp.mockResolvedValue(refused);
    await store.askAiHelp('Où en est le budget ?', { voice: true });
    expect(get(store.aiHelp)).toMatchObject({
      error: 'ai_help_domain_off',
      notice: 'questions_off',
    });

    // La demande suivante efface le bandeau : il valait pour la question d'avant.
    api.askAiHelp.mockResolvedValueOnce(
      ok({ item: null, notice: '', actions: [{ type: 'close' }], reminders: [] }),
    );
    await store.askAiHelp('Ferme ta fenêtre', { voice: true });
    expect(get(store.aiHelp)).toMatchObject({ error: '', notice: '' });

    // Posée au pupitre : l'erreur s'y lit, la scène n'a rien à ajouter.
    await store.askAiHelp('Où en est le budget ?', { seen: true });
    expect(get(store.aiHelp)).toMatchObject({ error: 'ai_help_domain_off', notice: '' });
  });

  it('pendant la recherche, l’orbe cherche ; une panne rend son slug', async () => {
    await ready();
    await openMeeting();
    let answer;
    api.askAiHelp.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const asking = store.askAiHelp('  Où en   est-on ? ');
    expect(get(store.aiHelpOrb)).toBe('think');
    expect(get(store.aiHelp).pending).toMatchObject([{ question: 'Où en est-on ?', voice: false }]);
    answer({ ok: false, status: 429, data: { error: 'too_many_requests' } });
    expect(await asking).toEqual({ ok: false, error: 'too_many_requests' });
    expect(get(store.aiHelp)).toMatchObject({ pending: [], error: 'too_many_requests' });
  });
});

describe('aiHelp — le prénom qui a déclenché l’IA', () => {
  const called = () => [...get(store.aiHelpCalledLines)];

  beforeEach(() => {
    api.askAiHelp.mockResolvedValue(
      ok({ item: { id: 'a'.repeat(32), kind: 'answer', state: 'open' }, notice: '' }),
    );
  });

  it('retient la ligne d’une question, et celle d’un prénom lancé seul', async () => {
    await ready();
    await openMeeting();
    observe([]);
    observe([
      line('q', 'Alfred, rappelle-moi la date de livraison ?'),
      line('m', 'J’en ai parlé à Alfred hier.'),
      line('a', 'Alfred ?'),
      line('s', 'Où en est le budget ?'),
    ]);
    // « m » le cite sans s'adresser à lui ; « s » est la question qui suit
    // l'appel, mais ne porte pas le prénom : rien à y marquer.
    expect(called()).toEqual(['q', 'a']);
    expect(store.aiHelpLineKey({ itemId: 'q' })).toBe('q');
  });

  it('rien n’est retenu quand le prénom ne déclenche rien', async () => {
    // Éteinte : « Alfred, … » n'est qu'une phrase.
    await ready({ enabled: false });
    await openMeeting();
    observe([]);
    observe([line('q', 'Alfred, rappelle-moi la date de livraison ?')]);
    expect(called()).toEqual([]);

    // Questions-réponses coupées, il déclenche encore : un geste reste possible.
    liveMeetingIdStore.set(null);
    store.resetAiHelp();
    await ready({ domains: { ...ALL, qa: false } });
    await openMeeting('m3');
    observe([]);
    observe([line('g', 'Alfred, ajoute le tag Atlas.')]);
    expect(called()).toEqual(['g']);

    // Déjà là quand l'observation commence : contexte, pas un appel.
    liveMeetingIdStore.set(null);
    store.resetAiHelp();
    await ready();
    await openMeeting('m2');
    observe([line('old', 'Alfred, une vieille question ?')]);
    expect(called()).toEqual([]);
  });

  it('la réunion suivante repart d’une liste vide', async () => {
    await ready();
    await openMeeting();
    observe([]);
    observe([line('q', 'Alfred, une question ?')]);
    expect(called()).toEqual(['q']);
    liveMeetingIdStore.set(null);
    expect(called()).toEqual([]);
  });
});

describe('aiHelp — la lecture au fil de la réunion', () => {
  const alert = { id: 'b'.repeat(32), kind: 'alert', title: 'Contradiction', state: 'open' };

  async function twoLines() {
    observe([line('ctx', 'Point sur le lot 2.')]);
    observe([line('ctx', 'x'), line('l1', 'On retire la signature.')]);
    observe([line('l2', 'D’accord.', { source: 'remote', speaker: 'Hugo' })]);
  }

  it('attend deux phrases, laisse retomber la rafale, puis lit le passage neuf', async () => {
    await ready();
    await openMeeting();
    observe([line('ctx', 'Point sur le lot 2.')]);
    observe([line('l1', 'On retire la signature.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);
    expect(api.watchAiHelp).not.toHaveBeenCalled();

    api.watchAiHelp.mockResolvedValue(
      ok({ items: [alert], agenda: [], project: null, candidates: [], notice: '' }),
    );
    observe([line('l2', 'D’accord.', { source: 'remote', speaker: 'Hugo' })]);
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);

    expect(api.watchAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: 'm1',
        before: 'Camille : Point sur le lot 2.',
        fresh: 'Camille : On retire la signature.\nHugo : D’accord.',
      }),
    );
    expect(get(store.aiHelp).items).toMatchObject([{ kind: 'alert', fresh: true }]);
    expect(get(store.aiHelpOrb)).toBe('speak');
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('une idée sonne la sonnette ; arrivée avec une alerte, seul le carillon', async () => {
    const idea = { id: 'i'.repeat(32), kind: 'idea', title: 'Une piste', state: 'open' };
    await ready();
    await openMeeting();
    api.watchAiHelp.mockResolvedValue(
      ok({ items: [idea], agenda: [], project: null, candidates: [], notice: '' }),
    );
    await twoLines();
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);
    expect(playBell).toHaveBeenCalledTimes(1);
    expect(playChime).not.toHaveBeenCalled();

    api.watchAiHelp.mockResolvedValue(
      ok({
        items: [{ ...idea, id: 'j'.repeat(32) }, alert],
        agenda: [],
        project: null,
        candidates: [],
        notice: '',
      }),
    );
    observe([line('l3', 'Trois.'), line('l4', 'Quatre.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_MIN_INTERVAL_MS);
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(playBell).toHaveBeenCalledTimes(1);
    expect(playAck).not.toHaveBeenCalled();
  });

  it('le son coupé, une idée ne sonne pas', async () => {
    await ready({ sound: false });
    await openMeeting();
    api.watchAiHelp.mockResolvedValue(
      ok({
        items: [{ id: 'i'.repeat(32), kind: 'idea', state: 'open' }],
        agenda: [],
        project: null,
        candidates: [],
        notice: '',
      }),
    );
    await twoLines();
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);
    expect(get(store.aiHelpOpenItems)).toHaveLength(1);
    expect(playBell).not.toHaveBeenCalled();
  });

  it('pas plus d’une lecture toutes les vingt secondes ; le son coupé ne sonne pas', async () => {
    await ready({ sound: false });
    await openMeeting();
    api.watchAiHelp.mockResolvedValue(
      ok({ items: [alert], agenda: [], project: null, candidates: [], notice: '' }),
    );
    await twoLines();
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);
    expect(api.watchAiHelp).toHaveBeenCalledTimes(1);
    expect(playChime).not.toHaveBeenCalled();

    observe([line('l3', 'Trois.'), line('l4', 'Quatre.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_MIN_INTERVAL_MS - 1000);
    expect(api.watchAiHelp).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.watchAiHelp).toHaveBeenCalledTimes(2);
    expect(api.watchAiHelp.mock.calls[1][0].fresh).toBe('Camille : Trois.\nCamille : Quatre.');
  });

  it('une lecture en échec garde le passage : il repart, plus tard, avec la suite', async () => {
    await ready();
    await openMeeting();
    api.watchAiHelp.mockResolvedValueOnce({ ok: false, status: 502, data: { error: 'upstream' } });
    await twoLines();
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);
    expect(api.watchAiHelp).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_BACKOFF_MS);
    expect(api.watchAiHelp).toHaveBeenCalledTimes(2);
    expect(api.watchAiHelp.mock.calls[1][0].fresh).toBe(
      'Camille : On retire la signature.\nHugo : D’accord.',
    );
  });

  it('seules les questions allumées : aucune lecture ne part', async () => {
    await ready({ domains: { project: false, qa: true, agenda: false, ideas: false } });
    await openMeeting();
    await twoLines();
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_MIN_INTERVAL_MS);
    expect(api.watchAiHelp).not.toHaveBeenCalled();
  });
});

describe('aiHelp — les interventions', () => {
  it('« Compris » s’applique tout de suite, puis s’écrit', async () => {
    await ready();
    api.saveAiHelpSession.mockResolvedValue(
      ok({
        session: session({ items: [{ id: 'c'.repeat(32), kind: 'alert', state: 'open' }] }),
        candidates: [],
      }),
    );
    await openMeeting();
    expect(get(store.aiHelpOpenItems)).toHaveLength(1);
    const saving = store.setAiHelpItemState('c'.repeat(32), 'acknowledged');
    expect(get(store.aiHelpOpenItems)).toHaveLength(0);
    expect(await saving).toEqual({ ok: true });
    expect(api.saveAiHelpItemState).toHaveBeenCalledWith({
      meetingId: 'm1',
      itemId: 'c'.repeat(32),
      state: 'acknowledged',
    });
  });

  it('relit les interventions gardées avec une réunion de l’historique', () => {
    const id = 'd'.repeat(32);
    expect(
      store.aiHelpItemsOf({
        aiHelp: {
          items: [{ id, kind: 'idea', title: 'Une piste' }, null],
          states: { [id]: 'dismissed' },
        },
      }),
    ).toEqual([{ id, kind: 'idea', title: 'Une piste', state: 'dismissed' }]);
    expect(store.aiHelpItemsOf({})).toEqual([]);
    expect(store.aiHelpItemsOf(null)).toEqual([]);
  });
});

describe('aiHelp — l’ordre du jour', () => {
  const point = (label, state = 'todo', heard = false) => ({ label, state, heard });
  const sessionCalls = () => api.saveAiHelpSession.mock.calls.map(([body]) => body);

  it('le brouillon de l’accueil part une fois ; ensuite le texte entier n’est plus jamais renvoyé', async () => {
    await ready();
    store.setAiHelpAgenda('Avancement');
    api.saveAiHelpSession.mockResolvedValue(
      ok({ session: session({ agendaState: [point('Avancement')] }), candidates: [] }),
    );
    await openMeeting();
    expect(sessionCalls().at(-1)).toMatchObject({ agenda: 'Avancement' });

    // Éteinte puis rallumée, un panneau fermé : le réglage repart SANS l'ordre
    // du jour — il écraserait ce que l'IA a retenu depuis.
    await store.setAiHelpEnabled(false);
    await store.setAiHelpEnabled(true);
    activePanel.set('settings');
    activePanel.set(null);
    await settle();
    for (const body of sessionCalls().slice(1)) expect(body).not.toHaveProperty('agenda');
  });

  it('les points que l’IA retient arrivent par la lecture, et remplacent la copie locale', async () => {
    await ready();
    await openMeeting();
    observe([]);
    api.watchAiHelp.mockResolvedValue(
      ok({
        items: [{ id: 'e'.repeat(32), kind: 'agenda', event: 'noted', state: 'open' }],
        agenda: [point('Budget', 'todo', true), point('Planning', 'now', true)],
        project: null,
        candidates: [],
        notice: '',
      }),
    );
    observe([line('a', 'À l’ordre du jour : le budget.'), line('b', 'Et le planning.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);

    expect(get(store.aiHelp)).toMatchObject({
      agenda: 'Budget\nPlanning',
      agendaState: [point('Budget', 'todo', true), point('Planning', 'now', true)],
    });
    expect(get(store.aiHelpOpenItems)).toHaveLength(1);
    // Un accusé de réception ne sonne pas.
    expect(playChime).not.toHaveBeenCalled();
  });

  it('au pupitre : un point ajouté ou retiré s’affiche tout de suite et part seul', async () => {
    await ready();
    api.saveAiHelpSession.mockResolvedValue(
      ok({ session: session({ agendaState: [point('Budget')] }), candidates: [] }),
    );
    await openMeeting();

    const adding = store.addAiHelpAgendaPoint('  Risques  ');
    expect(get(store.aiHelp).agendaState).toEqual([point('Budget'), point('Risques')]);
    await adding;
    expect(sessionCalls().at(-1)).toEqual({ meetingId: 'm1', agendaAdd: 'Risques' });

    // Un point déjà là — à la casse et aux accents près — ne repart pas.
    const before = sessionCalls().length;
    expect(await store.addAiHelpAgendaPoint('BUDGET')).toEqual({ ok: true });
    expect(await store.addAiHelpAgendaPoint('   ')).toEqual({ ok: false });
    expect(sessionCalls()).toHaveLength(before);

    await store.removeAiHelpAgendaPoint('Budget');
    expect(sessionCalls().at(-1)).toEqual({ meetingId: 'm1', agendaRemove: 'Budget' });
  });

  it('une réponse qui touche à l’ordre du jour le met à jour', async () => {
    await ready();
    await openMeeting();
    api.askAiHelp.mockResolvedValue(
      ok({
        item: { id: 'f'.repeat(32), kind: 'answer', state: 'open' },
        notice: '',
        agenda: [point('Budget', 'done', true)],
      }),
    );
    await store.askAiHelp('À l’ordre du jour : le budget');
    expect(get(store.aiHelp).agendaState).toEqual([point('Budget', 'done', true)]);
  });

  it('le rappel de fin de réunion sonne ; l’ordre du jour ne suit pas à la réunion suivante', async () => {
    await ready();
    await openMeeting();
    observe([]);
    api.watchAiHelp.mockResolvedValue(
      ok({
        items: [{ id: 'a'.repeat(32), kind: 'agenda', event: 'closing', state: 'open' }],
        agenda: [point('Budget')],
        project: null,
        candidates: [],
        notice: '',
      }),
    );
    observe([line('a', 'Merci à tous.'), line('b', 'On s’arrête là.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);
    expect(playChime).toHaveBeenCalledTimes(1);

    liveMeetingIdStore.set(null);
    await settle();
    expect(get(store.aiHelp)).toMatchObject({ agenda: '', agendaState: [] });
  });
});

describe('aiHelp — les gestes qu’on lui demande', () => {
  const answer = (over = {}) =>
    ok({
      item: { id: '1'.repeat(32), kind: 'answer', state: 'open' },
      notice: '',
      actions: [],
      reminders: [],
      ...over,
    });

  it('pose le tag et met la note en attente d’écriture — là où vit chaque état', async () => {
    await ready();
    await openMeeting();
    api.askAiHelp.mockResolvedValue(
      answer({
        actions: [
          { type: 'tag', tagId: 'tag-atlas' },
          { type: 'note', text: 'Budget validé.' },
        ],
      }),
    );
    await store.askAiHelp('Ajoute le tag Atlas et note que le budget est validé');

    expect(tagMeeting).toHaveBeenCalledWith('m1', 'tag-atlas');
    // La note attend le composant qui tient les notes de la réunion.
    expect(get(store.aiHelpNotes)).toEqual(['Budget validé.']);
    expect(store.takeAiHelpNotes()).toEqual(['Budget validé.']);
    expect(get(store.aiHelpNotes)).toEqual([]);
    // Deux gestes, un seul son ; une réponse, elle, ne sonne pas.
    expect(playAck).toHaveBeenCalledTimes(1);
    expect(playChime).not.toHaveBeenCalled();
    expect(playBell).not.toHaveBeenCalled();
  });

  it('un geste qui n’a rien fait ne s’entend pas ; le son coupé non plus', async () => {
    await ready();
    await openMeeting();
    // Le tag n'existe pas : le serveur ne rend que le compte rendu de l'échec.
    api.askAiHelp.mockResolvedValue(answer());
    await store.askAiHelp('Ajoute le tag Inconnu');
    expect(playAck).not.toHaveBeenCalled();

    const calls = api.saveAiHelpSession.mock.calls.length;
    store.setAiHelpSound(false);
    // Couper le son vaut pour CETTE réunion : rien ne part, la voix se tait.
    expect(api.saveAiHelpSession.mock.calls).toHaveLength(calls);
    expect(voice.stopSpeaking).toHaveBeenCalled();
    playChime.mockClear();
    api.askAiHelp.mockResolvedValue(answer({ actions: [{ type: 'note', text: 'x' }] }));
    await store.askAiHelp('Note x');
    expect(get(store.aiHelpNotes)).toEqual(['x']);
    expect(playAck).not.toHaveBeenCalled();

    // Rétabli : deux notes brèves le confirment.
    store.setAiHelpSound(true);
    expect(playAck).toHaveBeenCalledTimes(1);
  });

  it('un son coupé dans les préférences ne joue pas, les autres si', async () => {
    api.fetchAiHelp.mockResolvedValue(
      ok({
        available: true,
        domains: ALL,
        wakeWord: 'Alfred',
        defaults: { enabled: true, domains: ALL },
        preferences: { sounds: { alerts: true, ideas: true, actions: false } },
      }),
    );
    await store.loadAiHelp();
    await openMeeting();
    api.askAiHelp.mockResolvedValue(answer({ actions: [{ type: 'note', text: 'x' }] }));
    await store.askAiHelp('Note x');
    expect(playAck).not.toHaveBeenCalled();
  });

  it('« ferme » demandé au modèle : tout se range, sans carte de plus', async () => {
    await ready();
    api.saveAiHelpSession.mockResolvedValue(
      ok({
        session: session({ items: [{ id: 'c'.repeat(32), kind: 'idea', state: 'open' }] }),
        candidates: [],
      }),
    );
    await openMeeting();
    store.aiHelpDeskOpen.set(true);
    api.askAiHelp.mockResolvedValue(answer({ item: null, actions: [{ type: 'close' }] }));
    await store.askAiHelp('Laisse-nous la place');

    expect(get(store.aiHelpOpenItems)).toEqual([]);
    expect(get(store.aiHelpDeskOpen)).toBe(false);
    expect(api.saveAiHelpItemState).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'c'.repeat(32), state: 'dismissed' }),
    );
  });

  it('« Alfred, ferme », « Alfred, merci » : tout de suite, sans appel au modèle', async () => {
    await ready();
    api.saveAiHelpSession.mockResolvedValue(
      ok({
        session: session({ items: [{ id: 'c'.repeat(32), kind: 'idea', state: 'open' }] }),
        candidates: [],
      }),
    );
    await openMeeting();
    observe([]);
    const close = line('f', 'Alfred, ferme la fenêtre.');
    observe([close]);
    // Un geste reste vif : le temps de voir si la phrase continue, pas plus.
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_GESTURE_MS);
    expect(get(store.aiHelpOpenItems)).toEqual([]);
    expect(api.askAiHelp).not.toHaveBeenCalled();
    expect(playAck).toHaveBeenCalledTimes(1);

    // Une vraie demande qui commence par « ferme » part, elle, au modèle.
    api.askAiHelp.mockResolvedValue(answer());
    observe([close, line('g', 'Alfred, ferme le dossier Atlas dans le plan.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    await settle();
    expect(api.askAiHelp).toHaveBeenCalledTimes(1);
  });

  it('un rappel se tait jusqu’à son heure, puis sonne et prend la scène', async () => {
    await ready();
    await openMeeting();
    const dueAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const reminder = {
      id: '2'.repeat(32),
      kind: 'reminder',
      title: 'Le recrutement',
      dueAt,
      state: 'open',
    };
    api.askAiHelp.mockResolvedValue(answer({ reminders: [reminder] }));
    await store.askAiHelp('Rappelle-moi le recrutement dans dix minutes');

    // La réponse est là ; le rappel existe, mais ne se montre pas. Posé, il
    // s'entend comme un geste fait — il sonnera, lui, à son heure.
    expect(get(store.aiHelpOpenItems).map((item) => item.kind)).toEqual(['answer']);
    expect(playAck).toHaveBeenCalledTimes(1);
    playChime.mockClear();
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(get(store.aiHelpOpenItems)).toHaveLength(1);
    expect(playChime).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(get(store.aiHelpOpenItems).at(-1)).toMatchObject({ kind: 'reminder', fresh: true });
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('un rappel posé avant un rechargement de page sonne quand même ; il meurt avec la réunion', async () => {
    await ready();
    const dueAt = new Date(Date.now() + 5 * 60_000).toISOString();
    api.saveAiHelpSession.mockResolvedValue(
      ok({
        session: session({
          items: [
            { id: '3'.repeat(32), kind: 'reminder', title: 'Appeler Hugo', dueAt, state: 'open' },
          ],
        }),
        candidates: [],
      }),
    );
    await openMeeting();
    expect(get(store.aiHelpOpenItems)).toEqual([]);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(get(store.aiHelpOpenItems)).toHaveLength(1);

    // Réunion suivante : aucun minuteur ne survit.
    playChime.mockClear();
    liveMeetingIdStore.set(null);
    await ready();
    api.saveAiHelpSession.mockResolvedValue(
      ok({
        session: session({
          items: [
            {
              id: '4'.repeat(32),
              kind: 'reminder',
              title: 'x',
              dueAt: new Date(Date.now() + 60_000).toISOString(),
              state: 'open',
            },
          ],
        }),
        candidates: [],
      }),
    );
    await openMeeting('m2');
    liveMeetingIdStore.set(null);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(playChime).not.toHaveBeenCalled();
  });
});

describe('aiHelp — le minuteur', () => {
  const answer = (over = {}) =>
    ok({
      item: { id: '1'.repeat(32), kind: 'answer', state: 'open' },
      notice: '',
      actions: [],
      reminders: [],
      ...over,
    });
  const five = { seconds: 300, label: 'Pause café', remainingMs: 300_000 };
  /** Une session que le serveur rendra à la prochaine relecture. */
  const serverTimer = (timer) =>
    api.saveAiHelpSession.mockResolvedValue(ok({ session: session({ timer }), candidates: [] }));
  /** Lance cinq minutes en le demandant à l'IA. */
  async function start(timer = five) {
    api.askAiHelp.mockResolvedValue(answer({ timer }));
    await store.askAiHelp('Lance un minuteur de cinq minutes pour la pause café');
  }

  it('demandé : il décompte, s’entend comme un geste fait, et joue sa mélodie à zéro', async () => {
    await ready();
    await openMeeting();
    await start();

    expect(get(aiHelpTimer)).toMatchObject({ seconds: 300, label: 'Pause café', done: false });
    expect(get(aiHelpTimerLeft)).toBe(300);
    expect(playAck).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(299_000);
    expect(get(aiHelpTimerLeft)).toBe(1);
    expect(playTimerMelody).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(get(aiHelpTimer)).toMatchObject({ done: true });
    expect(playTimerMelody).toHaveBeenCalledTimes(1);
    // Ni carillon ni sonnette : la mélodie est SON signal.
    expect(playChime).not.toHaveBeenCalled();
    expect(playBell).not.toHaveBeenCalled();
    // L'orbe « parle » le temps qu'elle joue.
    expect(get(store.aiHelpOrb)).toBe('speak');
    await vi.advanceTimersByTimeAsync(4000);
    expect(get(store.aiHelpOrb)).toBe('listen');

    // « Temps écoulé » une minute, puis plus rien.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get(aiHelpTimer)).toBeNull();
    expect(playTimerMelody).toHaveBeenCalledTimes(1);
  });

  it('rallongé puis arrêté à la demande : l’écran suit ce que rend le serveur', async () => {
    await ready();
    await openMeeting();
    await start();
    await vi.advanceTimersByTimeAsync(60_000);

    api.askAiHelp.mockResolvedValue(
      answer({ timer: { seconds: 420, label: 'Pause café', remainingMs: 360_000 } }),
    );
    await store.askAiHelp('Ajoute deux minutes');
    expect(get(aiHelpTimer)).toMatchObject({ seconds: 420, done: false });
    expect(get(aiHelpTimerLeft)).toBe(360);

    playAck.mockClear();
    api.askAiHelp.mockResolvedValue(answer({ timer: null }));
    await store.askAiHelp('Arrête le minuteur');
    expect(get(aiHelpTimer)).toBeNull();
    expect(playAck).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(playTimerMelody).not.toHaveBeenCalled();

    // « Arrête » sans minuteur : rien à ranger, rien ne s'entend.
    playAck.mockClear();
    await store.askAiHelp('Arrête le minuteur');
    expect(playAck).not.toHaveBeenCalled();
  });

  it('son de la réunion coupé, ou mélodie coupée dans les préférences : il finit en silence', async () => {
    await ready();
    await openMeeting();
    store.setAiHelpSound(false);
    await start({ seconds: 10, label: '', remainingMs: 10_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(get(aiHelpTimer)).toMatchObject({ done: true });
    expect(playTimerMelody).not.toHaveBeenCalled();

    liveMeetingIdStore.set(null);
    api.fetchAiHelp.mockResolvedValue(
      ok({
        available: true,
        domains: ALL,
        wakeWord: 'Alfred',
        defaults: { enabled: true, domains: ALL },
        preferences: { sounds: { alerts: true, ideas: true, actions: true, timer: false } },
      }),
    );
    await store.loadAiHelp();
    await openMeeting('m2');
    await start({ seconds: 10, label: '', remainingMs: 10_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(get(aiHelpTimer)).toMatchObject({ done: true });
    expect(playTimerMelody).not.toHaveBeenCalled();
  });

  it('une page rechargée le retrouve ; arrêté dans un autre onglet, il s’arrête ici', async () => {
    await ready();
    serverTimer({ seconds: 300, label: 'Pause', remainingMs: 120_000 });
    await openMeeting();
    expect(get(aiHelpTimer)).toMatchObject({ seconds: 300, label: 'Pause', done: false });
    expect(get(aiHelpTimerLeft)).toBe(120);
    // Retrouvé, pas demandé : aucun « c'est fait ».
    expect(playAck).not.toHaveBeenCalled();

    serverTimer(null);
    await store.toggleAiHelpDomain('ideas');
    expect(get(aiHelpTimer)).toBeNull();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(playTimerMelody).not.toHaveBeenCalled();
  });

  it('relu à l’heure, il n’est pas relancé ; décalé, il est recalé', async () => {
    await ready();
    await openMeeting();
    await start();
    const running = get(aiHelpTimer);

    // Une demi-seconde d'écart : l'aller-retour, pas un autre minuteur.
    serverTimer({ seconds: 300, label: 'Pause café', remainingMs: 299_500 });
    await store.toggleAiHelpDomain('ideas');
    expect(get(aiHelpTimer)).toBe(running);

    // Rallongé ailleurs de deux minutes.
    serverTimer({ seconds: 420, label: 'Pause café', remainingMs: 420_000 });
    await store.toggleAiHelpDomain('ideas');
    expect(get(aiHelpTimer)).toMatchObject({ seconds: 420 });
    expect(get(aiHelpTimerLeft)).toBe(420);

    // Un serveur d'avant le minuteur n'en dit rien : il reste.
    api.saveAiHelpSession.mockResolvedValue(ok({ session: session(), candidates: [] }));
    await store.toggleAiHelpDomain('ideas');
    expect(get(aiHelpTimer)).toMatchObject({ seconds: 420 });
  });

  it('une session partie AVANT qu’on le lance ne l’efface pas', async () => {
    await ready();
    await openMeeting();
    let land;
    api.saveAiHelpSession.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const syncing = store.toggleAiHelpDomain('ideas');

    await start();
    expect(get(aiHelpTimer)).toMatchObject({ seconds: 300 });

    // La session relue avant la demande arrive après : elle ne sait rien du minuteur.
    land(ok({ session: session({ timer: null }), candidates: [] }));
    await syncing;
    expect(get(aiHelpTimer)).toMatchObject({ seconds: 300, done: false });
  });

  it('à quelques secondes de sa fin, une session qui le dit fini ne le fait pas taire', async () => {
    await ready();
    await openMeeting();
    await start({ seconds: 10, label: '', remainingMs: 10_000 });
    await vi.advanceTimersByTimeAsync(7000);

    serverTimer(null);
    await store.toggleAiHelpDomain('ideas');
    expect(get(aiHelpTimer)).toMatchObject({ done: false });
    await vi.advanceTimersByTimeAsync(3000);
    expect(playTimerMelody).toHaveBeenCalledTimes(1);
  });

  it('son bouton : retiré tout de suite, dit au serveur ; celui qui a sonné se range sans rien envoyer', async () => {
    await ready();
    await openMeeting();
    await start();
    api.saveAiHelpSession.mockClear();

    store.stopAiHelpTimer();
    expect(get(aiHelpTimer)).toBeNull();
    expect(api.saveAiHelpSession).toHaveBeenCalledWith({ meetingId: 'm1', timer: 'stop' });
    await settle();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(playTimerMelody).not.toHaveBeenCalled();

    await start({ seconds: 5, label: '', remainingMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(get(aiHelpTimer)).toMatchObject({ done: true });
    api.saveAiHelpSession.mockClear();
    expect(store.stopAiHelpTimer()).toEqual({ ok: true });
    expect(get(aiHelpTimer)).toBeNull();
    expect(api.saveAiHelpSession).not.toHaveBeenCalled();
    // Sans minuteur, le bouton n'existe pas — et l'appeler ne fait rien.
    expect(store.stopAiHelpTimer()).toEqual({ ok: true });
  });

  it('fermer la fenêtre de l’IA range celui qui a sonné, pas celui qui décompte', async () => {
    await ready();
    await openMeeting();
    await start({ seconds: 30, label: '', remainingMs: 30_000 });
    store.closeAiHelpCards();
    expect(get(aiHelpTimer)).toMatchObject({ done: false });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(get(aiHelpTimer)).toMatchObject({ done: true });
    store.closeAiHelpCards();
    expect(get(aiHelpTimer)).toBeNull();
  });

  it('il meurt avec la réunion : rien ne sonne dans la suivante', async () => {
    await ready();
    await openMeeting();
    await start({ seconds: 60, label: '', remainingMs: 60_000 });
    liveMeetingIdStore.set(null);
    expect(get(aiHelpTimer)).toBeNull();
    await openMeeting('m2');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(playTimerMelody).not.toHaveBeenCalled();
    expect(get(aiHelpTimer)).toBeNull();
  });
});

describe('aiHelp — les gestes sur la réunion elle-même', () => {
  const answer = (actions) =>
    ok({
      item: { id: '2'.repeat(32), kind: 'answer', state: 'open' },
      notice: '',
      actions,
      reminders: [],
    });
  const TEMPLATES = [
    { id: 'standard', label: 'Standard' },
    { id: 'tpl-copil', label: 'Comité de pilotage' },
    { id: '', label: 'Sans identifiant' },
    { id: 'vide', label: '   ' },
  ];

  it('la question part avec les templates proposés et l’état de l’enregistrement', async () => {
    await ready();
    await openMeeting();
    store.setAiHelpTemplates(TEMPLATES);
    isPausedStore.set(true);
    api.askAiHelp.mockResolvedValue(answer([]));
    await store.askAiHelp('Reprends');
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({ templates: ['Standard', 'Comité de pilotage'], paused: true }),
    );
  });

  it('pause, reprise, fin : posées dans la file, pour le composant qui tient l’enregistrement', async () => {
    await ready();
    await openMeeting();
    api.askAiHelp.mockResolvedValue(answer([{ type: 'meeting', do: 'pause' }]));
    await store.askAiHelp('Mets en pause');
    api.askAiHelp.mockResolvedValue(
      answer([
        { type: 'meeting', do: 'end' },
        { type: 'meeting', do: 'delete' }, // n'existe pas : jeté
      ]),
    );
    await store.askAiHelp('Termine');

    expect(get(store.aiHelpCommands)).toEqual([
      { type: 'meeting', do: 'pause' },
      { type: 'meeting', do: 'end' },
    ]);
    expect(store.takeAiHelpCommands()).toHaveLength(2);
    expect(get(store.aiHelpCommands)).toEqual([]);
  });

  it('le compte rendu : le nom du template revient à son identifiant ; inconnu, rien ne part', async () => {
    await ready();
    await openMeeting();
    store.setAiHelpTemplates(TEMPLATES);
    api.askAiHelp.mockResolvedValue(
      answer([{ type: 'summary', template: 'Comité de pilotage', when: 'now' }]),
    );
    await store.askAiHelp('Fais le compte rendu de comité de pilotage');
    expect(store.takeAiHelpCommands()).toEqual([{ type: 'summary', template: 'tpl-copil' }]);

    // Sans nom : le template déjà choisi à l'écran.
    api.askAiHelp.mockResolvedValue(answer([{ type: 'summary', template: '', when: 'now' }]));
    await store.askAiHelp('Fais le compte rendu');
    expect(store.takeAiHelpCommands()).toEqual([{ type: 'summary', template: '' }]);

    // Les templates ont changé depuis la question : on ne termine pas à
    // l'aveugle — et rien de fait, rien ne s'entend.
    playAck.mockClear();
    api.askAiHelp.mockResolvedValue(answer([{ type: 'summary', template: 'Codir', when: 'now' }]));
    await store.askAiHelp('Fais le compte rendu Codir');
    expect(store.takeAiHelpCommands()).toEqual([]);
    expect(playAck).not.toHaveBeenCalled();
  });

  it('commandé pour la fin : le template est retenu, et « termine » rédige ce compte rendu', async () => {
    await ready();
    await openMeeting();
    store.setAiHelpTemplates(TEMPLATES);
    api.askAiHelp.mockResolvedValue(
      answer([{ type: 'summary', template: 'Comité de pilotage', when: 'end' }]),
    );
    await store.askAiHelp('À la fin, le compte rendu avec le template comité de pilotage');
    expect(store.takeAiHelpCommands()).toEqual([{ type: 'template', template: 'tpl-copil' }]);

    api.askAiHelp.mockResolvedValue(answer([{ type: 'meeting', do: 'end' }]));
    await store.askAiHelp('Termine la réunion');
    expect(store.takeAiHelpCommands()).toEqual([{ type: 'summary', template: 'tpl-copil' }]);

    // La commande ne suit pas à la réunion suivante : « termine » la range.
    await openMeeting('m2');
    await store.askAiHelp('Termine la réunion');
    expect(store.takeAiHelpCommands()).toEqual([{ type: 'meeting', do: 'end' }]);
  });

  it('corriger la transcription : dictée, la demande désigne sa propre ligne ; écrite, aucune', async () => {
    await ready();
    await openMeeting();
    observe([]);
    const fix = { type: 'replace', find: 'Market', with: 'Marquet', all: true };
    api.askAiHelp.mockResolvedValue(answer([fix]));
    observe([line('l1', 'Alfred, remplace partout Market par Marquet.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    expect(store.takeAiHelpEdits()).toEqual([
      { find: 'Market', with: 'Marquet', all: true, skipKey: 'l1' },
    ]);

    api.askAiHelp.mockResolvedValue(
      answer([
        { type: 'replace', find: 'le 2 mars', with: 'le 12 mars' },
        { type: 'replace', find: '', with: 'x' }, // rien à chercher : jeté
      ]),
    );
    await store.askAiHelp('Corrige : la livraison est le 12 mars');
    expect(get(store.aiHelpEdits)).toEqual([
      { find: 'le 2 mars', with: 'le 12 mars', all: false, skipKey: '' },
    ]);
  });

  it('une ligne corrigée est relue en place : la question suivante lit le texte juste, rien ne repart', async () => {
    await ready();
    await openMeeting();
    observe([]);
    api.askAiHelp.mockResolvedValue(answer([]));
    const first = line('l1', 'On livre chez Market.');
    const call = line('l2', 'Alfred, corrige le nom du client.', {
      source: 'remote',
      speaker: 'Hugo',
    });
    observe([first, call]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_QUIET_MS);
    expect(api.askAiHelp).toHaveBeenCalledTimes(1);

    // La correction revient par la liste : mêmes lignes, un texte changé, et
    // la voix de la visio vient d'être nommée.
    observe([
      { ...first, text: 'On livre chez Marquet.' },
      { ...call, speaker: 'Marie' },
    ]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_OPEN_MS);
    expect(api.askAiHelp).toHaveBeenCalledTimes(1);

    await store.askAiHelp('Où livre-t-on ?');
    expect(api.askAiHelp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transcript: 'Camille : On livre chez Marquet.\nMarie : Alfred, corrige le nom du client.',
      }),
    );
  });

  it('un geste en attente meurt avec la réunion', async () => {
    await ready();
    await openMeeting();
    api.askAiHelp.mockResolvedValue(
      answer([
        { type: 'meeting', do: 'pause' },
        { type: 'replace', find: 'Market', with: 'Marquet' },
      ]),
    );
    await store.askAiHelp('Pause, et corrige Market');
    expect(get(store.aiHelpCommands)).toHaveLength(1);
    expect(get(store.aiHelpEdits)).toHaveLength(1);

    liveMeetingIdStore.set(null);
    await settle();
    expect(get(store.aiHelpCommands)).toEqual([]);
    expect(get(store.aiHelpEdits)).toEqual([]);
  });
});

describe('aiHelp — une question posée dans le pupitre', () => {
  it('la réponse se lit dans le fil : rangée d’emblée, elle ne ressurgit pas sur la scène', async () => {
    await ready();
    await openMeeting();
    api.askAiHelp.mockResolvedValue(
      ok({
        item: { id: '5'.repeat(32), kind: 'answer', question: 'Fais une synthèse', state: 'open' },
        notice: '',
        actions: [],
        reminders: [],
      }),
    );
    await store.askAiHelp('Fais une synthèse', { seen: true });

    const [item] = get(store.aiHelp).items;
    // Dans le fil, et s'y écrivant mot à mot — mais plus « ouverte ».
    expect(item).toMatchObject({ state: 'dismissed', fresh: true });
    expect(get(store.aiHelpOpenItems)).toEqual([]);
    expect(api.saveAiHelpItemState).toHaveBeenCalledWith({
      meetingId: 'm1',
      itemId: '5'.repeat(32),
      state: 'dismissed',
    });
  });

  it('le pupitre se rouvre toujours sur la conversation', () => {
    store.aiHelpDeskOpen.set(true);
    store.aiHelpDeskView.set('settings');
    store.aiHelpDeskOpen.set(false);
    expect(get(store.aiHelpDeskView)).toBe('chat');
  });
});

describe('aiHelp — une seule fenêtre, et sa taille', () => {
  const three = () =>
    ['a', 'b', 'c'].map((char) => ({ id: char.repeat(32), kind: 'answer', state: 'open' }));

  it('fermer ferme tout : trois interventions ouvertes, une seule fermeture', async () => {
    await ready();
    api.saveAiHelpSession.mockResolvedValue(
      ok({ session: session({ items: three() }), candidates: [] }),
    );
    await openMeeting();
    expect(get(store.aiHelpOpenItems)).toHaveLength(3);

    expect(store.closeAiHelpCards()).toMatchObject({ ok: true, closed: 3 });
    expect(get(store.aiHelpOpenItems)).toEqual([]);
    expect(api.saveAiHelpItemState).toHaveBeenCalledTimes(3);
  });

  it('« Demander » ouvre la conversation ; une seconde fois, ferme tout', async () => {
    await ready();
    api.saveAiHelpSession.mockResolvedValue(
      ok({ session: session({ items: three() }), candidates: [] }),
    );
    await openMeeting();
    store.toggleAiHelpDesk();
    expect(get(store.aiHelpDeskOpen)).toBe(true);
    // Ouvrir ne range rien : les interventions s'y lisent.
    expect(get(store.aiHelpOpenItems)).toHaveLength(3);

    store.toggleAiHelpDesk();
    expect(get(store.aiHelpDeskOpen)).toBe(false);
    expect(get(store.aiHelpOpenItems)).toEqual([]);
  });

  it('la taille va de 0 à 2, sans sortir des bornes', () => {
    store.aiHelpSize.set(0);
    expect(store.resizeAiHelp(-1).size).toBe(0);
    expect(store.resizeAiHelp(1).size).toBe(1);
    expect(store.resizeAiHelp(1).size).toBe(2);
    expect(store.resizeAiHelp(1).size).toBe(store.AI_HELP_SIZE_MAX);
    expect(get(store.aiHelpSize)).toBe(2);
    store.aiHelpSize.set(0);
  });

  it('« Alfred, agrandis », « Alfred, plus petit » : tout de suite, sans appel au modèle', async () => {
    store.aiHelpSize.set(0);
    await ready();
    await openMeeting();
    observe([]);
    const bigger = line('s1', 'Alfred, agrandis.');
    observe([bigger]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_GESTURE_MS);
    expect(get(store.aiHelpSize)).toBe(1);
    observe([bigger, line('s2', 'Alfred, plus petit')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_REQUEST_GESTURE_MS);
    expect(get(store.aiHelpSize)).toBe(0);
    expect(api.askAiHelp).not.toHaveBeenCalled();
    // Le prénom a bien été pris pour un appel : il se colore.
    expect([...get(store.aiHelpCalledLines)]).toEqual(['s1', 's2']);
  });

  it('demandé autrement, le modèle le nomme et l’écran le fait', async () => {
    store.aiHelpSize.set(0);
    await ready();
    await openMeeting();
    api.askAiHelp.mockResolvedValue(
      ok({ item: null, notice: '', actions: [{ type: 'size', direction: 'up' }], reminders: [] }),
    );
    await store.askAiHelp('J’ai du mal à te lire');
    expect(get(store.aiHelpSize)).toBe(1);
    expect(get(store.aiHelp).items).toEqual([]);
    store.aiHelpSize.set(0);
  });
});

describe('aiHelp — la voix', () => {
  const VOICE_ON = {
    enabled: true,
    provider: 'browser',
    read: { answers: true, alerts: true, ideas: false },
  };
  const idea = { id: 'i'.repeat(32), kind: 'idea', title: 'Une piste', state: 'open' };
  const alert = { id: 'a'.repeat(32), kind: 'alert', title: 'Contradiction', state: 'open' };

  async function watchReturns(items) {
    api.watchAiHelp.mockResolvedValue(
      ok({ items, agenda: [], project: null, candidates: [], notice: '' }),
    );
    observe([line('ctx', 'Point sur le lot 2.')]);
    observe([line('l1', 'On retire la signature.'), line('l2', 'D’accord.')]);
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);
  }

  it('ne lit que ce que les préférences demandent', async () => {
    await ready({ voice: VOICE_ON });
    await openMeeting();
    await watchReturns([idea, alert]);
    expect(store.takeAiHelpSpeech().map((item) => item.kind)).toEqual(['alert']);

    api.askAiHelp.mockResolvedValue(
      ok({ item: { id: '9'.repeat(32), kind: 'answer', body: 'Le 12 mars.', state: 'open' } }),
    );
    await store.askAiHelp('La date ?');
    expect(store.takeAiHelpSpeech()).toMatchObject([{ kind: 'answer', body: 'Le 12 mars.' }]);
  });

  it('voix éteinte, ou son de la réunion coupé : rien à lire', async () => {
    await ready();
    await openMeeting();
    await watchReturns([alert]);
    expect(store.takeAiHelpSpeech()).toEqual([]);

    store.resetAiHelp();
    await ready({ voice: VOICE_ON });
    await openMeeting();
    store.setAiHelpSound(false);
    await watchReturns([alert]);
    expect(store.takeAiHelpSpeech()).toEqual([]);
  });

  it('fermer la fenêtre la fait taire', async () => {
    await ready({ voice: VOICE_ON });
    await openMeeting();
    voice.stopSpeaking.mockClear();
    store.closeAiHelpCards();
    expect(voice.stopSpeaking).toHaveBeenCalled();
  });

  it('l’écho de sa voix, revenu par le micro, n’est ni lu ni relu', async () => {
    await ready({ voice: VOICE_ON });
    await openMeeting();
    voice.recentSpeech.mockReturnValue(['Attention, la signature du lot deux était décidée.']);
    observe([line('ctx', 'Point sur le lot 2.')]);
    observe([
      line('e1', 'attention la signature du lot deux était décidée'),
      line('l1', 'On retire la signature.'),
      line('l2', 'D’accord.'),
    ]);
    await vi.advanceTimersByTimeAsync(AI_HELP_WATCH_DEBOUNCE_MS);
    expect(api.watchAiHelp.mock.calls[0][0].fresh).toBe(
      'Camille : On retire la signature.\nCamille : D’accord.',
    );
    voice.recentSpeech.mockReturnValue([]);
  });

  it('enregistre les préférences et les applique aussitôt', async () => {
    await ready({ voice: VOICE_ON });
    api.saveAiHelpPreferences.mockResolvedValue(
      ok({ preferences: { voice: { ...VOICE_ON, enabled: false } } }),
    );
    voice.stopSpeaking.mockClear();
    expect(await store.saveAiHelpPreferences({ voice: { enabled: false } })).toEqual({ ok: true });
    expect(get(store.aiHelp).preferences.voice.enabled).toBe(false);
    expect(voice.stopSpeaking).toHaveBeenCalled();

    api.saveAiHelpPreferences.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: 'voice_unknown' },
    });
    expect(await store.saveAiHelpPreferences({ voice: { voice: 'x' } })).toEqual({
      ok: false,
      error: 'voice_unknown',
    });
  });
});
