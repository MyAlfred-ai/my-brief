/**
 * Store des réglages de détection.
 *
 * Trois garanties, chacune pour une panne évitée :
 *   - HYDRATATION AU BON MOMENT : la route exige une identité. L'appeler au
 *     démarrage produirait un 401, donc l'écran de connexion à chaque
 *     rafraîchissement. Elle s'accroche donc au début d'un enregistrement —
 *     forcément connecté, et juste avant que le rythme serve ;
 *   - UNE SEULE FOIS, même en échec : sans quoi chaque réunion rejouerait la
 *     requête sur un serveur qui vient de la refuser ;
 *   - PURGE À LA DÉCONNEXION : en mode mot de passe la page ne se recharge pas,
 *     et le rythme du compte précédent régirait la réunion du suivant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const fetchDetectionSettings = vi.fn();

vi.mock('../services/actionsApi.js', () => ({
  fetchDetectionSettings: (...a) => fetchDetectionSettings(...a),
}));

const { isRecordingStore } = await import('./recording.js');
const {
  actionDetection,
  DEFAULT_DETECTION,
  ensureActionDetection,
  resetActionDetection,
  applyDetectionSettings,
} = await import('./actionDetection.js');

const settings = (over = {}) => ({ ...DEFAULT_DETECTION, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  isRecordingStore.set(false);
  resetActionDetection();
  fetchDetectionSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
});

describe('actionDetection', () => {
  it('part sur les valeurs intégrées, sans appeler personne', () => {
    expect(get(actionDetection)).toEqual(DEFAULT_DETECTION);
    expect(fetchDetectionSettings).not.toHaveBeenCalled();
  });

  it('se charge au démarrage d’une réunion', async () => {
    fetchDetectionSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ windowSize: 20, minSentences: 3 }) },
    });
    isRecordingStore.set(true);
    await vi.waitFor(() => expect(fetchDetectionSettings).toHaveBeenCalledTimes(1));
    expect(get(actionDetection)).toMatchObject({ windowSize: 20, minSentences: 3 });
  });

  it('ne recharge pas à la réunion suivante', async () => {
    isRecordingStore.set(true);
    await vi.waitFor(() => expect(fetchDetectionSettings).toHaveBeenCalledTimes(1));
    isRecordingStore.set(false);
    isRecordingStore.set(true);
    await ensureActionDetection();
    expect(fetchDetectionSettings).toHaveBeenCalledTimes(1);
  });

  it('en échec, garde les valeurs intégrées et n’insiste pas', async () => {
    // Une réunion doit démarrer même si la route est indisponible, et ce repli
    // EST le comportement d'origine.
    fetchDetectionSettings.mockResolvedValue({ ok: false, data: { error: 'network' } });
    await ensureActionDetection();
    expect(get(actionDetection)).toEqual(DEFAULT_DETECTION);
    await ensureActionDetection();
    expect(fetchDetectionSettings).toHaveBeenCalledTimes(1);
  });

  it('la déconnexion remet les valeurs intégrées et rouvre le chargement', async () => {
    applyDetectionSettings(settings({ windowSize: 25 }));
    expect(get(actionDetection).windowSize).toBe(25);

    resetActionDetection();
    expect(get(actionDetection)).toEqual(DEFAULT_DETECTION);

    // Le compte suivant doit pouvoir charger les siens.
    await ensureActionDetection();
    expect(fetchDetectionSettings).toHaveBeenCalledTimes(1);
  });
});
