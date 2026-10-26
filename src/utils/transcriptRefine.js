/**
 * Relecture des dernières phrases transcrites à la lumière des notes de
 * réunion.
 *
 * Les notes servaient déjà de référence orthographique au RÉSUMÉ
 * (buildNotesBlock, src/config/templates.js) — mais la transcription AFFICHÉE
 * gardait les noms écorchés par le moteur (« Klobex » pour « Globex »).
 * Plutôt que d'envoyer les notes au moteur de transcription (indice de
 * vocabulaire qui ne profiterait qu'à l'audio suivant), on RELIT après coup :
 * à chaque phrase finalisée et à chaque sauvegarde des notes, les deux
 * dernières phrases repassent par un petit modèle avec les notes en référence
 * (POST /api/refine-transcript), et la transcription est corrigée sur place.
 *
 * Même discipline que l'ordonnanceur d'actions (actionDetectionScheduler.js) :
 * un seul appel en vol, débounce, relance de fin. La relecture est un plus —
 * tout échec est silencieux, rien ne bloque jamais l'enregistrement.
 */

export const REFINE_SENTENCE_COUNT = 2;
export const REFINE_DEBOUNCE_MS = 1200;

/**
 * Les dernières phrases finalisées à relire : jamais les deltas (phrase en
 * cours de dictée), jamais un marqueur ⟨hors ligne⟩ non résolu (offlineGapId).
 * Renvoie la référence de l'item AVEC son texte du moment : à l'application,
 * l'appelant vérifie que l'item existe toujours et n'a pas changé entre-temps.
 *
 * @param {Array<{text: string, isDelta?: boolean, offlineGapId?: string}>} history
 * @param {number} [count]
 * @returns {Array<{item: object, text: string}>}
 */
export function pickRefineTargets(history, count = REFINE_SENTENCE_COUNT) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((it) => it && !it.isDelta && !it.offlineGapId && String(it.text || '').trim())
    .slice(-count)
    .map((item) => ({ item, text: String(item.text).trim() }));
}

/**
 * Garde de cohérence sur une correction : la relecture ne doit qu'ajuster des
 * graphies, jamais réécrire. Une réponse vide, identique, ou d'une longueur
 * sans rapport avec l'original (le modèle a paraphrasé) est rejetée — puis
 * chaque substitution passe par isPlausibleRefinement : le prompt a beau
 * interdire de remplacer « Marc » par la « Sophie » des notes, la garde le
 * rend impossible par construction, pas par consigne.
 *
 * @param {string} original
 * @param {string} corrected
 * @param {string} [notes] Les notes envoyées avec la relecture — autorisent
 *   les remplacements dictés (« Remplace Bob par Robert ») même loin
 *   phonétiquement.
 * @returns {string|null} le texte à appliquer, ou null si rien à faire
 */
export function acceptRefined(original, corrected, notes = '') {
  if (typeof corrected !== 'string') return null;
  const next = corrected.trim();
  if (!next || next === original) return null;
  const a = original.split(/\s+/).length;
  const b = next.split(/\s+/).length;
  if (b < Math.ceil(a * 0.6) || b > Math.ceil(a * 1.5)) return null;
  if (!isPlausibleRefinement(original, next, notes)) return null;
  return next;
}

/**
 * Clé phonétique française APPROXIMATIVE d'un mot : minuscules, accents et
 * ponctuation retirés, puis une poignée de graphies ramenées à un son commun
 * (ph→f, au/eau→o, qu→k, gu+e/i→g, c dur→k / c doux→s, w→v, y→i, h muet,
 * doubles lettres pliées, e/s finaux muets). Volontairement grossière : elle
 * sert à mesurer si deux mots PEUVENT être le même entendu de travers
 * (« saufi »/« sophie » donnent la même clé), pas à faire de la phonétique.
 *
 * @param {string} word
 * @returns {string}
 */
export function frPhoneticKey(word) {
  return String(word || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/ch/g, 'x')
    .replace(/ph/g, 'f')
    .replace(/eau/g, 'o')
    .replace(/au/g, 'o')
    .replace(/gu(?=[eiy])/g, 'g')
    .replace(/qu/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/w/g, 'v')
    .replace(/y/g, 'i')
    .replace(/h/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/[es]+$/, '');
}

