/**
 * Actions post-réunion — montées sous /api, sans préfixe supplémentaire (les
 * chemins `/actions/email` et `/actions/store` sont ceux du frontend installé).
 *
 * Le dossier remplace l'ancien fichier unique routes/actions.js : l'exécution
 * (execute.js) et le paramétrage par utilisateur (settings.js) n'ont ni le même
 * contrat d'entrée ni la même surface de sécurité, et le bouton « Tester »
 * (test.js) est une troisième chose encore. La détection en réunion
 * (detection.js) est venue s'y ranger quand elle a cessé d'être un réglage
 * d'installation.
 *
 * Contrat d'erreur : vrais codes HTTP + { error: '<slug>' } (cf. lib/errors.js).
 * Les erreurs ajv sont normalisées par le handler racine posé dans app.js.
 */
import actionsDetectionRoutes from './detection.js';
import actionsExecuteRoutes from './execute.js';
import actionsSettingsRoutes from './settings.js';
import actionsStorageRoutes from './storage.js';
import actionsTestRoutes from './test.js';

export default function actionsRoutes(app) {
  app.register(async (actions) => {
    actionsDetectionRoutes(actions);
    actionsExecuteRoutes(actions);
    actionsSettingsRoutes(actions);
    actionsStorageRoutes(actions);
    actionsTestRoutes(actions);
  });
}
