/**
 * Application des deltas et finals de transcription à l'historique affiché —
 * règles de POSITION et de FUSION, sorties d'App.svelte (plafond max-lines)
 * pour être testables sans monter le composant.
 *
 * Le bug que ce module corrige (constaté en visio, quand les interlocuteurs
 * alternent) : la ligne « en cours » d'un flux (micro ou audio système) restait
 * plantée au milieu de l'historique dès que l'autre flux écrivait après elle.
 * Faute de ponctuation elle n'était jamais bouclée, et les premiers mots de la
 * prise de parole SUIVANTE du même flux se fusionnaient dedans : du texte neuf
 * apparaissait dans une section plus ancienne (au-dessus), et le bas de l'écran
 * — là où l'utilisateur lit — ne montrait rien avant la première ponctuation.
 *
 * Trois invariants remplacent ce comportement :
 *
 *  1. LE DIRECT RESTE EN BAS. Les lignes en cours (isDelta) vivent en QUEUE
 *     d'historique — au pire une par flux, comme les deux bulles vivantes d'un
 *     sous-titrage. Toute ligne FINALE s'insère AVANT elles
 *     (finalInsertIndex), jamais après.
 *
 *  2. UN SEGMENT VAD = UNE LIGNE. Chaque delta Realtime porte l'`item_id` du
 *     segment détecté par la VAD serveur. Un delta d'un AUTRE item que celui de
 *     la ligne en cours signe une nouvelle prise de parole : l'ancienne ligne
 *     est bouclée sur-le-champ et la nouvelle naît en bas — plus aucun mot
 *     avalé par une ligne périmée. Sans item_id (événements legacy), une ligne
 *     muette depuis PENDING_STALE_MS est bouclée de la même façon.
 *
 *  3. UNE LIGNE MUETTE N'EST PLUS LE DIRECT. Sous les modèles qui n'émettent
 *     jamais de `completed`, un « Voilà » sans ponctuation restait en cours
 *     tant que son auteur ne reprenait pas la parole : il gardait sa place en
 *     queue, et chaque phrase bouclée de l'autre flux s'insérait devant lui —
 *     la dernière réplique de l'utilisateur s'affichait en avant-dernier,
 *     plusieurs minutes durant. Dès qu'un flux écrit, la ligne en cours d'un
 *     AUTRE flux muette depuis LIVE_SILENCE_MS est bouclée sur place, avant
 *     que ce flux n'écrive : ce qui se dit ensuite passe sous elle.
 *
 * La clôture d'une ligne passe toujours par le même chemin (finalizeAt) :
 * corrections automatiques de l'organisation (transcriptCorrections.js),
 * déduplication d'écho micro ↔ système (transcriptEcho.js), puis repositionnement
 * devant les lignes en cours restantes.
 *
 * Les corrections (`correct`, injectée par l'appelant — par défaut aucune)
 * s'appliquent au texte DÉFINITIF, jamais aux deltas : un delta peut couper un
 * mot. Chaque résultat liste les lignes corrigées (`corrected`) pour que
 * l'écran montre ce qui vient de changer.
 */
import { findPendingDeltaIndex } from './transcriptDeltas.js';
import { applyEchoDedup, parseElapsedSeconds } from './transcriptEcho.js';

/**
 * Sans item_id, une ligne en cours restée muette aussi longtemps appartient à
 * une prise de parole terminée : le prochain delta du flux ouvre une nouvelle
 * ligne au lieu de s'y coller. Large (les deltas d'un même segment arrivent en
 * continu, à quelques secondes au pire) pour ne jamais couper une phrase lente.
 */
export const PENDING_STALE_MS = 10_000;

/**
 * Silence au-delà duquel la ligne en cours d'un flux n'est plus le direct
 * quand l'AUTRE flux écrit (invariant 3). Les deltas arrivent toutes les
 * 300-500 ms pendant qu'on parle et la VAD serveur coupe le segment après
 * 500 ms de silence : 1,5 s de mutisme, c'est une prise de parole terminée.
 * Plus court, une hésitation couperait la phrase en deux lignes ; plus long,
 * une réponse brève de l'autre flux passerait encore devant elle.
 */
export const LIVE_SILENCE_MS = 1_500;

