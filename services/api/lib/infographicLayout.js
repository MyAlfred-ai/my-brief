/**
 * Infographie en GABARITS — le contrat de données que l'IA remplit et que le
 * frontend met en page (src/components/infographic/).
 *
 * ── Pourquoi des gabarits et plus une image (2026-11-17) ────────────────────
 * L'image dessinée par un modèle (gpt-image-2, puis Flare) prenait une à trois
 * minutes, en deux appels, et ne savait ni placer le logo de l'organisation
 * (le prompt l'interdisait : un modèle d'image ne reproduit pas un fichier) ni
 * garantir ses textes. Désormais l'IA n'écrit que le CONTENU, dans ce format
 * fixe ; six gabarits le mettent en page avec le logo et les couleurs de
 * l'Apparence. L'appel d'image disparaît, le texte est exact, et les anciennes
 * images restent servies telles quelles (GET /infographic).
 *
 * ── Ce que ce module garantit ───────────────────────────────────────────────
 * La sortie du modèle n'est jamais affichée telle quelle : `normalizeLayout`
 * ne garde que les clés connues, borne chaque texte et chaque liste, ramène
 * chaque énumération à une valeur permise. Le frontend peut donc compter sur
 * ces bornes pour la mise en page (une carte ne déborde pas parce que le
 * modèle a été bavard), et rien d'inattendu n'arrive à l'écran.
 *
 * Le gabarit choisi par le modèle n'est retenu que si sa matière est là : une
 * « feuille de route » sans trois jalons serait une page vide — elle retombe
 * sur la « synthèse », qui s'affiche avec n'importe quel contenu.
 *
 * ⚠️ Les listes TEMPLATES et ICONS sont recopiées côté frontend
 * (src/lib/infographic/catalog.js) ; un test vérifie qu'elles ne divergent pas.
 */
import { normalizeLang } from './text.js';

/** Version du contrat, stockée avec chaque infographie. */
export const INFOGRAPHIC_LAYOUT_VERSION = 1;

/** Les six gabarits, dans l'ordre où les règles du modèle les présentent. */
export const INFOGRAPHIC_TEMPLATES = [
  'synthese',
  'decision',
  'feuille_de_route',
  'tableau_de_bord',
  'atelier',
  'bilan',
];

/** Gabarit de repli : il s'affiche avec n'importe quel contenu. */
export const DEFAULT_INFOGRAPHIC_TEMPLATE = 'synthese';

/**
 * Pictogrammes que le modèle peut demander — liste FERMÉE : chacun est dessiné
 * dans le même trait côté frontend (src/lib/infographic/icons.js). Un nom hors
 * liste devient `point`.
 */
export const INFOGRAPHIC_ICONS = [
  'document',
  'calendrier',
  'horloge',
  'euro',
  'graphique',
  'tendance',
  'cible',
  'equipe',
  'personne',
  'coche',
  'alerte',
  'drapeau',
  'fusee',
  'ampoule',
  'outil',
  'engrenage',
  'bouclier',
  'usine',
  'camion',
  'panier',
  'message',
  'loupe',
  'etoile',
  'coeur',
  'cadenas',
  'balance',
  'ordinateur',
  'feuille',
  'globe',
  'diplome',
];

/** Forme graphique d'un chiffre (cf. KpiTile côté frontend). */
export const KPI_FORMS = ['valeur', 'part', 'progression', 'objectif', 'evolution'];

/** État d'un jalon de feuille de route. */
export const MILESTONE_STATES = ['fait', 'a_venir', 'objectif'];

/**
 * Bornes en CARACTÈRES et en NOMBRE d'éléments. Les mots demandés au modèle
 * (lib/prompts.js) tiennent largement dedans : ces bornes-ci ne servent qu'à
 * protéger la mise en page d'une sortie qui ne les respecterait pas.
 *
 * Les NOMBRES sont ceux d'une page A4 (2026-11-17, demande explicite : « que
 * du A4 ») : mesurés au banc d'essai sur des réunions denses, ils laissent
 * chaque gabarit tenir sur la page sans réduire le texte au-delà de
 * l'illisible (cf. fitScale, src/lib/infographic/fit.js).
 */
