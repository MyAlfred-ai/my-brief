/**
 * Empaquette extension/ en public/mybrief-extension.zip — le fichier que la
 * page « Extension Chrome » de « Ma configuration » propose au téléchargement
 * tant que l'extension n'est pas sur le Chrome Web Store
 * (cf. EXTENSION_STORE_URL dans src/config/constants.js).
 *
 * Lancé avant chaque `vite build` (hook npm `prebuild`) et avant `vite`
 * (`predev`). Le .zip est ignoré par git : c'est un produit de build.
 *
 * Écrit le zip À LA MAIN, sans dépendance : entrées « store » (sans
 * compression — les fichiers sont minuscules), CRC-32 calculé ici, dates
 * fixes. Deux builds du même dossier donnent le même octet près, ce qui
 * évite un diff d'image Docker à chaque déploiement.
 *
 * Les tests unitaires (extension/lib/*.test.js) ne sont PAS empaquetés.
 *
 * Usage : node scripts/build-extension.mjs [--out chemin.zip]
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, join, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const SOURCE_DIR = resolve(repoRoot, 'extension');
/** Nom du dossier une fois décompressé — celui que l'aide cite. */
const ROOT_NAME = 'mybrief-extension';

const outIndex = process.argv.indexOf('--out');
const OUT_FILE =
  outIndex > -1 && process.argv[outIndex + 1]
    ? resolve(process.cwd(), process.argv[outIndex + 1])
    : resolve(repoRoot, 'public', 'mybrief-extension.zip');

// ── Inventaire ───────────────────────────────────────────────────────────────

/** @param {string} rel chemin relatif au dossier extension/, séparateur `/` */
export function isPackaged(rel) {
  if (rel.endsWith('.test.js')) return false;
  if (rel.startsWith('.') || rel.includes('/.')) return false;
  if (rel === 'README.md') return false;
  return true;
}

function walk(dir, base = dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full, base));
    else files.push(relative(base, full).split(sep).join('/'));
  }
  return files;
}

// ── CRC-32 ───────────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Écriture zip (méthode store) ─────────────────────────────────────────────

// Date fixe (2026-01-01 00:00, format MS-DOS) : reproductible.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

/**
 * @param {Array<{name: string, data: Buffer}>} entries
 * @returns {Buffer}
 */
export function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const common = Buffer.concat([
      u16(20), // version needed
      u16(0x0800), // flags : noms en UTF-8
      u16(0), // méthode : store
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0), // extra
    ]);
    const local = Buffer.concat([u32(0x04034b50), common, nameBuf, data]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20), // version made by
      common,
      u16(0), // comment
      u16(0), // disk
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset),
      nameBuf,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, end]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = walk(SOURCE_DIR).filter(isPackaged);
  const entries = files.map((rel) => ({
    name: `${ROOT_NAME}/${rel}`,
    data: readFileSync(join(SOURCE_DIR, rel)),
  }));
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, buildZip(entries));
  console.log(`extension : ${files.length} fichiers → ${relative(repoRoot, OUT_FILE)}`);
}
