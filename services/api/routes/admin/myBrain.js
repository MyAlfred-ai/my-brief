/**
 * Administration → MyBrain : brancher myBrief sur le myBrain de l'organisation,
 * et décider qui lui envoie ses réunions. Réservé aux administrateurs.
 *
 * La connexion est VÉRIFIÉE auprès de myBrain avant d'être enregistrée — même
 * parti pris que la clé OpenAI (routes/admin/settings.js) : une adresse fausse,
 * une clé révoquée ou une clé sans le droit « nourrir » se découvrirait sinon
 * réunion après réunion, en silence, chez les utilisateurs. Refuser tout de
 * suite met l'erreur sous les yeux de la personne qui vient de la coller.
 *
 * Aucun échec de myBrain ne répond 401 ni 403, même quand myBrain lui-même
 * répond ainsi : le frontend lit ces deux codes comme une perte de SA session
 * (cf. CLAUDE.md, contrat d'erreur). Tout passe en 400 avec un slug.
 *
 * La clé ne ressort jamais : cf. toPublicMyBrainSettings.
 */
import { requireAdmin } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { MyBrainError } from '../../lib/myBrain/client.js';
import {
  MYBRAIN_POLICIES,
  MYBRAIN_URL_MAX,
  normalizeMyBrainUrl,
  normalizeMyBrainKey,
} from '../../lib/repositories/myBrainSettings.js';

const connectionFields = {
  // Borne large : l'adresse est normalisée ENSUITE (…/api/v1 retiré), et
  // c'est la forme normalisée qui est plafonnée.
  url: { type: 'string', maxLength: MYBRAIN_URL_MAX * 2 },
  apiKey: { type: 'string', maxLength: 200 },
};

const adminMyBrainBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...connectionFields,
    policy: { type: 'string', enum: MYBRAIN_POLICIES },
  },
};

const testMyBrainBody = {
  type: 'object',
  additionalProperties: false,
  properties: connectionFields,
};

/**
 * L'adresse et la clé du corps, normalisées. Champ ABSENT = absent du patch :
 * c'est à l'appelant de dire ce que vaut l'absence (inchangé, ou enregistré).
 * @returns {{patch: {url?: string, apiKey?: string}, problem: string}}
 */
function connectionPatch(body) {
  const patch = {};
  if (body?.url !== undefined) {
    const { url, problem } = normalizeMyBrainUrl(body.url);
    if (problem) return { patch, problem };
    patch.url = url;
  }
  if (body?.apiKey !== undefined) {
    const { key, problem } = normalizeMyBrainKey(body.apiKey);
    if (problem) return { patch, problem };
    patch.apiKey = key;
  }
  return { patch, problem: '' };
}

function originOf(value) {
  try {
    return value ? new URL(value).origin : '';
  } catch {
    return '';
  }
}

/**
 * La clé enregistrée ne part JAMAIS vers une nouvelle adresse : la
 * vérification l'y enverrait dans un en-tête, avant même de savoir si c'est un
 * myBrain. Une session d'administration détournée (ou une adresse mal tapée)
 * ne doit pas suffire à l'exfiltrer — changer d'hôte demande de recoller la
 * clé, comme à la première configuration. Vaut pour l'enregistrement ET le
 * test : l'un comme l'autre appelle myBrain avec la clé.
 */
function storedKeyWouldTravel(patch, current) {
  return !!(
    patch.url &&
    patch.apiKey === undefined &&
    current.apiKey &&
    originOf(patch.url) !== originOf(current.url)
  );
}

/**
 * Qui suis-je, auprès de myBrain — et le droit de NOURRIR le cerveau. Une clé
 * « lire » seule répondrait au test et refuserait chaque réunion ensuite.
 *
 * `publicUrl` : l'adresse que myBrain annonce pour lui-même (`api`, sans
 * `/api/v1`). L'adresse saisie ici peut être interne au réseau du serveur
 * (`http://mybrain:3000`) ; c'est l'autre qu'un navigateur sait ouvrir, pour
 * mener l'utilisateur à sa revue.
 */
