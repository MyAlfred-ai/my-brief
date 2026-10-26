// @vitest-environment jsdom
/**
 * Périphériques audio choisis, par appareil : relus au démarrage de l'app,
 * écrits à chaque choix — et le NOM du son de l'ordinateur gardé avec lui.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

async function freshStore() {
  vi.resetModules();
  return import('./audioDevices.js');
}

describe('audioDevices', () => {
  beforeEach(() => localStorage.clear());

  it('relit les choix enregistrés sur cet appareil', async () => {
    localStorage.setItem('mybrief_audio_input_device', 'mic-7');
    localStorage.setItem(
      'mybrief_system_audio_device',
      JSON.stringify({ id: 'bh-1', label: 'BlackHole 2ch' }),
    );
    const { audioDevices } = await freshStore();
    expect(get(audioDevices)).toEqual({
      mic: 'mic-7',
      system: { id: 'bh-1', label: 'BlackHole 2ch' },
    });
  });

  it('un enregistrement illisible vaut « aucun son de l’ordinateur »', async () => {
    localStorage.setItem('mybrief_system_audio_device', '{pas du json');
    const { audioDevices } = await freshStore();
    expect(get(audioDevices).system).toBeNull();
  });

  it('écrit chaque choix, et l’efface quand on y renonce', async () => {
    const { audioDevices, chooseMicrophone, chooseSystemAudio } = await freshStore();
    chooseMicrophone('mic-2');
    chooseSystemAudio({ deviceId: 'cable-out', label: 'CABLE Output (VB-Audio)' });
    expect(get(audioDevices)).toEqual({
      mic: 'mic-2',
      system: { id: 'cable-out', label: 'CABLE Output (VB-Audio)' },
    });
    expect(JSON.parse(localStorage.getItem('mybrief_system_audio_device'))).toEqual({
      id: 'cable-out',
      label: 'CABLE Output (VB-Audio)',
    });

    chooseMicrophone('');
    chooseSystemAudio(null);
    expect(get(audioDevices)).toEqual({ mic: '', system: null });
    expect(localStorage.getItem('mybrief_audio_input_device')).toBeNull();
    expect(localStorage.getItem('mybrief_system_audio_device')).toBeNull();
  });
});
