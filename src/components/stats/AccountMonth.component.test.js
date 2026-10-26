/**
 * « Ce mois-ci » — le bloc du menu de compte qui résume « Mes statistiques ».
 *
 * Ce qui casserait sans ces tests : un crédit qui attend le réseau pour
 * s'afficher (il est déjà dans le store) ; un reste figé pendant qu'on
 * enregistre ; une barre qui montre le consommé au lieu du reste (l'anneau et
 * la jauge montrent le reste) ; un « Épuisé » sans le mois de renouvellement ;
 * un rythme affiché sur un crédit épuisé ; un compte sans quota sans rien ; un
 * menu qui crie une erreur réseau ; les chiffres du compte précédent montrés au
 * suivant (cache par adresse) ; un lien qui n'ouvre plus la page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tick } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const fetchMyStats = vi.fn();
vi.mock('../../services/statsApi.js', () => ({
  fetchMyStats: (...args) => fetchMyStats(...args),
  fetchTeamCredits: vi.fn(),
  fetchAccountStats: vi.fn(),
}));

const { default: AccountMonth } = await import('./AccountMonth.svelte');
const { auth } = await import('../../stores/auth.js');
const { applyQuota, resetQuota } = await import('../../stores/quota.js');
const { liveElapsedStore } = await import('../../stores/recording.js');

// Bornes telles que le serveur les rend : minuit à Paris, soit 22 h UTC la veille.
const SEPTEMBER = {
  start: '2026-08-31T22:00:00.000Z',
  end: '2026-09-30T22:00:00.000Z',
  timeZone: 'Europe/Paris',
};

const limited = (over = {}) => ({
  unlimited: false,
  limitMinutes: 120,
  usedSeconds: 45 * 60,
  usedMinutes: 45,
  remainingMinutes: 75,
  exhausted: false,
  period: SEPTEMBER,
  group: { id: 'g-sales', name: 'Commerciaux', color: 'blue' },
  ...over,
});

const payload = (credit = {}) => ({
  range: 'month',
  totals: { meetings: 6, durationSeconds: 3 * 3600 + 3 * 60, summaries: 8, regenerated: 2 },
  credit: {
    ...limited(),
    monthSeconds: 45 * 60,
    pace: {
      expectedRemainingSeconds: 60 * 60,
      exhaustsAt: '2026-09-20T10:00:00.000Z',
      alert: false,
    },
    ...credit,
  },
});

const kpiValues = () => [...document.querySelectorAll('.amo-kpi dd')].map((el) => el.textContent);

// Une adresse par test : le cache du composant est rangé par compte, et un
// test ne doit pas hériter des chiffres du précédent.
let seq = 0;
beforeEach(() => {
  seq += 1;
  auth.set({ user: { name: 'Dev Local', email: `dev${seq}@myalfred.ai` }, capabilities: {} });
  resetQuota();
  liveElapsedStore.set(0);
  fetchMyStats.mockReset();
  fetchMyStats.mockResolvedValue({ ok: true, status: 200, data: payload() });
});

describe('AccountMonth — le crédit du mois', () => {
  it('s’affiche tout de suite, depuis le store ; rythme et chiffres arrivent ensuite', async () => {
    applyQuota(limited());
    let answer;
    fetchMyStats.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(AccountMonth);
    await tick();

    expect(screen.getByText('1 h 15')).toBeTruthy();
    expect(screen.getByText('restantes sur 2 h')).toBeTruthy();
    expect(screen.getByText('septembre')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Temps de réunion' });
    expect(bar.getAttribute('aria-valuenow')).toBe('75');
    expect(bar.getAttribute('aria-valuemax')).toBe('120');
    // La barre se remplit de ce qui RESTE : 75 sur 120.
    expect(document.querySelector('.amo-fill').style.width).toBe('62.5%');
    expect(document.querySelector('.amo').className).toContain('amo-high');
    // Les chiffres attendent la relecture : des tirets, annoncés occupés.
    expect(document.querySelector('.amo-kpis').getAttribute('aria-busy')).toBe('true');
    expect(kpiValues()).toEqual(['—', '—', '—']);
    expect(fetchMyStats).toHaveBeenCalledWith('month');

    answer({ ok: true, status: 200, data: payload() });
    await screen.findByText('3 h 03');
    expect(kpiValues()).toEqual(['6', '3 h 03', '8']);
    expect([...document.querySelectorAll('.amo-kpi dt')].map((el) => el.textContent)).toEqual([
      'Réunions',
      'Enregistrées',
      'Comptes rendus',
    ]);
    // Le repère du rythme régulier : 1 h attendue sur 2 h.
    expect(document.querySelector('.amo-pace').style.left).toBe('50%');
    expect(screen.getByText('Rythme régulier : 1 h')).toBeTruthy();
    expect(document.querySelector('.amo-alert')).toBeNull();
  });

  it('déduit en direct la réunion en cours, sans attendre le serveur', async () => {
    applyQuota(limited());
    render(AccountMonth);
    liveElapsedStore.set(20 * 60);
    await tick();
    expect(screen.getByText('55 min')).toBeTruthy();
    expect(document.querySelector('.amo-fill').style.width).toMatch(/^45\.8/);
  });

  it('épuisé : « Épuisé », le mois du renouvellement, et plus de rythme', async () => {
    applyQuota(limited({ usedSeconds: 120 * 60, usedMinutes: 120, remainingMinutes: 0 }));
    render(AccountMonth);
    await screen.findByText('3 h 03');

    expect(screen.getByText('Épuisé')).toBeTruthy();
    expect(screen.getByText('Renouvelé le 1er octobre.')).toBeTruthy();
    expect(document.querySelector('.amo').className).toContain('amo-out');
    expect(document.querySelector('.amo-pace')).toBeNull();
    expect(screen.queryByText(/Rythme régulier/)).toBeNull();
  });

  it('nomme la date d’épuisement quand le serveur lève l’alerte de rythme', async () => {
    applyQuota(limited());
    fetchMyStats.mockResolvedValue({
      ok: true,
      status: 200,
      data: payload({
        pace: {
          expectedRemainingSeconds: 90 * 60,
          exhaustsAt: '2026-09-20T10:00:00.000Z',
          alert: true,
        },
      }),
    });
    render(AccountMonth);
    expect((await screen.findByText(/épuisé vers le/)).textContent).toContain('20 septembre');
  });
});

describe('AccountMonth — sans quota, et quand le réseau manque', () => {
  it('sans quota : « Temps illimité » et le temps du mois, sans barre', async () => {
    applyQuota({ unlimited: true, limitMinutes: null, period: SEPTEMBER });
    fetchMyStats.mockResolvedValue({
      ok: true,
      status: 200,
      data: payload({ unlimited: true, limitMinutes: null, monthSeconds: 3 * 3600 + 3 * 60 }),
    });
    render(AccountMonth);

    expect(screen.getByText('Temps illimité')).toBeTruthy();
    expect(await screen.findByText('3 h 03 enregistrées en septembre.')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('relecture en échec : le crédit reste, les chiffres s’effacent, aucun message', async () => {
    applyQuota(limited());
    fetchMyStats.mockResolvedValue({ ok: false, status: 0, data: { error: 'network' } });
    render(AccountMonth);
    await vi.waitFor(() => expect(document.querySelector('.amo-kpis')).toBeNull());

    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rouvert, il montre aussitôt les chiffres connus — jamais ceux d’un autre compte', async () => {
    applyQuota(limited());
    const first = render(AccountMonth);
    await screen.findByText('3 h 03');
    first.unmount();

    fetchMyStats.mockReturnValue(new Promise(() => {}));
    const again = render(AccountMonth);
    await tick();
    expect(kpiValues()).toEqual(['6', '3 h 03', '8']);
    again.unmount();

    auth.set({ user: { name: 'Autre', email: 'autre@myalfred.ai' }, capabilities: {} });
    render(AccountMonth);
    await tick();
    expect(kpiValues()).toEqual(['—', '—', '—']);
  });

  it('« Voir mes statistiques » ouvre la page', async () => {
    const onOpen = vi.fn();
    render(AccountMonth, { props: { onOpen } });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Voir mes statistiques' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
