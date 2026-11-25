import { describe, it, expect, afterEach, vi } from 'vitest';
import { recordUrl } from './recordUrl.js';

describe('recordUrl', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('porte la langue de l’interface, et les autres paramètres', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en' });
    expect(recordUrl('/api', { source: 'offline' })).toBe('/api/record?source=offline&lang=en');
  });

  it('sans langue enregistrée (ni stockage) : le français, défaut de l’application', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(recordUrl('/api')).toBe('/api/record?lang=fr');
  });
});