export const LAYOUT_LIMITS = Object.freeze({
  titre: 90,
  sousTitre: 150,
  herosValeur: 28,
  herosLibelle: 130,
  chiffres: 4,
  chiffreLibelle: 48,
  unite: 10,
  note: 70,
  repartition: 5,
  repartitionTitre: 60,
  repartitionLibelle: 32,
  sujets: 4,
  sujetTitre: 40,
  points: 3,
  point: 110,
  decisions: 4,
  vigilances: 3,
  phrase: 130,
  jalons: 6,
  quand: 18,
  jalonLibelle: 60,
  jalonDetail: 90,
  options: 3,
  optionTitre: 60,
  arguments: 2,
  argument: 90,
  themes: 4,
  theme: 40,
  idees: 3,
  idee: 100,
  bilan: 4,
  participants: 10,
  participant: 40,
  prochaineEtape: 100,
  actions: 8,
  actionTexte: 120,
  actionResponsable: 40,
  actionEcheance: 24,
});

const L = LAYOUT_LIMITS;

// ── Petits outils de nettoyage ──────────────────────────────────────────────

/** Texte d'une ligne, espaces repliés, borné — coupé avec « … ». */
function clip(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Nombre fini, ou null. Tolère « 1 650,5 » qu'un modèle écrirait en texte. */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // `\s` couvre aussi les espaces insécables qu'écrit un nombre français.
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function icon(value) {
  return oneOf(value, INFOGRAPHIC_ICONS, 'point');
}

/** Liste de textes non vides, chacun borné, la liste aussi. */
function texts(list, maxItems, maxChars) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => clip(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

/** Liste d'objets passés à `mapItem`, les nuls retirés, bornée. */
function items(list, maxItems, mapItem) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === 'object')
    .map(mapItem)
    .filter(Boolean)
    .slice(0, maxItems);
}

// ── Lecture de la sortie du modèle ──────────────────────────────────────────

/**
 * Objet JSON de la réponse du modèle : brut, entre balises de code, ou le
 * premier `{ … }` trouvé dans un texte. null si rien n'est lisible.
 * @param {string} raw
 * @returns {object|null}
 */
export function parseLayoutOutput(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start !== -1 && end > start ? tryParse(text.slice(start, end + 1)) : null;
}

// ── Actions : fournies par le CODE, jamais par le modèle ────────────────────

/**
 * Actions visibles de la réunion, telles que l'écran les montre : une action
 * masquée (`show: false`) ne sort pas. Le modèle ne les recopie pas — ce
 * serait un risque d'écart avec la liste de l'écran pour rien.
 * @param {Array} actions
 * @returns {{list: Array<{texte: string, responsable: string, echeance: string}>, total: number}}
 */
export function layoutActions(actions) {
  const visible = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === 'object' && a.show !== false)
    .map((a) => ({
      texte: clip(a.text || a.title || a.description || '', L.actionTexte),
      responsable: clip(a.assignee || a.owner || '', L.actionResponsable),
      echeance: clip(a.dueDate || '', L.actionEcheance),
    }))
    .filter((a) => a.texte);
  return { list: visible.slice(0, L.actions), total: visible.length };
}

// ── Normalisation ───────────────────────────────────────────────────────────

function chiffre(c) {
  const valeur = toNumber(c.valeur);
  const libelle = clip(c.libelle, L.chiffreLibelle);
  if (valeur === null || !libelle) return null;
  const cible = toNumber(c.cible);
  const precedent = toNumber(c.precedent);
  let forme = oneOf(c.forme, KPI_FORMS, 'valeur');
  const unite = clip(c.unite, L.unite);
  // Une forme qui exige une donnée absente redevient un simple nombre, plutôt
  // qu'un graphique faux (une barre de progression sans cible).
  if ((forme === 'progression' || forme === 'objectif') && !(cible > 0)) forme = 'valeur';
  if (forme === 'evolution' && precedent === null) forme = 'valeur';
  if (forme === 'part' && unite !== '%' && !(cible > 0)) forme = 'valeur';
  return { libelle, valeur, unite, cible, precedent, forme, note: clip(c.note, L.note) };
}

function repartition(r) {
  if (!r || typeof r !== 'object') return null;
  const elements = items(r.elements, L.repartition, (e) => {
    const valeur = toNumber(e.valeur);
    const libelle = clip(e.libelle, L.repartitionLibelle);
    return valeur !== null && valeur >= 0 && libelle ? { libelle, valeur } : null;
  });
  if (elements.length < 2) return null;
  return {
    titre: clip(r.titre, L.repartitionTitre),
    unite: clip(r.unite, L.unite),
    elements,
  };
}

