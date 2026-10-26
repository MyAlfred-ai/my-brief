/**
 * Réglages de l'application — réservés aux administrateurs.
 *
 * Cinq familles, cinq documents en base (cf. lib/repositories/settings.js) :
 * `/settings/auth` (fournisseurs d'identité, domaines), `/settings/ai`
 * (clé OpenAI), `/settings/actions` (actions après réunion / résumé),
 * `/settings/branding` (logo, phrase d'accueil, couleur primaire) et
 * `/settings/org-context` (vocabulaire de l'organisation, joint à chaque
 * résumé — réglé depuis le même onglet Configuration, en tête de page) et
 * `/settings/transcript-corrections` (corrections automatiques de la
 * transcription, même onglet, juste dessous).
 *
 * La détection d'actions en réunion N'EST PLUS un réglage d'installation :
 * chaque utilisateur règle la sienne (routes/actions/detection.js).
 *
 * Aucun secret n'est jamais renvoyé (cf. `toPublicSettings` /
 * `toPublicAiSettings`) : le formulaire affiche seulement s'il est renseigné,
 * et l'omettre à l'enregistrement conserve la valeur existante.
 *
 * ⚠️ Chaque fournisseur doit être relayé EXPLICITEMENT au dépôt : un champ
 * accepté par le schéma mais oublié ici serait silencieusement ignoré, et
 * l'interface annoncerait « Enregistré » sans que rien ne change.
 */
import { requireAdmin } from '../../lib/rbac.js';
import { sanitizeDomainList } from '../../lib/auth/domains.js';
import { mergeAuthSettings } from '../../lib/repositories/settings.js';
import { isProviderUsable } from '../../lib/auth/providers.js';
import { normalizeApiKey, upstreamMessage, UpstreamError } from '../../lib/openai.js';
import { fail } from '../../lib/errors.js';
import { ACTION_VARIABLES, listTemplateVariables } from '../../lib/actions/templating.js';
import { activeModels, referencePrices } from '../../lib/costs/estimate.js';
import { effectivePricing, pricingProvenance } from '../../lib/costs/pricing.js';
import {
  adminSettingsBody,
  adminAiSettingsBody,
  adminActionsSettingsBody,
  adminBrandingSettingsBody,
  adminTranscriptionTestBody,
  adminSummaryModelTestBody,
  adminOrgContextSettingsBody,
  adminTranscriptCorrectionsBody,
} from '../auth/schemas.js';

