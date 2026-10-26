/**
 * Routes templates : globaux (panneau admin), par utilisateur (max 5), et
 * configuration utilisateur (« MA configuration »).
 *
 * IMPORTANT — contrat d'erreur : les erreurs de VALIDATION partent en HTTP 200
 * avec { ok: false, error: '…' }. Le frontend (UserTemplatesPanel.svelte) ne
 * lit `data.ok === false` que si `res.ok` est vrai ; un 400 afficherait un
 * message générique au lieu du message dédié (limite atteinte, slug invalide…).
 * C'était le comportement n8n (« Forward error body » sur un webhook 200).
 */
import { requireEmail } from '../lib/identity.js';
import { ownerFilter, ownerFields } from '../lib/ownerScope.js';
import { requireAdmin } from '../lib/rbac.js';
import { normalizePages } from '../lib/pageMeter.js';

/** Projection commune : jamais de _id vers le client. */
const TEMPLATE_FIELDS = { _id: 0, value: 1, icon: 1, labels: 1, prompt: 1, pageMeter: 1 };

/**
 * Pagimètre du template : sa position par défaut, en pages (cf. lib/pageMeter.js).
 * Le champ n'est écrit que si le template le propose : toute autre valeur —
 * absente, hors bornes, pas un nombre — le laisse de côté, et le document est
 * celui d'avant le Pagimètre. L'écriture remplace le document entier : le
 * désactiver retire donc le champ.
 */
function pageMeterField(body) {
  const pages = normalizePages(body.pageMeter);
  return pages === null ? {} : { pageMeter: pages };
}

const USER_TEMPLATES_MAX = 5;

/**
 * Identifiant de template d'une suppression : une chaîne, sinon ''. Un objet
 * (`{"$ne": ""}`) passé tel quel au filtre y devenait un opérateur et
 * supprimait tous les templates d'un coup.
 */
const valueOf = (body) => (typeof body?.value === 'string' ? body.value : '');

export default function templatesRoutes(app) {
  // ── Templates transverses (gérés depuis le panneau admin) ─────────────────
  // Pas de scope par email : ils sont partagés par tous les utilisateurs. La
  // LECTURE est donc ouverte à tout compte authentifié, mais l'ÉCRITURE est
  // réservée aux administrateurs.
  //
  // Historique : jusqu'à l'ajout des rôles, save/delete n'avaient AUCUN
  // contrôle serveur — le gating vivait uniquement dans le frontend, et tout
  // compte authentifié pouvait réécrire les templates de tout le monde.

  /**
   * `orgContext` voyage AVEC les templates, et non par une route à lui : le
   * navigateur assemble le prompt de résumé et a besoin des deux au même
   * moment, au même endroit du démarrage. Une seconde route serait un second
   * appel, un second moment d'échec, et un second endroit où oublier de le
   * charger.
   *
   * Il n'a rien à faire dans /api/auth/config, qui est PUBLIQUE : c'est le
   * vocabulaire de l'organisation (noms de clients, sigles), pas une capacité
   * de l'installation. Un test le verrouille.
   *
   * `transcriptCorrections` (corrections automatiques de la transcription)
   * suit le même chemin, pour la même raison : le navigateur les applique au
   * direct, et ce sont aussi des noms de clients et de produits.
   */
  app.get('/templates', async (req, reply) => {
    if (!requireEmail(req, reply)) return;
    const templates = await app.db
      .collection('templates')
      .find({})
      .project(TEMPLATE_FIELDS)
      .toArray();
    const { context } = app.settings.toPublicOrgContextSettings(await app.settings.getOrgContext());
    const { rules } = app.settings.toPublicTranscriptCorrections(
      await app.settings.getTranscriptCorrections(),
    );
    return { templates, orgContext: context, transcriptCorrections: rules };
  });

  /** Upsert par `value` : delete puis insert, défauts identiques à n8n. */
  app.post('/templates/save', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body || {};
    const value = (body.value || '').toString().trim();
    if (!value) return reply.code(400).send({ ok: false, error: 'value_required' });
    await app.db.collection('templates').deleteMany({ value });
    await app.db.collection('templates').insertOne({
      value,
      icon: body.icon || '📄',
      labels: body.labels || { fr: value, en: value },
      prompt: body.prompt || '',
      ...pageMeterField(body),
    });
    return { ok: true };
  });

  app.post('/templates/delete', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const value = valueOf(req.body);
    if (!value) return reply.code(400).send({ ok: false, error: 'value_required' });
    await app.db.collection('templates').deleteMany({ value });
    return { ok: true };
  });

  // ── Templates par utilisateur (max 5) ─────────────────────────────────────

  app.get('/user-templates', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const templates = await app.db
      .collection('userTemplates')
      .find(ownerFilter(email))
      .project(TEMPLATE_FIELDS)
      .toArray();
    return { templates };
  });

  /**
   * Création/mise à jour d'un template utilisateur. Validation reprise du node
   * n8n « Validate + cap check », avec le fix : comptage du plafond ET
   * détection de doublon scopés PAR UTILISATEUR (n8n comptait sur TOUTE la
   * collection — 5 templates au global et plus personne ne pouvait créer).
   */
  app.post('/user-templates/save', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const body = req.body || {};
    const rawValue = (body.value || '').toString().trim();
    if (!rawValue) return { ok: false, error: 'value_required' };
    if (!/^[a-z0-9-_]+$/i.test(rawValue)) return { ok: false, error: 'value_invalid' };

    const existing = (
      await app.db
        .collection('userTemplates')
        .find(ownerFilter(email))
        .project({ _id: 0, value: 1 })
        .toArray()
    )
      .map((d) => d.value)
      .filter((v) => typeof v === 'string');
    const exists = existing.includes(rawValue);
    if (!exists && existing.length >= USER_TEMPLATES_MAX) {
      return { ok: false, error: 'limit_reached', count: existing.length, max: USER_TEMPLATES_MAX };
    }

    const now = new Date().toISOString();
    const labels =
      body.labels && typeof body.labels === 'object'
        ? { fr: body.labels.fr || rawValue, en: body.labels.en || rawValue }
        : { fr: rawValue, en: rawValue };
    await app.db.collection('userTemplates').deleteMany(ownerFilter(email, { value: rawValue }));
    await app.db.collection('userTemplates').insertOne({
      ...ownerFields(email),
      value: rawValue,
      icon: body.icon || '📄',
      labels,
      prompt: body.prompt || '',
      ...pageMeterField(body),
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  });

  app.post('/user-templates/delete', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const value = valueOf(req.body);
    if (!value) return { ok: false, error: 'value_required' };
    await app.db.collection('userTemplates').deleteMany(ownerFilter(email, { value }));
    return { ok: true };
  });

  // ── Configuration utilisateur (« MA configuration ») ──────────────────────
  // Texte libre injecté par le frontend dans chaque prompt de résumé.

  app.get('/user-config', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const doc = await app.db.collection('userConfig').findOne(ownerFilter(email));
    return { context: typeof doc?.context === 'string' ? doc.context : '' };
  });

  /** Contexte coercé en chaîne et tronqué à 4000 caractères (parité n8n). */
  app.post('/user-config/save', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    let context = req.body?.context;
    if (typeof context !== 'string') context = '';
    context = context.slice(0, 4000);
    await app.db.collection('userConfig').deleteMany(ownerFilter(email));
    await app.db
      .collection('userConfig')
      .insertOne({ ...ownerFields(email), context, updatedAt: new Date().toISOString() });
    return { ok: true };
  });
}
