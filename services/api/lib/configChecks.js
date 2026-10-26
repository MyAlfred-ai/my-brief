/**
 * Diagnostic de configuration — ce qui reste à régler, et OÙ le régler.
 *
 * Alimente les pastilles de l'interface : sur chaque section de
 * l'administration et de « Ma configuration », et sur les boutons qui ouvrent
 * ces panneaux. Chaque constat nomme la SECTION où il se corrige, un code
 * stable que l'écran traduit (src/config/uiText.js → `configChecks`), un niveau
 * et ses variables. Aucune phrase ne sort d'ici, même règle que lib/errors.js.
 *
 * ── Deux périmètres, deux routes ───────────────────────────────────────────
 * L'ORGANISATION (clé OpenAI, actions, identifiants OAuth, MyBrain, tarifs,
 * identité) ne regarde que les administrateurs : eux seuls la corrigent. Le
 * COMPTE (compte relié, dossier de dépôt, dossiers par tag) regarde son
 * titulaire : un administrateur ne peut ni relier le Google d'un collègue ni
 * choisir ses dossiers, et sonder le Drive de chacun avec ses jetons serait
 * aussi coûteux qu'intrusif.
 *
 * ── Des vérifications RÉELLES, mémorisées ──────────────────────────────────
 * « Une clé est enregistrée » ne dit pas qu'elle marche : la clé OpenAI, la
 * connexion MyBrain, le jeton du compte relié et chaque dossier sont éprouvés
 * auprès du service concerné. Pour ne pas le refaire à chaque ouverture de
 * l'app, les verdicts sont mémorisés — et la clé de la mémoire est CE QUI EST
 * VÉRIFIÉ (empreinte de la clé, du jeton, des chemins). Une clé remplacée ou un
 * dossier rechoisi repart donc à neuf sans qu'aucune écriture ait à invalider
 * quoi que ce soit. Un échec est gardé moins longtemps qu'un succès : c'est lui
 * qu'on attend de voir disparaître après une correction faite hors de l'app
 * (dossier recréé dans le Drive, serveur MyBrain redémarré).
 *
 * Chaque sonde a un budget. Au-delà, son constat est ABSENT de cette réponse —
 * on ne sait pas encore — et la sonde, qui continue, remplira la mémoire pour
 * la suivante. Un service lent ne doit pas faire attendre l'interface.
 *
 * ── Ce qui ne donne JAMAIS de pastille ─────────────────────────────────────
 * Une panne passagère (5xx, délai dépassé, limitation de débit, 403 qui en est
 * une) : la pastille dit « il y a quelque chose à régler », pas « le réseau a
 * toussé ». Un doute ne vaut pas une alerte.
 */
import { createHash } from 'node:crypto';
import { UpstreamError } from './openai.js';
import { ConnectionAuthError } from './connections/errors.js';
import {
  CONNECT_PROVIDERS,
  connectionCredentials,
  effectiveProvider,
  hasScope,
} from './connections/providers.js';
import { effectivePricing, pricingProvenance } from './costs/pricing.js';
import { activeModels } from './costs/estimate.js';
import { ownerFilter } from './ownerScope.js';
import { hasDestination } from './actions/resolve.js';
import { TAGS_COLLECTION } from '../routes/tags.js';

/** Du plus grave au plus léger — c'est aussi l'ordre de la réponse. */
export const CHECK_LEVELS = ['error', 'warning', 'tip'];

/** Durée de vie d'un verdict favorable. */
export const CHECK_TTL_MS = 10 * 60_000;

/** Durée de vie d'un échec : court, pour qu'une correction se voie vite. */
export const CHECK_FAILURE_TTL_MS = 2 * 60_000;

/** Temps accordé à une sonde avant de répondre sans elle. */
export const PROBE_BUDGET_MS = 6_000;

/** Au-delà, les tarifs appliqués aux modèles en service sont dits anciens. */
export const PRICES_STALE_DAYS = 30;

const DAY_MS = 24 * 3600 * 1000;

/** Empreinte d'un secret : la mémoire ne garde jamais la clé elle-même. */
const fingerprint = (value) =>
  createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 24);

/** @returns {{section: string, code: string, level: string, vars?: object}} */
function issue(section, code, level, vars) {
  return { section, code, level, ...(vars ? { vars } : {}) };
}

