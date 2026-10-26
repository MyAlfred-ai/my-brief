/**
 * Le son de l'ordinateur au démarrage d'une réunion.
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - Chrome et Edge gardent EXACTEMENT leur chemin : la question, puis la
 *     fenêtre de partage, l'image jetée, le son gardé ;
 *   - Firefox et Safari ouvrent le périphérique virtuel choisi, traitements de
 *     la voix coupés, et le retrouvent par son nom si son identifiant a changé ;
 *   - rien ici n'empêche le micro de démarrer : tout échec rend « micro seul »
 *     et le statut à afficher — sauf « Annuler », qui arrête tout.
 */
import { describe, it, expect, vi } from 'vitest';
import { acquireSystemAudio, findSystemDevice, systemAudioPath } from './systemAudio.js';

const track = (kind, deviceId = '') => ({ kind, stop: vi.fn(), getSettings: () => ({ deviceId }) });
const stream = (tracks) => ({
  getTracks: () => tracks,
  getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
});
const input = (deviceId, label) => ({ kind: 'audioinput', deviceId, label });
const BLACKHOLE = { id: 'bh-1', label: 'BlackHole 2ch' };

function devices({
  inputs = [input('mic-1', 'MacBook Pro Microphone'), input('bh-1', 'BlackHole 2ch')],
  userMedia,
  displayMedia,
} = {}) {
  return {
    enumerateDevices: vi.fn(async () => inputs),
    getUserMedia: vi.fn(userMedia || (async () => stream([track('audio')]))),
    getDisplayMedia: vi.fn(displayMedia || (async () => stream([track('video'), track('audio')]))),
  };
}

describe('systemAudioPath', () => {
  const mediaDevices = devices();
  it('Chrome et Edge : la fenêtre de partage, quel que soit le réglage', () => {
    expect(
      systemAudioPath({ shareAudio: true, desktop: true, device: BLACKHOLE, mediaDevices }),
    ).toBe('share');
  });
  it('Firefox et Safari : le périphérique choisi, sinon le micro seul', () => {
    expect(
      systemAudioPath({ shareAudio: false, desktop: true, device: BLACKHOLE, mediaDevices }),
    ).toBe('device');
    expect(systemAudioPath({ shareAudio: false, desktop: true, device: null, mediaDevices })).toBe(
      'none',
    );
  });
  it('téléphone et application native : le micro seul, même avec un réglage', () => {
    expect(
      systemAudioPath({ shareAudio: false, desktop: false, device: BLACKHOLE, mediaDevices }),
    ).toBe('none');
  });
});

describe('findSystemDevice', () => {
  const inputs = [
    input('mic-1', 'Micro'),
    input('bh-NEW', 'BlackHole 2ch'),
    { kind: 'audiooutput', deviceId: 'bh-1', label: 'BlackHole 2ch' },
  ];
  it('par identifiant, puis par nom quand le navigateur l’a renouvelé — jamais une sortie', () => {
    expect(findSystemDevice(inputs, BLACKHOLE).deviceId).toBe('bh-NEW');
    expect(findSystemDevice(inputs, { id: 'mic-1', label: '' }).deviceId).toBe('mic-1');
    expect(findSystemDevice(inputs, { id: 'absent', label: 'Loopback' })).toBeNull();
  });
});

