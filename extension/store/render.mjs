/**
 * Rend les visuels de la fiche Chrome Web Store dans images/, depuis
 * scenes.html (le vrai popup, figé scène par scène) :
 *
 *   capture-{fr,en}-{1..4}.png   captures 1280×800
 *   vignette-440x280.png         petite vignette promotionnelle
 *
 * À relancer quand le popup change. Playwright n'est pas une dépendance du
 * dépôt : pointer PLAYWRIGHT_DIR sur un dossier node_modules qui contient
 * `playwright-core` (celui du cache npx convient), Chromium déjà installé.
 *
 *   PLAYWRIGHT_DIR=~/.npm/_npx/<hash>/node_modules node extension/store/render.mjs
 *
 * Sert la racine du dépôt en local (scenes.html lit popup/, _locales/,
 * icons/ et public/logo.png) — aucun accès réseau extérieur.
 */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = join(here, 'images');

const base = process.env.PLAYWRIGHT_DIR
  ? join(process.env.PLAYWRIGHT_DIR, 'x.js')
  : import.meta.url;
const { chromium } = createRequire(base)('playwright-core');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const path = resolve(repoRoot, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!path.startsWith(repoRoot + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const SHOTS = [
  ...['fr', 'en'].flatMap((lang) =>
    [1, 2, 3, 4].map((n) => ({
      id: `${lang}-${n}`,
      file: `capture-${lang}-${n}.png`,
      width: 1280,
      height: 800,
    })),
  ),
  { id: 'tile', file: 'vignette-440x280.png', width: 440, height: 280 },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  for (const shot of SHOTS) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 1,
    });
    await page.goto(`${origin}/extension/store/scenes.html#${shot.id}`);
    await page.waitForFunction(() => window.__ready === true);
    await page.screenshot({ path: join(outDir, shot.file) });
    await page.close();
    console.log(`images/${shot.file}`);
  }
} finally {
  await browser.close();
  server.close();
}