/**
 * La ligne est bouclée à la ponctuation de fin de phrase — comportement
 * historique, seul signal de clôture des modèles qui n'émettent jamais de
 * `completed` (gpt-realtime-whisper, gpt-live-transcribe).
 */
const isSentenceEnd = (s) => /[.!?…]\s*$/.test((s || '').trim()) && (s || '').trim().length > 2;

/** Aucune correction : le texte tel qu'entendu. */
const asHeard = (s) => s;

/**
 * Position d'insertion d'une ligne FINALE : avant les lignes en cours de fin
 * d'historique, pour que le direct reste en bas (invariant 1).
 * @param {Array<{isDelta?: boolean}>} history
 * @returns {number}
 */
export function finalInsertIndex(history) {
  let i = history.length;
  while (i > 0 && history[i - 1]?.isDelta) i--;
  return i;
}

/**
 * Ligne en cours à laquelle un `completed` s'applique : celle de SON segment.
 * Jamais celle d'un autre item — elle attend son propre `completed` (whisper-1,
 * retiré depuis, livrait parfois les segments dans le désordre). Une ligne
 * sans item_id (événements legacy) reste un repli valide.
 * @returns {number} index, ou -1
 */
export function findPendingForFinal(history, source, itemId) {
  if (!itemId) return findPendingDeltaIndex(history, source);
  if (!Array.isArray(history)) return -1;
  const key = source || 'local';
  let legacy = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const it = history[i];
    if (!it?.isDelta || (it.source || 'local') !== key) continue;
    if (it.itemId === itemId) return i;
    if (!it.itemId && legacy === -1) legacy = i;
  }
  return legacy;
}

/**
 * Index des lignes du segment `itemId` d'un flux, bouclées ou en cours, dans
 * l'ordre de l'historique.
 * @returns {number[]}
 */
function segmentIndexes(history, source, itemId) {
  const key = source || 'local';
  const found = [];
  history.forEach((it, i) => {
    if (it?.itemId === itemId && (it.source || 'local') === key) found.push(i);
  });
  return found;
}

/**
 * Clôture d'une ligne en cours : texte figé, déduplication d'écho, puis
 * repositionnement devant les lignes en cours restantes (invariant 1 — sans ce
 * déplacement, une ligne bouclée pendant que l'autre flux dicte resterait
 * coincée au-dessus de lui et les finales suivantes s'inséreraient avant elle).
 *
 * Les corrections passent AVANT la déduplication d'écho : les deux flux se
 * comparent ainsi dans la même graphie.
 *
 * @returns {{history: Array, finalText: string|null, corrected: object|null}}
 *   finalText est null si la ligne était vide ou dupliquait l'autre flux
 *   (écho) : rien à verser au texte complet ni aux analyses. corrected =
 *   `{line, original}` si une correction a changé le texte.
 */
function finalizeAt(history, index, correct = asHeard) {
  const line = history[index];
  const heard = String(line?.text || '').trim();
  if (!heard) {
    return {
      history: [...history.slice(0, index), ...history.slice(index + 1)],
      finalText: null,
      corrected: null,
    };
  }
  const text = correct(heard);
  const echo = applyEchoDedup(history, {
    text,
    source: line.source || 'local',
    elapsedS: parseElapsedSeconds(line.time),
    selfIndex: index,
  });
  if (echo.dropped) return { history: echo.history, finalText: null, corrected: null };
  // `lastDeltaAt` ne sert qu'aux lignes en cours : il ne se persiste pas.
  const { lastDeltaAt, ...rest } = line;
  const finalLine = { ...rest, text, isDelta: false };
  const without = [...history.slice(0, index), ...history.slice(index + 1)];
  // Remonter DEVANT les lignes en cours restantes si besoin (invariant 1),
  // mais ne jamais redescendre sous des finales écrites après elle : une ligne
  // déjà bien placée ne bouge pas (min).
  const at = Math.min(finalInsertIndex(without), index);
  return {
    history: [...without.slice(0, at), finalLine, ...without.slice(at)],
    finalText: text,
    corrected: text !== heard ? { line: finalLine, original: heard } : null,
  };
}