/** Distance de Levenshtein classique, sur des chaînes courtes (clés de mots). */
function levenshtein(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[m];
}

/**
 * Similarité [0..1] entre les clés phonétiques de deux fragments. Deux clés
 * vides (fragments faits de ponctuation) sont identiques par convention.
 */
function phoneticSimilarity(a, b) {
  const ka = frPhoneticKey(a);
  const kb = frPhoneticKey(b);
  const max = Math.max(ka.length, kb.length);
  if (!max) return 1;
  return 1 - levenshtein(ka, kb) / max;
}

/**
 * Groupes de mots que la relecture a changés, alignés par le même LCS que
 * diffWordFlags : entre deux mots communs, les mots retirés de l'original et
 * ceux ajoutés par la correction forment UN groupe {from, to}. Un mot scindé
 * (« airfrance » → « AIR FRANCE ») reste ainsi comparable en bloc.
 *
 * @param {string} original
 * @param {string} corrected
 * @returns {Array<{from: string[], to: string[]}>}
 */
export function changedWordGroups(original, corrected) {
  const a = String(original || '')
    .split(/\s+/)
    .filter(Boolean);
  const b = String(corrected || '')
    .split(/\s+/)
    .filter(Boolean);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const groups = [];
  let cur = null;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      cur = null;
      i++;
      j++;
      continue;
    }
    if (!cur) {
      cur = { from: [], to: [] };
      groups.push(cur);
    }
    if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
      cur.from.push(a[i]);
      i++;
    } else {
      cur.to.push(b[j]);
      j++;
    }
  }
  return groups;
}

/**
 * En deçà, un remplacement n'est pas « le même mot entendu de travers ».
 * Relevé de 0,5 à 0,7 (retour terrain 2026-08-28) : à 0,5, deux noms
 * différents mais vaguement proches (« Durand »/« Dupont », clés à 0,5)
 * passaient encore. Les vraies déformations du moteur restent bien au-dessus
 * (« Klobex »/« Globex » 0,83, « Saufi »/« Sophie » 1,0).
 */
export const REFINE_SIMILARITY_MIN = 0.7;

/** Clé de comparaison des consignes : minuscules, sans accents ni séparateurs. */
function directiveKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 60);
}

/**
 * Consignes de remplacement EXPLICITES trouvées dans les notes :
 * « Remplace Alexe par Alex », « corriger X en Y », « changer X en Y »,
 * « Replace X with Y » (formes anglaises du hint EN comprises),
 * « Alexe → Alex » (aussi -> et =>). Rien d'autre — la simple présence d'un
 * mot dans les notes n'est PAS une consigne. C'était le trou de la première
 * version de la garde : avec des notes « Sophie et Marc au point », « Marc »
 * figurait dans les notes et le repli laissait passer Marc → Sophie.
 *
 * Analyse segment par segment (coupé aux fins de ligne, virgules, points,
 * points-virgules) ; chaque côté est réduit en clé normalisée. Un faux
 * positif d'analyse (« corrige la transcription en direct ») est inoffensif :
 * la paire ne s'applique que si le modèle fait EXACTEMENT ce remplacement.
 *
 * @param {string} notes
 * @returns {Array<{fromKey: string, toKey: string}>}
 */
export function parseNoteDirectives(notes) {
  const out = [];
  const push = (from, to) => {
    const fromKey = directiveKey(from);
    const toKey = directiveKey(to);
    if (fromKey && toKey && fromKey !== toKey) out.push({ fromKey, toKey });
  };
  for (const raw of String(notes || '').split(/[\n;,.]+/)) {
    const seg = raw.trim();
    if (!seg) continue;
    const arrow = seg.match(/^(.{1,60}?)\s*(?:→|->|=>)\s*(.{1,60})$/);
    if (arrow) push(arrow[1], arrow[2]);
    const verb = seg.match(
      /(?:remplac|replac|corrig|correct|chang)\S*\s+(.{1,60}?)\s+(?:par|en|with|by|to)\s+(.{1,60})$/i,
    );
    if (verb) push(verb[1], verb[2]);
  }
  return out;
}