const byLevel = (a, b) => CHECK_LEVELS.indexOf(a.level) - CHECK_LEVELS.indexOf(b.level);

/**
 * Mémoire des verdicts, bornée. Une sonde EN COURS est partagée : deux onglets
 * ouverts ensemble ne sondent qu'une fois.
 *
 * `probe` ne doit pas lever : il rend un verdict, dont `failed` règle la durée
 * de vie. S'il lève quand même, rien n'est gardé.
 *
 * @param {{now?: () => number, maxEntries?: number}} [options]
 */
export function createVerdictCache({ now = () => Date.now(), maxEntries = 500 } = {}) {
  const entries = new Map();

  function prune() {
    const at = now();
    for (const [key, entry] of entries) {
      if (!entry.pending && entry.expiresAt <= at) entries.delete(key);
    }
    // Toujours plein : la plus ancienne part — une sonde refaite, rien de plus.
    if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
  }

  return {
    /**
     * @param {string} key
     * @param {() => Promise<{failed?: boolean}>} probe
     */
    remember(key, probe) {
      const hit = entries.get(key);
      if (hit && (hit.pending || hit.expiresAt > now())) return hit.promise;
      if (entries.size >= maxEntries) prune();
      const entry = { pending: true, expiresAt: 0, promise: null };
      entry.promise = Promise.resolve()
        .then(probe)
        .then(
          (verdict) => {
            entry.pending = false;
            entry.expiresAt = now() + (verdict?.failed ? CHECK_FAILURE_TTL_MS : CHECK_TTL_MS);
            return verdict;
          },
          (err) => {
            entries.delete(key);
            throw err;
          },
        );
      entries.set(key, entry);
      return entry.promise;
    },
  };
}

/**
 * Le verdict, ou `null` s'il dépasse le budget. La sonde n'est pas annulée : elle
 * se termine en arrière-plan et sa réponse servira à la prochaine lecture.
 */
function withinBudget(promise, ms) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
    timer.unref?.();
  });
  return Promise.race([promise.catch(() => null), late]).finally(() => clearTimeout(timer));
}

// ── Sondes ──────────────────────────────────────────────────────────────────

/**
 * Seul un 401 condamne la clé. Un 403 sur `/models` peut venir d'une clé À
 * DROITS RESTREINTS qui transcrit et résume parfaitement : la dire refusée
 * serait faux.
 */
async function probeOpenAiKey(app, key) {
  try {
    await app.verifyApiKey(key);
    return { failed: false };
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 401) {
      return { failed: true, code: 'ai_key_rejected' };
    }
    return { failed: true };
  }
}

/** Échecs de myBrain qui disent une configuration à revoir, pas un incident. */
const MYBRAIN_UNREACHABLE = new Set([
  'mybrain_unreachable',
  'mybrain_not_found',
  'mybrain_redirected',
  'mybrain_invalid_response',
  'mybrain_unavailable',
]);

/**
 * Même vérification que l'enregistrement (routes/admin/myBrain.js) : qui suis-je,
 * et le droit de NOURRIR — sans lui, chaque réunion serait refusée.
 */
async function probeMyBrain(app, { url, apiKey }) {
  try {
    const who = await app.myBrain.whoami({ url, apiKey });
    if (!who?.droits?.includes('nourrir')) return { failed: true, code: 'mybrain_right_missing' };
    return { failed: false };
  } catch (err) {
    const code = err?.code || '';
    if (code === 'mybrain_key_rejected' || code === 'mybrain_right_missing') {
      return { failed: true, code };
    }
    if (MYBRAIN_UNREACHABLE.has(code)) return { failed: true, code: 'mybrain_unreachable' };
    return { failed: true };
  }
}

/**
 * Jeton du compte relié + verdict de chaque destination, en un passage : le
 * rafraîchissement du jeton est aussi ce qui révèle un accès retiré.
 *
 * Lecture seule. Contrairement au dépôt (lib/actions/execute.js), un accès
 * retiré ne SUPPRIME pas la connexion ici : un diagnostic ne change rien, il
 * constate — la purge reste l'affaire du geste qui échoue.
 */
