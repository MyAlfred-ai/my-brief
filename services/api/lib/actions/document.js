/**
 * Le document d'une action — une transcription ou un résumé — et les deux
 * chemins par lesquels il entre dans l'API.
 *
 * Il y a deux points d'entrée, et c'est irréductible : ajv ne verra jamais un
 * corps multipart (le corps est un flux, donc `undefined` pour lui). Il y avait
 * en revanche DEUX jeux de bornes et DEUX validations à tenir en miroir, avec
 * un commentaire pour seule garantie. Ici, les bornes sont déclarées une fois,
 * le schéma en est DÉRIVÉ, et les deux chemins finissent dans le même
 * `normalizeDocument`.
 *
 * Un troisième producteur est arrivé depuis — le document factice du bouton
 * « Tester » (lib/actions/testDocument.js). Deux copies tenaient avec un
 * commentaire ; trois, non.
 */

/**
 * `content` plafonné à 2 Mo : une transcription de 8 h fait quelques centaines
 * de Ko, un résumé beaucoup moins. Au-delà, c'est un abus, pas une réunion.
 *
 * app.js aligne `fieldSize` du register multipart sur cette valeur : sans quoi
 * un long compte rendu passe en JSON mais est refusé dès qu'une pièce jointe
 * l'accompagne.
 */
export const MAX_CONTENT = 2 * 1024 * 1024;
export const TITLE_MAX = 300;
export const DOCUMENT_KINDS = ['transcription', 'summary'];
export const DOCUMENT_LANGS = ['fr', 'en'];
/** UUID de conversation — borne de transport, pas une règle métier. */
export const MEETING_ID_MAX = 64;

export const actionDocumentSchema = {
  type: 'object',
  required: ['kind', 'content'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: DOCUMENT_KINDS },
    title: { type: 'string', maxLength: TITLE_MAX },
    content: { type: 'string', minLength: 1, maxLength: MAX_CONTENT },
    lang: { type: 'string', enum: DOCUMENT_LANGS },
    meetingId: { type: 'string', maxLength: MEETING_ID_MAX },
  },
};

/**
 * Le même schéma, restreint au JSON.
 *
 * Sans cette restriction, ajv s'appliquerait aussi aux requêtes multipart —
 * dont le corps est un flux, donc `undefined` pour lui : toute pièce jointe
 * était rejetée en `invalid_body` avant même d'atteindre le handler.
 */
export const jsonOnlyBody = { content: { 'application/json': { schema: actionDocumentSchema } } };

/** Caractères qu'aucun fournisseur de stockage n'accepte dans un nom. */
const FORBIDDEN_IN_FILENAME = /[/\\:*?"<>|\r\n\t]/g;

/**
 * Assainit un nom de fichier avant qu'il ne parte chez un fournisseur.
 *
 * Le nom vient du NAVIGATEUR (`part.filename` du multipart) : il n'est passé
 * par aucun schéma, et c'est pourtant lui qui devient le nom du fichier déposé
 * sur le Drive de l'utilisateur. OneDrive refuse un `/` d'un 400 sec, Google
 * l'accepte et produit un nom sale.
 *
 * Le retrait est STRICTEMENT limité aux caractères interdits : ni les espaces
 * ni les tirets ne bougent, sinon un nom fabriqué par src/utils/filename.js
 * (`2026-08-08-point-client.pdf`) ne se reconnaîtrait plus.
 */
export function safeFilename(name, fallback = 'document') {
  const cleaned = String(name || '')
    .replace(FORBIDDEN_IN_FILENAME, '')
    // Un nom qui commence par un point est masqué sur la plupart des systèmes,
    // et `..` traverserait un chemin chez un fournisseur naïf.
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200)
    .trim();
  return cleaned || fallback;
}

/**
 * Valide et normalise un document venu d'ailleurs qu'ajv (multipart, document
 * factice). Mêmes bornes que `actionDocumentSchema`, puisqu'elles sont lues aux
 * mêmes constantes.
 *
 * Renvoie un slug d'erreur plutôt qu'un booléen : les chemins d'entrée
 * distinguent « mauvais type » de « contenu absent ou trop gros ».
 *
 * @param {{kind?: string, title?: string, content?: string, lang?: string,
 *          meetingId?: string}} raw
 * @returns {{document: object}|{error: 'invalid_kind'|'invalid_content'}}
 */
export function normalizeDocument(raw = {}) {
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  if (!DOCUMENT_KINDS.includes(kind)) return { error: 'invalid_kind' };

  const content = typeof raw.content === 'string' ? raw.content : '';
  if (!content || content.length > MAX_CONTENT) return { error: 'invalid_content' };

  const title = (typeof raw.title === 'string' ? raw.title : '').slice(0, TITLE_MAX);
  const lang = DOCUMENT_LANGS.includes(raw.lang) ? raw.lang : DOCUMENT_LANGS[0];

  const meetingId = (typeof raw.meetingId === 'string' ? raw.meetingId : '').slice(
    0,
    MEETING_ID_MAX,
  );

  return { document: { kind, title, content, lang, meetingId } };
}

/**
 * Lit un document envoyé en multipart : mêmes champs que le corps JSON, plus le
 * FICHIER que le navigateur a fabriqué (PDF du résumé, texte de la
 * transcription). Le PDF est tiré de la mise en page du navigateur : le
 * serveur ne peut que relayer ces octets.
 *
 * @returns {Promise<{document: object, file: {filename: string, content: Buffer,
 *   contentType: string}}|{error: string}>}
 */
export async function readMultipartDocument(req) {
  const part = await req.file();
  if (!part) return { error: 'file_required' };

  // Le corps est lu AVANT les champs : @fastify/multipart ne peuple `fields`
  // qu'au fil du flux, et un fichier non consommé bloquerait la requête.
  let content;
  try {
    content = await part.toBuffer();
  } catch (err) {
    // Dépassement de la limite posée sur le register multipart (cf. app.js).
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return { error: 'attachment_too_large' };
    throw err;
  }

  const valueOf = (name) => {
    const field = part.fields?.[name];
    const raw = Array.isArray(field) ? field[0] : field;
    return typeof raw?.value === 'string' ? raw.value : '';
  };

  // Aucun champ de DESTINATION n'est lu ici, et il ne faut jamais en ajouter :
  // cette branche n'a pas d'ajv, donc pas de `removeAdditional`. Destinataires
  // et dossier viennent des réglages persistés, cf. lib/actions/resolve.js.
  //
  // `meetingId` n'en est pas un, et la nuance est ce qui autorise la couche
  // « tag » : ce n'est pas une destination mais une RÉFÉRENCE, relue en base
  // sous le scope du demandeur (cf. `meetingTag` dans lib/actions/resolve.js).
  // Le pire qu'un identifiant forgé puisse faire est de désigner une autre
  // conversation DE LA MÊME PERSONNE, donc un dossier qui est déjà le sien.
  const parsed = normalizeDocument({
    kind: valueOf('kind'),
    title: valueOf('title'),
    content: valueOf('content'),
    lang: valueOf('lang'),
    meetingId: valueOf('meetingId'),
  });
  if (parsed.error) return parsed;

  return {
    document: parsed.document,
    // Accord explicite de l'utilisateur devant l'écran d'approbation. Un
    // consentement, pas une destination : il ne peut RIEN choisir, seulement
    // confirmer ce que le serveur a déjà résolu.
    approved: valueOf('approved') === 'true',
    file: {
      filename: safeFilename(part.filename),
      content,
      contentType: part.mimetype || 'application/octet-stream',
    },
  };
}
