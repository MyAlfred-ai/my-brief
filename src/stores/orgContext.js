/**
 * Vocabulaire et contexte de l'organisation — noms de clients, de projets et
 * sigles maison, réglés dans Administration → Templates.
 *
 * Le prompt de résumé est assemblé par le NAVIGATEUR (src/config/templates.js) :
 * ce texte doit donc descendre jusqu'ici. Il arrive avec les templates
 * transverses (`GET /api/templates`), au même moment et par le même appel —
 * les deux servent au même assemblage, les séparer aurait créé un second
 * endroit où oublier de charger.
 *
 * Il ne transite JAMAIS par /api/auth/config, qui est publique : c'est du
 * vocabulaire d'organisation, pas une capacité de l'installation. Un test le
 * verrouille côté serveur.
 *
 * Pas de purge à la déconnexion, contrairement aux brouillons : la valeur est
 * la même pour tous les comptes de l'installation, et elle est réécrite au
 * chargement suivant.
 */
import { writable } from 'svelte/store';

export const orgContext = writable('');

/** @param {unknown} value - `orgContext` de la réponse /api/templates */
export function setOrgContext(value) {
  orgContext.set(typeof value === 'string' ? value : '');
}
