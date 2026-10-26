/**
 * Script de contenu injecté sur le site lié — le pont avec l'application
 * (src/stores/extensionBridge.js, côté app).
 *
 *  - Il se SIGNALE (`hello`) à l'injection et sur `ping` : la page
 *    « Extension Chrome » de « Ma configuration » passe au vert.
 *  - Il RELAIE au service worker les messages `state` de l'app (enregistrement
 *    en cours, en pause, depuis quand), qui en fait le badge « REC ». L'app
 *    répond `state` au `hello` : rien à demander de plus.
 *
 * Isolé dans une IIFE : ce fichier est aussi exécuté à la main
 * (scripting.executeScript) juste après la liaison, sur un onglet où il peut
 * déjà avoir tourné — rien ne doit fuir dans la portée globale.
 *
 * `chrome.runtime.sendMessage` échoue quand l'extension a été rechargée
 * (contexte invalidé) : avalé, la page ne doit jamais en souffrir.
 */
(() => {
  const SOURCE = 'mybrief-extension';
  const APP_SOURCE = 'mybrief-app';
  const version = chrome.runtime.getManifest().version;

  const hello = () =>
    window.postMessage({ source: SOURCE, type: 'hello', version }, window.location.origin);

  const relayState = (data) => {
    try {
      chrome.runtime
        .sendMessage({
          type: 'state',
          recording: !!data.recording,
          paused: !!data.paused,
          since: typeof data.since === 'number' ? data.since : null,
        })
        .catch(() => {});
    } catch {}
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== APP_SOURCE) return;
    if (data.type === 'ping') hello();
    else if (data.type === 'state') relayState(data);
  });

  hello();
})();
