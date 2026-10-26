/**
 * mybrief-api — construction de l'application Fastify.
 *
 * Séparé de server.js pour être testable : buildApp() reçoit ses dépendances
 * (db Mongo, client OpenAI) et s'exerce via app.inject(), sans réseau ni
 * process. server.js est le seul à toucher l'environnement réel.
 *
 * Limites de taille — dimensionnées sur les vrais payloads :
 *   - bodyLimit 32 Mo : une transcription de 8 h fait plusieurs Mo de JSON
 *     (le défaut Fastify d'1 Mo tronquerait silencieusement les longues réunions).
 *   - multipart 25 Mo : segments audio hors ligne ~16 Mo max côté client
 *     (rotation des segments, cf. src/platform/offlineRecording.js).
 */
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import coreRoutes from './routes/core.js';
import clientEventsRoutes from './routes/clientEvents.js';
import aiRoutes from './routes/ai.js';
import meetingsRoutes from './routes/meetings.js';
import templatesRoutes from './routes/templates.js';
import tagsRoutes from './routes/tags.js';
import quotaRoutes from './routes/quota.js';
import statsRoutes from './routes/stats.js';
import actionsRoutes from './routes/actions/index.js';
import authRoutes from './routes/auth/index.js';
import adminRoutes from './routes/admin/index.js';
import myBrainRoutes from './routes/myBrain.js';
import oauth2Routes from './routes/oauth2.js';
import mobileAuthRoutes from './routes/mobileAuth.js';
import connectRoutes from './routes/connect.js';
import configChecksRoutes from './routes/configChecks.js';
import authPlugin from './lib/authPlugin.js';
import { createUsersRepo } from './lib/repositories/users.js';
import { createGroupsRepo } from './lib/repositories/groups.js';
import { createQuotaService } from './lib/quota.js';
import { createSettingsRepo } from './lib/repositories/settings.js';
import { createConnectionsRepo } from './lib/repositories/connections.js';
import { createSecretBox } from './lib/crypto/secretBox.js';
import { createUserActionsRepo } from './lib/repositories/userActions.js';
import { createMyBrainSettingsRepo } from './lib/repositories/myBrainSettings.js';
import { createPricingRepo } from './lib/repositories/pricing.js';
import { createPriceSources } from './lib/costs/sources/index.js';
import { createMyBrainClient } from './lib/myBrain/client.js';
import { createDriveStore } from './lib/connections/store.js';
import { createDriveBrowser } from './lib/connections/browse.js';
import { sendViaGraph } from './lib/connections/msGraph.js';
import { sendViaGmail, revokeGmailToken } from './lib/gmail.js';
import { createSessionStore } from './lib/auth/sessions.js';
import { createResetTokenStore } from './lib/auth/resetTokens.js';
import { createOAuthStateStore } from './lib/auth/oauthState.js';
import { loadConfig } from './lib/config.js';
import { verifyOpenAiKey } from './lib/openai.js';
import { createAudioChunker } from './lib/audioChunks.js';
import { slugErrorHandler } from './lib/errors.js';
import { createBackgroundTracker } from './lib/background.js';
import { MAX_CONTENT } from './lib/actions/document.js';

export const BODY_LIMIT = 32 * 1024 * 1024;
export const FILE_LIMIT = 25 * 1024 * 1024;
/**
 * Aligné sur le plafond du champ `content` d'un document d'action — importé, et
 * non recopié : les deux valeurs doivent bouger ensemble ou pas du tout.
 */
export const FIELD_LIMIT = MAX_CONTENT;

/** Mailer inerte par défaut : sans SMTP, la réinitialisation est désactivée, pas cassée. */
const DISABLED_MAILER = {
  enabled: false,
  async sendPasswordReset() {
    throw new Error('mailer_disabled');
  },
  async sendDocument() {
    throw new Error('mailer_disabled');
  },
};

