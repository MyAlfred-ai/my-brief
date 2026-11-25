/**
 * La pastille de l'Aide IA dans le dock.
 *
 * Ce qui compte ici : le mot d'appel se lit à côté de l'orbe, et seulement
 * quand il déclenche quelque chose ; les domaines ne tiennent plus dans la
 * pastille — un seul bouton ouvre leur menu, où chacun porte son nom et son
 * état — ; et ce menu se referme sans qu'on ait à le chercher.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

const ALL = { project: true, qa: true, agenda: true, ideas: true };

// Le serveur rend le réglage tel qu'il vient de l'enregistrer.
vi.mock('../../services/aiHelpApi.js', () => ({
  fetchAiHelp: vi.fn(),
  saveAiHelpSession: vi.fn(async (body) => ({
    ok: true,
    status: 200,
    data: {
      session: {
        enabled: body.enabled !== false,
        domains: body.domains || { project: true, qa: true, agenda: true, ideas: true },
        agendaState: [],
        project: null,
        projectDeclined: false,
        items: [],
      },
      candidates: [],
    },
  })),
  watchAiHelp: vi.fn(),
  askAiHelp: vi.fn(),
  saveAiHelpItemState: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  searchAiHelpProjects: vi.fn(),
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
const chime = await import('../../utils/chime.js');
const { uiTextData } = await import('../../config/uiText.js');
const store = await import('../../stores/aiHelp.js');
const AiHelpPill = (await import('./AiHelpPill.svelte')).default;

const t = uiTextData.fr.aiHelp;

function pill(over = {}) {
  store.aiHelp.update((s) => ({
    ...s,
    loaded: true,
    available: true,
    allowed: ALL,
    domains: ALL,
    enabled: true,
    wakeWord: 'Alfred',
    meetingId: 'm1',
    items: [],
    pending: [],
    ...over,
  }));
  return render(AiHelpPill);
}
const tuneButton = () => screen.getByRole('button', { name: /Choisir ce que suit l’Aide IA/ });

beforeEach(() => {
  vi.clearAllMocks();
  store.aiHelpDeskOpen.set(false);
});

describe('AiHelpPill — le mot d’appel', () => {
  it('se lit sous « Aide IA », et l’orbe dit comment s’en servir', () => {
    const { container } = pill();
    expect(container.querySelector('.aip-wake').textContent).toBe('« Alfred, … »');
    const orb = screen.getByRole('button', { name: /Aide IA activée/ });
    expect(orb.getAttribute('aria-label')).toContain('commencez votre phrase par « Alfred »');
    expect(orb.title).toContain('commencez votre phrase par « Alfred »');
  });

  it('ne s’écrit que s’il déclenche quelque chose : pas éteinte — mais sans les questions, oui', () => {
    const off = pill({ enabled: false });
    expect(off.container.querySelector('.aip-wake')).toBeNull();
    expect(screen.getByRole('button', { name: t.pillOff })).toBeTruthy();
    off.unmount();

    // Questions-réponses coupées : « Alfred, … » fait encore les gestes.
    const commands = pill({ domains: { ...ALL, qa: false } });
    expect(commands.container.querySelector('.aip-wake').textContent).toBe('« Alfred, … »');
    commands.unmount();

    // Les questions pas proposées à ce compte : pareil.
    const barred = pill({ allowed: { ...ALL, qa: false } });
    expect(barred.container.querySelector('.aip-wake')).toBeTruthy();
  });
});

describe('AiHelpPill — les domaines, derrière un bouton', () => {
  it('aucun domaine dans la pastille ; le menu les nomme, avec ce qu’ils font et leur état', async () => {
    const { container } = pill({ domains: { ...ALL, ideas: false } });
    expect(container.querySelector('.aid-item')).toBeNull();
    expect(screen.queryByText(t.domains.project.title)).toBeNull();

    await userEvent.click(tuneButton());
    expect(tuneButton().getAttribute('aria-expanded')).toBe('true');
    const rows = container.querySelectorAll('.aip-menu .aid-item');
    expect([...rows].map((row) => row.querySelector('.aid-title').textContent)).toEqual([
      t.domains.project.title,
      t.domains.qa.title,
      t.domains.agenda.title,
      t.domains.ideas.title,
    ]);
    expect(screen.getByText(t.domains.agenda.hint)).toBeTruthy();
    expect([...rows].map((row) => row.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'true',
      'false',
    ]);
  });

  it('un clic sur une ligne bascule le domaine, et le réglage part', async () => {
    pill();
    await userEvent.click(tuneButton());
    await userEvent.click(screen.getByRole('button', { name: new RegExp(t.domains.agenda.title) }));

    expect(get(store.aiHelp).domains.agenda).toBe(false);
    expect(api.saveAiHelpSession).toHaveBeenCalledWith(
      expect.objectContaining({ domains: { ...ALL, agenda: false } }),
    );
    // Le menu reste ouvert : on peut en couper un second.
    expect(tuneButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('un domaine coupé se voit sans ouvrir le menu : un point, et le compte dans l’infobulle', () => {
    const { container } = pill({ domains: { ...ALL, ideas: false, project: false } });
    expect(container.querySelector('.aip-tune-dot')).toBeTruthy();
    expect(tuneButton().getAttribute('aria-label')).toBe(
      'Choisir ce que suit l’Aide IA — 2 domaines sur 4 activés',
    );
  });

  it('tous allumés : aucun point ; un domaine non proposé au compte ne compte pas', () => {
    const { container } = pill({
      allowed: { ...ALL, project: false },
      domains: { ...ALL, project: false },
    });
    expect(container.querySelector('.aip-tune-dot')).toBeNull();
    expect(tuneButton().getAttribute('aria-label')).toBe(t.domainsOpen);
  });

  it('se referme par Échap — le focus revient au bouton —, par un clic ailleurs, ou quand l’IA s’éteint', async () => {
    const { container } = pill();
    const menu = () => container.querySelector('.aip-menu');

    await userEvent.click(tuneButton());
    expect(menu()).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(tuneButton());

    await userEvent.click(tuneButton());
    await userEvent.click(document.body);
    expect(menu()).toBeNull();

    await userEvent.click(tuneButton());
    await userEvent.click(screen.getByRole('button', { name: /Aide IA activée/ }));
    expect(menu()).toBeNull();
    expect(get(store.aiHelp).enabled).toBe(false);
  });

  it('« Demander » ouvre toujours la conversation, avec le nombre d’interventions en attente', async () => {
    pill({ items: [{ id: 'a'.repeat(32), kind: 'idea', title: 'Une idée', state: 'open' }] });
    const ask = screen.getByRole('button', { name: new RegExp(t.ask) });
    expect(ask.textContent).toContain('1');
    await userEvent.click(ask);
    expect(get(store.aiHelpDeskOpen)).toBe(true);
  });
});

describe('AiHelpPill — le son de la réunion', () => {
  it('un clic coupe le son de CETTE réunion, sans rien envoyer ; un autre le rétablit', async () => {
    pill({ sound: true });
    const user = userEvent.setup();
    const calls = api.saveAiHelpSession.mock.calls.length;
    await user.click(screen.getByRole('button', { name: t.soundMute }));
    expect(get(store.aiHelp).sound).toBe(false);
    expect(api.saveAiHelpSession.mock.calls).toHaveLength(calls);
    expect(screen.getByRole('status').textContent).toBe(t.soundMuted);

    const back = screen.getByRole('button', { name: t.soundUnmute });
    expect(back.getAttribute('aria-pressed')).toBe('true');
    await user.click(back);
    expect(get(store.aiHelp).sound).toBe(true);
    expect(chime.playAck).toHaveBeenCalled();
  });

  it('verrouillé par le navigateur : le clic déverrouille, sans couper', async () => {
    chime.aiHelpAudioLocked.set(true);
    pill({ sound: true });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t.soundLocked }));
    expect(chime.unlockAiHelpAudio).toHaveBeenCalled();
    expect(get(store.aiHelp).sound).toBe(true);
    chime.aiHelpAudioLocked.set(false);
  });
});
