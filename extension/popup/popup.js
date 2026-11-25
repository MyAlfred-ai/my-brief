/**
 * Le menu de l'extension — deux écrans, jamais ensemble :
 *
 *  - LIÉ : « Nouvelle réunion » (ou « Revenir à la réunion » si elle tourne),
 *    « Ouvrir MyBrief », deux liens, l'état : réunion en cours avec sa durée,
 *    sinon la session si l'API la connaît. Le rappel visio se règle ici. Si
 *    la permission du site manque (autre ordinateur, retirée à la main), un
 *    bouton la redemande en tête : sans elle, rien ne marche vraiment.
 *  - PAS LIÉ : on lit l'onglet courant (activeTab : accordé par le clic sur
 *    l'icône, le temps du popup), on demande à la sonde publique, DEPUIS
 *    l'onglet, si c'est un MyBrief, et on propose « Utiliser ce site comme mon
 *    MyBrief ». Le clic
 *    demande la permission d'hôte pour CE site — obligatoirement en premier
 *    dans le gestionnaire : Chrome n'accorde une permission que pendant le
 *    geste de l'utilisateur, un `await` avant l'invalide. Même règle pour la
 *    case du rappel visio, qui demande la lecture des onglets de visio.
 */
import {
  originOf,
  hostLabel,
  hostPattern,
  resolveLogo,
  homeUrl,
  configUrl,
  formatElapsed,
  VIDEO_CALL_HOST_PATTERNS,
} from '../lib/core.js';
import {
  getInstance,
  setInstance,
  clearInstance,
  probeTab,
  probeInstance,
  fetchSession,
  hasSiteAccess,
  activateBridge,
  openInstance,
} from '../lib/instance.js';
import {
  getRecordingState,
  isReminderEnabled,
  setReminderEnabled,
  isVideoCallOpen,
  refreshBadge,
} from '../lib/state.js';

const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
const $ = (id) => document.getElementById(id);

for (const el of document.querySelectorAll('[data-i18n]')) {
  el.textContent = t(el.dataset.i18n);
}

function show(id) {
  $('linked').hidden = id !== 'linked';
  $('unlinked').hidden = id !== 'unlinked';
}

let timer = null;

// ── Écran lié ────────────────────────────────────────────────────────────────

async function renderLinked(instance) {
  const { origin } = instance;
  show('linked');
  $('host').textContent = hostLabel(origin);
  const logo = resolveLogo(instance.logo, origin);
  if (logo) $('logo').src = logo;
  $('link-history').href = homeUrl(origin);
  $('link-config').href = configUrl(origin);

  const state = await getRecordingState();
  const primary = $('new-meeting');
  primary.querySelector('span').textContent = t(state.recording ? 'backToMeeting' : 'newMeeting');
  primary.onclick = async () => {
    await openInstance(origin, { record: !state.recording });
    window.close();
  };
  $('open-app').onclick = async () => {
    await openInstance(origin);
    window.close();
  };
  for (const id of ['link-history', 'link-config']) {
    $(id).onclick = async (event) => {
      event.preventDefault();
      await chrome.tabs.create({ url: $(id).href });
      window.close();
    };
  }
  $('unlink').onclick = async () => {
    await clearInstance();
    await renderUnlinked();
  };

  await renderAccess(instance);

  // Rappel visio : la case reflète la préférence ; l'activer demande la
  // permission de lire l'adresse des onglets de visio, en premier (geste).
  const reminder = $('reminder');
  reminder.checked = await isReminderEnabled();
  reminder.onchange = async () => {
    if (reminder.checked) {
      let granted = false;
      try {
        granted = await chrome.permissions.request({ origins: VIDEO_CALL_HOST_PATTERNS });
      } catch {}
      if (!granted) {
        reminder.checked = false;
        return;
      }
    }
    await setReminderEnabled(reminder.checked);
    await refreshBadge(t);
    await renderStatus(origin);
  };

  await renderStatus(origin);
}

