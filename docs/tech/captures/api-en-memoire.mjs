/**
 * L'API des captures SANS Docker : la vraie application Fastify du dépôt, sur la base EN MÉMOIRE
 * des tests (services/api/test/helpers.js), remplie par donnees-fictives.mjs. Aucun Mongo, aucune
 * clé, aucun appel sortant. Même port que lancer.sh (3100) : le Vite des captures s'y branche.
 *
 *   node docs/tech/captures/api-en-memoire.mjs            (puis, à côté, le Vite de lancer.sh)
 *
 * Utile là où Docker manque (poste Windows). La base en mémoire n'est pas Mongo : une capture qui
 * montrerait un écran fondé sur `aggregate` (que le faux n'implémente pas) passe par lancer.sh.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { buildTestApp, defaultGroupDoc, adminGroupDoc } = await import(
  pathToFileURL(path.join(racine, 'services/api/test/helpers.js')).href
);
const { app, db } = buildTestApp({ seed: { userGroups: [defaultGroupDoc(), adminGroupDoc()], user: [] } });

// donnees-fictives.mjs parle à Mongo par le pilote de l'API : on lui sert la base en mémoire.
const requireApi = createRequire(path.join(racine, 'services/api/'));
const pilote = requireApi.resolve('mongodb');
class MongoClient {
  async connect() {}
  db() {
    return db;
  }
  async close() {}
}
requireApi.cache[pilote] = { id: pilote, filename: pilote, loaded: true, exports: { MongoClient } };

await app.listen({ port: Number(process.env.CAPTURE_API_PORT ?? 3100), host: '127.0.0.1' });
await import(pathToFileURL(path.join(racine, 'docs/tech/captures/donnees-fictives.mjs')).href);
console.log(`API des captures prête sur http://127.0.0.1:${process.env.CAPTURE_API_PORT ?? 3100}`);