/**
 * Garde déterministe sur une phrase relue : chaque groupe de mots changés doit
 * être soit quasi identique phonétiquement à ce qu'il remplace (« Klobex » →
 * « Globex », « salle » → « SAL »), soit la copie EXACTE d'une consigne de
 * remplacement des notes (parseNoteDirectives — les deux côtés doivent
 * correspondre). Une insertion ou une suppression pure (un côté du groupe
 * vide) n'est jamais une correction de graphie : rejetée.
 *
 * Complète le prompt serveur (refineTranscriptPrompt) sans s'y fier : si le
 * modèle remplace « Marc » par la « Sophie » des notes, la phrase est rejetée
 * ici — y compris quand « Marc » figure lui aussi dans les notes. L'échec est
 * conservateur — au pire une vraie correction est perdue, la transcription
 * d'origine reste affichée.
 *
 * @param {string} original
 * @param {string} corrected
 * @param {string} [notes]
 * @returns {boolean}
 */
export function isPlausibleRefinement(original, corrected, notes = '') {
  const directives = parseNoteDirectives(notes);
  return changedWordGroups(original, corrected).every(({ from, to }) => {
    if (!from.length || !to.length) return false;
    if (phoneticSimilarity(from.join(' '), to.join(' ')) >= REFINE_SIMILARITY_MIN) return true;
    const fromKey = directiveKey(from.join(' '));
    const toKey = directiveKey(to.join(' '));
    return directives.some((d) => d.fromKey === fromKey && d.toKey === toKey);
  });
}

/**
 * Diff mot à mot entre la phrase d'origine et sa version relue, pour montrer
 * FURTIVEMENT ce que la relecture vient de changer (surlignage qui s'efface,
 * cf. .word-refined dans style.css). LCS sur les mots : seuls les mots de la
 * version corrigée absents de la sous-séquence commune sont marqués `changed`
 * — un simple « même index, mot différent » marquerait toute la fin de phrase
 * dès qu'un mot est inséré ou retiré.
 *
 * Phrases courtes (2 phrases relues à la fois) : le O(n·m) est sans enjeu.
 *
 * @param {string} original
 * @param {string} corrected
 * @returns {Array<{word: string, changed: boolean}>} les mots de `corrected`
 */
export function diffWordFlags(original, corrected) {
  const a = String(original || '')
    .split(/\s+/)
    .filter(Boolean);
  const b = String(corrected || '')
    .split(/\s+/)
    .filter(Boolean);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const flags = new Array(m).fill(true);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flags[j] = false;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return b.map((word, k) => ({ word, changed: flags[k] }));
}

/** Durée du surlignage furtif — l'animation CSS (.word-refined) dure 2,2 s. */
export const REFINE_FLASH_MS = 2600;

/**
 * Pose le marqueur `refineFlash` sur l'item corrigé, et le retire tout seul
 * une fois l'animation jouée. Le marqueur porte les mots de la phrase corrigée
 * avec leur drapeau `changed` (cf. diffWordFlags) — EditableTranscript s'en
 * sert pour surligner ce qui vient de changer.
 *
 * Jamais persisté : session.js l'écarte de la sauvegarde locale (même
 * discipline que le `flash` des actions — un flash rejoué au reload mentirait
 * sur ce qui vient de se passer). Retrait par ESTAMPILLE et non par index :
 * l'item peut bouger (dédup d'écho, insertion) pendant l'animation.
 *
 * @param {number} index Position de l'item au moment de la correction.
 * @param {string} original
 * @param {string} corrected
 * @param {(up: (history: Array) => Array) => void} update Reçoit une fonction
 *   de transformation à appliquer à l'historique COURANT (pas celui d'alors).
 * @param {number} [ms]
 */
export function flashRefinedWords(index, original, corrected, update, ms = REFINE_FLASH_MS) {
  const tokens = diffWordFlags(original, corrected);
  if (!tokens.some((t) => t.changed)) return;
  const at = Date.now();
  update((history) =>
    history.map((it, i) => (i === index ? { ...it, refineFlash: { at, tokens } } : it)),
  );
  setTimeout(() => {
    update((history) =>
      history.map((it) => {
        if (it.refineFlash?.at !== at) return it;
        const { refineFlash, ...rest } = it;
        return rest;
      }),
    );
  }, ms);
}