/**
 * La permission du site lié manque-t-elle ? Alors le bouton qui la redemande
 * passe en tête. Le clic demande la permission EN PREMIER (geste), puis
 * remet le pont en route dans les onglets déjà ouverts.
 *
 * @param {{origin: string}} instance
 */
async function renderAccess(instance) {
  const { origin } = instance;
  const box = $('reauth');
  const button = $('reauth-btn');
  box.hidden = await hasSiteAccess(origin);
  // Un seul bouton de marque à la fois : tant que l'accès manque, c'est lui.
  $('new-meeting').classList.toggle('btn-brand', box.hidden);
  if (box.hidden) return;
  $('reauth-text').textContent = t('reauthHint', [hostLabel(origin)]);
  button.textContent = t('reauthUse', [hostLabel(origin)]);
  button.disabled = false;
  button.onclick = async () => {
    button.disabled = true;
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [hostPattern(origin)] });
    } catch {}
    if (!granted) {
      button.disabled = false;
      return;
    }
    await activateBridge(origin).catch(() => {});
    await renderLinked(instance);
  };
}

/** La ligne d'état : réunion en cours (durée vivante) > visio ouverte > session. */
async function renderStatus(origin) {
  const status = $('status');
  const hint = $('visio-hint');
  const state = await getRecordingState();
  clearInterval(timer);
  hint.hidden = true;

  if (state.recording) {
    status.className = state.paused ? 'status paused' : 'status rec';
    const tick = () => {
      const elapsed =
        typeof state.since === 'number' ? formatElapsed(Date.now() - state.since) : '';
      status.textContent = t(state.paused ? 'meetingPaused' : 'meetingRunning', [elapsed]);
    };
    tick();
    timer = setInterval(tick, 1000);
    status.hidden = false;
    return;
  }

  if ((await isReminderEnabled()) && (await isVideoCallOpen())) hint.hidden = false;

  // Après le rendu : le popup ne doit pas attendre le réseau pour s'ouvrir.
  status.hidden = true;
  const user = await fetchSession(origin);
  if (user) {
    status.className = 'status';
    status.textContent = user.name ? t('signedIn', [user.name]) : t('signedInAnon');
    status.hidden = false;
  }
}

// ── Écran de liaison ─────────────────────────────────────────────────────────

async function renderUnlinked() {
  show('unlinked');
  clearInterval(timer);
  const probe = $('probe');
  const button = $('link');
  const error = $('error');
  button.hidden = true;
  error.hidden = true;
  probe.className = 'status neutral';
  probe.textContent = t('linkChecking');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = originOf(tab?.url);
  let found = null;
  if (origin && tab?.id != null) {
    found = await probeTab(tab.id);
    // L'onglet refuse toute exécution (page protégée, politique) : sonde
    // directe, qui ne passe que si la permission du site existe déjà.
    if (found === undefined) found = await probeInstance(origin);
  }
  if (!origin || !found) {
    probe.textContent = t('linkNotFound');
    return;
  }

  probe.className = 'status';
  probe.textContent = hostLabel(origin);
  button.textContent = t('linkUse', [hostLabel(origin)]);
  button.hidden = false;
  button.onclick = async () => {
    button.disabled = true;
    error.hidden = true;
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [hostPattern(origin)] });
    } catch {}
    if (!granted) {
      error.textContent = t('linkDenied');
      error.hidden = false;
      button.disabled = false;
      return;
    }
    try {
      const instance = { origin, logo: found.logo, linkedAt: Date.now() };
      await setInstance(instance);
      await activateBridge(origin);
      await renderLinked(instance);
    } catch {
      error.textContent = t('linkFailed');
      error.hidden = false;
      button.disabled = false;
    }
  };
}

// ── Démarrage ────────────────────────────────────────────────────────────────

(async () => {
  const instance = await getInstance();
  if (instance) await renderLinked(instance);
  else await renderUnlinked();
  // Un badge « ! » posé par le raccourci clavier sans site lié : levé à
  // l'ouverture. Sinon, recalcul depuis l'état — jamais un effacement aveugle.
  if (instance) refreshBadge(t);
  else chrome.action.setBadgeText({ text: '' }).catch(() => {});
})();