async function verifyConnection(app, { url, apiKey }) {
  const who = await app.myBrain.whoami({ url, apiKey });
  if (!who.droits.includes('nourrir')) {
    throw new MyBrainError('mybrain_right_missing');
  }
  return {
    application: who.application,
    droits: who.droits,
    publicUrl: normalizeMyBrainUrl(who.api).url || '',
    at: new Date().toISOString(),
  };
}

export default function adminMyBrainRoutes(app) {
  const view = async () => app.myBrainSettings.toPublic(await app.myBrainSettings.get());

  app.get('/settings/mybrain', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { settings: await view() };
  });

  /**
   * Champ ABSENT = inchangé, champ VIDE = retiré (`apiKey: ''` débranche). La
   * connexion n'est revérifiée que si l'adresse ou la clé CHANGE : changer la
   * politique ne dépend pas de la disponibilité de myBrain.
   */
  app.post('/settings/mybrain', { schema: { body: adminMyBrainBody } }, async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const current = await app.myBrainSettings.get();
    const { patch, problem } = connectionPatch(req.body);
    if (problem) return fail(reply, 400, problem);
    if (req.body.policy !== undefined) patch.policy = req.body.policy;
    if (storedKeyWouldTravel(patch, current)) return fail(reply, 400, 'mybrain_key_required');

    const url = patch.url ?? current.url;
    const apiKey = patch.apiKey ?? current.apiKey;
    const connectionChanged =
      (patch.url !== undefined && patch.url !== current.url) ||
      (patch.apiKey !== undefined && patch.apiKey !== current.apiKey);

    let verified;
    if (connectionChanged) {
      if (url && apiKey) {
        try {
          verified = await verifyConnection(app, { url, apiKey });
        } catch (err) {
          if (!(err instanceof MyBrainError)) throw err;
          req.log?.warn({ error: err.code, status: err.status }, 'myBrain : connexion refusée');
          return fail(reply, 400, err.code, err.details());
        }
      } else {
        // Débranché (adresse ou clé retirée) : l'ancienne vérification ne dit
        // plus rien de la connexion.
        verified = null;
      }
    }

    await app.myBrainSettings.update(patch, { actor: admin.email, verified });
    return { settings: await view() };
  });

  /**
   * Teste la connexion telle que l'écran la montre, sans rien enregistrer :
   * l'adresse et la clé du corps quand elles viennent d'être saisies — c'est
   * le geste naturel AVANT « Enregistrer » —, celles enregistrées pour ce qui
   * est absent. Sans corps, la connexion enregistrée : la réponse à « est-ce
   * myBrain qui est en cause ? » quand des réunions restent en échec.
   *
   * Seul le test de la connexion enregistrée met à jour sa vérification
   * (application, droits) : un brouillon ne dit rien d'elle.
   */
  const testOptions = {
    schema: { body: testMyBrainBody },
    // Sans corps = la connexion enregistrée : c'est l'appel d'un onglet resté
    // sur l'écran précédent. Le schéma, lui, veut un objet.
    preValidation: async (req) => {
      if (req.body === undefined || req.body === null) req.body = {};
    },
  };

  app.post('/settings/mybrain/test', testOptions, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const current = await app.myBrainSettings.get();
    const { patch, problem } = connectionPatch(req.body);
    if (problem) return fail(reply, 400, problem);
    if (storedKeyWouldTravel(patch, current)) return fail(reply, 400, 'mybrain_key_required');

    // Champ vide = pas saisi : le test ne « retire » rien, il essaie.
    const url = patch.url || current.url;
    const apiKey = patch.apiKey || current.apiKey;
    if (!url || !apiKey) return fail(reply, 400, 'mybrain_not_configured');
    const draft = url !== current.url || apiKey !== current.apiKey;

    let verified;
    try {
      verified = await verifyConnection(app, { url, apiKey });
    } catch (err) {
      if (!(err instanceof MyBrainError)) throw err;
      req.log?.warn(
        { error: err.code, status: err.status, draft },
        'myBrain : test de connexion en échec',
      );
      return fail(reply, 400, err.code, err.details());
    }
    if (!draft) await app.myBrainSettings.saveVerification(verified);
    return {
      ok: true,
      draft,
      application: verified.application,
      droits: verified.droits,
      settings: await view(),
    };
  });
}