/**
 * Invariant 3 : boucle sur place les lignes en cours des AUTRES flux que
 * `source`, muettes depuis LIVE_SILENCE_MS. À appeler avant d'écrire pour
 * `source`, pour que sa ligne bouclée ou insérée passe SOUS elles. Sans
 * horloge (`nowMs` absent), rien ne bouge.
 *
 * @returns {{history: Array, finalized: string[], dropped: boolean,
 *   corrected: Array<{line: object, original: string}>}}
 */
function closeSilentOthers(history, source, nowMs, correct) {
  const out = {
    history: Array.isArray(history) ? history : [],
    finalized: [],
    dropped: false,
    corrected: [],
  };
  if (!Number.isFinite(nowMs)) return out;
  const key = source || 'local';
  const silent = (it) =>
    it?.isDelta &&
    (it.source || 'local') !== key &&
    Number.isFinite(it.lastDeltaAt) &&
    nowMs - it.lastDeltaAt >= LIVE_SILENCE_MS;
  // Chaque clôture rend la ligne finale (ou la retire, écho) : la boucle
  // s'arrête. Au pire une ligne en cours par flux.
  for (let i = out.history.findIndex(silent); i !== -1; i = out.history.findIndex(silent)) {
    const r = finalizeAt(out.history, i, correct);
    out.history = r.history;
    if (r.finalText) out.finalized.push(r.finalText);
    else out.dropped = true;
    if (r.corrected) out.corrected.push(r.corrected);
  }
  return out;
}

/**
 * Un delta arrive pour un flux.
 *
 * @param {Array} history
 * @param {Object} p
 * @param {string} p.text - message.delta (non vide, mais parfois fait d'espaces
 *   seules : le tokeniseur détache l'espace d'un nombre — « qu'à », « ␣ », « 4 »,
 *   « ␣h ». L'écarter collait le chiffre au mot : « qu'à4 h »)
 * @param {string} [p.itemId] - message.item_id (segment VAD)
 * @param {string} p.source - 'local' | 'remote'
 * @param {number} p.nowMs - Date.now() injecté (tests)
 * @param {{time: string, timestamp: string, author: string}} p.stamp - horodatage
 *   d'une ligne NAISSANTE (une fusion garde celui de la ligne existante)
 * @param {(text: string) => string} [p.correct] - corrections de l'organisation
 * @returns {{history: Array, finalized: string[], dropped: boolean,
 *   corrected: Array<{line: object, original: string}>}}
 *   finalized = textes bouclés par ce delta (bascule de prise de parole et/ou
 *   fin de phrase), dans l'ordre, à verser au texte complet et aux analyses.
 *   dropped = une clôture a retiré une ligne (écho) : l'historique a changé
 *   sans rien produire, la sauvegarde reste due. corrected = lignes bouclées
 *   dont une correction a changé le texte.
 */
