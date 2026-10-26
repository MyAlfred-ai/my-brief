/**
 * État d'authentification — source de vérité unique côté frontend.
 *
 * Existe parce que `userInfo` vivait en variable locale d'App.svelte (5500+
 * lignes) : inaccessible depuis la Sidebar, l'AdminPanel ou l'écran de
 * connexion sans traverser tout l'arbre de props. App.svelte lit maintenant
 * `$auth.user` et ne fait plus que déclencher les actions.
 */
import { writable, derived, get } from 'svelte/store';
import { registerAuthFailureHandler } from '../utils/httpErrorHandler.js';
import * as authApi from '../services/authApi.js';
import { resetActionSettings } from './actionSettings.js';
import { resetActionDetection } from './actionDetection.js';
import { resetInfographic } from './infographic.js';
import { resetMyBrain } from './myBrain.js';
import { resetQuota } from './quota.js';
import { resetConfigChecks } from './configChecks.js';

const EMPTY_CAPABILITIES = {
  oidcEnabled: true,
  // Fournisseurs natifs : joués par l'API et configurés depuis l'administration.
  // Faux par défaut — afficher un bouton qui échouerait serait pire que ne rien
  // afficher.
  googleEnabled: false,
  entraEnabled: false,
  passwordLoginEnabled: true,
  passwordResetEnabled: false,
  passwordPolicy: { minLength: 10 },
  // Actions après réunion / résumé (cf. GET /api/auth/config). « Télécharger »
  // vrai par défaut : c'est le comportement historique, il ne doit pas
  // clignoter le temps que la sonde réponde. Les deux autres attendent la
  // confirmation du serveur — un bouton qui échouerait est pire qu'absent.
  actions: {
    transcription: { email: false, storage: false, download: true },
    summary: { email: false, storage: false, download: true },
    connections: { provider: '' },
    storage: { provider: '' },
    emailAvailable: false,
  },
  // Apparence de l'installation (administration → Configuration). Vide par
  // défaut : logo, phrase et couleur intégrés tant que la sonde n'a pas
  // répondu — l'interface ne doit pas clignoter d'une identité à l'autre.
  branding: { logo: '', tagline: '', taglineEn: '', primaryColor: '', secondaryColor: '' },
  // Infographie de compte rendu (administration → IA). Faux tant que la sonde
  // n'a pas répondu : une case qui échouerait est pire qu'une case absente.
  infographic: { enabled: false },
  // Formulaire de remontées (FEEDBACK_URL côté API). Vide : pas d'entrée
  // « Déclarer un bug ou une idée ».
  feedbackUrl: '',
  // Documentation de l'installation (DOCS_URL côté API). Vide : la publique.
  docsUrl: '',
};

export const auth = writable({
  /** 'unknown' tant que la sonde de démarrage n'a pas répondu. */
  status: 'unknown',
  /**
   * {email, name, role, mustChangePassword, authMode, authProvider, picture,
   * groups, rights} ou null. `picture` : adresse de la photo de profil, vide
   * quand l'IdP n'en publie pas (l'avatar montre alors les initiales). `groups` : les groupes du compte résolus par le serveur
   * ([{id, name, color}]), attribués par l'administration. `rights` : ce que
   * ces groupes lui permettent ({infographic}), cumulatif côté serveur.
   */
  user: null,
  /** Ce que le serveur sait faire — cf. GET /api/auth/config */
  capabilities: { ...EMPTY_CAPABILITIES },
});

/**
 * Créer une infographie : l'installation la propose (interrupteur de l'onglet
 * IA, dans les capacités) ET un groupe du compte en donne le droit. Les deux
 * sont lus à part : l'interrupteur se relit sans recharger la page quand
 * l'administration le change, le droit arrive avec l'identité. Le serveur
 * vérifie les deux à nouveau : ce dérivé ne fait que masquer ce qui serait
 * refusé.
 */
export const canGenerateInfographic = derived(
  auth,
  ($a) => $a.capabilities.infographic?.enabled === true && $a.user?.rights?.infographic === true,
);

function setUser(user) {
  auth.update((state) => ({
    ...state,
    status: user ? 'authenticated' : 'signed_out',
    user: user || null,
  }));
}

/**
 * Marque la session comme perdue — affiche l'écran de connexion.
 *
 * En mode mot de passe, la déconnexion NE recharge PAS la page : les stores
 * survivent. Les réglages d'actions sont donc purgés ici, sinon les
 * destinataires et le brouillon du compte précédent s'afficheraient — et
 * seraient enregistrables — sous le compte suivant. Même raison pour la
 * détection : le rythme du compte précédent régirait la réunion du suivant.
 */
