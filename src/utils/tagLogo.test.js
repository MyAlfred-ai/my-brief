// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { logoSize, prepareTagLogo, TAG_LOGO_SIDE, TAG_LOGO_MAX } from './tagLogo.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

describe('logoSize', () => {
  it('réduit au plus à 512 px de côté, sans déformer ni agrandir', () => {
    expect(logoSize(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(logoSize(300, 120)).toEqual({ width: 300, height: 120 });
  });

  it('une image sans dimension propre (SVG) se dessine à la taille maximale', () => {
    expect(logoSize(0, 0)).toEqual({ width: TAG_LOGO_SIDE, height: TAG_LOGO_SIDE });
  });
});

describe('prepareTagLogo — refus avant tout décodage', () => {
  it('ce qui n’est pas une image admise', async () => {
    const pdf = new File(['x'], 'logo.pdf', { type: 'application/pdf' });
    await expect(prepareTagLogo(pdf)).rejects.toMatchObject({ code: 'logo_invalid' });
    await expect(prepareTagLogo(null)).rejects.toMatchObject({ code: 'logo_invalid' });
  });

  it('un fichier de plus de 10 Mo n’est pas un logo', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'photo.png', {
      type: 'image/png',
    });
    await expect(prepareTagLogo(big)).rejects.toMatchObject({ code: 'logo_too_big' });
  });
});

it('la borne du navigateur est celle du serveur', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const route = readFileSync(
    join(here, '..', '..', 'services', 'api', 'routes', 'tags.js'),
    'utf8',
  );
  const m = route.match(/export const TAG_LOGO_MAX = ([\d_]+);/);
  expect(m, 'TAG_LOGO_MAX introuvable dans routes/tags.js').toBeTruthy();
  expect(TAG_LOGO_MAX).toBe(Number(m[1].replace(/_/g, '')));
});
