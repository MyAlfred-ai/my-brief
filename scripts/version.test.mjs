/**
 * Une seule version : celle de package.json, que le tag de publication doit
 * reprendre (cf. .github/workflows/release.yml). src/version.json en est la
 * copie embarquée dans l'interface (numéro affiché, garde de cache).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

describe('version', () => {
  it('src/version.json reprend package.json', () => {
    expect(read('src/version.json').version).toBe(read('package.json').version);
  });

  it('suit la forme X.Y.Z', () => {
    expect(read('package.json').version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });
});