/** Le gabarit a-t-il de quoi remplir sa page ? */
function hasContentFor(template, layout) {
  switch (template) {
    case 'decision':
      return layout.options.length >= 2 || layout.decisions.length >= 1;
    case 'feuille_de_route':
      return layout.jalons.length >= 3;
    case 'tableau_de_bord':
      return layout.chiffres.length >= 2;
    case 'atelier':
      return layout.idees.reduce((n, t) => n + t.idees.length, 0) >= 3;
    case 'bilan': {
      const { reussites, difficultes, essais } = layout.bilan;
      return [reussites, difficultes, essais].filter((col) => col.length > 0).length >= 2;
    }
    default:
      return true;
  }
}

/**
 * Contrat nettoyé, prêt à stocker et à mettre en page.
 *
 * @param {object} raw - objet lu par parseLayoutOutput
 * @param {{language?: string, actions?: Array, meta?: {date?: string|null,
 *          durationSec?: number|null}}} [context]
 * @returns {object}
 */
export function normalizeLayout(raw, { language, actions, meta = {} } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const heros = src.heros && typeof src.heros === 'object' ? src.heros : {};
  const bilan = src.bilan && typeof src.bilan === 'object' ? src.bilan : {};
  const { list, total } = layoutActions(actions);

  const layout = {
    version: INFOGRAPHIC_LAYOUT_VERSION,
    gabarit: oneOf(src.gabarit, INFOGRAPHIC_TEMPLATES, DEFAULT_INFOGRAPHIC_TEMPLATE),
    langue: normalizeLang(language),
    titre: clip(src.titre, L.titre),
    sousTitre: clip(src.sousTitre, L.sousTitre),
    heros: {
      valeur: clip(heros.valeur, L.herosValeur),
      libelle: clip(heros.libelle, L.herosLibelle),
      icone: icon(heros.icone),
    },
    chiffres: items(src.chiffres, L.chiffres, chiffre),
    repartition: repartition(src.repartition),
    sujets: items(src.sujets, L.sujets, (s) => {
      const titre = clip(s.titre, L.sujetTitre);
      const points = texts(s.points, L.points, L.point);
      return titre && points.length ? { titre, icone: icon(s.icone), points } : null;
    }),
    decisions: texts(src.decisions, L.decisions, L.phrase),
    vigilances: texts(src.vigilances, L.vigilances, L.phrase),
    jalons: items(src.jalons, L.jalons, (j) => {
      const libelle = clip(j.libelle, L.jalonLibelle);
      return libelle
        ? {
            quand: clip(j.quand, L.quand),
            libelle,
            detail: clip(j.detail, L.jalonDetail),
            etat: oneOf(j.etat, MILESTONE_STATES, 'a_venir'),
          }
        : null;
    }),
    options: items(src.options, L.options, (o) => {
      const titre = clip(o.titre, L.optionTitre);
      return titre
        ? {
            titre,
            pour: texts(o.pour, L.arguments, L.argument),
            contre: texts(o.contre, L.arguments, L.argument),
            retenue: o.retenue === true,
          }
        : null;
    }),
    idees: items(src.idees, L.themes, (t) => {
      const theme = clip(t.theme, L.theme);
      const idees = items(t.idees, L.idees, (i) => {
        const texte = clip(i.texte, L.idee);
        const votes = toNumber(i.votes);
        return texte
          ? {
              texte,
              votes: votes === null ? null : Math.max(0, Math.min(999, Math.round(votes))),
              retenue: i.retenue === true,
            }
          : null;
      });
      return theme && idees.length ? { theme, icone: icon(t.icone), idees } : null;
    }),
    bilan: {
      reussites: texts(bilan.reussites, L.bilan, L.point),
      difficultes: texts(bilan.difficultes, L.bilan, L.point),
      essais: texts(bilan.essais, L.bilan, L.point),
    },
    participants: texts(src.participants, L.participants, L.participant),
    prochaineEtape: clip(src.prochaineEtape, L.prochaineEtape),
    actions: list,
    actionsTotal: total,
    date: typeof meta.date === 'string' ? meta.date.slice(0, 40) : null,
    dureeSec: Number.isFinite(meta.durationSec) && meta.durationSec > 0 ? meta.durationSec : null,
  };

  // Une seule option retenue au plus : deux « retenues » se contrediraient.
  let retained = false;
  for (const option of layout.options) {
    if (option.retenue && retained) option.retenue = false;
    if (option.retenue) retained = true;
  }

  if (!hasContentFor(layout.gabarit, layout)) layout.gabarit = DEFAULT_INFOGRAPHIC_TEMPLATE;
  return layout;
}