export default function adminSettingsRoutes(app) {
  // Drapeaux d'environnement joints à la projection : l'écran doit pouvoir
  // dire « masqué par le déploiement » sans deviner l'environnement du serveur.
  const authEnvContext = () => ({
    passwordLoginEnv: !!app.config.passwordLoginEnabled,
    legacySsoEnv: !!app.config.oidcEnabled,
  });

  app.get('/settings/auth', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { settings: app.settings.toPublicSettings(await app.settings.get(), authEnvContext()) };
  });

  app.post('/settings/auth', { schema: { body: adminSettingsBody } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const patch = {
      google: req.body.google,
      entra: req.body.entra,
      passwordLogin: req.body.passwordLogin,
      legacySso: req.body.legacySso,
      allowedDomains:
        req.body.allowedDomains === undefined
          ? undefined
          : sanitizeDomainList(req.body.allowedDomains),
    };

    // Refusé AVANT d'écrire : un enregistrement qui ne laisserait plus aucun
    // mode affiché sur l'écran de connexion verrouillerait tout le monde dehors
    // — administrateur compris, et la réparation se ferait en base. Le jugement
    // porte sur l'état d'ARRIVÉE (fusion patch + existant), pas sur le patch :
    // désactiver le mot de passe est légitime tant qu'un SSO utilisable reste.
    const next = mergeAuthSettings(await app.settings.get(), patch);
    const anyModeLeft =
      (app.config.passwordLoginEnabled && next.passwordLogin.enabled) ||
      (app.config.oidcEnabled && next.legacySso.enabled) ||
      isProviderUsable('google', next) ||
      isProviderUsable('entra', next);
    if (!anyModeLeft) return fail(reply, 400, 'no_login_mode_left');

    const updated = await app.settings.update(patch);
    return { settings: app.settings.toPublicSettings(updated, authEnvContext()) };
  });

  // ── Clé OpenAI ────────────────────────────────────────────────────────────

  /**
   * Prix des modèles de transcription proposés, pour choisir en connaissance
   * de cause : les tarifs de l'écran Statistiques (lib/costs), « Actualiser les
   * tarifs » compris. Des tarifs illisibles ne doivent jamais empêcher de
   * régler l'IA : `null`, et l'écran affiche les modèles sans leur prix.
   */
  async function aiPrices(aiDoc, log) {
    try {
      const pricing = effectivePricing(await app.pricing.get());
      const transcription = referencePrices('transcription', {
        models: activeModels(aiDoc, app.config.openai?.models),
        pricing,
      });
      return {
        transcription,
        ...pricingProvenance(
          pricing,
          transcription.map((entry) => entry.model),
        ),
      };
    } catch (err) {
      log?.error({ err }, 'onglet IA : tarifs des modèles indisponibles');
      return null;
    }
  }

  /** Réglages publics de l'IA, et le prix de chaque modèle proposé. */
  async function publicAi(log) {
    const doc = await app.settings.getAi();
    const settings = app.settings.toPublicAiSettings(doc, {
      envKey: app.config.openai?.apiKey || '',
      envModel: app.config.openai?.models?.transcription || '',
      envSummaryModel: app.config.openai?.models?.summary || '',
      envInfographicImageModel: app.config.openai?.models?.infographicImage || '',
    });
    return { settings, prices: await aiPrices(doc, log) };
  }

  app.get('/settings/ai', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return publicAi(req.log);
  });

  /**
   * Enregistre une clé et/ou le modèle de transcription.
   *
   * La clé est VÉRIFIÉE auprès d'OpenAI avant d'être écrite : une clé fausse
   * casse la transcription, le résumé et les actions d'un coup, et le symptôme
   * (« Service IA indisponible ») apparaîtrait chez les utilisateurs, pas ici.
   * Refuser tout de suite met l'erreur sous les yeux de la personne qui vient
   * de la coller.
   *
   * Champ absent = inchangé ; champ vide = retour au défaut (clé du `.env`,
   * modèle intégré). Sans cette distinction, enregistrer un changement de
   * modèle effacerait la clé.
   */
  app.post('/settings/ai', { schema: { body: adminAiSettingsBody } }, async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const patch = {};

    if (req.body.apiKey !== undefined) {
      const { key, problem } = normalizeApiKey(req.body.apiKey);
      if (problem) return fail(reply, 400, problem);

      if (key) {
        try {
          await app.verifyApiKey(key);
        } catch (err) {
          if (!(err instanceof UpstreamError)) throw err;
          req.log?.warn({ status: err.status }, 'clé OpenAI refusée à la vérification');
          return fail(reply, 400, 'openai_key_rejected', {
            upstreamStatus: err.status,
            upstreamMessage: upstreamMessage(err),
          });
        }
      }
      patch.apiKey = key;
    }

    if (req.body.transcriptionModel !== undefined) {
      patch.transcriptionModel = req.body.transcriptionModel;
    }

    if (req.body.summaryModel !== undefined) {
      patch.summaryModel = req.body.summaryModel;
    }

    if (req.body.infographicEnabled !== undefined) {
      patch.infographicEnabled = req.body.infographicEnabled;
    }

    if (req.body.infographicStyle !== undefined) {
      patch.infographicStyle = req.body.infographicStyle;
    }

    if (req.body.infographicImageModel !== undefined) {
      patch.infographicImageModel = req.body.infographicImageModel;
    }

    await app.settings.updateAi(patch, { actor: admin.email });
    return publicAi(req.log);
  });

  // ── Actions après réunion / résumé ────────────────────────────────────────

  // `withFolder` : l'administration voit le dossier cible ; la projection
  // servie aux utilisateurs (cf. routes/auth/session.js) ne l'expose pas.
  const publicActions = async () =>
    app.settings.toPublicActionsSettings(await app.settings.getActions(), {
      mailerEnabled: !!app.mailer?.enabled,
      withFolder: true,
    });

  /**
   * Variables de gabarit admises, servies comme à l'écran utilisateur
   * (`GET /actions/settings`) : c'est la MÊME allowlist, celle qui refuse à
   * l'enregistrement. Recopier la liste côté client la ferait diverger au
   * premier ajout — et l'écran proposerait une variable que le serveur rejette.
   */
  const templateVariables = () => ACTION_VARIABLES.map(({ key }) => key);

  app.get('/settings/actions', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { settings: await publicActions(), variables: templateVariables() };
  });

  app.post(
    '/settings/actions',
    { schema: { body: adminActionsSettingsBody } },
    async (req, reply) => {
      const admin = requireAdmin(req, reply);
      if (!admin) return;
      const templates = [req.body.mail?.subjectTemplate, req.body.naming?.filenameTemplate];
      for (const template of templates) {
        const { unknown } = listTemplateVariables(template);
        // Refusé plutôt que silencieusement retiré au rendu : un `{{client}}`
        // qui disparaît de l'objet d'un mail ne se découvre qu'une fois le mail
        // parti chez le client.
        if (unknown.length) return fail(reply, 400, 'template_variable_unknown', { unknown });
      }

      await app.settings.updateActions(
        {
          transcription: req.body.transcription,
          summary: req.body.summary,
          connections: req.body.connections,
          storage: req.body.storage,
          mail: req.body.mail,
          naming: req.body.naming,
        },
        { actor: admin.email },
      );
      return { settings: await publicActions(), variables: templateVariables() };
    },
  );

  // ── Apparence (logo, phrase d'accueil, couleurs primaire et secondaire) ──

  // `withMeta` : l'administration voit qui a enregistré ; la projection servie
  // par la sonde publique /api/auth/config ne l'expose pas.
  const publicBranding = async () =>
    app.settings.toPublicBrandingSettings(await app.settings.getBranding(), { withMeta: true });

  app.get('/settings/branding', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { settings: await publicBranding() };
  });

  app.post(
    '/settings/branding',
    { schema: { body: adminBrandingSettingsBody } },
    async (req, reply) => {
      const admin = requireAdmin(req, reply);
      if (!admin) return;
      // Chaque champ est relayé EXPLICITEMENT (cf. l'avertissement en tête de
      // fichier) : absent = inchangé, vide = retour à la valeur intégrée.
      await app.settings.updateBranding(
        {
          logo: req.body.logo,
          tagline: req.body.tagline,
          taglineEn: req.body.taglineEn,
          primaryColor: req.body.primaryColor,
          secondaryColor: req.body.secondaryColor,
        },
        { actor: admin.email },
      );
      return { settings: await publicBranding() };
    },
  );

  // ── Contexte de l'organisation (onglet Configuration) ────────────────────

  // `withMeta` : l'administration voit qui a enregistré. La projection servie
  // avec les templates à tout compte authentifié ne porte que le texte.
  const publicOrgContext = async () =>
    app.settings.toPublicOrgContextSettings(await app.settings.getOrgContext(), { withMeta: true });

  app.get('/settings/org-context', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { settings: await publicOrgContext() };
  });

  app.post(
    '/settings/org-context',
    { schema: { body: adminOrgContextSettingsBody } },
    async (req, reply) => {
      const admin = requireAdmin(req, reply);
      if (!admin) return;
      await app.settings.updateOrgContext({ context: req.body.context }, { actor: admin.email });
      return { settings: await publicOrgContext() };
    },
  );

  // ── Corrections automatiques de la transcription (onglet Configuration) ──

  const publicTranscriptCorrections = async () =>
    app.settings.toPublicTranscriptCorrections(await app.settings.getTranscriptCorrections(), {
      withMeta: true,
    });

  app.get('/settings/transcript-corrections', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { settings: await publicTranscriptCorrections() };
  });

  app.post(
    '/settings/transcript-corrections',
    { schema: { body: adminTranscriptCorrectionsBody } },
    async (req, reply) => {
      const admin = requireAdmin(req, reply);
      if (!admin) return;
      await app.settings.updateTranscriptCorrections(
        { rules: req.body.rules },
        { actor: admin.email },
      );
      return { settings: await publicTranscriptCorrections() };
    },
  );

  /**
   * Teste la clé RÉELLEMENT utilisée (celle enregistrée, sinon celle du `.env`).
   * Sert à diagnostiquer sans rien changer : c'est la réponse à « est-ce la clé
   * qui est en cause ? » quand l'IA échoue.
   */
  app.post('/settings/ai/test', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const key = await app.settings.resolveOpenAiKey(app.config.openai?.apiKey || '');
    if (!key) return fail(reply, 400, 'openai_key_missing');
    try {
      await app.verifyApiKey(key);
    } catch (err) {
      if (!(err instanceof UpstreamError)) throw err;
      return fail(reply, 400, 'openai_key_rejected', {
        upstreamStatus: err.status,
        upstreamMessage: upstreamMessage(err),
      });
    }
    return { ok: true };
  });

  /**
   * Teste un modèle de transcription en OUVRANT une vraie session Realtime
   * (jeton éphémère, jamais renvoyé au client) — pas de simulacre : c'est
   * exactement l'appel que fera `/tempkey` au prochain enregistrement.
   *
   * Il attrape ce que la liste ne peut pas savoir : un modèle réservé à
   * certaines organisations (« Your organization does not have access to this
   * transcription model »), un quota, une clé sans droit Realtime. Sans lui, la
   * panne se découvre au démarrage d'une réunion.
   *
   * Le modèle testé est celui du corps — celui qu'on s'apprête à choisir — ou,
   * à défaut, celui déjà enregistré.
   */
  app.post(
    '/settings/ai/test-transcription',
    { schema: { body: adminTranscriptionTestBody } },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const model =
        req.body?.model ||
        (await app.settings.resolveTranscriptionModel(
          app.config.openai?.models?.transcription || '',
        ));
      try {
        await app.openai.realtimeClientSecret('fr', model);
      } catch (err) {
        if (!(err instanceof UpstreamError)) throw err;
        req.log?.warn({ status: err.status, model }, 'modèle de transcription refusé');
        return fail(reply, 400, 'transcription_model_rejected', {
          model,
          upstreamStatus: err.status,
          upstreamMessage: upstreamMessage(err),
        });
      }
      return { ok: true, model };
    },
  );

  /**
   * Test RÉEL du modèle de résumé : un appel de chat minuscule sur ce modèle.
   *
   * Il ne juge PAS la qualité du compte rendu — il répond à la seule question
   * qu'un écran peut trancher avant d'enregistrer : « ce compte OpenAI a-t-il
   * accès à ce modèle ? ». Sans lui, un modèle refusé par l'organisation ne se
   * découvrirait qu'à la première génération, chez l'utilisateur. Deux mots de
   * sortie : le test coûte une fraction de centime, là où une vraie génération
   * coûterait un compte rendu entier.
   */
  app.post(
    '/settings/ai/test-summary',
    { schema: { body: adminSummaryModelTestBody } },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const model =
        req.body?.model ||
        (await app.settings.resolveSummaryModel(app.config.openai?.models?.summary || ''));
      try {
        // AUCUN réglage de volume ni de raisonnement : on teste l'ACCÈS au
        // modèle, et chaque paramètre en plus est une façon supplémentaire de
        // répondre 400 pour une raison qui n'a rien à voir avec l'accès. Mesuré
        // le 2026-09-02 : `reasoningEffort: 'minimal'` — valeur de la
        // génération 5.0 — faisait échouer ce test sur les TROIS modèles
        // proposés, le bouton ne pouvant alors jamais réussir. Un appel nu
        // fonctionne sur toute la famille chat, y compris un modèle hors liste
        // imposé par `OPENAI_MODEL_SUMMARY`.
        await app.openai.chat({
          model,
          messages: [{ role: 'user', content: 'Réponds exactement : OK' }],
          timeoutMs: 30_000,
        });
      } catch (err) {
        if (!(err instanceof UpstreamError)) throw err;
        req.log?.warn({ status: err.status, model }, 'modèle de résumé refusé');
        return fail(reply, 400, 'summary_model_rejected', {
          model,
          upstreamStatus: err.status,
          upstreamMessage: upstreamMessage(err),
        });
      }
      return { ok: true, model };
    },
  );
}