async function probeDestinations(app, { providerId, credentials, connection, targets }) {
  try {
    const states = await app.driveBrowser.probe({
      provider: providerId,
      credentials,
      connection,
      targets: targets.map(({ folder, driveId }) => ({ folder, driveId })),
    });
    return { failed: states.some((state) => state !== 'found'), states };
  } catch (err) {
    if (err instanceof ConnectionAuthError) return { failed: true, revoked: true };
    return { failed: true, states: [] };
  }
}

// ── Organisation ────────────────────────────────────────────────────────────

/**
 * Constats de l'ORGANISATION, pour l'administration.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{cache: ReturnType<typeof createVerdictCache>, budgetMs?: number,
 *   now?: () => number}} options
 * @returns {Promise<Array<{section: string, code: string, level: string, vars?: object}>>}
 */
export async function organizationChecks(
  app,
  { cache, budgetMs = PROBE_BUDGET_MS, now = () => Date.now() },
) {
  const env = app.config.openai || {};
  const [authDoc, aiDoc, actions, myBrain, pricingDoc, branding, orgContext] = await Promise.all([
    app.settings.get(),
    app.settings.getAi(),
    app.settings.getActions(),
    app.myBrainSettings.get(),
    app.pricing.get(),
    app.settings.getBranding(),
    app.settings.getOrgContext(),
  ]);
  const found = [];
  const add = (...args) => found.push(issue(...args));
  const live = [];

  // ── IA : sans clé, l'application enregistre mais ne produit rien. ──
  const key = aiDoc.apiKey || env.apiKey || '';
  if (!key) {
    add('ai', 'ai_key_missing', 'error');
  } else {
    live.push(
      withinBudget(
        cache.remember(`openai:${fingerprint(key)}`, () => probeOpenAiKey(app, key)),
        budgetMs,
      ).then((verdict) => {
        if (verdict?.code) add('ai', verdict.code, 'error');
      }),
    );
  }

  // ── Actions : un bouton coché qui n'apparaîtra chez personne. ──
  const providerId = actions.connections.provider;
  const toggles = [actions.transcription, actions.summary];
  const storageOn = toggles.some((section) => section.storage !== false);
  const mailOn = toggles.some((section) => section.email !== false);
  if (storageOn && !providerId) add('actions', 'storage_provider_missing', 'warning');
  // Le compte qu'un utilisateur peut relier : celui du fournisseur choisi, Google
  // à défaut — même règle que /connect/status.
  const linkable = effectiveProvider(providerId);
  const credentials = connectionCredentials(linkable, authDoc);
  if (providerId && !credentials) {
    add('auth', 'connect_credentials_missing', 'error', { provider: linkable.label });
  }
  // Le bouton mail part par le relais SMTP OU par le compte relié : il ne manque
  // que si ni l'un ni l'autre n'est possible.
  if (mailOn && !app.mailer?.enabled && !credentials) {
    add('actions', 'mail_unavailable', 'warning');
  }

  // ── MyBrain : branché, mais les réunions n'y arrivent plus. ──
  if (myBrain.policy !== 'off' && myBrain.url) {
    if (myBrain.keyUnreadable) {
      add('mybrain', 'mybrain_key_unreadable', 'error');
    } else if (myBrain.apiKey) {
      const target = { url: myBrain.url, apiKey: myBrain.apiKey };
      live.push(
        withinBudget(
          cache.remember(`mybrain:${fingerprint(`${target.url}\n${target.apiKey}`)}`, () =>
            probeMyBrain(app, target),
          ),
          budgetMs,
        ).then((verdict) => {
          if (verdict?.code) add('mybrain', verdict.code, 'error');
        }),
      );
    }
  }

  // ── Statistiques : des estimations bâties sur des prix anciens. ──
  // Le relevé le plus ancien des modèles EN SERVICE, comme l'écran le date.
  const inService = Object.values(activeModels(aiDoc, env.models || {})).filter(Boolean);
  const { checkedAt } = pricingProvenance(effectivePricing(pricingDoc), inService);
  const ageDays = checkedAt ? (now() - Date.parse(checkedAt)) / DAY_MS : 0;
  if (ageDays > PRICES_STALE_DAYS) {
    add('stats', 'prices_stale', 'tip', { days: Math.floor(ageDays) });
  }

  // ── Configuration : une identité jamais réglée. Un conseil, pas une panne. ──
  const brandingSet = ['logo', 'tagline', 'taglineEn', 'primaryColor', 'secondaryColor'];
  if (!brandingSet.some((field) => branding[field])) {
    add('branding', 'branding_default', 'tip');
  }
  if (!String(orgContext.context || '').trim()) add('branding', 'org_context_empty', 'tip');

  await Promise.all(live);
  return found.sort(byLevel);
}

