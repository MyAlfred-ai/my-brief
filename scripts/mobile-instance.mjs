/**
 * Pointe l'app mobile sur UNE installation de MyBrief : réécrit
 * capacitor.config.json avec l'URL de cette installation, et n'autorise
 * qu'elle dans `allowNavigation`.
 *
 * Une build par installation. L'app est une
 * coquille server.url : elle charge le site de SON installation. Or tout
 * domaine d'`allowNavigation` reçoit aussi le pont natif — micro, fichiers,
 * préférences (Bridge.setAllowedOriginRules, dans Capacitor) : y lister
 * plusieurs installations offrirait ce pont à chacune, depuis chaque APK.
 *
 * Le fichier VERSIONNÉ ne vise aucune installation : chaque build donne la
 * sienne. Un test l'impose, pour qu'une config générée pour un build local ne
 * reparte pas dans un commit.
 *
 * Usage :
 *   node scripts/mobile-instance.mjs https://mybrief.example.test
 *   node scripts/mobile-instance.mjs --aucune     # revient au fichier versionné
 *
 * Imprime `clé=valeur` (slug, domain, url) sur la sortie standard : une CI
 * peut les verser telles quelles dans $GITHUB_OUTPUT.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const CONFIG_FILE = resolve(here, '..', 'capacitor.config.json');

/**
 * @param {string} [raw] URL https de l'installation
 * @returns {{slug: string, domain: string, url: string}}
 */
export function resolveInstance(raw) {
  let parsed = null;
  try {
    parsed = new URL(String(raw ?? ''));
  } catch {
    /* refusée ci-dessous */
  }
  if (parsed?.protocol !== 'https:' || !parsed.hostname) {
    throw new Error(`URL d'installation invalide : « ${raw ?? ''} ». Attendu : https://<domaine>.`);
  }
  const domain = parsed.host;
  return { slug: domain.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), domain, url: parsed.origin };
}

/**
 * La config Capacitor d'une installation. Seuls `server.url` et
 * `server.allowNavigation` changent : tout le reste (errorPath, user agent,
 * splash…) est commun à toutes les builds.
 *
 * @param {object} config contenu de capacitor.config.json (non modifié)
 * @param {{domain: string, url: string}} instance
 */
export function withInstance(config, { domain, url }) {
  return { ...config, server: { ...config.server, url, allowNavigation: [domain] } };
}

/** La config versionnée : celle d'aucune installation. */
export function withoutInstance(config) {
  const { url, allowNavigation, ...server } = config.server || {};
  return { ...config, server };
}

/** Sérialisation stable : deux générations pour la même installation donnent le même fichier. */
export function serialize(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  if (process.argv[2] === '--aucune') {
    writeFileSync(CONFIG_FILE, serialize(withoutInstance(config)));
    console.error('capacitor.config.json → aucune installation');
    process.exit(0);
  }
  let instance;
  try {
    instance = resolveInstance(process.argv[2]);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  writeFileSync(CONFIG_FILE, serialize(withInstance(config, instance)));
  console.error(`capacitor.config.json → ${instance.url}`);
  for (const key of ['slug', 'domain', 'url']) console.log(`${key}=${instance[key]}`);
}
