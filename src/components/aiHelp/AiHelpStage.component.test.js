/**
 * La scène de l'Aide IA — une seule fenêtre.
 *
 * Ce qui compte ici : quel que soit le nombre d'interventions en attente, on
 * ne voit qu'UNE carte, et la fermer ferme tout ; les autres se lisent dans la
 * conversation, à un geste ; et la taille de la fenêtre se règle par ses
 * boutons, sur trois crans.
 *
 * C'est aussi la scène qui fait les corrections de la transcription demandées
 * à l'IA : elle les rend par l'événement `edit`, celui d'une ligne corrigée à
 * la main — et une carte dit, ligne par ligne, ce qui a été fait.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

vi.mock('../../services/aiHelpApi.js', () => ({
  fetchAiHelp: vi.fn(),
  saveAiHelpSession: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  watchAiHelp: vi.fn(),
  askAiHelp: vi.fn(),
  saveAiHelpItemState: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  searchAiHelpProjects: vi.fn(),
  saveAiHelpTagProject: vi.fn(),
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

const api = await import('../../services/aiHelpApi.js');
const { uiTextData } = await import('../../config/uiText.js');
const store = await import('../../stores/aiHelp.js');
const AiHelpStage = (await import('./AiHelpStage.svelte')).default;
const { historyItems } = await import('../../stores/history.js');
const { tags } = await import('../../stores/tags.js');

const t = uiTextData.fr.aiHelp;
const ALL = { project: true, qa: true, agenda: true, ideas: true };
const answer = (char, body) => ({
  id: char.repeat(32),
  kind: 'answer',
  question: `Question ${char}`,
  body,
  state: 'open',
});

/** L'Aide IA allumée sur une réunion, avec ces interventions. */
function seed(items) {
  store.aiHelp.update((s) => ({
    ...s,
    loaded: true,
    available: true,
    allowed: ALL,
    domains: ALL,
    enabled: true,
    wakeWord: 'Alfred',
    meetingId: 'm1',
    items,
    pending: [],
    candidates: [],
    notice: '',
  }));
}

function stage(items) {
  seed(items);
  return render(AiHelpStage, { items: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.aiHelpDeskOpen.set(false);
  store.aiHelpSize.set(0);
});

describe('AiHelpStage — une seule fenêtre', () => {
  it('trois interventions en attente : une carte, la dernière — et la fermer ferme tout', async () => {
    const { container } = stage([
      answer('a', 'Première réponse.'),
      answer('b', 'Deuxième réponse.'),
      answer('c', 'Dernière réponse.'),
    ]);
    expect(container.querySelectorAll('.ai-card')).toHaveLength(1);
    expect(screen.getByText('Dernière réponse.')).toBeTruthy();
    expect(screen.queryByText('Première réponse.')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: t.dismissLabel }));
    expect(get(store.aiHelpOpenItems)).toEqual([]);
    expect(api.saveAiHelpItemState).toHaveBeenCalledTimes(3);
    expect(container.querySelector('.ai-card')).toBeNull();
  });

  it('les autres se lisent dans la conversation, à un geste — pas en cartes successives', async () => {
    const { container } = stage([
      answer('a', 'Première réponse.'),
      answer('b', 'Dernière réponse.'),
    ]);
    await userEvent.click(screen.getByRole('button', { name: t.othersOpenOne }));

    expect(get(store.aiHelpDeskOpen)).toBe(true);
    // Toujours une seule fenêtre : la conversation a pris la place de la carte.
    expect(container.querySelectorAll('.aidk')).toHaveLength(1);
    expect(container.querySelector('.ai-card-stage')).toBeNull();
    expect(screen.getByText('Première réponse.')).toBeTruthy();
    expect(screen.getByText('Dernière réponse.')).toBeTruthy();
  });

  it('« Compris » sur une alerte la marque vue, et ferme la fenêtre entière', async () => {
    stage([
      answer('a', 'Une réponse.'),
      { id: 'd'.repeat(32), kind: 'alert', title: 'Contradiction avec le projet', state: 'open' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: t.acknowledge }));
    expect(get(store.aiHelp).items.map((item) => item.state)).toEqual([
      'dismissed',
      'acknowledged',
    ]);
  });

  it('Échap, le focus dans la fenêtre : elle se ferme', async () => {
    stage([answer('a', 'Une réponse.')]);
    screen.getByRole('button', { name: t.dismissLabel }).focus();
    await userEvent.keyboard('{Escape}');
    expect(get(store.aiHelpOpenItems)).toEqual([]);
  });

  it('un bandeau SEUL — question refusée, réponses coupées : il se lit, sans carte, et se ferme', async () => {
    const { container, component } = stage([]);
    const sizes = [];
    component.$on('resize', (event) => sizes.push(event.detail));
    store.aiHelp.update((s) => ({ ...s, notice: 'questions_off' }));
    const text = t.notices.questions_off.replace('{name}', 'Alfred');
    const banner = await screen.findByRole('button', { name: text });
    expect(container.querySelector('.ai-card')).toBeNull();

    await userEvent.click(banner);
    expect(get(store.aiHelp).notice).toBe('');
    expect(container.querySelector('.ais')).toBeNull();
    expect(sizes.at(-1)).toBe(0);
  });
});

