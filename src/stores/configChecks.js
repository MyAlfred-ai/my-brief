/**
 * Pastilles de configuration — les constats du diagnostic (cf.
 * services/api/lib/configChecks.js), pour le COMPTE et, chez un
 * administrateur, pour l'ORGANISATION.
 *
 * Un store parce qu'ils ont plusieurs lecteurs qui doivent dire la même chose :
 * les sections des deux panneaux (colonne de gauche, déroulant mobile), la roue
 * crantée et le bouclier qui les ouvrent, et le bouton menu de la barre mobile.
 *
 * Un store ne parle pas à l'utilisateur : il garde les CODES du serveur. Les
 * phrases sont composées par utils/configAlerts.js depuis config/uiText.js.
 *
 * Relu à l'ouverture de l'app, à l'ouverture d'un panneau, et après chaque
 * enregistrement qui peut corriger un constat — le serveur mémorise ses
 * vérifications, relire ne coûte presque rien. Purgé à la déconnexion
 * (stores/auth.js) : les dossiers du compte précédent n'ont pas à s'afficher
 * sous le suivant.
 */
import { writable } from 'svelte/store';
import { fetchAccountChecks, fetchOrganizationChecks } from '../services/configChecksApi.js';

const EMPTY = { loaded: false, account: [], organization: [] };

export const configChecks = writable({ ...EMPTY });

const issuesOf = (res) => (res?.ok && Array.isArray(res.data?.issues) ? res.data.issues : null);

/** Dernier périmètre demandé : un rafraîchissement sans argument le reprend. */
let withOrganization = false;
let running = null;
let queued = false;

async function load() {
  const admin = withOrganization;
  const [account, organization] = await Promise.all([
    fetchAccountChecks(),
    admin ? fetchOrganizationChecks() : null,
  ]);
  // Un échec garde les constats précédents : une pastille qui clignote au gré
  // du réseau ne dirait plus rien.
  configChecks.update((state) => ({
    loaded: true,
    account: issuesOf(account) ?? state.account,
    organization: admin ? (issuesOf(organization) ?? state.organization) : [],
  }));
  return { ok: !!account?.ok && (!admin || !!organization?.ok) };
}

/**
 * Relit les constats. Un appel pendant une lecture en cours est REPORTÉ, pas
 * perdu : il suit souvent un enregistrement, que la lecture en cours ne voit
 * peut-être pas encore.
 *
 * @param {{admin?: boolean}} [options] - lire aussi l'organisation (admin)
 */
export function refreshConfigChecks(options = {}) {
  if (options.admin !== undefined) withOrganization = !!options.admin;
  if (running) {
    queued = true;
    return running;
  }
  running = load().finally(() => {
    running = null;
    if (queued) {
      queued = false;
      refreshConfigChecks();
    }
  });
  return running;
}

export function resetConfigChecks() {
  withOrganization = false;
  queued = false;
  configChecks.set({ ...EMPTY });
}
