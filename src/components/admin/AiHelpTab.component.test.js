/**
 * Administration → Aide IA. Ce que l'onglet doit rendre évident : régler les
 * domaines ne donne l'Aide IA à personne. Sans la carte « Qui y a droit », un
 * administrateur voyait ses domaines allumés, myBrain en vert, et cherchait
 * l'Aide IA dans une réunion où elle ne pouvait pas apparaître (recette,
 * 2026-11-12).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const fetchAiHelpAdminSettings = vi.fn();
const saveAiHelpAdminSettings = vi.fn();
const testAiHelpReading = vi.fn();
const listGroups = vi.fn();
const selectPanelSection = vi.fn();
vi.mock('../../services/aiHelpApi.js', () => ({
  fetchAiHelpAdminSettings: (...args) => fetchAiHelpAdminSettings(...args),
  saveAiHelpAdminSettings: (...args) => saveAiHelpAdminSettings(...args),
  testAiHelpReading: (...args) => testAiHelpReading(...args),
}));
vi.mock('../../services/adminGroupsApi.js', () => ({
  listGroups: (...args) => listGroups(...args),
}));
vi.mock('../../stores/panels.js', async (original) => ({
  ...(await original()),
  selectPanelSection: (...args) => selectPanelSection(...args),
}));

const { uiTextData } = await import('../../config/uiText.js');
const { auth } = await import('../../stores/auth.js');
const AiHelpTab = (await import('./AiHelpTab.svelte')).default;

const t = uiTextData.fr.adminAiHelp;
const ok = (data) => ({ ok: true, status: 200, data });
const settings = {
  domains: { project: true, qa: true, agenda: true, ideas: true },
  wakeWord: 'Alfred',
  pace: 'normal',
};
const group = (id, over = {}) => ({ id, name: id, color: 'slate', aiHelpAllowed: false, ...over });

function mount({ groups, canRead = true, myGroup = 'admin', me }) {
  fetchAiHelpAdminSettings.mockResolvedValue(
    ok({ settings, myBrain: { connected: true, canRead }, ...(me ? { me } : {}) }),
  );
  listGroups.mockResolvedValue(ok({ groups }));
  auth.update((s) => ({
    ...s,
    status: 'authenticated',
    user: { email: 'patron@exemple.test', role: 'admin', groups: [{ id: myGroup, name: myGroup }] },
  }));
  return render(AiHelpTab);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiHelpTab — qui y a droit', () => {
  it('aucun groupe : le dit en toutes lettres, et mène à Groupes', async () => {
    mount({ groups: [group('default'), group('admin')] });
    expect(await screen.findByText(t.accessNone)).toBeTruthy();
    expect(screen.getByText(t.accessNoneBadge)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: t.accessOpenGroups }));
    expect(selectPanelSection).toHaveBeenCalledWith('groups');
  });

  it('des groupes l’ont : ils sont nommés, avec ce qu’ils lisent de myBrain', async () => {
    mount({
      groups: [
        group('default'),
        group('admin', { name: 'Admin', aiHelpAllowed: true, aiHelpMyBrainAllowed: true }),
        group('pilots', { name: 'Pilotes', aiHelpAllowed: true }),
      ],
    });
    expect(await screen.findByText(t.accessSome)).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('Pilotes')).toBeTruthy();
    expect(screen.getAllByText(t.accessWithBrain)).toHaveLength(1);
    expect(screen.queryByText(t.accessNone)).toBeNull();
    expect(screen.queryByText(t.accessNotYou)).toBeNull();
  });

  it('l’administrateur hors des groupes servis est prévenu qu’il ne la verra pas', async () => {
    mount({ groups: [group('admin'), group('pilots', { name: 'Pilotes', aiHelpAllowed: true })] });
    expect(await screen.findByText(t.accessNotYou)).toBeTruthy();
  });

  it('son groupe a l’Aide IA mais pas myBrain : c’est dit, avec le nom du droit qui manque', async () => {
    // Le défaut vu en recette : tout paraît réglé, et l'IA ne consulte pas myBrain.
    mount({
      groups: [group('admin', { name: 'Admin', aiHelpAllowed: true })],
      me: { available: true, myBrain: false, reason: 'no_group_right' },
    });
    expect(await screen.findByText(t.meReasons.no_group_right)).toBeTruthy();
    expect(screen.queryByText(t.meOk)).toBeNull();
    expect(screen.queryByText(t.accessNotYou)).toBeNull();
  });

  it('tout est en place pour son compte : l’onglet le confirme', async () => {
    mount({
      groups: [group('admin', { name: 'Admin', aiHelpAllowed: true, aiHelpMyBrainAllowed: true })],
      me: { available: true, myBrain: true, reason: 'ok' },
    });
    expect(await screen.findByText(t.meOk)).toBeTruthy();
  });
});

describe('AiHelpTab — réglages', () => {
  it('n’envoie que ce qui a changé', async () => {
    saveAiHelpAdminSettings.mockResolvedValue(
      ok({ settings: { ...settings, pace: 'quiet' }, myBrain: { connected: true, canRead: true } }),
    );
    mount({ groups: [] });
    await userEvent.click(await screen.findByRole('radio', { name: t.paces.quiet.label }));
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    expect(saveAiHelpAdminSettings).toHaveBeenCalledWith({ pace: 'quiet' });
  });

  it('sans le droit « lire » sur la clé : le garde-fou du projet est verrouillé, et on dit pourquoi', async () => {
    mount({ groups: [], canRead: false });
    expect(await screen.findByText(t.domainLocked)).toBeTruthy();
    expect(screen.getByText(t.brainNoRead)).toBeTruthy();
  });
});

describe('AiHelpTab — tester la lecture de myBrain', () => {
  const ask = async (question) => {
    await userEvent.type(await screen.findByLabelText(t.testTitle), question);
    await userEvent.click(screen.getByRole('button', { name: t.testButton }));
  };

  it('montre les fiches que myBrain rend, et leur extrait', async () => {
    testAiHelpReading.mockResolvedValue(
      ok({
        canRead: true,
        ms: 420,
        keywords: 'AMBRE',
        context: {
          ok: true,
          sheets: ['Projet AMBRE'],
          chars: 900,
          truncated: false,
          excerpt: 'Migration ERP.',
        },
        search: { ok: true, results: [{ title: 'Projet AMBRE', type: 'projet' }] },
      }),
    );
    mount({ groups: [] });
    await ask('C’est quoi le projet AMBRE ?');
    expect(testAiHelpReading).toHaveBeenCalledWith('C’est quoi le projet AMBRE ?');
    expect(await screen.findByText('myBrain a rendu 1 fiche en 420 ms :')).toBeTruthy();
    expect(screen.getByText('Migration ERP.')).toBeTruthy();
    expect(screen.getAllByText(/Projet AMBRE/).length).toBeGreaterThan(0);
  });

  it('aucune fiche : le dit, avec ce que trouve la recherche par mots-clés', async () => {
    testAiHelpReading.mockResolvedValue(
      ok({
        canRead: true,
        ms: 300,
        keywords: 'AMBRE',
        context: { ok: true, sheets: [], chars: 0, truncated: false, excerpt: '' },
        search: { ok: true, results: [] },
      }),
    );
    mount({ groups: [] });
    await ask('AMBRE ?');
    expect(await screen.findByText(/myBrain n’a rendu aucune fiche/)).toBeTruthy();
    expect(screen.getByText(/aucune fiche trouvée/)).toBeTruthy();
  });

  it('un refus de myBrain s’affiche avec sa raison', async () => {
    testAiHelpReading.mockResolvedValue(
      ok({
        canRead: false,
        ms: 80,
        keywords: 'AMBRE',
        context: { ok: false, error: 'mybrain_right_missing', upstreamStatus: 403 },
        search: { ok: false, error: 'mybrain_inconnu', upstreamMessage: 'message de myBrain' },
      }),
    );
    mount({ groups: [] });
    await ask('AMBRE ?');
    expect(
      await screen.findByText(`myBrain a refusé cette lecture : ${t.errors.mybrain_right_missing}`),
    ).toBeTruthy();
    expect(screen.getByText('myBrain a refusé cette lecture : message de myBrain')).toBeTruthy();
  });
});

describe('AiHelpTab — textes', () => {
  it('chaque clé existe en français ET en anglais', () => {
    const keys = (o) =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k],
      );
    expect(keys(uiTextData.en.adminAiHelp)).toEqual(keys(uiTextData.fr.adminAiHelp));
    expect(keys(uiTextData.en.aiHelp)).toEqual(keys(uiTextData.fr.aiHelp));
  });
});
