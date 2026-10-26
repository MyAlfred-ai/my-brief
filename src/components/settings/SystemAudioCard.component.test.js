/**
 * « Ma configuration → Réglages audio → Son de l'ordinateur » (Firefox, Safari).
 *
 * Ce qui se vérifie ici :
 *   - le micro choisi n'est pas proposé, le choix est gardé pour l'appareil ;
 *   - un périphérique disparu le dit, par son nom ; retrouvé par son nom sous
 *     un nouvel identifiant, il est gardé sous le nouveau ;
 *   - « Tester le son » écoute le périphérique SANS traitement de la voix, et
 *     son verdict est annoncé.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';
import { uiTextData } from '../../config/uiText.js';
import { currentLanguageStore } from '../../store.js';
import { audioDevices, SYSTEM_STORAGE_KEY } from '../../stores/audioDevices.js';

const probeInputLevel = vi.fn();
vi.mock('../../lib/audio/levelProbe.js', () => ({
  probeInputLevel: (...args) => probeInputLevel(...args),
}));

const { default: SystemAudioCard } = await import('./SystemAudioCard.svelte');

const c = uiTextData.fr.config;
const input = (deviceId, label) => ({ kind: 'audioinput', deviceId, label, groupId: '' });
const MIC = input('mic-1', 'Microphone MacBook');
const BLACKHOLE = input('bh-1', 'BlackHole 2ch');

function setup({ mic = '', system = null, devices = [MIC, BLACKHOLE], ready = true } = {}) {
  audioDevices.set({ mic, system });
  render(SystemAudioCard, { props: { devices, ready } });
  return userEvent.setup();
}

const select = () => screen.getByRole('combobox', { name: c.systemAudioDeviceLabel });

describe('SystemAudioCard', () => {
  beforeEach(() => {
    localStorage.clear();
    probeInputLevel.mockReset();
  });
  afterEach(() => {
    currentLanguageStore.set('fr');
    vi.restoreAllMocks();
  });

  it('propose les entrées sauf le micro choisi, et garde le choix pour cet appareil', async () => {
    const user = setup({ mic: 'mic-1' });
    const labels = screen.getAllByRole('option').map((option) => option.textContent.trim());
    expect(labels).toEqual([c.systemAudioNone, 'BlackHole 2ch']);

    await user.selectOptions(select(), 'bh-1');

    expect(get(audioDevices).system).toEqual({ id: 'bh-1', label: 'BlackHole 2ch' });
    expect(JSON.parse(localStorage.getItem(SYSTEM_STORAGE_KEY))).toEqual({
      id: 'bh-1',
      label: 'BlackHole 2ch',
    });
    expect(screen.getByText(c.saved)).toBeTruthy();

    await user.selectOptions(select(), '');
    expect(get(audioDevices).system).toBeNull();
    expect(localStorage.getItem(SYSTEM_STORAGE_KEY)).toBeNull();
  });

  it('sans autorisation du micro, pas de liste : les noms manqueraient', () => {
    setup({ ready: false });
    expect(screen.getByText(c.systemAudioIntro)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('un périphérique disparu le dit, par son nom, sans rien choisir à sa place', () => {
    setup({ system: { id: 'cable-9', label: 'CABLE Output (VB-Audio)' } });
    expect(
      screen.getByText(c.systemAudioMissing.replace('{device}', 'CABLE Output (VB-Audio)')),
    ).toBeTruthy();
    expect(select().value).toBe('');
    expect(screen.queryByRole('button', { name: c.systemAudioTest })).toBeNull();
    expect(get(audioDevices).system).toEqual({ id: 'cable-9', label: 'CABLE Output (VB-Audio)' });
  });

  it('retrouvé par son nom sous un nouvel identifiant : le nouveau est gardé', () => {
    setup({ system: { id: 'ancien-id', label: 'BlackHole 2ch' } });
    expect(get(audioDevices).system).toEqual({ id: 'bh-1', label: 'BlackHole 2ch' });
    expect(select().value).toBe('bh-1');
    expect(screen.queryByText(/introuvable/)).toBeNull();
  });

  it('le micro devenu le son de l’ordinateur : il reste affiché, avec l’avertissement', () => {
    setup({ mic: 'bh-1', system: { id: 'bh-1', label: 'BlackHole 2ch' } });
    expect(select().value).toBe('bh-1');
    expect(screen.getByText(c.systemAudioIsMic)).toBeTruthy();
  });

  it('« Tester le son » écoute le périphérique sans traitement de la voix', async () => {
    probeInputLevel.mockResolvedValue({ heard: true, peak: 0.4 });
    const user = setup({ system: { id: 'bh-1', label: 'BlackHole 2ch' } });

    await user.click(screen.getByRole('button', { name: c.systemAudioTest }));

    expect(probeInputLevel).toHaveBeenCalledOnce();
    expect(probeInputLevel.mock.calls[0][0].constraints).toEqual({
      deviceId: { exact: 'bh-1' },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    expect((await screen.findByRole('status')).textContent.trim()).toBe(c.systemAudioHeard);
  });

  it.each([
    ['silence', () => probeInputLevel.mockResolvedValue({ heard: false, peak: 0 }), 'Silent'],
    ['échec', () => probeInputLevel.mockRejectedValue(new Error('NotReadableError')), 'Failed'],
  ])('test en %s : le verdict dit quoi vérifier', async (_cas, arrange, key) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    arrange();
    const user = setup({ system: { id: 'bh-1', label: 'BlackHole 2ch' } });
    await user.click(screen.getByRole('button', { name: c.systemAudioTest }));
    expect((await screen.findByRole('status')).textContent.trim()).toBe(c[`systemAudio${key}`]);
  });

  it("suit la langue de l'interface", () => {
    currentLanguageStore.set('en');
    setup({ system: { id: 'bh-1', label: 'BlackHole 2ch' } });
    const en = uiTextData.en.config;
    expect(screen.getByRole('heading', { name: en.systemAudioSection })).toBeTruthy();
    expect(screen.getByRole('button', { name: en.systemAudioTest })).toBeTruthy();
  });
});
