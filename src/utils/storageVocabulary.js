/**
 * Vocabulaire du fournisseur de stockage, pour les libellés.
 *
 * Le fournisseur est choisi par l'installation (Administration → Actions) et
 * le serveur le désigne (`connections.provider`, `/connect/status`). Les écrans
 * qui parlent de « votre Drive » doivent dire « OneDrive » à un compte
 * Microsoft — sinon la page « Entreposer » d'une installation Microsoft
 * annonçait un Google Drive que personne n'avait relié.
 *
 * Un seul endroit pour cette table : App.svelte, le bandeau de connexion, la
 * page « Entreposer » et le toast de dépôt en avaient chacun une copie
 * implicite dans un ternaire.
 */

/**
 * Nom courant de l'espace où se déposent les documents.
 *
 * @param {string} providerId - `google`, `microsoft`, ou vide tant que le
 *   serveur n'a pas répondu
 * @param {string} [fallback] - ce qu'on affiche en attendant : le mot
 *   générique de la phrase d'origine, pour ne pas nommer un fournisseur avant
 *   de le connaître
 */
export function storageLabel(providerId, fallback = 'Drive') {
  if (providerId === 'microsoft') return 'OneDrive';
  if (providerId === 'google') return 'Google Drive';
  return fallback;
}

/**
 * Quel logo pour une bibliothèque — celui de [StorageLogo](../components/icons/StorageLogo.svelte).
 *
 * Chez Google, Mon Drive et les Drive partagés portent le même logo. Chez
 * Microsoft il faut distinguer le OneDrive personnel d'une bibliothèque
 * SharePoint, et la seule trace qu'une destination enregistrée en garde est
 * son NOM : la fenêtre de navigation compose « Site / Bibliothèque » pour un
 * site (cf. `fullDriveName` dans DriveFolderPicker.svelte) et le nom nu pour
 * le OneDrive. On relit cette composition ici plutôt que d'ajouter un champ au
 * modèle : les destinations déjà enregistrées n'en auraient pas, et le logo
 * doit être juste pour elles aussi.
 *
 * Fournisseur inconnu ⇒ `''`, et StorageLogo ne rend rien.
 *
 * @param {string} providerId - `google`, `microsoft`, ou vide
 * @param {string} [driveName] - nom enregistré avec la destination
 * @returns {'google-drive'|'onedrive'|'sharepoint'|''}
 */
export function libraryKind(providerId, driveName = '') {
  if (providerId === 'google') return 'google-drive';
  if (providerId === 'microsoft') {
    return String(driveName || '').includes(' / ') ? 'sharepoint' : 'onedrive';
  }
  return '';
}
