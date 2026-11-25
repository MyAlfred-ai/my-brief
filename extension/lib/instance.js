/**
 * L'instance liée — ce que l'extension sait du MyBrief de l'utilisateur — et
 * les gestes `chrome.*` qui en dépendent. Partagé par le popup et le service
 * worker.
 *
 * Une extension unique (Web Store) sert toutes les installations : elle ne
 * connaît AUCUNE adresse d'avance. L'origine est lue dans l'onglet ouvert au
 * moment de la liaison, puis accordée comme permission d'hôte OPTIONNELLE,
 * limitée à ce seul site : c'est ce qui permet ensuite de retrouver l'onglet
 * (tabs.query par URL) et d'y injecter le script de contenu.
 */
import {
  hostPattern,
  isMyBriefConfig,
  fetchConfigFromPage,
  pickInstanceTab,
  recordUrl,
  homeUrl,
} from './core.js';

export const STORAGE_KEY = 'instance';
export const SCRIPT_ID = 'mybrief-bridge';

/** @typedef {{origin: string, logo: string, linkedAt: number}} Instance */

/** @returns {Promise<Instance|null>} */
export async function getInstance() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const instance = stored[STORAGE_KEY];
  return instance && typeof instance.origin === 'string' ? instance : null;
}

/** @param {Instance} instance */
export async function setInstance(instance) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: instance });
}

/** Oublie le site, retire le script de contenu ; la permission d'hôte est rendue. */
export async function clearInstance() {
  const previous = await getInstance();
  await chrome.storage.sync.remove(STORAGE_KEY);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch {}
  if (previous) {
    try {
      await chrome.permissions.remove({ origins: [hostPattern(previous.origin)] });
    } catch {}
  }
}

/**
 * « Cet onglet est-il un MyBrief ? », demandé DEPUIS l'onglet — le chemin de
 * la liaison (voir fetchConfigFromPage). activeTab, accordé par le clic sur
 * l'icône, permet d'y exécuter la sonde le temps du popup.
 *
 * Trois réponses : `{logo}` (c'est un MyBrief), `null` (l'onglet a répondu :
 * non), `undefined` (impossible d'y exécuter quoi que ce soit — page protégée,
 * politique d'entreprise : l'appelant tente la sonde directe).
 *
 * @param {number} tabId
 * @returns {Promise<{logo: string}|null|undefined>}
 */
export async function probeTab(tabId, { timeoutMs = 3000 } = {}) {
  let injection;
  try {
    [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: fetchConfigFromPage,
      args: [timeoutMs],
    });
  } catch {
    return undefined;
  }
  const data = injection?.result;
  if (!isMyBriefConfig(data)) return null;
  return { logo: /** @type {any} */ (data).branding?.logo || '' };
}

/**
 * La même sonde, lancée depuis l'extension. Ne passe le CORS que si la
 * permission d'hôte est déjà accordée : repli de probeTab seulement.
 * Sans cookie. Borné : sur un site quelconque, la réponse peut être lente ou
 * ne jamais venir.
 *
 * @param {string} origin
 * @returns {Promise<{logo: string}|null>}
 */
export async function probeInstance(origin, { timeoutMs = 3000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${origin}/api/auth/config`, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!isMyBriefConfig(data)) return null;
    return { logo: data.branding?.logo || '' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Qui est connecté, si l'API le sait. Renvoie null dès que ce n'est pas un
 * `authenticated: true` franc : les cookies de session ne suivent pas toujours
 * (SSO du plugin Traefik, redirection vers l'IdP…), et le popup n'affirme
 * jamais « non connecté » sur un doute.
 *
 * @param {string} origin
 * @returns {Promise<{name?: string, email?: string}|null>}
 */
export async function fetchSession(origin) {
  try {
    const res = await fetch(`${origin}/api/auth/session`, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.authenticated ? data.user || {} : null;
  } catch {
    return null;
  }
}

/**
 * Script de contenu sur le site lié — le pont avec l'app (content.js). Inscrit
 * de façon persistante : Chrome le rejoue à chaque chargement du site, même
 * après redémarrage. Mis à jour si déjà inscrit (changement de site).
 *
 * @param {string} origin
 */
export async function ensureContentScript(origin) {
  const script = {
    id: SCRIPT_ID,
    js: ['content.js'],
    matches: [hostPattern(origin)],
    runAt: 'document_idle',
  };
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

/**
 * L'extension a-t-elle encore la permission d'hôte du site lié ? Le site lié
 * est dans `storage.sync` et suit le compte Chrome sur un autre ordinateur ;
 * la permission, elle, reste sur le poste où elle a été accordée, et
 * l'utilisateur peut la retirer dans chrome://extensions. Sans elle : pas de
 * pont (badge REC, page « Extension Chrome »), et l'onglet MyBrief ouvert
 * n'est pas retrouvé — chaque clic en ouvrirait un autre.
 *
 * @param {string} origin
 */
export async function hasSiteAccess(origin) {
  return chrome.permissions.contains({ origins: [hostPattern(origin)] }).catch(() => false);
}

/**
 * Met le pont en route sur le site lié, permission accordée : script de
 * contenu inscrit pour les chargements à venir, ET exécuté tout de suite dans
 * les onglets déjà ouverts — le script inscrit n'y jouerait qu'au prochain
 * chargement, et la page « Extension Chrome » doit passer au vert sans F5.
 * Un onglet où le script tourne déjà se signale une seconde fois : sans effet.
 *
 * @param {string} origin
 */
export async function activateBridge(origin) {
  await ensureContentScript(origin);
  const tabs = await chrome.tabs.query({ url: hostPattern(origin) }).catch(() => []);
  await Promise.all(
    tabs
      .filter((tab) => tab.id != null)
      .map((tab) =>
        chrome.scripting
          .executeScript({
            target: { tabId: /** @type {number} */ (tab.id) },
            files: ['content.js'],
          })
          .catch(() => {}),
      ),
  );
}

/**
 * Ouvre MyBrief — ou y REVIENT. Un onglet déjà ouvert est réutilisé : deux
 * onglets MyBrief, c'est deux sessions live et des réunions en double dans
 * l'historique. Avec `record`, l'URL reçoit le deep-link `#record` : à froid
 * l'app le lit au chargement, à chaud c'est un simple `hashchange` — la page
 * n'est pas rechargée, une réunion en cours n'est pas perdue.
 *
 * @param {string} origin
 * @param {{record?: boolean}} [opts]
 */
export async function openInstance(origin, { record = false } = {}) {
  const url = record ? recordUrl(origin) : homeUrl(origin);
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: hostPattern(origin) });
  } catch {
    // Permission d'hôte absente (révoquée par l'utilisateur) : on ouvre.
  }
  const current = await chrome.windows.getCurrent().catch(() => null);
  const tab = pickInstanceTab(tabs, current?.id);
  if (!tab?.id) {
    await chrome.tabs.create({ url });
    return;
  }
  await chrome.tabs.update(tab.id, { active: true, ...(record ? { url } : {}) });
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
}
