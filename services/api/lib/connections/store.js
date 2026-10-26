/**
 * Aiguillage du dépôt de document vers le Drive du fournisseur relié.
 *
 * Un seul point d'entrée pour la route : elle ne connaît que « déposer ce
 * fichier pour ce fournisseur », et n'a pas à savoir que Google demande une
 * session d'upload là où Graph veut des tranches. C'est aussi ce qui rend le
 * dépôt injectable dans les tests, comme l'envoi de mail (cf. app.js).
 */
import { storeOnDrive } from './googleDrive.js';
import { storeOnOneDrive } from './msGraph.js';

/**
 * @returns {(params: {provider: string, credentials: object, connection: object,
 *   folderPath: string, file: object}) => Promise<{fileId: string, folderId: string,
 *   folderPath: string, cacheUsed: boolean}>}
 */
export function createDriveStore() {
  return async ({ provider, ...params }) => {
    if (provider === 'google') return storeOnDrive(params);
    if (provider === 'microsoft') return storeOnOneDrive(params);
    // Le fournisseur est validé en amont (registre + réglages) : arriver ici
    // veut dire qu'une entrée du registre n'a pas son implémentation.
    throw new Error(`storage_provider_unsupported_${provider}`);
  };
}
