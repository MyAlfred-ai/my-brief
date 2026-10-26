/**
 * Une APK par installation : la config générée pour une URL, et le fichier
 * versionné, qui n'en vise aucune.
 *
 * Tout domaine d'`allowNavigation` reçoit le pont natif (micro, fichiers,
 * préférences) : une build ne doit autoriser que le site de SON installation,
 * et le fichier versionné aucun — une config générée pour un build local ne
 * doit pas repartir dans un commit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONFIG_FILE,
  resolveInstance,
  serialize,
  withInstance,
  withoutInstance,
} from './mobile-instance.mjs';

describe('resolveInstance', () => {
  it("déduit domaine et slug de l'URL de l'installation", () => {
    expect(resolveInstance('https://mybrief.example.test')).toEqual({
      slug: 'mybrief-example-test',
      domain: 'mybrief.example.test',
      url: 'https://mybrief.example.test',
    });
  });

  it("ne garde que l'origine", () => {
    expect(resolveInstance('https://mybrief.example.test/signin?x=1').url).toBe(
      'https://mybrief.example.test',
    );
  });

  it('exige une URL https', () => {
    for (const raw of [
      undefined,
      '',
      'mybrief.example.test',
      'http://mybrief.example.test',
      'javascript:alert(1)',
    ]) {
      expect(() => resolveInstance(raw), String(raw)).toThrow(/https:\/\//);
    }
  });
});

describe('withInstance', () => {
  const base = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));

  it("n'autorise que le domaine de l'installation, et ne touche à rien d'autre", () => {
    const built = withInstance(base, resolveInstance('https://mybrief.example.test'));
    expect(built.server.url).toBe('https://mybrief.example.test');
    expect(built.server.allowNavigation).toEqual(['mybrief.example.test']);
    const { server, ...rest } = built;
    const { server: baseServer, ...baseRest } = base;
    expect(rest).toEqual(baseRest);
    expect(withoutInstance({ ...built, server })).toEqual({ ...base, server: baseServer });
  });

  it("ne modifie pas l'objet reçu", () => {
    const copy = structuredClone(base);
    withInstance(base, resolveInstance('https://mybrief.example.test'));
    expect(base).toEqual(copy);
  });
});

describe('capacitor.config.json versionné', () => {
  it('ne vise aucune installation (`npm run mobile:instance -- --aucune` pour y revenir)', () => {
    const committed = readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(committed);
    expect(config.server.url).toBeUndefined();
    expect(config.server.allowNavigation).toBeUndefined();
    expect(serialize(withoutInstance(config))).toBe(committed);
  });
});