describe('AiHelpStage — les corrections de la transcription', () => {
  const LINES = [
    { itemId: 'l1', text: 'On livre chez Market le 12 mars.' },
    { itemId: 'l2', text: 'Market a validé le devis.' },
    { itemId: 'l3', text: 'Alfred, remplace partout Market par Marquet.' },
    { itemId: 'l4', text: 'Et chez Wirk', isDelta: true },
  ];

  // Des lignes arrivent : la ligne « Alfred, … » peut partir en question, et une
  // lecture du passage suit. Le serveur n'a rien à en dire ici.
  beforeEach(() => {
    api.askAiHelp.mockResolvedValue({ ok: true, status: 200, data: { item: null, actions: [] } });
    api.watchAiHelp.mockResolvedValue({ ok: true, status: 200, data: { items: [] } });
  });

  it('une correction en attente devient des événements `edit`, une ligne à la fois, et la file se vide', async () => {
    seed([]);
    const { component } = render(AiHelpStage, { items: LINES });
    const edits = [];
    component.$on('edit', (event) => edits.push(event.detail));

    store.aiHelpEdits.set([{ find: 'Market', with: 'Marquet', all: true, skipKey: 'l3' }]);
    await vi.waitFor(() => expect(edits).toHaveLength(2));
    expect(edits).toEqual([
      { index: 0, text: 'On livre chez Marquet le 12 mars.' },
      { index: 1, text: 'Marquet a validé le devis.' },
    ]);
    expect(get(store.aiHelpEdits)).toEqual([]);
  });

  it('une phrase adressée à l’IA plus tôt n’est pas réécrite ; un passage absent ne rend rien', async () => {
    seed([]);
    const { component } = render(AiHelpStage, { items: LINES });
    store.aiHelpCalledLines.set(new Set(['l3']));
    const edits = [];
    component.$on('edit', (event) => edits.push(event.detail));

    // Demandé par écrit : aucune ligne n'a porté la demande.
    store.aiHelpEdits.set([
      { find: 'Globex', with: 'Initech', all: true, skipKey: '' },
      { find: 'Market', with: 'Marquet', all: false, skipKey: '' },
    ]);
    await vi.waitFor(() => expect(get(store.aiHelpEdits)).toEqual([]));
    expect(edits).toEqual([{ index: 1, text: 'Marquet a validé le devis.' }]);
    store.aiHelpCalledLines.set(new Set());
  });
});

describe('AiHelpStage — ce que l’IA a fait, dit par myBrief', () => {
  const done = (acts) => ({ id: 'e'.repeat(32), kind: 'answer', body: '', state: 'open', acts });
  const lines = (container) =>
    [...container.querySelectorAll('.ai-card-acts li')].map((li) => li.textContent.trim());

  it('pause, reprise, fin : une ligne chacune ; sans objet, le geste est dit en défaut', () => {
    const { container } = stage([
      done([
        { type: 'meeting', do: 'pause', ok: true },
        { type: 'meeting', do: 'pause', ok: false },
        { type: 'meeting', do: 'resume', ok: false },
        { type: 'meeting', do: 'end', ok: true },
      ]),
    ]);
    expect(lines(container)).toEqual([
      'Réunion mise en pause. Alfred n’entend plus rien : reprenez par « Reprendre », ou demandez-le-lui par écrit.',
      t.acts.pauseNoop,
      t.acts.resumeNoop,
      t.acts.end,
    ]);
    expect(container.querySelectorAll('.ai-card-act-failed')).toHaveLength(2);
  });

  it('le compte rendu : tout de suite ou commandé, avec ou sans template ; un nom inconnu est dit', () => {
    const { container } = stage([
      done([
        { type: 'summary', template: 'Standard', when: 'now', ok: true },
        { type: 'summary', template: '', when: 'end', ok: true },
        { type: 'summary', template: 'Codir', when: 'now', ok: false },
      ]),
    ]);
    expect(lines(container)).toEqual([
      'Réunion terminée : compte rendu rédigé avec le template « Standard ».',
      t.acts.summaryLaterDefault,
      'Aucun template ne s’appelle « Codir » : rien n’a été lancé.',
    ]);
  });

  it('la transcription : remplacé, remplacé partout, retiré — ou introuvable', () => {
    const { container } = stage([
      done([
        { type: 'replace', find: 'le 2', with: 'le 12', all: false, ok: true },
        { type: 'replace', find: 'Market', with: 'Marquet', all: true, ok: true },
        { type: 'replace', find: 'euh', with: '', all: true, ok: true },
        { type: 'replace', find: 'Globex', with: 'Initech', all: false, ok: false },
      ]),
    ]);
    expect(lines(container)).toEqual([
      'Transcription corrigée : « le 2 » remplacé par « le 12 ».',
      'Transcription corrigée : « Market » remplacé partout par « Marquet ».',
      'Transcription corrigée : « euh » retiré.',
      '« Globex » ne figure pas dans la transcription : rien n’a été changé.',
    ]);
  });
});

