/**
 * « Ma configuration → MyBrain ».
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - imposé par l'administration, l'interrupteur est allumé ET verrouillé,
 *     avec la raison — un envoi invisible serait une surprise ;
 *   - au choix, l'interrupteur s'enregistre à l'instant ;
 *   - « Derniers envois » dit ce qui est parti, et une réunion peut-être
 *     arrivée (délai dépassé) le dit avant qu'on la réessaie.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';
import { resetMyBrain } from '../../stores/myBrain.js';

const fetchMyBrainSettings = vi.fn();
const saveMyBrainSettings = vi.fn();
const retryMyBrainSend = vi.fn();

vi.mock('../../services/myBrainApi.js', () => ({
  fetchMyBrainSettings: (...args) => fetchMyBrainSettings(...args),
  saveMyBrainSettings: (...args) => saveMyBrainSettings(...args),
  retryMyBrainSend: (...args) => retryMyBrainSend(...args),
}));

const { default: MyBrainSection } = await import('./MyBrainSection.svelte');

const t = uiTextData.fr.configMyBrain;

const view = (over = {}) => ({
  available: true,
  policy: 'optin',
  enabled: false,
  active: false,
  reviewUrl: 'https://cerveau.example.test/revue',
  recent: [],
  ...over,
});

async function renderSection(over = {}) {
  fetchMyBrainSettings.mockResolvedValue({ ok: true, data: view(over) });
  render(MyBrainSection);
  return screen.findByLabelText(t.toggleLabel);
}

describe('MyBrainSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMyBrain();
  });

  it("imposé : l'interrupteur est allumé, verrouillé, et dit pourquoi", async () => {
    const toggle = await renderSection({ policy: 'forced', active: true });
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText(t.forcedNote)).toBeTruthy();
    expect(screen.getByText(t.statusForced)).toBeTruthy();
  });

  it("au choix : l'interrupteur s'enregistre à l'instant", async () => {
    const toggle = await renderSection();
    expect(toggle.checked).toBe(false);
    saveMyBrainSettings.mockResolvedValue({
      ok: true,
      data: view({ enabled: true, active: true }),
    });

    await userEvent.click(toggle);

    expect(saveMyBrainSettings).toHaveBeenCalledWith(true);
    expect(await screen.findByText(t.statusOn)).toBeTruthy();
    expect(toggle.checked).toBe(true);
  });

  it('un enregistrement refusé remet l’interrupteur sur l’état réel', async () => {
    const toggle = await renderSection();
    saveMyBrainSettings.mockResolvedValue({
      ok: false,
      status: 409,
      data: { error: 'mybrain_policy_forced' },
    });

    await userEvent.click(toggle);

    expect((await screen.findByRole('alert')).textContent).toContain(
      t.errors.mybrain_policy_forced,
    );
    expect(toggle.checked).toBe(false);
  });

  it('les derniers envois : arrivé, et échec ambigu à vérifier avant de réessayer', async () => {
    await renderSection({
      active: true,
      enabled: true,
      recent: [
        {
          meetingId: 'm-1',
          title: 'Budget 2026',
          status: 'sent',
          sentAt: '2026-09-15T12:30:00.000Z',
          parts: 3,
        },
        {
          meetingId: 'm-2',
          title: 'Chantier Alpha',
          status: 'error',
          error: 'mybrain_timeout',
          retryable: false,
          ambiguous: true,
          updatedAt: '2026-09-15T13:00:00.000Z',
        },
      ],
    });

    expect(screen.getByText('Budget 2026')).toBeTruthy();
    expect(screen.getByText(/en 3 parties/)).toBeTruthy();
    expect(screen.getByText(new RegExp(t.errors.mybrain_timeout))).toBeTruthy();
    expect(screen.getByText(new RegExp(t.ambiguous))).toBeTruthy();

    retryMyBrainSend.mockResolvedValue({
      ok: true,
      data: view({
        active: true,
        enabled: true,
        recent: [{ meetingId: 'm-2', title: 'Chantier Alpha', status: 'sent', parts: 1 }],
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: t.retry }));

    expect(retryMyBrainSend).toHaveBeenCalledWith('m-2');
    expect(await screen.findByText(t.retried)).toBeTruthy();
  });

  it('mène à la revue de myBrain, où attendent les réunions envoyées', async () => {
    await renderSection();
    const link = screen.getByRole('link', { name: t.openReview });
    expect(link.getAttribute('href')).toBe('https://cerveau.example.test/revue');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