export function signedOut() {
  setUser(null);
  resetActionSettings();
  resetActionDetection();
  // L'image d'une réunion du compte précédent ne doit pas rester affichable
  // (ni son polling actif) sous le compte suivant.
  resetInfographic();
  // Même raison : les derniers envois à myBrain portent des titres de réunion.
  resetMyBrain();
  // Le compteur de minutes est celui d'un compte : il ne survit pas au suivant.
  resetQuota();
  // Les pastilles nomment les dossiers et les tags du compte précédent.
  resetConfigChecks();
}

/**
 * Pont depuis App.init() : /api/init renvoie la même forme que /api/auth/session.
 * Sans lui, les écritures de `userInfo` faites dans App.svelte seraient écrasées
 * par la ligne réactive qui lit le store.
 */
export function setUserFromInit(userData) {
  setUser(userData || null);
}

/**
 * Neutralise le rebond automatique vers l'IdP.
 *
 * Historiquement, un 401 déclenchait `forceReauth()` : purge du service worker
 * et des caches, puis navigation dure vers /login — le déclencheur du flux
 * OIDC. Avec l'écran de connexion unique, la perte de session doit simplement
 * afficher cet écran ; c'est l'utilisateur qui choisit sa méthode. Bénéfice de
 * bord : plus de rebond automatique, donc plus de « Invalid state parameter »
 * quand deux flux OIDC s'initient en même temps.
 *
 * `registerAuthFailureHandler` est consulté par l'intercepteur fetch ET en tête
 * de `forceReauth()` : un seul point à brancher.
 */
export function initAuth() {
  registerAuthFailureHandler((reason) => {
    console.warn('[auth] session perdue:', reason);
    signedOut();
  });
}

/**
 * Sonde de démarrage, avant tout appel applicatif. Les deux requêtes sont
 * publiques et ne déclenchent jamais de 401.
 *
 * ⚠️ `authenticated: false` ne veut PAS dire « déconnecté ». /api/auth/session
 * est servi par un routeur Traefik qui efface les en-têtes d'identité
 * (middleware `noident`, cf. lib/auth/resolve.js) : il ne peut voir qu'une
 * session native, jamais une session OIDC. Conclure `signed_out` ici afficherait
 * l'écran de connexion à un utilisateur SSO parfaitement authentifié — et
 * l'application ne chargerait jamais ses données.
 *
 * On reste donc sur `unknown`, et c'est /api/init — qui passe, lui, par le
 * routeur OIDC — qui tranche : 200 ⇒ session SSO, 401 ⇒ vraiment déconnecté
 * (l'intercepteur fetch bascule alors le store en `signed_out`).
 *
 * @returns {Promise<boolean>} vrai si une session NATIVE est active
 */
export async function bootstrapAuth() {
  const [configRes, sessionRes] = await Promise.all([
    authApi.fetchAuthConfig(),
    authApi.fetchSession(),
  ]);

  const capabilities = configRes.ok
    ? { ...EMPTY_CAPABILITIES, ...configRes.data }
    : { ...EMPTY_CAPABILITIES };

  const user = sessionRes.ok && sessionRes.data.authenticated ? sessionRes.data.user : null;
  auth.set({ status: user ? 'authenticated' : 'unknown', user, capabilities });
  return !!user;
}

/**
 * Relit les seules capacités du serveur, sans toucher à la session.
 *
 * Utile après une écriture qui les change — activer Google depuis
 * l'administration, par exemple : sans ça, l'état affiché resterait celui du
 * démarrage jusqu'au prochain rechargement de page.
 */
export async function refreshCapabilities() {
  const res = await authApi.fetchAuthConfig();
  if (!res.ok) return;
  auth.update((state) => ({
    ...state,
    capabilities: { ...EMPTY_CAPABILITIES, ...res.data },
  }));
}

/**
 * @returns {Promise<{ok: boolean, error?: string, retryAfter?: number}>}
 */
export async function signIn(email, password) {
  const res = await authApi.login(email, password);
  if (!res.ok) {
    return { ok: false, error: res.data.error || 'unknown', retryAfter: res.data.retryAfter };
  }
  setUser(res.data.user);
  return { ok: true };
}

/**
 * Déconnexion. En mode mot de passe, on détruit la session côté serveur et on
 * reste dans l'app : surtout PAS de navigation vers le RP-logout OIDC, qui
 * fermerait aussi la session Google du navigateur pour rien.
 * @returns {Promise<{oidc: boolean}>} `oidc` vrai si l'appelant doit faire le RP-logout
 */
export async function signOut() {
  const wasOidc = get(auth).user?.authMode === 'oidc';
  await authApi.logout();
  signedOut();
  return { oidc: wasOidc };
}

/** Après un changement de mot de passe réussi, le verrou tombe. */
export function clearPasswordChangeRequirement() {
  auth.update((state) =>
    state.user ? { ...state, user: { ...state.user, mustChangePassword: false } } : state,
  );
}