export function applyLiveDelta(
  history,
  { text, itemId = '', source = 'local', nowMs, stamp, correct = asHeard },
) {
  // L'autre flux s'est tu : sa ligne est bouclée avant que celui-ci n'écrive.
  const pre = closeSilentOthers(history, source, nowMs, correct);
  const { finalized, corrected } = pre;
  let { dropped, history: h } = pre;

  const close = (index) => {
    const r = finalizeAt(h, index, correct);
    h = r.history;
    if (r.finalText) finalized.push(r.finalText);
    else dropped = true;
    if (r.corrected) corrected.push(r.corrected);
  };

  const idx = findPendingDeltaIndex(h, source);
  if (idx !== -1) {
    const pending = h[idx];
    // Avec item_id, seul le CHANGEMENT d'item fait foi : une ligne d'un autre
    // segment — ou sans segment, donc d'une autre époque (session restaurée,
    // événement legacy) — ne reçoit jamais ces mots. Même segment = fusion,
    // même après une longue pause : son `completed` remplacera la ligne
    // entière, elle doit rester entière. Le délai d'obsolescence ne joue que
    // pour les deltas SANS item_id, qui n'ont pas mieux.
    const otherItem = !!itemId && itemId !== pending.itemId;
    const stale =
      !itemId &&
      Number.isFinite(pending.lastDeltaAt) &&
      Number.isFinite(nowMs) &&
      nowMs - pending.lastDeltaAt > PENDING_STALE_MS;
    if (!otherItem && !stale) {
      // Même segment (ou continuité sans item_id) : fusion sur place — la
      // ligne vit déjà dans la queue « direct » de l'historique.
      const merged = pending.text + text;
      const ended = isSentenceEnd(merged);
      h = [
        ...h.slice(0, idx),
        { ...pending, text: merged, isDelta: true, lastDeltaAt: nowMs },
        ...h.slice(idx + 1),
      ];
      if (ended) close(idx);
      return { history: h, finalized, dropped, corrected };
    }
  }
  // Une espace seule ne vaut que devant le mot qui la suit, dans la ligne de
  // son segment : elle n'en ouvre aucune et ne signe pas de nouvelle prise de
  // parole — le mot suivant en décidera.
  if (!text.trim()) return { history: h, finalized, dropped, corrected };
  // Nouvelle prise de parole du même flux (item changé, ou ligne muette trop
  // longtemps) : boucler l'ancienne ligne — ses mots sont dits — et laisser
  // le delta ouvrir la sienne en bas (invariant 2).
  if (idx !== -1) close(idx);

  h = [
    ...h,
    {
      ...stamp,
      text,
      isDelta: true,
      source,
      ...(itemId ? { itemId } : {}),
      lastDeltaAt: nowMs,
    },
  ];
  if (isSentenceEnd(text)) {
    // Phrase complète en un seul delta (whisper-1 livrait le segment d'un bloc) :
    // boucler tout de suite — sinon la ligne resterait « en cours » à jamais.
    close(h.length - 1);
  }
  return { history: h, finalized, dropped, corrected };
}

/**
 * Une transcription FINALE arrive : `completed` d'un segment, reprise différée,
 * import. Quatre cas, du plus précis au plus général :
 *
 *  1. la ligne en cours du segment existe → le final la REMPLACE SUR PLACE
 *     (autorité au modèle : ponctuation, casse), puis clôture normale. Jamais
 *     de retrait-puis-ajout en bas — c'est ce qui faisait sauter la ligne sous
 *     les sections plus récentes ;
 *  2. la ligne du segment est DÉJÀ bouclée (fin de phrase précoce, bascule de
 *     prise de parole) → son texte est simplement mis au propre, sans doublon ;
 *  3. les deltas avaient déjà tout écrit mais la ligne a disparu (écho
 *     dédupliqué) → rien à faire ;
 *  4. ligne inconnue (segment sans deltas) → déduplication d'écho puis
 *     insertion devant les lignes en cours (invariant 1).
 *
 * Les cas 1 et 2 supposent le segment sur UNE ligne. Les modèles à `completed`
 * l'écrivent souvent sur plusieurs : la ponctuation d'un delta boucle « Bonjour. »,
 * la suite du même item ouvre une autre ligne. Le `completed` portant tout le
 * segment, il va alors dans sa PREMIÈRE ligne et les autres disparaissent
 * (invariant 2) — sans quoi le début serait écrit deux fois, au texte complet
 * comme à l'écran.
 *
 * @param {Array} history
 * @param {Object} p
 * @param {string} p.text - transcription finale (déjà validée)
 * @param {string} [p.itemId]
 * @param {string} p.source
 * @param {boolean} p.alreadyWritten - verdict du deltaTracker (cas 3)
 * @param {number} p.elapsedS - secondes écoulées (fenêtre de dédup du cas 4)
 * @param {{time: string, timestamp: string, author: string}} p.stamp
 * @param {number} [p.nowMs] - Date.now() injecté (tests) ; sans lui, les
 *   lignes muettes de l'autre flux ne sont pas bouclées (invariant 3)
 * @param {(text: string) => string} [p.correct] - corrections de l'organisation
 * @returns {{history: Array, finalized: string[], recompute: boolean,
 *   dropped: boolean, corrected: Array<{line: object, original: string}>}}
 *   recompute = un texte déjà versé au texte complet a changé : le re-dériver
 *   de l'historique au lieu d'ajouter. corrected = ligne écrite dont une
 *   correction a changé le texte (cas 1 et 4, et segment sur plusieurs lignes
 *   dont une encore en cours ; le cas 2 met au propre une ligne déjà montrée
 *   corrigée).
 */
