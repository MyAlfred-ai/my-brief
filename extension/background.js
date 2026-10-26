/**
 * Service worker de l'extension.
 *
 *  - Raccourci clavier « Démarrer une réunion » (commands, Alt+Maj+M), le
 *    seul geste qui n'ouvre pas le popup.
 *  - Badge de l'icône (V2) : « REC » quand l'onglet MyBrief lié enregistre,
 *    point de rappel quand une visio est ouverte sans enregistrement (si
 *    l'utilisateur l'a activé). Recalculé sur chaque événement, jamais
 *    entretenu par un minuteur : le worker s'endort entre deux événements.
 *  - Ré-inscrire le script de contenu à l'installation et au démarrage, si un
 *    site est lié — filet contre une inscription perdue.
 *
 * Tout le reste (liaison, boutons) se passe dans popup/popup.js.
 */
import { getInstance, openInstance, ensureContentScript } from './lib/instance.js';
import { hostPattern, originOf } from './lib/core.js';
import {
  getRecordingState,
  setRecordingState,
  clearRecordingState,
  refreshBadge,
} from './lib/state.js';

const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const TITLE_ALARM = 'recording-title';

// ── Raccourci clavier ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'start-meeting') return;
  const instance = await getInstance();
  if (instance) {
    await openInstance(instance.origin, { record: true });
    return;
  }
  // Pas encore lié : le popup explique quoi faire. openPopup() n'existe pas
  // partout — à défaut, un badge signale qu'il y a un geste à faire.
  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d9534f' });
  }
});

// ── État d'enregistrement, annoncé par l'onglet MyBrief ──────────────────────

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'state' || !sender.tab?.id) return;
  (async () => {
    // Seul le site lié a voix au chapitre : un autre site qui aurait le même
    // script (impossible en pratique) ou un message forgé sont ignorés.
    const instance = await getInstance();
    const from = sender.origin || originOf(sender.url);
    if (!instance || from !== instance.origin) return;
    const previous = await getRecordingState();
    if (message.recording) {
      await setRecordingState({
        recording: true,
        paused: !!message.paused,
        since: typeof message.since === 'number' ? message.since : (previous.since ?? Date.now()),
        tabId: sender.tab.id,
      });
      // Le titre de l'icône porte la durée : rafraîchi toutes les minutes.
      await chrome.alarms.create(TITLE_ALARM, { periodInMinutes: 1 });
    } else if (previous.tabId === null || previous.tabId === sender.tab.id) {
      // Un « ne tourne pas » venu d'un AUTRE onglet ne coupe pas le badge de
      // celui qui enregistre (deux onglets ouverts, l'un au repos).
      await clearRecordingState();
      await chrome.alarms.clear(TITLE_ALARM);
    }
    await refreshBadge(t);
  })();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TITLE_ALARM) refreshBadge(t);
});

// ── L'onglet qui enregistrait disparaît ou se recharge ───────────────────────

async function tabGone(tabId) {
  const state = await getRecordingState();
  if (state.recording && state.tabId === tabId) {
    await clearRecordingState();
    await chrome.alarms.clear(TITLE_ALARM);
  }
  await refreshBadge(t);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabGone(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Rechargement ou navigation : le script de contenu rejouera et l'app
  // ré-annoncera son état. Entre-temps, le badge ne doit pas mentir.
  if (changeInfo.status === 'loading') tabGone(tabId);
  else if (changeInfo.status === 'complete' || changeInfo.url) refreshBadge(t);
});
chrome.tabs.onActivated.addListener(() => {
  refreshBadge(t);
});

// ── Installation / démarrage ─────────────────────────────────────────────────

async function restore() {
  await clearRecordingState();
  await chrome.alarms.clear(TITLE_ALARM);
  const instance = await getInstance();
  if (instance) {
    const allowed = await chrome.permissions
      .contains({ origins: [hostPattern(instance.origin)] })
      .catch(() => false);
    if (allowed) await ensureContentScript(instance.origin).catch(() => {});
  }
  await refreshBadge(t);
}

chrome.runtime.onInstalled.addListener(() => {
  restore();
});
chrome.runtime.onStartup.addListener(() => {
  restore();
});
