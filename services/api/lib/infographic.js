/**
 * Infographie de compte rendu — génération en tâche de fond.
 *
 * Même contrat que le titre (cf. generateAndSaveTitle dans routes/meetings.js) :
 * la route pose `infographic.status = 'pending'` sur le document `resume` AVANT
 * de répondre, puis l'enregistrement règle le drapeau dans TOUS les cas de
 * sortie — `ready` ou `error`, jamais `pending` à demeure : c'est lui qui borne
 * le polling du frontend.
 *
 * Le CONTENU vit dans une collection dédiée : /history renvoie les documents
 * `resume` ENTIERS, et le document ne porte que l'état ; le contenu se demande
 * à GET /infographic. Historiquement c'était une image de plusieurs Mo ; depuis
 * le 2026-11-17 c'est le contrat de lib/infographicLayout.js (quelques Ko),
 * mis en page par les gabarits du frontend. Les anciennes images restent dans
 * la même collection et sont toujours servies — une régénération les remplace.
 *
 * DEUX TEMPS, séparables : `composeInfographicLayout` écrit le contenu (UN
 * appel au modèle, rien d'enregistré), `saveInfographic` l'enregistre et règle
 * le drapeau. C'est ce qui permet à /resume de lancer l'écriture EN MÊME TEMPS
 * que le compte rendu — elle ne dépend que des matériaux de la réunion — et de
 * n'enregistrer qu'une fois la réunion écrite. Avant le 2026-11-17, elle
 * attendait la fin de la rédaction : son temps s'ajoutait à celui du compte
 * rendu au lieu de s'y fondre.
 *
 * Une réponse illisible fait échouer l'infographie (`error`) : sans contenu, il
 * n'y a rien à mettre en page — l'utilisateur régénère.
 */
import { ownerFilter, ownerFields } from './ownerScope.js';
import { infographicPrompt, INFOGRAPHIC_LAYOUT_RULES } from './prompts.js';
import { normalizeLayout, parseLayoutOutput } from './infographicLayout.js';
import { sanitizeDuration } from './meetingDuration.js';
import { readTagContext, tagContextInfographicBlock } from './tagContext.js';

export const INFOGRAPHICS_COLLECTION = 'infographics';

/**
 * Effort de raisonnement du modèle de contenu : `low`. Trier et résumer dans
 * un format fixe ne demande pas la conception de maquette de l'ère « image »
 * (`medium`), et la vitesse est la raison d'être des gabarits ; `none` est
 * écarté parce que le CHOIX du gabarit, lui, demande un peu de jugement. Non
 * mesuré sur génération réelle depuis ce dépôt (clé de l'organisation).
 */
export const INFOGRAPHIC_REASONING_EFFORT = 'low';

/**
 * Date, durée, modèle de compte rendu et tag de la réunion : ceux du corps de
 * la requête d'abord (une réunion qui naît à cette génération n'a pas encore
 * de document, ni son tag, posé juste après), sinon ceux du document.
 */
async function meetingMeta({ app, email, meetingId, body }) {
  const doc = meetingId
    ? await app.db.collection('resume').findOne(ownerFilter(email, { meetingId }), {
        projection: { meetingStartTime: 1, now: 1, meetingDuration: 1, template: 1, tagId: 1 },
      })
    : null;
  const startedAt = typeof body.meetingStartTime === 'string' ? body.meetingStartTime : '';
  return {
    date: startedAt || doc?.meetingStartTime || doc?.now || new Date().toISOString(),
    durationSec: sanitizeDuration(body.meetingDuration) ?? doc?.meetingDuration ?? null,
    template: body.template ?? doc?.template,
    tagId: typeof body.tagId === 'string' ? body.tagId : doc?.tagId,
  };
}