// ── Compte ──────────────────────────────────────────────────────────────────

/**
 * Constats du COMPTE, pour son titulaire : peut-il déposer là où il l'a réglé ?
 *
 * Silencieux tant que le compte n'a rien réglé : il ne dépose peut-être jamais,
 * et une pastille qui réclamerait un compte relié à tout le monde deviendrait
 * vite du bruit qu'on ne regarde plus.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{email: string, emailLower: string}} user
 * @param {{cache: ReturnType<typeof createVerdictCache>, budgetMs?: number}} options
 */
export async function accountChecks(app, user, { cache, budgetMs = PROBE_BUDGET_MS }) {
  const actions = await app.settings.getActions();
  const providerId = actions.connections.provider;
  const provider = CONNECT_PROVIDERS[providerId];
  const storageOn = [actions.transcription, actions.summary].some((s) => s.storage !== false);
  if (!provider || !storageOn) return [];
  // Sans identifiants OAuth, personne ne peut relier son compte : c'est un
  // constat d'ORGANISATION (`connect_credentials_missing`), pas le sien.
  const credentials = connectionCredentials(provider, await app.settings.get());
  if (!credentials) return [];

  const [personal, tags, connection] = await Promise.all([
    app.userActions.get(user.email),
    app.db
      .collection(TAGS_COLLECTION)
      .find(ownerFilter(user.email))
      .project({ _id: 0, id: 1, label: 1 })
      .toArray(),
    app.connections.getByProvider(user.emailLower, providerId),
  ]);

  const labels = new Map(tags.map((tag) => [tag.id, tag.label || '']));
  const targets = [];
  if (hasDestination(personal.storage)) {
    targets.push({ section: 'action-storage', ...destinationOf(personal.storage) });
  }
  for (const entry of personal.storage.tagFolders) {
    // Le dossier d'un tag supprimé depuis ne sert plus : rien à en dire.
    if (!labels.has(entry.tagId) || !hasDestination(entry)) continue;
    targets.push({ section: 'tags', tag: labels.get(entry.tagId), ...destinationOf(entry) });
  }
  if (!targets.length && !personal.storage.tagSubfolders) return [];

  const vars = { provider: provider.label };
  if (!connection) return [issue('mail', 'connection_missing', 'error', vars)];
  if (!hasScope(connection.scopes, provider.driveScope)) {
    return [issue('mail', 'connection_scope_missing', 'error', vars)];
  }

  const key = [
    'storage',
    user.emailLower,
    providerId,
    fingerprint(connection.refreshToken),
    fingerprint(JSON.stringify(targets.map((t) => [t.folder, t.driveId]))),
  ].join(':');
  const verdict = await withinBudget(
    cache.remember(key, () =>
      probeDestinations(app, { providerId, credentials, connection, targets }),
    ),
    budgetMs,
  );
  if (!verdict) return [];
  if (verdict.revoked) return [issue('mail', 'connection_revoked', 'error', vars)];

  const found = [];
  (verdict.states || []).forEach((state, index) => {
    const target = targets[index];
    if (!target) return;
    const onTag = target.section === 'tags';
    const tagVars = onTag ? { tag: target.tag } : {};
    if (state === 'missing') {
      found.push(
        issue(target.section, onTag ? 'tag_folder_missing' : 'storage_folder_missing', 'warning', {
          ...tagVars,
          folder: target.folder,
        }),
      );
    } else if (state === 'drive_missing') {
      found.push(
        issue(target.section, onTag ? 'tag_drive_missing' : 'storage_drive_missing', 'error', {
          ...tagVars,
          drive: target.driveName || target.driveId,
        }),
      );
    }
  });
  return found.sort(byLevel);
}

function destinationOf(storage) {
  return {
    folder: storage.folder || '',
    driveId: storage.driveId || '',
    driveName: storage.driveName || '',
  };
}
