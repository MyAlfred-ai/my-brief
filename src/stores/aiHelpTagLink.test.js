/**
 * Relier le tag de la réunion au projet que l'Aide IA y a retenu
 * (stores/aiHelpTagLink.js) — API simulée.
 *
 * Garanties tenues ici :
 *   - la proposition n'existe que si la réunion porte un tag et que son projet
 *     est connu ; jamais quand le tag mène déjà à ce projet ;
 *   - un tag relié à un AUTRE projet se propose aussi, en le disant : c'est la
 *     façon de corriger un lien faux ;
 *   - « Relier » écrit par la route du serveur, puis la liste des tags le sait ;
 *   - un échec garde la proposition et rend le slug, rattaché à elle ;
 *   - « Pas maintenant » ne vaut que pour ce projet : en changer repropose.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../services/aiHelpApi.js', () => ({
  fetchAiHelp: vi.fn(async () => ({ ok: false, status: 0, data: {} })),
  saveAiHelpSession: vi.fn(),
  watchAiHelp: vi.fn(),
  askAiHelp: vi.fn(),
  saveAiHelpItemState: vi.fn(),
  searchAiHelpProjects: vi.fn(),
  saveAiHelpPreferences: vi.fn(),
  fetchAiHelpVoices: vi.fn(),
  saveAiHelpTagProject: vi.fn(),
}));
vi.mock('../utils/chime.js', () => ({
  playChime: vi.fn(),
  playBell: vi.fn(),
  playAck: vi.fn(),
  playTimerMelody: vi.fn(),
}));
vi.mock('../lib/aiHelp/voice.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    aiHelpSpeaking: writable(false),
    stopSpeaking: vi.fn(),
    recentSpeech: vi.fn(() => []),
  };
});
// store.js lit `localStorage` à l'import : absent hors navigateur.
vi.mock('../store.js', async () => {
  const { writable } = await import('svelte/store');
  return { currentLanguageStore: writable('fr') };
});

const api = await import('../services/aiHelpApi.js');
const { aiHelp } = await import('./aiHelp.js');
const { historyItems } = await import('./history.js');
const { tags } = await import('./tags.js');
const { aiHelpTagLink, aiHelpTagLinkStatus, linkAiHelpTag, skipAiHelpTagLink } =
  await import('./aiHelpTagLink.js');

const ATLAS = { path: 'wiki/projets/atlas.md', title: 'Projet Atlas' };
const BORA = { path: 'wiki/projets/bora.md', title: 'Projet Bora' };

// Une réunion neuve par test : ce qui est réglé (relié, écarté) l'est pour
// une réunion, et le module le garde d'un test à l'autre.
let current = 0;

/** Une réunion en cours, taguée `tagId`, dont le projet est `project`. */
function meeting({ project = ATLAS, tagId = 't1', meetingId = `m${current}` } = {}) {
  aiHelp.update((s) => ({ ...s, meetingId, enabled: true, myBrain: true, project }));
  historyItems.set([{ meetingId, tagId }]);
}

beforeEach(() => {
  current += 1;
  vi.clearAllMocks();
  aiHelpTagLinkStatus.set({ key: '', busy: false, error: '' });
  tags.set([{ id: 't1', label: 'Atlas' }]);
  historyItems.set([]);
  aiHelp.update((s) => ({ ...s, meetingId: null, project: null, enabled: false }));
});

describe('la proposition', () => {
  it('naît quand la réunion porte un tag non relié et que son projet est connu', () => {
    meeting();
    expect(get(aiHelpTagLink)).toMatchObject({
      tagId: 't1',
      tag: 'Atlas',
      path: ATLAS.path,
      project: 'Projet Atlas',
      linked: '',
    });
  });

  it("n'existe pas sans tag, sans projet, sans myBrain, ou Aide IA éteinte", () => {
    meeting({ tagId: null });
    expect(get(aiHelpTagLink)).toBeNull();
    meeting({ project: null });
    expect(get(aiHelpTagLink)).toBeNull();
    meeting();
    aiHelp.update((s) => ({ ...s, myBrain: false }));
    expect(get(aiHelpTagLink)).toBeNull();
    meeting();
    aiHelp.update((s) => ({ ...s, enabled: false }));
    expect(get(aiHelpTagLink)).toBeNull();
  });

  it("n'existe pas quand le tag mène déjà à ce projet", () => {
    tags.set([{ id: 't1', label: 'Atlas', myBrainProject: ATLAS }]);
    meeting();
    expect(get(aiHelpTagLink)).toBeNull();
  });

  it('dit à quel projet le tag mène encore, quand il en mène à un autre', () => {
    tags.set([{ id: 't1', label: 'Atlas', myBrainProject: BORA }]);
    meeting();
    expect(get(aiHelpTagLink)).toMatchObject({ linked: 'Projet Bora', project: 'Projet Atlas' });
  });
});

describe('Relier', () => {
  it('écrit le lien par la route du serveur, puis la liste des tags le sait', async () => {
    api.saveAiHelpTagProject.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tagId: 't1', project: ATLAS },
    });
    meeting();
    await expect(linkAiHelpTag()).resolves.toEqual({ ok: true });
    expect(api.saveAiHelpTagProject).toHaveBeenCalledWith('t1', ATLAS.path);
    expect(get(tags)[0].myBrainProject).toEqual(ATLAS);
    expect(get(aiHelpTagLink)).toBeNull();
  });

  it('en échec, garde la proposition et rend le slug, rattaché à elle', async () => {
    api.saveAiHelpTagProject.mockResolvedValue({
      ok: false,
      status: 502,
      data: { error: 'mybrain_unreachable' },
    });
    meeting();
    const { key } = get(aiHelpTagLink);
    await expect(linkAiHelpTag()).resolves.toEqual({ ok: false, error: 'mybrain_unreachable' });
    expect(get(aiHelpTagLink)).not.toBeNull();
    expect(get(aiHelpTagLinkStatus)).toEqual({ key, busy: false, error: 'mybrain_unreachable' });
    expect(get(tags)[0].myBrainProject).toBeUndefined();
  });

  it("ne part pas deux fois pendant qu'un lien s'écrit", async () => {
    let finish;
    api.saveAiHelpTagProject.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    meeting();
    const first = linkAiHelpTag();
    await expect(linkAiHelpTag()).resolves.toEqual({ ok: false, error: 'busy' });
    finish({ ok: true, status: 200, data: { tagId: 't1', project: ATLAS } });
    await first;
    expect(api.saveAiHelpTagProject).toHaveBeenCalledTimes(1);
  });
});

describe('Pas maintenant', () => {
  it('ne vaut que pour ce projet, dans cette réunion', () => {
    meeting();
    skipAiHelpTagLink();
    expect(get(aiHelpTagLink)).toBeNull();
    expect(api.saveAiHelpTagProject).not.toHaveBeenCalled();
    // Le projet change : la question revient, pour lui.
    meeting({ project: BORA });
    expect(get(aiHelpTagLink)).toMatchObject({ path: BORA.path });
    // La réunion suivante, même tag, même projet : elle revient aussi.
    meeting({ meetingId: `m${current}-suivante` });
    expect(get(aiHelpTagLink)).toMatchObject({ path: ATLAS.path });
  });
});