/**
 * @param {Object} deps
 * @param {Object} deps.db - base Mongo (client.db('mybrief')) ou fake de test
 * @param {Object} deps.openai - client créé par lib/openai.js ou fake de test
 * @param {Object} [deps.mailer] - créé par lib/mailer.js ou fake de test
 * @param {Function} [deps.verifyApiKey] - sonde de validité d'une clé OpenAI
 *   candidate ; injectable pour que les tests n'appellent pas le réseau
 * @param {Function} [deps.gmailSend] - envoi via l'API Gmail (lib/gmail.js) ;
 *   injectable pour que les tests n'appellent pas Google
 * @param {Function} [deps.driveStore] - dépôt sur le Drive du compte relié
 *   (lib/connections/store.js) ; injectable pour la même raison
 * @param {Object} [deps.driveBrowser] - navigation dans ce Drive
 *   (lib/connections/browse.js) ; injectable pour la même raison
 * @param {Object} [deps.myBrain] - client de l'API myBrain
 *   (lib/myBrain/client.js) ; injectable pour la même raison
 * @param {Object} [deps.priceSources] - sources en ligne des tarifs d'IA et du
 *   taux de change (lib/costs/sources/index.js) ; injectables pour la même raison
 * @param {Object} [deps.audioChunker] - découpe des imports audio longs
 *   (lib/audioChunks.js) ; injectable : aucun test n'exige ffmpeg
 * @param {Object} [deps.config] - surcharges de lib/config.js (tests)
 * @param {Object|boolean} [deps.logger]
 * @returns {import('fastify').FastifyInstance}
 */
