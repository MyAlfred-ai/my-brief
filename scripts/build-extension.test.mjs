import { describe, it, expect } from 'vitest';
import { crc32, buildZip, isPackaged } from './build-extension.mjs';

describe('isPackaged', () => {
  it('écarte les tests, le README et les fichiers cachés', () => {
    expect(isPackaged('lib/core.test.js')).toBe(false);
    expect(isPackaged('README.md')).toBe(false);
    expect(isPackaged('.DS_Store')).toBe(false);
    expect(isPackaged('popup/.gitkeep')).toBe(false);
  });
  it('garde le reste', () => {
    for (const f of ['manifest.json', 'lib/core.js', 'popup/popup.html', 'icons/16.png']) {
      expect(isPackaged(f), f).toBe(true);
    }
  });
});

describe('crc32', () => {
  it('valeurs de référence', () => {
    // Vecteurs classiques : chaîne vide et « 123456789 ».
    expect(crc32(Buffer.alloc(0))).toBe(0);
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});

describe('buildZip', () => {
  const entries = [
    { name: 'mybrief-extension/manifest.json', data: Buffer.from('{}') },
    { name: 'mybrief-extension/a/b.txt', data: Buffer.from('hello') },
  ];

  it('signatures locale, centrale et de fin, dans l’ordre attendu', () => {
    const zip = buildZip(entries);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // Fin de répertoire central : les 22 derniers octets (pas de commentaire).
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(entries.length);
    const centralSize = zip.readUInt32LE(end + 12);
    const centralOffset = zip.readUInt32LE(end + 16);
    expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50);
    expect(centralOffset + centralSize).toBe(end);
  });

  it('les noms et les octets sont dedans, et le résultat est reproductible', () => {
    const zip = buildZip(entries);
    expect(zip.includes(Buffer.from('mybrief-extension/a/b.txt'))).toBe(true);
    expect(zip.includes(Buffer.from('hello'))).toBe(true);
    expect(buildZip(entries).equals(zip)).toBe(true);
  });
});
