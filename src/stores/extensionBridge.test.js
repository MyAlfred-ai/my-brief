import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  APP_SOURCE,
  EXTENSION_SOURCE,
  extensionInfo,
  handleBridgeMessage,
  pingExtension,
  stateMessage,
  updateBridgeState,
} from './extensionBridge.js';

const ORIGIN = 'https://mybrief.example.com';

function fakeWindow() {
  const posted = [];
  return {
    location: { origin: ORIGIN },
    postMessage: (data, target) => posted.push({ data, target }),
    posted,
  };
}

beforeEach(() => {
  extensionInfo.set({ installed: false, version: '' });
  updateBridgeState(false, false);
});

describe('handleBridgeMessage', () => {
  it('un hello de la même fenêtre et de la même origine marque l’extension installée', () => {
    const win = fakeWindow();
    const event = {
      source: win,
      origin: ORIGIN,
      data: { source: EXTENSION_SOURCE, type: 'hello', version: '1.0.0' },
    };
    expect(handleBridgeMessage(event, win)).toBe(true);
    expect(get(extensionInfo)).toEqual({ installed: true, version: '1.0.0' });
  });

  it('répond au hello par l’état courant, restreint à l’origine', () => {
    const win = fakeWindow();
    updateBridgeState(true, false, () => 1234);
    const hello = { source: EXTENSION_SOURCE, type: 'hello', version: '1.0.0' };
    handleBridgeMessage({ source: win, origin: ORIGIN, data: hello }, win);
    expect(win.posted).toEqual([
      {
        data: { source: APP_SOURCE, type: 'state', recording: true, paused: false, since: 1234 },
        target: ORIGIN,
      },
    ]);
  });

  it('refuse une autre origine, une autre fenêtre, ou un autre émetteur', () => {
    const win = fakeWindow();
    const hello = { source: EXTENSION_SOURCE, type: 'hello', version: '1.0.0' };
    expect(
      handleBridgeMessage({ source: win, origin: 'https://evil.test', data: hello }, win),
    ).toBe(false);
    expect(handleBridgeMessage({ source: {}, origin: ORIGIN, data: hello }, win)).toBe(false);
    expect(
      handleBridgeMessage({ source: win, origin: ORIGIN, data: { ...hello, source: 'x' } }, win),
    ).toBe(false);
    expect(handleBridgeMessage({ source: win, origin: ORIGIN, data: null }, win)).toBe(false);
    expect(get(extensionInfo).installed).toBe(false);
    expect(win.posted).toEqual([]);
  });
});

describe('pingExtension', () => {
  it('poste un ping restreint à l’origine de la page', () => {
    const win = fakeWindow();
    pingExtension(win);
    expect(win.posted).toEqual([{ data: { source: APP_SOURCE, type: 'ping' }, target: ORIGIN }]);
  });
});

describe('état d’enregistrement', () => {
  it('since est posé au démarrage et gardé pendant une pause, effacé à l’arrêt', () => {
    let clock = 100;
    const now = () => clock;
    expect(updateBridgeState(true, false, now)).toEqual({
      recording: true,
      paused: false,
      since: 100,
    });
    clock = 200;
    expect(updateBridgeState(true, true, now).since).toBe(100);
    expect(updateBridgeState(false, false, now)).toEqual({
      recording: false,
      paused: false,
      since: null,
    });
  });

  it('stateMessage : jamais « en pause » sans enregistrement, jamais de since sans enregistrement', () => {
    expect(stateMessage({ recording: false, paused: true, since: 5 })).toEqual({
      source: APP_SOURCE,
      type: 'state',
      recording: false,
      paused: false,
      since: null,
    });
  });
});
