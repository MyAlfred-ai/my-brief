/**
 * Aide IA d'une réunion — ses domaines d'intervention et leurs bornes.
 *
 * Quatre domaines, et pas un réglage libre : chacun est une CONSIGNE distincte
 * donnée au modèle (lib/aiHelp/prompts.js), un interrupteur à l'écran et un
 * droit que l'administration peut retirer. En ajouter un demande les trois.
 *
 *   project  garde-fou du projet : une décision qui contredit l'objectif, le
 *            périmètre ou une échéance de la fiche du projet dans myBrain.
 *            Le seul domaine qui EXIGE myBrain.
 *   qa       questions-réponses : à l'appel (« Alfred, … ») ou par écrit.
 *            Avec myBrain, il cite les fiches ; sans, il s'en tient à la réunion.
 *   agenda   ordre du jour : les points saisis au début OU annoncés pendant la
 *            réunion, leur état, ceux qu'on oublie — et, à la fin, ceux qu'on
 *            n'a pas abordés.
 *   ideas    boîte à idées : une piste de temps à autre.
 *
 * Ce module ne lit ni la base ni le réseau : des constantes et des fonctions
 * pures, partagées par les dépôts, les routes et les prompts.
 */

export const AI_HELP_DOMAINS = ['project', 'qa', 'agenda', 'ideas'];

/**
 * Ce avec quoi une réunion DÉMARRE : tout allumé. Décision du 2026-11-12 —
 * celui qui lance la réunion n'a rien à régler avant, et ne coupe un domaine
 * que s'il le gêne, pendant. Ce qui module l'ensemble est le niveau
 * d'intervention de l'installation (`AI_HELP_PACES`), pas un choix par compte.
 * Écarté : repartir du réglage de la réunion précédente — sans écran avant la
 * réunion, un domaine coupé un jour le restait sans qu'on le voie.
 */
export const AI_HELP_FIRST_DOMAINS = { project: true, qa: true, agenda: true, ideas: true };

/** Le domaine qui ne vaut rien sans la lecture de myBrain. */
export const AI_HELP_MYBRAIN_DOMAIN = 'project';

/**
 * Ce que l'IA signale d'elle-même. `quiet` : les contradictions nettes, et
 * aucune idée ; `normal` : aussi ce qu'on est en train d'oublier, et une idée
 * toutes les dix minutes au plus ; `busy` : aussi les dérives légères, et une
 * idée toutes les cinq minutes (lib/aiHelp/ideas.js). Réglé par
 * l'administration — le niveau est une politique d'installation, pas un goût
 * personnel.
 */
export const AI_HELP_PACES = ['quiet', 'normal', 'busy'];
export const AI_HELP_PACE_DEFAULT = 'normal';

export const AI_HELP_WAKE_WORD_DEFAULT = 'Alfred';
export const AI_HELP_WAKE_WORD_MAX = 24;

/** Ordre du jour : douze points, de quoi tenir sur une carte. */
export const AI_HELP_AGENDA_POINTS_MAX = 12;
export const AI_HELP_AGENDA_POINT_MAX = 160;
export const AI_HELP_AGENDA_MAX = AI_HELP_AGENDA_POINTS_MAX * (AI_HELP_AGENDA_POINT_MAX + 1);
/** Clés de points gardées par réunion (cf. `agendaHeard`, lib/aiHelp/session.js). */
export const AI_HELP_AGENDA_HEARD_MAX = 40;

/**
 * `{ project, qa, agenda, ideas }` en booléens stricts. Une clé absente ou
 * mal typée prend la valeur de `fallback` : un patch partiel ne coupe pas ce
 * qu'il ne nomme pas.
 * @param {unknown} input
 * @param {Record<string, boolean>} [fallback]
 * @returns {{project: boolean, qa: boolean, agenda: boolean, ideas: boolean}}
 */
export function normalizeDomains(input, fallback = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const key of AI_HELP_DOMAINS) {
    out[key] = typeof source[key] === 'boolean' ? source[key] : fallback[key] === true;
  }
  return out;
}

/** Les domaines allumés, dans l'ordre de `AI_HELP_DOMAINS`. */
export function activeDomains(domains) {
  return AI_HELP_DOMAINS.filter((key) => domains?.[key] === true);
}

/**
 * Le mot d'appel : des lettres, des chiffres, espaces, tirets et apostrophes —
 * un prénom, pas une phrase. Vide après nettoyage : le défaut, pour que la
 * question à voix haute ne disparaisse pas sur une saisie effacée.
 */
export function normalizeWakeWord(raw) {
  const cleaned = String(raw ?? '')
    .replace(/[^\p{L}\p{N} '’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AI_HELP_WAKE_WORD_MAX)
    .trim();
  return cleaned || AI_HELP_WAKE_WORD_DEFAULT;
}

export function normalizePace(raw) {
  return AI_HELP_PACES.includes(raw) ? raw : AI_HELP_PACE_DEFAULT;
}

/**
 * Ce qui fait que deux libellés disent le MÊME point : casse, accents,
 * ponctuation et espaces ignorés. « Le budget ! » et « le Budget » n'en font
 * qu'un — le modèle ne redit jamais un sujet deux fois à l'identique.
 * @param {unknown} label
 * @returns {string}
 */
export function agendaKey(label) {
  return String(label ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Les points de l'ordre du jour : un par ligne, les puces de saisie retirées,
 * sans doublon, bornés en nombre et en longueur.
 * @param {unknown} raw - le texte saisi
 * @returns {string[]}
 */
export function agendaPoints(raw) {
  const seen = new Set();
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•–—]|\d+[.)])\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, AI_HELP_AGENDA_POINT_MAX)
        .trim(),
    )
    .filter((point) => {
      const key = agendaKey(point);
      // Un point sans lettre ni chiffre n'en est pas un ; un doublon non plus
      // (l'écran liste les points par leur libellé).
      return key && !seen.has(key) && seen.add(key);
    })
    .slice(0, AI_HELP_AGENDA_POINTS_MAX);
}

/** L'ordre du jour tel qu'on l'enregistre : ses points, un par ligne. */
export function normalizeAgenda(raw) {
  return agendaPoints(raw).join('\n');
}

/**
 * Ajoute des points à un ordre du jour — à la suite, sans doublon, sans
 * dépasser le plafond.
 * @param {unknown} raw - l'ordre du jour actuel
 * @param {string[]} labels - les points à ajouter
 * @param {{skip?: string[]}} [options] - `skip` : des clés (`agendaKey`) à ne
 *   pas ajouter, même absentes de l'ordre du jour
 * @returns {{agenda: string, added: string[]}} `added` : ce qui est réellement entré
 */
export function addAgendaPoints(raw, labels, { skip = [] } = {}) {
  const points = agendaPoints(raw);
  const taken = new Set([...points.map(agendaKey), ...skip]);
  const added = [];
  for (const label of agendaPoints((Array.isArray(labels) ? labels : []).join('\n'))) {
    const key = agendaKey(label);
    if (taken.has(key) || points.length + added.length >= AI_HELP_AGENDA_POINTS_MAX) continue;
    taken.add(key);
    added.push(label);
  }
  return { agenda: [...points, ...added].join('\n'), added };
}

/** L'ordre du jour sans le point qui porte ce libellé. */
export function removeAgendaPoint(raw, label) {
  const key = agendaKey(label);
  return agendaPoints(raw)
    .filter((point) => agendaKey(point) !== key)
    .join('\n');
}
