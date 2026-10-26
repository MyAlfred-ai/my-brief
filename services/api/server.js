/**
 * mybrief-api — point d'entrée. Remplace les workflows n8n : les 20 endpoints
 * applicatifs (/api/*) vivent ici, MongoDB reste la seule base (les données —
 * historique compris — sont strictement inchangées).
 *
 * Le service n'est JAMAIS exposé publiquement : il n'écoute que sur les
 * réseaux docker internes, derrière Traefik qui applique l'authentification
 * (plugin OIDC pour le web, ForwardAuth mobile-auth pour l'app) et injecte les
 * en-têtes d'identité (cf. lib/identity.js).
 *
 * Depuis l'ajout du login par mot de passe, le service authentifie AUSSI
 * lui-même les requêtes portant un cookie de session native — cf. lib/auth/.
 * L'identité par en-tête reste le chemin OIDC/mobile (lib/identity.js).
 *
 * Env :
 *   OPENAI_API_KEY  (optionnel — amorçage ; la clé se règle dans
 *                    Administration → IA et prime alors sur celle-ci)
 *   MONGO_URL       (requis, ex: mongodb://root:pass@mongo:27017/mybrief?authSource=admin)
 *   MONGO_DB        (défaut mybrief)
 *   PORT            (défaut 3000)
 *   OPENAI_BASE_URL (défaut https://api.openai.com/v1 — proxy, Azure, ou mock de test)
 *   → authentification : cf. lib/config.js (SESSION_TTL_DAYS, COOKIE_SECURE,
 *     ADMIN_SEED_*, LEGACY_ADMIN_DOMAIN, OIDC_ENABLED…)
 *   → email : cf. lib/mailer.js (SMTP_HOST et suivants ; vide = reset désactivé)
 */
import { MongoClient } from 'mongodb';
import { buildApp } from './app.js';
import { createOpenAiClient } from './lib/openai.js';
import { loadConfig } from './lib/config.js';
import { bootstrap } from './lib/bootstrap.js';
import { createMailer } from './lib/mailer.js';
import { createSettingsRepo } from './lib/repositories/settings.js';
import { startMyBrainRetryLoop } from './lib/myBrain/feed.js';

// Toute la lecture d'environnement passe par loadConfig — une seule table à
// relire pour savoir ce qui est configurable (cf. lib/config.js).
const config = loadConfig(process.env);

if (!config.mongoUrl) {
  console.error('[api] MONGO_URL manquant');
  process.exit(1);
}

const mongo = new MongoClient(config.mongoUrl);
await mongo.connect();
const db = mongo.db(config.mongoDb);

// Index, migrations et compte admin d'amorçage — idempotents, à chaque boot.
// Bloquant volontairement : servir des requêtes avant que `emailLower` existe
// donnerait des connexions qui échouent sans raison visible. Un échec de
// création d'INDEX arrête le boot (cf. lib/bootstrap.js — fail-fast, une prod
// non indexée est une panne invisible).
try {
  await bootstrap(
    db,
    config,
    {
      info: (msg) => console.log(msg),
      warn: (msg) => console.warn(msg),
      error: (msg) => console.error(msg),
    },
    process.env,
  );
} catch (err) {
  console.error(`[api] bootstrap en échec — arrêt : ${err.message}`);
  process.exit(1);
}

const mailer = createMailer(config.smtp, {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
});

// La clé est résolue à CHAQUE appel, pas au démarrage : celle enregistrée dans
// Administration → IA prime sur celle du `.env`, et un remplacement prend effet
// immédiatement — sans redéploiement, ce qui est tout l'intérêt de l'écran.
const settingsRepo = createSettingsRepo(db);
const openai = createOpenAiClient({
  apiKey: () => settingsRepo.resolveOpenAiKey(config.openai.apiKey),
  ...(config.openai.baseUrl ? { baseUrl: config.openai.baseUrl } : {}),
});

if (!(await settingsRepo.resolveOpenAiKey(config.openai.apiKey))) {
  // Avertissement et NON arrêt : une installation neuve démarre légitimement
  // sans clé, l'administrateur la saisit ensuite dans l'interface. Seules les
  // fonctions IA sont indisponibles d'ici là, et elles le disent (503).
  console.warn(
    '[api] aucune clé OpenAI configurée — transcription, résumé et actions répondront 503. ' +
      'À renseigner dans Administration → IA (ou via OPENAI_API_KEY).',
  );
}

const app = buildApp({
  db,
  openai,
  mailer,
  config,
  logger: { level: config.logLevel },
});

// Relance des envois à myBrain en échec transitoire (réseau, myBrain en
// redémarrage) — ici et non dans buildApp : les tests n'ont pas d'horloge qui
// tourne. Inerte tant que l'administration n'a pas branché myBrain.
const myBrainRetry = startMyBrainRetryLoop(app);

// Arrêt propre : ferme le serveur (les requêtes en vol se terminent — la
// persistance de /resume est DANS le handler désormais), attend TOUS les
// travaux de fond (titres en cours, pas seulement le dernier), puis Mongo.
async function shutdown(signal) {
  app.log.info({ signal }, 'arrêt en cours');
  try {
    myBrainRetry.stop();
    await app.close();
    await app.background.drain();
    await mongo.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ port: config.port, host: '0.0.0.0' });