export function buildApp({
  db,
  openai,
  mailer = DISABLED_MAILER,
  verifyApiKey,
  gmailSend,
  graphSend,
  gmailRevoke,
  driveStore,
  driveBrowser,
  myBrain,
  priceSources,
  audioChunker,
  config: configOverride,
  logger = false,
}) {
  const config = { ...loadConfig(), ...(configOverride || {}) };

  // trustProxy : sans lui `req.ip` vaut l'IP du conteneur Traefik pour TOUTES
  // les requêtes, et le rate-limit par IP de /login deviendrait un verrou
  // global qui bloquerait tout le monde dès qu'un seul client se trompe.
  // Sûr ici : l'API n'est jamais exposée directement (réseaux docker internes).
  const app = Fastify({ logger, bodyLimit: BODY_LIMIT, trustProxy: true });

  app.decorate('db', db);
  app.decorate('openai', openai);
  app.decorate('mailer', mailer);
  // Vérification d'une clé OpenAI candidate avant enregistrement. Décorée (et
  // non importée dans la route) pour rester substituable en test : sans ça,
  // enregistrer une clé dans un test partirait vraiment chez OpenAI.
  app.decorate(
    'verifyApiKey',
    verifyApiKey ||
      ((key) =>
        verifyOpenAiKey({
          apiKey: key,
          ...(config.openai?.baseUrl ? { baseUrl: config.openai.baseUrl } : {}),
        })),
  );
  app.decorate('config', config);
  app.decorate('users', createUsersRepo(db));
  // Groupes d'utilisateurs : catalogue à part, appartenance sur le compte
  // (cf. lib/repositories/groups.js).
  app.decorate('groups', createGroupsRepo(db));
  // Minutes de réunion par groupe : l'état d'un compte, et le refus au
  // démarrage (cf. lib/quota.js).
  app.decorate('quota', createQuotaService({ db, users: app.users, groups: app.groups }));
  app.decorate('settings', createSettingsRepo(db));
  // Coffre des refresh tokens. Construit ICI et non dans server.js : la clé
  // vient de `config`, comme toute lecture d'environnement, et les tests
  // l'obtiennent en passant `configOverride` — sans variable d'environnement.
  app.decorate('secretBox', createSecretBox(config.connections?.encryptionKey, app.log));
  app.decorate('connections', createConnectionsRepo(db, app.secretBox));
  app.decorate('userActions', createUserActionsRepo(db));
  // Injectables (tests) : l'envoi, la révocation et le dépôt partent chez le
  // fournisseur du compte relié.
  app.decorate('gmailSend', gmailSend || sendViaGmail);
  app.decorate('graphSend', graphSend || sendViaGraph);
  app.decorate('gmailRevoke', gmailRevoke || revokeGmailToken);
  app.decorate('driveStore', driveStore || createDriveStore());
  // Navigation dans le stockage (fenêtre de sélection de dossier) — injectable
  // pour la même raison que le dépôt : aucun test ne doit sortir sur le réseau.
  app.decorate('driveBrowser', driveBrowser || createDriveBrowser());
  // myBrain : la clé d'application passe par le MÊME coffre que les refresh
  // tokens (cf. lib/repositories/myBrainSettings.js), et l'appel sortant est
  // injectable — aucun test ne doit joindre un vrai cerveau.
  app.decorate('myBrainSettings', createMyBrainSettingsRepo(db, app.secretBox));
  app.decorate('myBrain', myBrain || createMyBrainClient());
  // Tarifs d'IA (Administration → Statistiques) : le dernier relevé en base, et
  // les sources en ligne du prochain — injectables, aucun test ne sort sur le
  // réseau.
  app.decorate('pricing', createPricingRepo(db));
  app.decorate('priceSources', priceSources || createPriceSources());
  // Imports audio longs coupés en tranches de 5 min avant OpenAI (cf.
  // lib/audioChunks.js) : ffmpeg sur le serveur, injectable en test.
  app.decorate('audioChunker', audioChunker || createAudioChunker({ log: app.log }));
  app.decorate('sessions', createSessionStore(db, { ttlMs: config.sessionTtlMs }));
  app.decorate('resetTokens', createResetTokenStore(db, { ttlMs: config.passwordResetTtlMs }));
  app.decorate('oauthStates', createOAuthStateStore(db));
  // Travaux post-réponse (titre de /resume) — traçables par les tests et
  // drainés au shutdown (cf. lib/background.js pour le pourquoi du Set).
  app.decorate('background', createBackgroundTracker());

  // Contrat d'erreur unifié — cf. lib/errors.js. Hérité par tous les
  // sous-contextes (auth, admin, actions y compris).
  app.setErrorHandler(slugErrorHandler);

  // `fieldSize` : le défaut de @fastify/multipart est 1 Mo, alors que le champ
  // `content` des actions (transcription, résumé) est plafonné à 2 Mo côté
  // schéma. Sans cet alignement, un long compte rendu passait en JSON mais
  // était refusé dès qu'une pièce jointe l'accompagnait.
  app.register(multipart, {
    limits: { fileSize: FILE_LIMIT, files: 1, fieldSize: FIELD_LIMIT },
  });

  // Toutes les routes vivent sous /api : Traefik route PathPrefix(/api) vers ce
  // service SANS stripprefix (contrairement à /n8n qui était réécrit).
  app.register(
    async (api) => {
      authPlugin(api); // pose req.user — doit précéder toutes les routes
      coreRoutes(api);
      clientEventsRoutes(api);
      aiRoutes(api);
      meetingsRoutes(api);
      templatesRoutes(api);
      tagsRoutes(api);
      quotaRoutes(api);
      statsRoutes(api);
      actionsRoutes(api);
      connectRoutes(api);
      myBrainRoutes(api);
      configChecksRoutes(api);
      authRoutes(api);
      adminRoutes(api);
    },
    { prefix: '/api' },
  );

  // HORS /api : le callback Entra reprend l'URI de redirection déjà enregistrée
  // dans l'app registration on-prem (`/oauth2/callback`), que nous n'avons pas
  // les droits de changer. Il n'a besoin d'aucune identité préalable — c'est lui
  // qui l'établit — donc pas d'authPlugin ici. Voir routes/oauth2.js.
  oauth2Routes(app);

  // HORS /api également : les chemins du flux mobile (`/auth/mobile/*`,
  // `/auth/verify`) sont ceux du sidecar qu'ils remplacent, et sont câblés
  // dans l'app installée comme dans les labels Traefik. Ils résolvent
  // l'identité eux-mêmes (cf. routes/mobileAuth.js) : pas d'authPlugin ici non
  // plus — /auth/verify est justement ce qui l'ÉTABLIT pour le mobile.
  mobileAuthRoutes(app);

  return app;
}
