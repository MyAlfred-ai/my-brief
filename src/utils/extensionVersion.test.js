import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXTENSION_VERSION, isOlderVersion } from './extensionVersion.js';

describe('EXTENSION_VERSION', () => {
  it('est celle du manifest de extension/', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../extension/manifest.json', import.meta.url), 'utf8'),
    );
    expect(EXTENSION_VERSION).toBe(manifest.version);
  });
});

describe('isOlderVersion', () => {
  it('compare partie par partie, en nombres', () => {
    expect(isOlderVersion('1.1.0', '1.2.0')).toBe(true);
    expect(isOlderVersion('1.9.0', '1.10.0')).toBe(true);
    expect(isOlderVersion('1.10.0', '1.9.0')).toBe(false);
    expect(isOlderVersion('2.0', '1.9.9')).toBe(false);
  });
  it('égales, ou écrites avec plus ou moins de zéros : pas plus ancienne', () => {
    expect(isOlderVersion('1.2.0', '1.2.0')).toBe(false);
    expect(isOlderVersion('1.2', '1.2.0')).toBe(false);
    expect(isOlderVersion('1.2', '1.2.1')).toBe(true);
  });
  it('version illisible : on ne réclame rien', () => {
    expect(isOlderVersion('', '1.2.0')).toBe(false);
    expect(isOlderVersion(undefined, '1.2.0')).toBe(false);
    expect(isOlderVersion('1.x', '1.2.0')).toBe(false);
    expect(isOlderVersion('1.1.0', '')).toBe(false);
  });
});