export function applyLiveFinal(
  history,
  {
    text,
    itemId = '',
    source = 'local',
    alreadyWritten = false,
    elapsedS,
    stamp,
    nowMs,
    correct = asHeard,
  },
) {
  // L'autre flux s'est tu : sa ligne est bouclée avant que celui-ci n'écrive
  // (invariant 3). Ce qu'elle produit précède le résultat du final.
  const pre = closeSilentOthers(history, source, nowMs, correct);
  const r = placeFinal(pre.history, {
    text,
    itemId,
    source,
    alreadyWritten,
    elapsedS,
    stamp,
    correct,
  });
  return {
    ...r,
    finalized: [...pre.finalized, ...r.finalized],
    dropped: pre.dropped || r.dropped,
    corrected: [...pre.corrected, ...r.corrected],
  };
}

/** Les quatre cas d'applyLiveFinal, une fois les lignes muettes bouclées. */
function placeFinal(h, { text, itemId, source, alreadyWritten, elapsedS, stamp, correct }) {
  const unchanged = (next) => ({
    history: next,
    finalized: [],
    recompute: false,
    dropped: false,
    corrected: [],
  });
  const heard = String(text || '').trim();
  if (!heard) return unchanged(h);
  // Les comparaisons avec les lignes déjà écrites (cas 2, écho) se font dans
  // la graphie corrigée : c'est celle de l'historique.
  const clean = correct(heard);

  // Segment écrit sur PLUSIEURS lignes (cas 1 et 2 étendus) : la ponctuation
  // en a bouclé le début avant son `completed`, qui livre pourtant la
  // transcription ENTIÈRE. Invariant 2 : elle va dans la PREMIÈRE ligne du
  // segment, les autres disparaissent — remplacer la seule ligne en cours, ou
  // la dernière bouclée, écrirait deux fois le début du segment.
  const segment = itemId ? segmentIndexes(h, source, itemId) : [];
  if (segment.length > 1) {
    // `lastDeltaAt` ne sert qu'aux lignes en cours : il ne se persiste pas.
    const { lastDeltaAt, ...first } = h[segment[0]];
    const line = { ...first, text: clean, isDelta: false };
    // Une partie jamais bouclée n'a jamais été montrée corrigée (cas 1) ; les
    // lignes bouclées, si (cas 2).
    const unseen = segment.some((i) => h[i].isDelta);
    const without = h.filter((_, i) => !segment.includes(i));
    // Les lignes retirées suivent toutes la première : son index vaut dans
    // `without`. Remonter devant le direct si elle y était (invariant 1).
    const at = Math.min(finalInsertIndex(without), segment[0]);
    return {
      ...unchanged([...without.slice(0, at), line, ...without.slice(at)]),
      recompute: true,
      corrected: unseen && clean !== heard ? [{ line, original: heard }] : [],
    };
  }

  const idx = findPendingForFinal(h, source, itemId);
  if (idx !== -1) {
    h = [...h.slice(0, idx), { ...h[idx], text: heard }, ...h.slice(idx + 1)];
    const r = finalizeAt(h, idx, correct);
    return {
      history: r.history,
      finalized: r.finalText ? [r.finalText] : [],
      recompute: false,
      dropped: !r.finalText,
      corrected: r.corrected ? [r.corrected] : [],
    };
  }

  if (itemId) {
    for (let i = h.length - 1; i >= 0; i--) {
      const it = h[i];
      if (it?.isDelta || (it.source || 'local') !== source || it.itemId !== itemId) continue;
      if (it.text === clean) return unchanged(h);
      h = [...h.slice(0, i), { ...it, text: clean }, ...h.slice(i + 1)];
      return { ...unchanged(h), recompute: true };
    }
  }

  if (alreadyWritten) return unchanged(h);

  const echo = applyEchoDedup(h, { text: clean, source, elapsedS });
  if (echo.dropped) return { ...unchanged(echo.history), dropped: true };
  const at = finalInsertIndex(echo.history);
  const line = { ...stamp, text: clean, isDelta: false, source, ...(itemId ? { itemId } : {}) };
  return {
    history: [...echo.history.slice(0, at), line, ...echo.history.slice(at)],
    finalized: [clean],
    recompute: false,
    dropped: false,
    corrected: clean !== heard ? [{ line, original: heard }] : [],
  };
}
