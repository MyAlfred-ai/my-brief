import { describe, it, expect } from 'vitest';
import {
  originOf,
  hostLabel,
  recordUrl,
  hostPattern,
  isMyBriefConfig,
  resolveLogo,
  pickInstanceTab,
  isVideoCallUrl,
  badgeFor,
  formatElapsed,
} from './core.js';

describe('originOf', () => {
  it('garde l’origine http(s), sans chemin ni hash', () => {
    expect(originOf('https://mybrief.acme.fr/#config')).toBe('https://mybrief.acme.fr');
    expect(originOf('http://localhost:5173/x?y=1')).toBe('http://localhost:5173');
  });
  it('refuse ce qui n’est pas un site : chrome://, file:, vide, invalide', () => {
    expect(originOf('chrome://extensions')).toBe(null);
    expect(originOf('file:///tmp/a.html')).toBe(null);
    expect(originOf('')).toBe(null);
    expect(originOf(undefined)).toBe(null);
    expect(originOf('pas une url')).toBe(null);
  });
});

describe('URLs', () => {
  it('le deep-link et le motif d’hôte sont bâtis sur l’origine seule', () => {
    expect(recordUrl('https://mybrief.acme.fr')).toBe('https://mybrief.acme.fr/#record');
    expect(hostPattern('https://mybrief.acme.fr')).toBe('https://mybrief.acme.fr/*');
    expect(hostLabel('https://mybrief.acme.fr:8443')).toBe('mybrief.acme.fr:8443');
  });
});

describe('isMyBriefConfig', () => {
  it('reconnaît la sonde publique à ses deux blocs obligatoires', () => {
    expect(isMyBriefConfig({ branding: { logo: '' }, actions: {} })).toBe(true);
  });
  it('rejette un autre JSON, un HTML, null', () => {
    expect(isMyBriefConfig({ ok: true })).toBe(false);
    expect(isMyBriefConfig({ branding: 'x', actions: {} })).toBe(false);
    expect(isMyBriefConfig(null)).toBe(false);
    expect(isMyBriefConfig('<!doctype html>')).toBe(false);
  });
});

describe('resolveLogo', () => {
  const origin = 'https://mybrief.acme.fr';
  it('résout un chemin relatif sur le site, garde une data-URL ou une URL absolue', () => {
    expect(resolveLogo('/logo.png', origin)).toBe('https://mybrief.acme.fr/logo.png');
    expect(resolveLogo('data:image/png;base64,AAAA', origin)).toBe('data:image/png;base64,AAAA');
    expect(resolveLogo('https://cdn.acme.fr/l.png', origin)).toBe('https://cdn.acme.fr/l.png');
  });
  it('vide → null', () => {
    expect(resolveLogo('', origin)).toBe(null);
    expect(resolveLogo(undefined, origin)).toBe(null);
  });
});

describe('pickInstanceTab', () => {
  it('préfère l’onglet actif de la fenêtre courante', () => {
    const tabs = [
      { id: 1, active: false, windowId: 7, lastAccessed: 900 },
      { id: 2, active: true, windowId: 7, lastAccessed: 100 },
      { id: 3, active: true, windowId: 8, lastAccessed: 950 },
    ];
    expect(pickInstanceTab(tabs, 7)?.id).toBe(2);
  });
  it('sinon le dernier consulté, toutes fenêtres confondues', () => {
    const tabs = [
      { id: 1, active: false, windowId: 7, lastAccessed: 900 },
      { id: 3, active: true, windowId: 8, lastAccessed: 950 },
    ];
    expect(pickInstanceTab(tabs, 7)?.id).toBe(3);
  });
  it('aucun onglet → null', () => {
    expect(pickInstanceTab([], 7)).toBe(null);
    expect(pickInstanceTab(undefined, 7)).toBe(null);
  });
});

describe('isVideoCallUrl', () => {
  it('reconnaît une salle ou un appel', () => {
    for (const url of [
      'https://meet.google.com/abc-defg-hij',
      'https://meet.google.com/abc-defg-hij?authuser=1',
      'https://teams.live.com/meet/9312345678901',
      'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=1',
      'https://us05web.zoom.us/wc/12345/join',
      'https://zoom.us/j/12345',
      'https://acme.webex.com/meet/jdoe',
    ]) {
      expect(isVideoCallUrl(url), url).toBe(true);
    }
  });
  it('ignore les pages d’accueil, Teams en tchat, http et le reste', () => {
    for (const url of [
      'https://meet.google.com/',
      'https://meet.google.com/landing',
      'https://teams.microsoft.com/v2/',
      'https://zoom.us/',
      'http://meet.google.com/abc-defg-hij',
      'https://example.com/abc-defg-hij',
      '',
      undefined,
      'chrome://newtab',
    ]) {
      expect(isVideoCallUrl(url), String(url)).toBe(false);
    }
  });
});

describe('badgeFor', () => {
  const now = () => 10 * 60000 + 5000;
  it('REC rouge avec les minutes écoulées, gris en pause', () => {
    const rec = badgeFor({ recording: true, paused: false, since: 0 }, true, now);
    expect(rec).toMatchObject({ text: 'REC', color: '#d9534f', titleKey: 'titleRecording' });
    expect(rec.titleSubs).toEqual(['10']);
    const paused = badgeFor({ recording: true, paused: true, since: 0 }, false, now);
    expect(paused).toMatchObject({ text: 'REC', color: '#8b949e', titleKey: 'titlePaused' });
  });
  it('point de rappel seulement sans enregistrement, rien sinon', () => {
    expect(badgeFor({ recording: false, paused: false, since: null }, true, now)).toMatchObject({
      text: '•',
      titleKey: 'titleVideoCall',
    });
    expect(badgeFor({ recording: false, paused: false, since: null }, false, now)).toEqual({
      text: '',
      color: null,
      titleKey: null,
      titleSubs: [],
    });
  });
});

describe('formatElapsed', () => {
  it('mm:ss puis h:mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(3_600_000 + 61_000)).toBe('1:01:01');
    expect(formatElapsed(-5)).toBe('00:00');
  });
});
