import App from './App.svelte';
import { registerSW } from 'virtual:pwa-register';
import {
  bootstrapAuthRecovery,
  installAuthFetchInterceptor,
  isRecordingGuardActive,
  registerAuthTokenProvider,
  registerAuthFailureHandler,
} from './utils/httpErrorHandler.js';
import { isNative } from './platform/index.js';
import { loadToken, getCachedToken } from './platform/auth.js';
import { installBackButton } from './platform/backButton.js';
import { runVersionGuard } from './utils/versionGuard.js';
import { initAuth, bootstrapAuth } from './stores/auth.js';

// Installer l'intercepteur de fetch AVANT tout appel réseau (auth recovery, init
// de l'app...). Il marque les requêtes /api/ comme XHR pour que le plugin OIDC
// renvoie 401 au lieu de réécrire le cookie d'état (cause des "CSRF mismatch"),
// et déclenche une reconnexion propre unique sur perte de session.
installAuthFetchInterceptor();

// Le SPA est servi PUBLIQUEMENT ; seules /login et /oauth2/* sont protégées OIDC.
// Si on est ici avec le pathname /login, c'est que le plugin OIDC nous a laissés
// passer => on est authentifié et il vient de nous rediriger vers l'URL d'origine
// (/login). On réécrit alors l'URL en / (sans recharger) pour une adresse propre,
// en conservant un éventuel hash (#admin, #config…).
try {
  if (window.location.pathname === '/login') {
    window.history.replaceState(null, '', '/' + (window.location.hash || ''));
  }
} catch (_) {
  /* ignore */
}

// Web : la perte de session affiche l'écran de connexion (mot de passe + SSO)
// au lieu de rebondir vers l'IdP. Enregistré AVANT bootstrapAuthRecovery, qui
// consulte ce même point de branchement — c'est ce qui neutralise le rebond
// automatique, et donc la cause des « Invalid state parameter » (deux flux OIDC
// initiés en parallèle). L'app native, elle, garde sa porte de login système :
// son handler est enregistré plus bas et écrase celui-ci.
if (!isNative) initAuth();

// Auto-recover si l'utilisateur revient d'une erreur OIDC (CSRF mismatch,
// state invalide, etc.). Sur natif, une récupération déclenche encore une
// navigation dure : on n'a alors rien à monter.
bootstrapAuthRecovery().then(async (recovered) => {
  if (recovered && isNative) return; // forceReauth fera location.replace, abandon

  // L'app a démarré -> on est authentifié. Réinitialise le compteur anti-boucle
  // de la page /auth-recover.html (servie par Traefik `errors` sur CSRF mismatch)
  // pour qu'une future erreur reparte avec un budget de retries plein.
  try {
    sessionStorage.removeItem('mybrief_auth_recover_count');
  } catch (_) {
    /* ignore */
  }

  // App native (mode server.url : cette page EST le site déployé, chargé dans
  // la WebView Capacitor — les évolutions web arrivent donc toutes seules) :
  // brancher l'auth Bearer AVANT le montage (init() part tout de suite). Le
  // jeton est attaché par l'intercepteur ; sur perte de session, le handler
  // remplace le teardown web par la porte de login système (App.svelte écoute).
  if (isNative) {
    await loadToken();
    registerAuthTokenProvider(getCachedToken);
    registerAuthFailureHandler(() => {
      window.dispatchEvent(new CustomEvent('mybrief:native-auth-required'));
    });
    // Android : le retour ferme ce qui est ouvert, puis passe l'app en
    // arrière-plan (platform/backButton.js). Sans lui, il ne faisait rien.
    installBackButton();
  }

  // Nouvelle version du bundle chargée ? -> purge des caches applicatifs
  // hérités (best-effort, asynchrone, ne bloque pas le montage).
  runVersionGuard();

  // Enregistre le service worker. Mode `prompt` (sans skipWaiting) : quand une
  // nouvelle version est prête, onNeedRefresh décide. Hors enregistrement on
  // applique immédiatement (updateSW(true) = activation + reload, comportement
  // identique à l'ancien autoUpdate). PENDANT un enregistrement on DIFFÈRE :
  // un reload détruirait la réunion en cours ; la mise à jour est appliquée
  // automatiquement dès la fin de l'enregistrement (poll ci-dessous).
  // (1re visite : pas d'update en attente -> pas de reload, pas de boucle.)
  // App native Capacitor (mode server.url) : PAS de service worker — la
  // WebView charge le site déployé et prend la dernière version à chaque
  // démarrage ; un SW ne ferait que servir du HTML périmé dans l'app.
  if (!isNative) {
    let applyingUpdate = false; // reload en cours -> ignorer controllerchange
    let pendingUpdate = false; // update différée pendant un enregistrement

    function applyUpdate() {
      if (applyingUpdate) return;
      applyingUpdate = true;
      updateSW(true);
    }

    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Sans ceci, une PWA installée qui reste résidente en mémoire (reprise
        // depuis l'app switcher iOS/Android, onglet jamais fermé) ne re-vérifie
        // jamais sw.js et peut rester des jours sur une vieille version. On
        // force donc la vérification : au retour au premier plan + toutes les
        // 5 minutes. nginx sert sw.js en no-cache -> la vérification voit
        // toujours la dernière version déployée.
        const checkForUpdate = () => {
          if (navigator.onLine === false) return;
          registration.update().catch(() => {});
        };
        setInterval(checkForUpdate, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
      },
      onNeedRefresh() {
        if (isRecordingGuardActive()) {
          console.log('[pwa] mise à jour disponible, différée : enregistrement en cours');
          pendingUpdate = true;
          return;
        }
        applyUpdate();
      },
    });

    // Applique une mise à jour différée dès que l'enregistrement est terminé.
    setInterval(() => {
      if (pendingUpdate && !isRecordingGuardActive()) {
        pendingUpdate = false;
        console.log('[pwa] enregistrement terminé : application de la mise à jour');
        applyUpdate();
      }
    }, 15 * 1000);

    // Un autre onglet/fenêtre a activé le nouveau SW (skipWaiting + clientsClaim) :
    // recharger aussi cette page pour ne pas mélanger ancien bundle et nouveau SW.
    // NB : à la TOUTE première visite, clientsClaim déclenche aussi un
    // controllerchange (la page passe de "non contrôlée" à "contrôlée") — ce
    // n'est pas une mise à jour, on ne recharge pas dans ce cas.
    if ('serviceWorker' in navigator) {
      let wasControlled = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const firstClaim = !wasControlled;
        wasControlled = true;
        if (firstClaim) return; // premier claim, pas une mise à jour
        if (applyingUpdate) return; // reload déjà déclenché par updateSW(true)
        if (isRecordingGuardActive()) {
          pendingUpdate = true; // reload différé fin d'enregistrement
          return;
        }
        applyingUpdate = true;
        window.location.reload();
      });
    }
  }

  // Sonde d'authentification avant le montage : deux requêtes publiques
  // (/api/auth/config et /api/auth/session) qui ne renvoient jamais 401. Sans
  // elle, App.init() partirait sur /api/init et un 401 ferait clignoter l'app
  // avant l'écran de connexion.
  if (!isNative) {
    await bootstrapAuth().catch((err) => {
      console.warn('[auth] sonde de session en échec:', err);
    });
  }

  const app = new App({
    target: document.getElementById('app'),
  });

  app;
});