describe('acquireSystemAudio — partage d’écran (Chrome, Edge)', () => {
  it('visio : partage d’un pixel, image jetée, son gardé', async () => {
    const mediaDevices = devices();
    const askMeetingType = vi.fn(async () => true);
    const result = await acquireSystemAudio({ path: 'share', askMeetingType, mediaDevices });
    expect(askMeetingType).toHaveBeenCalledWith({ path: 'share' });
    expect(mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
      video: { width: 1, height: 1, frameRate: 1 },
      audio: true,
    });
    const media = await mediaDevices.getDisplayMedia.mock.results[0].value;
    expect(media.getVideoTracks()[0].stop).toHaveBeenCalled();
    expect(media.getAudioTracks()[0].stop).not.toHaveBeenCalled();
    expect(result).toEqual({ stream: media, status: '' });
  });

  it('présentiel : micro seul, sans fenêtre de partage', async () => {
    const mediaDevices = devices();
    const result = await acquireSystemAudio({
      path: 'share',
      askMeetingType: async () => false,
      mediaDevices,
    });
    expect(mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
    expect(result).toEqual({ stream: null, status: 'statuses.systemDenied' });
  });

  it('« Annuler » arrête le démarrage', async () => {
    const result = await acquireSystemAudio({
      path: 'share',
      askMeetingType: async () => null,
      mediaDevices: devices(),
    });
    expect(result).toMatchObject({ cancelled: true, stream: null });
  });

  it('partage sans la case de l’audio : tout est refermé, et le statut le dit', async () => {
    const mediaDevices = devices({ displayMedia: async () => stream([track('video')]) });
    const result = await acquireSystemAudio({
      path: 'share',
      askMeetingType: async () => true,
      mediaDevices,
    });
    expect(result).toEqual({ stream: null, status: 'statuses.noSystemAudio' });
  });

  it('partage refusé : micro seul', async () => {
    const mediaDevices = devices({
      displayMedia: async () => {
        throw new DOMException('refusé', 'NotAllowedError');
      },
    });
    const result = await acquireSystemAudio({
      path: 'share',
      askMeetingType: async () => true,
      mediaDevices,
    });
    expect(result).toEqual({ stream: null, status: 'statuses.systemDenied' });
  });

  it('délai dépassé : micro seul, et un partage accordé après coup est refermé', async () => {
    vi.useFakeTimers();
    let grant;
    const late = stream([track('audio')]);
    const mediaDevices = devices({
      displayMedia: () => new Promise((resolve) => (grant = resolve)),
    });
    const pending = acquireSystemAudio({
      path: 'share',
      askMeetingType: async () => true,
      mediaDevices,
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ stream: null, status: 'statuses.systemDenied' });
    grant(late);
    await vi.runAllTimersAsync();
    expect(late.getTracks()[0].stop).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('acquireSystemAudio — périphérique virtuel (Firefox, Safari)', () => {
  it('visio : ouvre le périphérique, traitements de la voix coupés, et le nomme dans la question', async () => {
    const mediaDevices = devices();
    const askMeetingType = vi.fn(async () => true);
    const result = await acquireSystemAudio({
      path: 'device',
      device: BLACKHOLE,
      askMeetingType,
      mediaDevices,
    });
    expect(askMeetingType).toHaveBeenCalledWith({ path: 'device', deviceLabel: 'BlackHole 2ch' });
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'bh-1' },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(result.status).toBe('');
    expect(result.stream).not.toBeNull();
    expect(mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
  });

  it('retrouve le périphérique par son nom quand son identifiant a changé', async () => {
    const mediaDevices = devices({
      inputs: [input('mic-1', 'Micro'), input('bh-NEW', 'BlackHole 2ch')],
    });
    await acquireSystemAudio({
      path: 'device',
      device: BLACKHOLE,
      askMeetingType: async () => true,
      mediaDevices,
    });
    expect(mediaDevices.getUserMedia.mock.calls[0][0].audio.deviceId).toEqual({ exact: 'bh-NEW' });
  });

  it('périphérique absent : le dit tout de suite, sans poser la question', async () => {
    const askMeetingType = vi.fn();
    const result = await acquireSystemAudio({
      path: 'device',
      device: BLACKHOLE,
      askMeetingType,
      mediaDevices: devices({ inputs: [input('mic-1', 'Micro')] }),
    });
    expect(askMeetingType).not.toHaveBeenCalled();
    expect(result).toEqual({ stream: null, status: 'statuses.systemDeviceMissing' });
  });

  it('le même appareil que le micro : refusé, chaque mot serait transcrit deux fois', async () => {
    const mediaDevices = devices();
    const result = await acquireSystemAudio({
      path: 'device',
      device: BLACKHOLE,
      micStream: stream([track('audio', 'bh-1')]),
      askMeetingType: async () => true,
      mediaDevices,
    });
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(result).toEqual({ stream: null, status: 'statuses.systemDeviceIsMic' });
  });

  it('présentiel : le périphérique n’est pas ouvert', async () => {
    const mediaDevices = devices();
    const result = await acquireSystemAudio({
      path: 'device',
      device: BLACKHOLE,
      askMeetingType: async () => false,
      mediaDevices,
    });
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(result).toEqual({ stream: null, status: 'statuses.systemDenied' });
  });

  it('ouverture impossible : micro seul, jamais d’exception', async () => {
    const mediaDevices = devices({
      userMedia: async () => {
        throw new DOMException('occupé', 'NotReadableError');
      },
    });
    const result = await acquireSystemAudio({
      path: 'device',
      device: BLACKHOLE,
      askMeetingType: async () => true,
      mediaDevices,
    });
    expect(result).toEqual({ stream: null, status: 'statuses.systemDeviceFailed' });
  });
});

describe('acquireSystemAudio — ni partage, ni périphérique', () => {
  it('micro seul, sans poser de question', async () => {
    const askMeetingType = vi.fn();
    const result = await acquireSystemAudio({
      path: 'none',
      askMeetingType,
      mediaDevices: devices(),
    });
    expect(askMeetingType).not.toHaveBeenCalled();
    expect(result).toEqual({ stream: null, status: 'statuses.systemUnsupported' });
  });
});