/**
 * Écrit le contenu de l'infographie — un appel au modèle, RIEN d'enregistré.
 * Lève si la réponse est illisible ou si le modèle échoue.
 *
 * @param {Object} params
 * @param {Object} params.app - instance Fastify décorée (db, openai, config)
 * @param {string} params.email - propriétaire (lecture du document de la réunion)
 * @param {string} [params.meetingId] - absent pour une réunion qui naît à cette génération
 * @param {Object} params.body - matériaux : transcription, actions, notes,
 *   language (celle de l'interface, qui écrit les textes), template,
 *   meetingStartTime, meetingDuration
 * @returns {Promise<{layout: object, model: string}>}
 */
export async function composeInfographicLayout({ app, email, meetingId, body }) {
  const meta = await meetingMeta({ app, email, meetingId, body });
  // Le contexte du tag est relu EN BASE, sous le compte du demandeur : le
  // corps ne porte que l'id (lib/tagContext.js).
  const dossier = await readTagContext(app, email, meta.tagId);
  const model = app.config.openai.models.infographic;
  const written = await app.openai.chat({
    model,
    messages: [
      { role: 'system', content: INFOGRAPHIC_LAYOUT_RULES },
      {
        role: 'user',
        content:
          infographicPrompt({
            transcription: body.transcription ?? '',
            actions: body.actions,
            notes: typeof body.notes === 'string' ? body.notes : '',
            language: body.language,
            template: meta.template,
          }) + tagContextInfographicBlock(dossier),
      },
    ],
    // Ignoré hors famille raisonnante (lib/openai.js) : sans risque pour
    // une surcharge par OPENAI_MODEL_INFOGRAPHIC.
    reasoningEffort: INFOGRAPHIC_REASONING_EFFORT,
  });
  const parsed = parseLayoutOutput(written);
  if (!parsed) throw new Error('contenu illisible');
  const layout = normalizeLayout(parsed, {
    language: body.language,
    actions: body.actions,
    meta: { date: meta.date, durationSec: meta.durationSec },
  });
  return { layout, model };
}

/**
 * Enregistre le contenu écrit (ou l'échec de son écriture) et règle le drapeau
 * — `ready` ou `error`, dans tous les cas.
 *
 * @param {Object} params
 * @param {Object} params.app
 * @param {Object} params.log - logger de la requête d'origine
 * @param {string} params.email - propriétaire, pour le scope de TOUTES les écritures
 * @param {string} params.meetingId
 * @param {Promise<{layout: object, model: string}>} params.compose - l'écriture, en cours ou finie
 */
export async function saveInfographic({ app, log, email, meetingId, compose }) {
  const filter = ownerFilter(email, { meetingId });
  const setStatus = (status) =>
    app.db.collection('resume').updateOne(filter, {
      $set: { infographic: { status, updatedAt: new Date().toISOString() } },
    });
  try {
    const { layout, model } = await compose;
    await app.db.collection(INFOGRAPHICS_COLLECTION).updateOne(
      filter,
      {
        $set: { layout, model, createdAt: new Date().toISOString() },
        // Une ancienne image remplacée part avec sa régénération : GET
        // /infographic sert le contenu le plus récent, jamais les deux.
        $unset: { image: '', mime: '', size: '' },
        $setOnInsert: { ...ownerFields(email), meetingId },
      },
      { upsert: true },
    );
    // Le contenu d'abord, le statut ensuite : un `ready` ne peut jamais
    // désigner une infographie absente.
    await setStatus('ready');
  } catch (err) {
    log.warn({ err: err.message, meetingId }, 'infographie : génération en échec');
    await setStatus('error');
  }
}

/**
 * Les deux temps d'affilée — la régénération seule (POST /infographic/regenerate).
 * @param {{app: Object, log: Object, email: string, meetingId: string, body: Object}} params
 */
export async function generateAndSaveInfographic({ app, log, email, meetingId, body }) {
  return saveInfographic({
    app,
    log,
    email,
    meetingId,
    compose: composeInfographicLayout({ app, email, meetingId, body }),
  });
}