/**
 * Câblage complet de la relecture pour App.svelte : cibles, application par
 * référence (item retrouvé et vérifié inchangé — insensible aux retraits
 * d'écho et aux éditions manuelles survenus pendant l'appel), puis surlignage
 * furtif des mots corrigés. Sorti d'App.svelte pour rester sous son plafond
 * max-lines et être testable sans monter le composant.
 *
 * @param {object} opts
 * @param {() => Array} opts.getHistory
 * @param {(history: Array) => void} opts.setHistory
 * @param {() => string} opts.getNotes
 * @param {() => boolean} opts.isActive
 * @param {(sentences: string[], notes: string) => Promise<string[]|null>} opts.post
 * @param {(index: number, text: string) => void} opts.editTranscription
 * @returns {{notify: () => void, reset: () => void, isInFlight: () => boolean}}
 */
export function createNotesRefiner({
  getHistory,
  setHistory,
  getNotes,
  isActive,
  post,
  editTranscription,
}) {
  return createTranscriptRefiner({
    getTargets: () => pickRefineTargets(getHistory()),
    getNotes,
    isActive,
    post,
    apply: (item, original, corrected) => {
      const idx = getHistory().indexOf(item);
      if (idx === -1 || String(item.text).trim() !== original) return;
      editTranscription(idx, corrected);
      flashRefinedWords(idx, original, corrected, (up) => setHistory(up(getHistory())));
    },
  });
}

/**
 * Ordonnanceur de relecture : un seul appel en vol, débounce, relance de fin.
 *
 * @param {object} opts
 * @param {() => Array<{item: object, text: string}>} opts.getTargets Évalué au
 *   DÉPART de l'appel (texte le plus frais), jamais à la notification.
 * @param {() => string} opts.getNotes
 * @param {() => boolean} opts.isActive Enregistrement en cours, hors preview.
 * @param {(sentences: string[], notes: string) => Promise<string[]|null>} opts.post
 * @param {(item: object, original: string, corrected: string) => void} opts.apply
 * @param {number} [opts.debounceMs]
 * @returns {{notify: () => void, reset: () => void, isInFlight: () => boolean}}
 */
export function createTranscriptRefiner({
  getTargets,
  getNotes,
  isActive,
  post,
  apply,
  debounceMs = REFINE_DEBOUNCE_MS,
}) {
  let dirty = false;
  let inFlight = false;
  let timer = null;
  // Dernier couple (notes, phrases) traité : un blur de notes sans changement
  // ne doit pas re-dépenser un appel sur les mêmes phrases.
  let lastKey = '';

  function arm() {
    if (timer !== null || inFlight) return;
    timer = setTimeout(() => {
      timer = null;
      fire();
    }, debounceMs);
  }

  async function fire() {
    if (inFlight || !dirty) return;
    dirty = false;
    if (!isActive()) return;
    const notes = String(getNotes() || '').trim();
    const targets = getTargets();
    if (!notes || !targets.length) return;
    const key = JSON.stringify([notes, targets.map((t) => t.text)]);
    if (key === lastKey) return;

    inFlight = true;
    try {
      const refined = await post(
        targets.map((t) => t.text),
        notes,
      );
      lastKey = key;
      if (Array.isArray(refined) && refined.length === targets.length) {
        targets.forEach((t, i) => {
          const next = acceptRefined(t.text, refined[i], notes);
          if (next) apply(t.item, t.text, next);
        });
      }
    } catch {
      // Relecture best-effort : l'échec réseau/modèle ne remonte jamais.
    } finally {
      inFlight = false;
      if (dirty) arm();
    }
  }

  return {
    /** Une phrase vient d'être finalisée, ou les notes ont été sauvées. */
    notify() {
      if (!isActive()) return;
      dirty = true;
      arm();
    },
    /** Nouvelle réunion ou consultation d'un historique. */
    reset() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      dirty = false;
      lastKey = '';
    },
    isInFlight() {
      return inFlight;
    },
  };
}
