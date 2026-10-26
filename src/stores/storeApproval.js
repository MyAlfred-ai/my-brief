/**
 * Approbation d'un dépôt : la demande, et la réponse de l'utilisateur.
 *
 * Un store plutôt qu'une prop parce que les deux extrémités ne se connaissent
 * pas — la demande naît dans `utils/postActions.js` (au retour du 409 du
 * serveur), la réponse vient d'une boîte de dialogue montée à la racine. Les
 * relier par des props aurait fait traverser App.svelte à un réglage qui ne le
 * concerne pas, alors qu'il est à son plafond `max-lines`.
 *
 * Le plan affiché vient TOUJOURS du serveur : c'est lui qui a résolu la
 * destination (dossier du tag, bibliothèque, nom de fichier). Une boîte qui
 * annoncerait ce que le client croit serait pire que pas d'approbation du tout.
 */
import { writable } from 'svelte/store';

/** `{ plan, resolve }` tant qu'une demande attend, `null` sinon. */
export const pendingApproval = writable(null);

/**
 * Demande l'accord de l'utilisateur.
 *
 * @param {object} plan - destination résolue par le serveur
 * @returns {Promise<boolean>} `true` si l'utilisateur confirme
 */
export function requestStoreApproval(plan) {
  return new Promise((resolve) => {
    // Une demande déjà en vol est refusée plutôt qu'écrasée : sa promesse
    // resterait pendante pour toujours, et l'appelant garderait son verrou
    // « un envoi à la fois » sans jamais le rendre.
    let replaced = false;
    pendingApproval.update((current) => {
      if (current) {
        replaced = true;
        return current;
      }
      return { plan, resolve };
    });
    if (replaced) resolve(false);
  });
}

/** Réponse de la boîte de dialogue. Idempotent : refermer deux fois ne casse rien. */
export function answerStoreApproval(confirmed) {
  pendingApproval.update((current) => {
    current?.resolve(!!confirmed);
    return null;
  });
}
