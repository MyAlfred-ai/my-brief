/**
 * « Mots remplacés » d'un UTILISATEUR — sa liste de corrections de la
 * transcription, en plus de celle de l'organisation (routes/admin/settings.js).
 *
 *   GET  /transcript-corrections        la liste et le choix d'apprendre
 *   POST /transcript-corrections        l'écran de réglages : liste entière, choix
 *   POST /transcript-corrections/learn  les remplacements écrits dans les notes
 *
 * ── Pourquoi une liste PAR COMPTE ───────────────────────────────────────────
 * Un remplacement écrit dans les notes (« Remplace Alexe par Alex ») ne valait
 * que pour sa réunion : il fallait le réécrire à la suivante. Le verser dans la
 * liste de l'organisation l'aurait gardé — mais elle vaut pour TOUS les comptes,
 * et n'importe qui aurait alors réécrit la transcription des autres en prenant
 * des notes. La liste du compte ne touche que ses réunions.
 *
 * Le navigateur l'applique, comme celle de l'organisation (le direct ne passe
 * pas par le serveur) : elle descend avec `GET /api/templates`, et ces routes
 * ne servent qu'à l'écran de réglages et à l'apprentissage.
 *
 * ── Ce qui est appris est décidé par le navigateur ─────────────────────────
 * C'est lui qui lit les notes et écarte ce qui n'est pas une correction de
 * graphie (src/utils/noteReplacements.js). Le serveur n'a pas à le rejuger :
 * un compte n'écrit ici que dans SA liste, comme depuis l'écran. Il tient en
 * revanche ce qu'on ne peut pas laisser au client — le plafond, le « déjà
 * présent », et le choix du compte de ne rien apprendre.
 */
import { requireUser } from '../lib/rbac.js';
import { fail } from '../lib/errors.js';
import { isSameOrigin } from '../lib/auth/originCheck.js';
import { USER_CORRECTIONS_MAX } from '../lib/transcriptCorrections.js';
import {
  userTranscriptCorrectionsBody,
  userTranscriptCorrectionsLearnBody,
} from './auth/schemas.js';

export default function transcriptCorrectionsRoutes(app) {
  app.get('/transcript-corrections', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    return {
      settings: await app.userActions.getTranscriptCorrections(user.email),
      max: USER_CORRECTIONS_MAX,
    };
  });

  app.post(
    '/transcript-corrections',
    { schema: { body: userTranscriptCorrectionsBody } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return undefined;
      // Seconde barrière CSRF, gratuite et tolérante aux appels sans Origin
      // (curl, app.inject) — cf. lib/auth/originCheck.js.
      if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

      const settings = await app.userActions.saveTranscriptCorrections(user.email, {
        rules: req.body.rules,
        learn: req.body.learn,
      });
      return { settings, max: USER_CORRECTIONS_MAX };
    },
  );

  app.post(
    '/transcript-corrections/learn',
    { schema: { body: userTranscriptCorrectionsLearnBody } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return undefined;
      if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

      // La liste de l'organisation est lue ICI, jamais reçue : ce qu'elle
      // corrige déjà de la même façon n'a pas à être recopié chez le compte.
      const { rules: shared } = app.settings.toPublicTranscriptCorrections(
        await app.settings.getTranscriptCorrections(),
      );
      const { rules, learn, added, full } = await app.userActions.learnTranscriptCorrections(
        user.email,
        req.body.replacements,
        { shared },
      );
      return { settings: { rules, learn }, added, full, max: USER_CORRECTIONS_MAX };
    },
  );
}