describe('AiHelpStage — la taille de la fenêtre', () => {
  const scale = (container) => container.querySelector('.ais').style.getPropertyValue('--ai-scale');

  it('A+ et A− la font passer par trois crans, bornés', async () => {
    const { container } = stage([answer('a', 'Une réponse.')]);
    const bigger = screen.getByRole('button', { name: t.sizeUp });
    const smaller = screen.getByRole('button', { name: t.sizeDown });
    // Au départ : le plus petit cran — on ne peut qu'agrandir.
    expect(scale(container)).toBe('1');
    expect(smaller.disabled).toBe(true);

    await userEvent.click(bigger);
    expect(container.querySelector('.ais').classList.contains('ais-size-1')).toBe(true);
    expect(Number(scale(container))).toBeGreaterThan(1);
    await userEvent.click(bigger);
    expect(container.querySelector('.ais').classList.contains('ais-size-2')).toBe(true);
    expect(bigger.disabled).toBe(true);

    await userEvent.click(smaller);
    expect(get(store.aiHelpSize)).toBe(1);
  });

  it('la conversation porte les mêmes boutons, et la même taille', async () => {
    store.aiHelpSize.set(1);
    const { container } = stage([]);
    store.aiHelpDeskOpen.set(true);
    await screen.findByRole('button', { name: t.sizeUp });
    expect(container.querySelector('.ais').classList.contains('ais-size-1')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: t.sizeDown }));
    expect(get(store.aiHelpSize)).toBe(0);
  });
});

describe('AiHelpStage — relier le tag de la réunion à son projet', () => {
  const ATLAS = { path: 'wiki/projets/atlas.md', title: 'Projet Atlas', source: 'chosen' };
  let meeting = 0;

  /** La réunion porte le tag Atlas, et son projet vient d'être choisi. */
  function tagged(items = [], tag = { id: 't1', label: 'Atlas' }) {
    meeting += 1;
    tags.set([tag]);
    seed(items);
    store.aiHelp.update((s) => ({
      ...s,
      meetingId: `tag-${meeting}`,
      myBrain: true,
      project: ATLAS,
    }));
    historyItems.set([{ meetingId: `tag-${meeting}`, tagId: 't1' }]);
    return render(AiHelpStage, { items: [] });
  }

  afterEach(() => {
    historyItems.set([]);
    tags.set([]);
    store.aiHelp.update((s) => ({ ...s, project: null, myBrain: false }));
  });

  it('le propose une fois le projet connu, et « Relier » écrit le lien', async () => {
    api.saveAiHelpTagProject.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tagId: 't1', project: ATLAS },
    });
    const { container } = tagged();
    expect(screen.getByText(t.tagLinkTitle.replace('{tag}', 'Atlas'))).toBeTruthy();
    expect(screen.getByText(/Projet Atlas/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: t.tagLinkYes }));
    expect(api.saveAiHelpTagProject).toHaveBeenCalledWith('t1', ATLAS.path);
    expect(get(tags)[0].myBrainProject).toEqual(ATLAS);
    expect(container.querySelector('.ai-card')).toBeNull();
  });

  it('rien quand le tag mène déjà à ce projet', () => {
    const { container } = tagged([], { id: 't1', label: 'Atlas', myBrainProject: ATLAS });
    expect(container.querySelector('.ai-card')).toBeNull();
  });

  it('« Pas maintenant » la range sans rien écrire', async () => {
    const { container } = tagged();
    await userEvent.click(screen.getByRole('button', { name: t.tagLinkNo }));
    expect(api.saveAiHelpTagProject).not.toHaveBeenCalled();
    expect(container.querySelector('.ai-card')).toBeNull();
  });

  it('un échec est dit sur la carte, qui reste', async () => {
    api.saveAiHelpTagProject.mockResolvedValue({
      ok: false,
      status: 502,
      data: { error: 'mybrain_unreachable' },
    });
    tagged();
    await userEvent.click(screen.getByRole('button', { name: t.tagLinkYes }));
    expect(await screen.findByText(t.tagLinkFailed)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.tagLinkYes })).toBeTruthy();
  });

  it('une intervention ouverte passe devant : la proposition attend', async () => {
    tagged([answer('a', 'Une réponse.')]);
    expect(screen.getByText('Une réponse.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.tagLinkYes })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: t.dismissLabel }));
    expect(screen.getByRole('button', { name: t.tagLinkYes })).toBeTruthy();
  });
});
