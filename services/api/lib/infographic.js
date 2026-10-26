/**
 * Infographie de compte rendu — génération en tâche de fond après /resume.
 *
 * Même contrat que le titre (cf. generateAndSaveTitle dans routes/meetings.js) :
 * la route pose `infographic.status = 'pending'` sur le document `resume` AVANT
 * de répondre, puis cette fonction règle le drapeau dans TOUS les cas de sortie
 * — `ready` ou `error`, jamais `pending` à demeure : c'est lui qui borne le
 * polling du frontend.
 *
 * L'IMAGE, elle, vit dans une collection dédiée : /history renvoie les
 * documents `resume` ENTIERS, y embarquer plusieurs Mo de base64 ferait peser
 * chaque réunion illustrée sur chaque chargement d'historique. Le document
 * `resume` ne porte que l'état ; l'image se demande à GET /infographic.
 */
import { ownerFilter, ownerFields } from './ownerScope.js';
import { infographicPrompt, INFOGRAPHIC_WRITER_RULES, INFOGRAPHIC_PROMPT_MAX } from './prompts.js';

export const INFOGRAPHICS_COLLECTION = 'infographics';
/**
 * Le FORMAT reste FIXE, pas un réglage : la page portrait est un choix de
 * produit (« A4 portrait » côté utilisateur) et la direction artistique du
 * réécrivain est écrite pour elle (lib/prompts.js). En faire un réglage
 * ajouterait une panne possible — un format refusé par l'amont — sans besoin
 * exprimé.
 *
 * Le MODÈLE, lui, ne l'est plus depuis le 2026-09-16 : la génération 2.5
 * apporte des paliers, et l'arbitrage rapidité/coût/accès de l'organisation
 * n'est pas le nôtre. Choix dans Administration → IA, défaut et liste dans
 * lib/infographicModels.js.
 */
export const INFOGRAPHIC_IMAGE_SIZE = '1024x1536';

/**
 * Deux temps, comme l'application ChatGPT (la référence de l'utilisateur) :
 * un modèle TEXTE reçoit la demande et les matériaux bruts (transcription
 * tronquée, actions, notes) et écrit le prompt d'image étayé — maquette, palette
 * et lettrage compris, cf. lib/prompts.js — puis le modèle d'image le dessine.
 * Sans cette réécriture, l'appel API direct rendait une image plate (mesuré
 * 2026-08-31).
 * Réécriture vide ou en échec : repli sur les matériaux bruts, l'image part
 * quand même. L'image remplace la précédente (une infographie par réunion).
 *
 * Le style graphique de l'installation (Administration → IA, facultatif) est
 * joint aux MATÉRIAUX et non aux règles du réécrivain : c'est ce qui le fait
 * survivre au repli ci-dessus, où le réécrivain n'écrit rien.
 *
 * @param {Object} params
 * @param {Object} params.app - instance Fastify décorée (db, openai, config)
 * @param {Object} params.log - logger de la requête d'origine
 * @param {string} params.email - propriétaire, pour le scope de TOUTES les écritures
 * @param {string} params.meetingId
 * @param {Object} params.body - corps de /resume (notes, actions, transcription,
 *   language — celle de l'interface, qui écrit les textes de l'image)
 */
export async function generateAndSaveInfographic({ app, log, email, meetingId, body }) {
  const setStatus = (status) =>
    app.db.collection('resume').updateOne(ownerFilter(email, { meetingId }), {
      $set: { infographic: { status, updatedAt: new Date().toISOString() } },
    });

  try {
    // Charte de l'installation, relue à CHAQUE image : une charte corrigée
    // s'applique à la génération suivante, sans redémarrage. Vide = le modèle
    // choisit sa palette, comportement d'avant ce réglage.
    const materials = infographicPrompt({
      transcription: body.transcription ?? '',
      actions: body.actions,
      notes: typeof body.notes === 'string' ? body.notes : '',
      style: await app.settings.infographicStyle(),
      language: body.language,
    });

    let imagePrompt = '';
    try {
      const written = await app.openai.chat({
        model: app.config.openai.models.infographic,
        messages: [
          { role: 'system', content: INFOGRAPHIC_WRITER_RULES },
          { role: 'user', content: materials },
        ],
        // Effort EXPLICITE, celui du résumé mesuré sur gpt-5.4
        // (lib/summaryModels.js) : concevoir la maquette demande de raisonner
        // — quelle donnée devient quel graphique —, et l'infographie ne doit
        // pas dépendre du défaut du modèle réglé. Ignoré hors famille
        // raisonnante (lib/openai.js), donc sans risque pour une surcharge.
        reasoningEffort: 'medium',
      });
      imagePrompt = String(written || '')
        .trim()
        .slice(0, INFOGRAPHIC_PROMPT_MAX);
    } catch (err) {
      // Réécriture en panne ≠ infographie en panne : les matériaux bruts
      // suffisent à produire une image, juste moins étayée.
      log.warn({ err: err.message, meetingId }, 'infographie : réécriture du prompt en échec');
    }

    // Relu ICI et non au démarrage : un modèle changé dans l'administration
    // s'applique à l'infographie suivante, sans redémarrage — même parti pris
    // que la clé et que le modèle de rédaction.
    const imageModel = await app.settings.resolveInfographicImageModel(
      app.config.openai.models.infographicImage,
    );

    const { b64 } = await app.openai.generateImage({
      model: imageModel,
      prompt: imagePrompt || materials,
      size: INFOGRAPHIC_IMAGE_SIZE,
    });
    if (!b64) throw new Error('image vide');

    const now = new Date().toISOString();
    await app.db.collection(INFOGRAPHICS_COLLECTION).updateOne(
      ownerFilter(email, { meetingId }),
      {
        $set: {
          image: b64,
          mime: 'image/png',
          model: imageModel,
          size: INFOGRAPHIC_IMAGE_SIZE,
          createdAt: now,
        },
        $setOnInsert: { ...ownerFields(email), meetingId },
      },
      { upsert: true },
    );
    // L'image d'abord, le statut ensuite : un `ready` ne peut jamais désigner
    // une image absente. L'ordre inverse ouvrirait la fenêtre au frontend.
    await setStatus('ready');
  } catch (err) {
    log.warn({ err: err.message, meetingId }, 'infographie : génération en échec');
    await setStatus('error');
  }
}
