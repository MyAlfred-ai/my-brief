/**
 * Registre des fournisseurs d'identité joués par l'API.
 *
 * Un seul flux OIDC (routes/auth/ssoFlow.js) les sert tous : ce fichier décrit
 * ce qui les distingue, et rien d'autre.
 *
 * ── Pourquoi Entra reprend `/oauth2/callback` ──────────────────────────────
 * Sur les installations passées par le plugin OIDC Traefik, l'URI de redirection
 * `https://<domaine>/oauth2/callback` est DÉJÀ enregistrée dans l'app
 * registration Entra — c'est celle du plugin OIDC Traefik. Nous n'avons pas
 * accès à l'administration Entra pour en déclarer une autre. On hérite donc de
 * l'existante : même URI, même clientId, même secret, seul change qui répond
 * derrière (l'API au lieu du plugin). Ne JAMAIS renommer ce chemin sans un
 * accès admin Entra.
 *
 * Conséquence : ce callback vit hors du préfixe `/api` (cf. app.js) et exige
 * côté Traefik un routeur dédié portant le middleware `noident` — sans lui,
 * n'importe qui pourrait se déclarer n'importe qui par en-tête
 * (cf. lib/auth/resolve.js).
 */

import { EMAIL_RE } from './emailPattern.js';
import { pictureUrl } from '../identity.js';

const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';

/**
 * Adresses candidates d'un profil, dans l'ordre des claims donnés : sans
 * doublon (casse ignorée) et sans ce qui n'a pas la forme d'une adresse —
 * `preferred_username` peut être un numéro de téléphone ou un identifiant libre.
 * @param {unknown[]} values
 * @returns {string[]}
 */
function emailCandidates(values) {
  const seen = new Set();
  const emails = [];
  for (const value of values) {
    const email = String(value || '').trim();
    const key = email.toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

/** Google ne publie son adresse que dans `email`. */
const googleEmails = (profile) => emailCandidates([profile?.email]);

/** Entra : cf. `emailsOf` dans son entrée du registre. */
const entraEmails = (profile) =>
  emailCandidates([profile?.email, profile?.preferred_username, profile?.upn]);

/**
 * Repli si la découverte Google échoue (réseau coupé au démarrage). Ces URLs
 * sont stables depuis des années. Aucun équivalent pour Entra : ses endpoints
 * dépendent du tenant, les deviner enverrait vers le mauvais annuaire.
 */
const GOOGLE_FALLBACK_ENDPOINTS = {
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
};

export const PROVIDERS = {
  google: {
    id: 'google',
    label: 'Google',
    /** URI déclarée dans la console Google Cloud — celle-là, nous la maîtrisons. */
    callbackPath: '/api/auth/google/callback',
    startPath: '/google/start',
    scopes: 'openid email profile',
    discoveryUrlOf: () => GOOGLE_DISCOVERY_URL,
    fallbackEndpoints: GOOGLE_FALLBACK_ENDPOINTS,
    /**
     * Google publie `email_verified`. Une adresse non vérifiée peut appartenir à
     * quelqu'un d'autre : elle ne doit jamais servir de clé de compte.
     */
    requireVerifiedEmail: true,
    /**
     * Adresses sous lesquelles chercher le compte, puis en créer un (cf.
     * routes/auth/ssoFlow.js). Une seule chez Google.
     */
    emailsOf: googleEmails,
    emailOf: (profile) => googleEmails(profile)[0] || '',
    /** Photo de profil : une adresse publique, affichable sans jeton. */
    pictureOf: (profile) => pictureUrl(profile?.picture),
    // Slugs historiques : traduits tels quels par l'écran de connexion.
    errors: {
      disabled: 'google_disabled',
      cancelled: 'google_cancelled',
      failed: 'google_failed',
      stateMismatch: 'google_state_mismatch',
      email: 'google_email_unverified',
    },
  },

  entra: {
    id: 'entra',
    label: 'Microsoft Entra ID',
    callbackPath: '/oauth2/callback', // hérité du plugin — cf. en-tête de fichier
    startPath: '/entra/start',
    scopes: 'openid email profile',
    /** Dépend du tenant : vient des réglages (amorcés depuis OIDC_DISCOVERY_URL). */
    discoveryUrlOf: (providerSettings) => providerSettings?.discoveryUrl || '',
    fallbackEndpoints: null,
    /**
     * Entra ne publie PAS `email_verified` : l'exiger refuserait toutes les
     * connexions. La garantie vient d'ailleurs — l'autorité est épinglée au
     * tenant, donc seuls les comptes de cet annuaire peuvent arriver ici.
     */
    requireVerifiedEmail: false,
    /**
     * L'adresse n'est pas toujours dans `email` : un compte sans adresse `mail`
     * dans l'annuaire n'a que son identifiant de connexion, `preferred_username`
     * — que certains composes à plugin OIDC mappaient déjà. `upn` en dernier recours.
     *
     * Ces deux claims n'existent que dans l'id_token, jamais dans `userinfo`
     * (cf. mergeIdentityClaims dans lib/auth/oauthFlow.js).
     *
     * TOUTES les adresses servent, pas la première : l'identité stockée dépend
     * de l'installation — selon sa configuration, le plugin Traefik posait
     * `email` ou `preferred_username`. Le compte existant se retrouve sous
     * l'une ou l'autre, et un domaine autorisé se juge sur l'une ou l'autre.
     */
    emailsOf: entraEmails,
    emailOf: (profile) => entraEmails(profile)[0] || '',
    /**
     * Rien : le `picture` d'Entra pointe vers Microsoft Graph, qui exige un
     * jeton — un `<img>` n'en a pas, la photo ne s'afficherait jamais. Le
     * compte garde ses initiales.
     */
    pictureOf: () => '',
    errors: {
      disabled: 'sso_disabled',
      cancelled: 'sso_cancelled',
      failed: 'sso_failed',
      stateMismatch: 'sso_state_mismatch',
      email: 'sso_email_missing',
    },
  },
};

/**
 * Un fournisseur est utilisable quand il est activé ET complet : afficher un
 * bouton qui échouerait au premier clic est pire que ne rien afficher.
 * @param {string} id
 * @param {object} settings - document complet de `appSettings` (secret inclus)
 * @returns {boolean}
 */
export function isProviderUsable(id, settings) {
  const provider = PROVIDERS[id];
  const conf = settings?.[id];
  if (!provider || !conf?.enabled || !conf.clientId || !conf.clientSecret) return false;
  // Entra sans URL de découverte n'a pas d'annuaire : rien à interroger.
  if (!provider.fallbackEndpoints && !provider.discoveryUrlOf(conf)) return false;
  return true;
}
