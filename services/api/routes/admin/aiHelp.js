/**
 * Administration → Aide IA : ce que l'installation propose pendant une réunion.
 *
 *   GET  /admin/settings/ai-help        les réglages, l'état de la lecture de
 *                                       myBrain, et ce que l'administrateur
 *                                       lui-même obtient dans SES réunions
 *   POST /admin/settings/ai-help        domaines proposés, mot d'appel, niveau
 *   POST /admin/settings/ai-help/test   ce que myBrain rend pour une question
 *
 * Ce réglage ne donne l'Aide IA à personne : c'est le droit du groupe qui le
 * fait (Administration → Groupes, cf. lib/repositories/groups.js). Ici on
 * décide de ce qui EXISTE dans l'installation ; là-bas, de qui s'en sert.
 *
 * `myBrain` dit à l'écran pourquoi le garde-fou du projet est, ou non,
 * utilisable : une clé sans le droit « lire » se découvrirait sinon réunion
 * après réunion, chez les utilisateurs. Les droits de la clé sont REDEMANDÉS à
 * myBrain à chaque ouverture de l'onglet (cf. `refreshMyBrainRights`) : ce
 * qu'on y lit est l'état d'aujourd'hui, pas celui du dernier test de connexion.
 *
 * `me` : l'administrateur règle l'installation, puis teste dans ses propres
 * réunions. L'onglet lui dit donc ce que SON compte obtient — la même fonction
 * que celle qui décide en réunion (`aiHelpAccess`), pas une approximation.
 */
import { requireAdmin } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { createRateLimiter } from '../../lib/auth/rateLimit.js';
import { MyBrainError } from '../../lib/myBrain/client.js';
import { keywordsOf } from '../../lib/aiHelp/engine.js';
import { AI_HELP_DOMAINS, AI_HELP_PACES } from '../../lib/aiHelp/domains.js';
import { aiHelpAccess, myBrainReadable, refreshMyBrainRights } from '../../lib/aiHelp/session.js';

const adminAiHelpBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    domains: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(AI_HELP_DOMAINS.map((key) => [key, { type: 'boolean' }])),
    },
    // Borne de transport ; le mot d'appel est nettoyé et coupé par le dépôt.
    wakeWord: { type: 'string', maxLength: 80 },
    pace: { type: 'string', enum: AI_HELP_PACES },
  },
};

const testBody = {
  type: 'object',
  required: ['question'],
  additionalProperties: false,
  properties: { question: { type: 'string', minLength: 1, maxLength: 400 } },
};

/** Ce qu'on montre d'un extrait : assez pour reconnaître la fiche, pas le wiki. */
const EXCERPT_MAX = 700;

export default function adminAiHelpRoutes(app) {
  const testByAccount = createRateLimiter(app.config.rateLimits.aiHelpTestByAccount);
  app.addHook('onClose', async () => testByAccount.stop());

  const view = async (req, admin) => {
    const [settings, connection] = await Promise.all([
      app.settings.getAiHelp(),
      refreshMyBrainRights(app, { force: true, log: req.log }),
    ]);
    const mine = await aiHelpAccess(app, admin, { log: req.log });
    return {
      settings: app.settings.toPublicAiHelpSettings(settings, { withMeta: true }),
      myBrain: {
        connected: !!(connection.url && connection.apiKey),
        canRead: myBrainReadable(connection),
      },
      me: { available: mine.available, myBrain: mine.myBrain, reason: mine.brainReason },
    };
  };

  app.get('/settings/ai-help', async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return undefined;
    return view(req, admin);
  });

  /** Champ ABSENT = inchangé ; `domains` peut ne nommer qu'un domaine. */
  app.post('/settings/ai-help', { schema: { body: adminAiHelpBody } }, async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return undefined;
    const { domains, wakeWord, pace } = req.body;
    await app.settings.updateAiHelp({ domains, wakeWord, pace }, { actor: admin.email });
    return view(req, admin);
  });

  /**
   * « Tester la lecture » : ce que myBrain REND à myBrief pour une question —
   * les deux lectures dont se sert l'Aide IA (le contexte, puis la recherche
   * par mots-clés qui prend le relais quand le contexte est vide). Une sonde
   * réelle, comme celles de la rubrique Modèles IA : « la clé a le droit lire » ne dit pas
   * que le cerveau sait répondre, et sans elle une réponse tirée de la seule
   * réunion ne se distingue pas d'un myBrain muet.
   *
   * Elle teste la CONNEXION de l'installation, pas le droit du compte : un
   * administrateur hors des groupes servis doit pouvoir diagnostiquer.
   * Toujours 200 : une lecture en échec est un RÉSULTAT (`error`, avec le
   * message de myBrain), pas une panne de cette route.
   */
  app.post('/settings/ai-help/test', { schema: { body: testBody } }, async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return undefined;
    const quota = testByAccount.hit(admin.emailLower);
    if (!quota.allowed) {
      return fail(reply, 429, 'too_many_requests', { retryAfter: quota.retryAfterSec });
    }
    const connection = await refreshMyBrainRights(app, { force: true, log: req.log });
    if (!(connection.url && connection.apiKey)) return fail(reply, 409, 'mybrain_not_connected');
    const link = { url: connection.url, apiKey: connection.apiKey };
    const question = req.body.question.replace(/\s+/g, ' ').trim();
    const keywords = keywordsOf(question);
    const failure = (err) => {
      if (!(err instanceof MyBrainError)) throw err;
      return { ok: false, error: err.code, ...err.details() };
    };
    const started = Date.now();
    const [context, search] = await Promise.all([
      app.myBrain
        .context({ ...link, question, budget: 8000 })
        .then((got) => ({
          ok: true,
          sheets: got.sheets.map((sheet) => sheet.title || sheet.path),
          chars: got.context.length,
          truncated: got.truncated,
          excerpt: got.context.slice(0, EXCERPT_MAX),
        }))
        .catch(failure),
      keywords
        ? app.myBrain
            .search({ ...link, query: keywords, limit: 6 })
            .then((hits) => ({
              ok: true,
              results: hits.map((hit) => ({ title: hit.title || hit.path, type: hit.type })),
            }))
            .catch(failure)
        : { ok: true, results: [] },
    ]);
    return {
      canRead: myBrainReadable(connection),
      ms: Date.now() - started,
      keywords,
      context,
      search,
    };
  });
}
