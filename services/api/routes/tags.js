/**
 * Tags de conversation — étiquettes de rangement définies PAR UTILISATEUR.
 *
 * Chaque conversation en porte au plus un (cf. `tagId` sur `resume`) : un tag
 * est un classeur, pas une étiquette libre. Ce choix n'est pas cosmétique — un
 * tag portera à terme des règles d'action (destinataires d'un résumé, dossier
 * d'entreposage), et deux tags concurrents sur une même conversation
 * signifieraient deux destinations contradictoires.
 *
 * Contrat d'erreur : de VRAIS codes HTTP, cf. lib/errors.js. Le `200 {ok:false}`
 * de routes/templates.js est un héritage n8n qu'on n'étend pas.
 *
 * La palette est FERMÉE et servie par l'API (`GET /tags` la renvoie) : le
 * frontend mappe chaque slug vers un jeton de design, et ne peut pas inventer
 * une couleur illisible en thème sombre. Le serveur revalide de son côté —
 * une liste envoyée au client n'est pas un contrôle. Même régime pour les
 * FORMES de pastille (`shapes`). La seule liberté laissée à l'utilisateur est
 * la couleur libre (`hue-<angle>-<clarté>`) : un angle de teinte, et une
 * clarté BORNÉE (`hueLightness`, servi aussi) ; le chroma reste fixé par les
 * jetons du frontend. Une pastille libre ne peut donc être ni blanche sur
 * blanc, ni un gris.
 */
import { randomUUID } from 'node:crypto';
import { requireEmail } from '../lib/identity.js';
import { ownerFilter, ownerFields } from '../lib/ownerScope.js';
import { fail } from '../lib/errors.js';

export const TAGS_COLLECTION = 'userTags';

/**
 * Slugs de couleur admis. Le rendu (jeton CSS) appartient au frontend.
 *
 * L'ordre est celui des pastilles du formulaire : les deux teintes sourdes,
 * puis le cercle chromatique, puis les pastilles à motif — un slug composé
 * (`couleur-motif`, ou deux couleurs pour le moitié-moitié). `slate` reste en
 * tête — c'est la couleur d'un nouveau tag. Réordonner est sans risque : un
 * tag stocke son slug, pas un rang.
 */
export const TAG_COLORS = [
  'slate',
  'brown',
  'red',
  'orange',
  'amber',
  'lime',
  'green',
  'teal',
  'sky',
  'blue',
  'navy',
  'violet',
  'fuchsia',
  'pink',
  'blue-stripes',
  'red-stripes',
  'green-spots',
  'amber-spots',
  'violet-ring',
  'teal-ring',
  'navy-orange',
];

/**
 * Clarté d'une couleur libre, en pour cent oklch. Bornée des deux côtés : au
 * plafond, 68 % est la clarté de l'ambre et du vert anis — les pastilles les
 * plus pâles de la palette (contraste ≈ 2,5 à 2,9 sur blanc) ; au-delà, une
 * pastille de 12 px se perd sur fond blanc. Au plancher, 35 % reste une
 * couleur (le marine de la palette est à 42 %) ; plus bas, tout tire vers le
 * noir. `default` est la clarté d'un slug sans suffixe (`hue-<angle>`), la
 * même que le jeton `--tag-hue-l` du frontend. Servi par `GET /tags`
 * (`hueLightness`) : le curseur du formulaire en prend ses bornes, et le
 * store du frontend en garde une copie pour l'avant-premier-chargement —
 * src/stores/tags.test.js vérifie qu'elle est identique.
 */
export const TAG_HUE_LIGHTNESS = { min: 35, max: 68, default: 60 };

/**
 * Couleur libre : `hue-<angle>` ou `hue-<angle>-<clarté>`. Angle entier de 0
 * à 359, clarté à deux chiffres, sans zéro de tête — une seule écriture par
 * couleur, pour que « hue-7 » et « hue-07 » ne soient pas deux couleurs. Le
 * chroma n'est pas dans le slug : il appartient au jeton `--tag-hue-c`.
 */
const TAG_HUE_RE = /^hue-(0|[1-9]\d{0,2})(?:-([1-9]\d))?$/;

/**
 * Un slug de couleur admis : une teinte de la palette, ou une couleur libre
 * dont l'angle et la clarté sont dans les bornes.
 * @param {string} color
 */
export function isTagColor(color) {
  if (TAG_COLORS.includes(color)) return true;
  const m = TAG_HUE_RE.exec(color);
  if (!m || Number(m[1]) >= 360) return false;
  if (m[2] === undefined) return true;
  const lightness = Number(m[2]);
  return lightness >= TAG_HUE_LIGHTNESS.min && lightness <= TAG_HUE_LIGHTNESS.max;
}

/**
 * Formes de pastille admises. Le rendu (`clip-path`) appartient au frontend,
 * en miroir dans tokens.css — un slug servi sans jeton découperait la pastille
 * en rond, sans erreur. `circle` reste en tête : c'est la forme d'un nouveau
 * tag, et celle des tags créés avant les formes (champ absent = rond).
 */
export const TAG_SHAPES = ['circle', 'square', 'diamond', 'triangle', 'hexagon', 'star', 'heart'];

export const TAG_LABEL_MAX = 32;

/**
 * Plafond par utilisateur. Volontairement plus haut que les 5 templates : un
 * tag par client est un usage attendu, pas un abus. Assez bas pour qu'un
 * sélecteur reste lisible sans recherche.
 */
export const USER_TAGS_MAX = 20;

/** Jamais de _id ni de champs d'appartenance vers le client. */
const TAG_FIELDS = { _id: 0, id: 1, label: 1, color: 1, shape: 1, createdAt: 1, updatedAt: 1 };

/**
 * Forme du corps — bornée par ajv pour que la validation sémantique ci-dessous
 * ne travaille jamais sur un mégaoctet de chaîne. Les longueurs ici sont des
 * garde-fous de transport ; la règle métier (`TAG_LABEL_MAX`) est vérifiée
 * ensuite, pour renvoyer un slug précis plutôt qu'un `invalid_body` générique.
 */
const saveBody = {
  type: 'object',
  required: ['label', 'color'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 64 },
    label: { type: 'string', maxLength: 200 },
    color: { type: 'string', maxLength: 32 },
    // Facultative : un client qui ne connaît pas les formes crée des ronds.
    shape: { type: 'string', maxLength: 32 },
  },
};

const deleteBody = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', maxLength: 64 } },
};

/**
 * Clé de comparaison des libellés : casse et espaces neutralisés.
 * Deux tags « Client Dupont » et « client  dupont » sont le même classeur pour
 * l'utilisateur — les laisser coexister rendrait le rangement inutilisable.
 */
function labelKey(label) {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function tagsRoutes(app) {
  const tags = () => app.db.collection(TAGS_COLLECTION);

  /**
   * Tags de l'utilisateur + le vocabulaire dont le frontend a besoin (palette,
   * formes, plafond). Les servir ici évite une seconde source de vérité côté
   * client, qui divergerait au premier ajout de couleur ou de forme.
   */
  app.get('/tags', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const list = await tags()
      .find(ownerFilter(email))
      .sort({ labelLower: 1 })
      .project(TAG_FIELDS)
      .toArray();
    return {
      tags: list,
      colors: TAG_COLORS,
      shapes: TAG_SHAPES,
      hueLightness: TAG_HUE_LIGHTNESS,
      max: USER_TAGS_MAX,
    };
  });

  /**
   * Création (sans `id`) ou renommage/recoloration/changement de forme (avec
   * `id`). Le corps est COMPLET, pas un patch : une forme absente vaut `circle`,
   * jamais « garder l'ancienne ».
   *
   * Un `id` inconnu est un 404, jamais une création silencieuse : côté client
   * il ne peut venir que d'un tag supprimé entre-temps depuis un autre onglet,
   * et le recréer ferait réapparaître un classeur que l'utilisateur a jeté.
   */
  app.post('/tags/save', { schema: { body: saveBody } }, async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;

    const { id, label: rawLabel, color, shape = TAG_SHAPES[0] } = req.body;
    const label = rawLabel.trim().replace(/\s+/g, ' ');
    if (!label) return fail(reply, 400, 'label_required');
    if (label.length > TAG_LABEL_MAX)
      return fail(reply, 400, 'label_too_long', { max: TAG_LABEL_MAX });
    if (!isTagColor(color)) return fail(reply, 400, 'color_invalid');
    if (!TAG_SHAPES.includes(shape)) return fail(reply, 400, 'shape_invalid');

    const owned = await tags()
      .find(ownerFilter(email))
      .project({ _id: 0, id: 1, labelLower: 1 })
      .toArray();
    const lower = labelKey(label);
    if (owned.some((t) => t.labelLower === lower && t.id !== id))
      return fail(reply, 409, 'duplicate_label');

    const now = new Date().toISOString();

    if (id) {
      const res = await tags().updateOne(ownerFilter(email, { id }), {
        $set: { label, labelLower: lower, color, shape, updatedAt: now },
      });
      if (!res.matchedCount) return fail(reply, 404, 'tag_not_found');
      return { tag: { id, label, color, shape, updatedAt: now } };
    }

    if (owned.length >= USER_TAGS_MAX)
      return fail(reply, 409, 'limit_reached', { count: owned.length, max: USER_TAGS_MAX });

    const tag = { id: randomUUID(), label, color, shape, createdAt: now, updatedAt: now };
    await tags().insertOne({ ...ownerFields(email), ...tag, labelLower: lower });
    return { tag };
  });

  /**
   * Suppression d'un tag, et de toutes les références qui y pointent.
   *
   * Les conversations sont détaguées AVANT que le tag disparaisse : si la
   * seconde écriture échoue, il reste un tag sans conversation — inoffensif et
   * rejouable. L'ordre inverse laisserait des conversations pointant vers un
   * tag inexistant, donc invisibles dans tout filtre par tag.
   */
  app.post('/tags/delete', { schema: { body: deleteBody } }, async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const { id } = req.body;

    const existing = await tags().findOne(ownerFilter(email, { id }));
    if (!existing) return fail(reply, 404, 'tag_not_found');

    const untagged = await app.db
      .collection('resume')
      .updateMany(ownerFilter(email, { tagId: id }), { $unset: { tagId: '' } });
    await tags().deleteMany(ownerFilter(email, { id }));

    return { ok: true, untagged: untagged?.modifiedCount || 0 };
  });
}
