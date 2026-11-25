/**
 * Un Markdown SIMPLE, lu en un arbre de nœuds — jamais en HTML.
 *
 * Les réponses de l'Aide IA arrivent souvent en Markdown : myBrain écrit ses
 * fiches ainsi, et le modèle le reprend (gras, listes, liens). Affiché brut, on
 * lisait des astérisques et des crochets. Ce module en fait un ARBRE que le
 * composant AiMarkdown rend nœud par nœud : aucun `{@html}`, aucune chaîne de
 * balises — un texte venu d'un modèle, qui a lui-même lu une transcription et
 * un wiki, ne peut donc rien injecter dans la page. C'est le parti pris de
 * toute l'appli (elle n'insère de HTML brut nulle part), et la raison de ne
 * pas ajouter une bibliothèque de Markdown qu'il aurait fallu assainir.
 *
 * Ce qui est compris — le sous-ensemble qu'une réponse courte emploie :
 *   blocs     listes à puces et numérotées, titres (rendus comme une ligne en
 *             gras), citations, blocs de code, lignes de tableau (aplaties en
 *             « a · b »), paragraphes — un par ligne.
 *   en ligne  **gras**, *italique*, `code`, [texte](lien), [[lien de wiki]].
 * Tout le reste est du texte, écrit tel quel.
 *
 * Un lien n'est cliquable que s'il est en http(s), ou — relatif — s'il part
 * d'une base qu'on lui donne (l'adresse de myBrain, seule source de liens
 * relatifs). `javascript:`, `data:` et consorts restent du texte.
 */

/** @typedef {{t: 'text', v: string} | {t: 'code', v: string} |
 *   {t: 'strong' | 'em', c: InlineNode[]} | {t: 'link', href: string, c: InlineNode[]}} InlineNode */
/** @typedef {{t: 'p' | 'h' | 'quote', c: InlineNode[]} | {t: 'pre', v: string} |
 *   {t: 'ul' | 'ol', items: InlineNode[][]}} BlockNode */

/** L'adresse d'un lien qu'on accepte de rendre cliquable, ou `''`. */
function safeHref(raw, base) {
  const url = String(raw || '').trim();
  if (/^https?:\/\//i.test(url)) {
    try {
      return new URL(url).href;
    } catch {
      return '';
    }
  }
  // Relatif à la racine, et une base connue : un lien de myBrain vers sa fiche.
  if (base && /^\/(?!\/)/.test(url)) {
    try {
      return new URL(url, base).href;
    } catch {
      return '';
    }
  }
  return '';
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Le texte d'une ligne, en nœuds. Lu caractère par caractère plutôt que par
 * une seule expression régulière : pas de regard en arrière (`(?<=…)`), que
 * les Safari d'avant 16.4 refusent au CHARGEMENT du script.
 * @param {string} text
 * @param {string} base
 * @returns {InlineNode[]}
 */
function inline(text, base) {
  /** @type {InlineNode[]} */
  const out = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ t: 'text', v: plain });
    plain = '';
  };
  const push = (node) => {
    flush();
    out.push(node);
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const before = i > 0 ? text[i - 1] : ' ';
    let m;

    if ((m = /^`([^`\n]+)`/.exec(rest))) {
      push({ t: 'code', v: m[1] });
    } else if ((m = /^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(rest))) {
      // Lien de wiki : son texte, sans crochets. On ne sait pas où il mène.
      plain += (m[2] || m[1]).trim();
    } else if ((m = /^\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"\n]*")?\)/.exec(rest))) {
      // Un lien qu'on ne sait pas ouvrir sans risque : son texte, sans l'adresse.
      const href = safeHref(m[2], base);
      if (href) push({ t: 'link', href, c: inline(m[1], base) });
      else {
        flush();
        out.push(...inline(m[1], base));
      }
    } else if ((m = /^(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/.exec(rest))) {
      push({ t: 'strong', c: inline(m[2], base) });
    } else if (before !== '*' && (m = /^\*(\S(?:[^*\n]*?\S)?)\*(?!\*)/.exec(rest))) {
      push({ t: 'em', c: inline(m[1], base) });
    } else if (
      // `_` au milieu d'un mot (snake_case, une adresse) n'est pas de l'italique.
      !WORD_CHAR.test(before) &&
      (m = /^_(\S(?:[^_\n]*?\S)?)_/.exec(rest)) &&
      !WORD_CHAR.test(rest[m[0].length] || ' ')
    ) {
      push({ t: 'em', c: inline(m[1], base) });
    } else {
      plain += text[i];
      i += 1;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

const BULLET = /^\s*[-*•–]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(?:```|~~~)/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_RULE = /^\s*\|?[\s:|-]+\|?\s*$/;

/**
 * @param {string} source - le texte, en Markdown simple
 * @param {{base?: string}} [options] - `base` : d'où partent les liens relatifs
 * @returns {BlockNode[]}
 */
export function parseMarkdown(source, { base = '' } = {}) {
  /** @type {BlockNode[]} */
  const blocks = [];
  const lines = String(source ?? '').split(/\r?\n/);
  let fence = null;

  for (const raw of lines) {
    if (fence !== null) {
      if (FENCE.test(raw)) {
        blocks.push({ t: 'pre', v: fence.join('\n') });
        fence = null;
      } else fence.push(raw);
      continue;
    }
    if (FENCE.test(raw)) {
      fence = [];
      continue;
    }
    if (!raw.trim() || RULE.test(raw)) continue;

    const last = blocks[blocks.length - 1];
    let m;
    if ((m = BULLET.exec(raw))) {
      if (last?.t === 'ul') last.items.push(inline(m[1], base));
      else blocks.push({ t: 'ul', items: [inline(m[1], base)] });
    } else if ((m = NUMBERED.exec(raw))) {
      if (last?.t === 'ol') last.items.push(inline(m[1], base));
      else blocks.push({ t: 'ol', items: [inline(m[1], base)] });
    } else if ((m = HEADING.exec(raw))) {
      blocks.push({ t: 'h', c: inline(m[1], base) });
    } else if ((m = QUOTE.exec(raw))) {
      blocks.push({ t: 'quote', c: inline(m[1], base) });
    } else if (TABLE_ROW.test(raw)) {
      // Un tableau ne tient pas dans une bulle : ses lignes, aplaties.
      if (TABLE_RULE.test(raw)) continue;
      const cells = TABLE_ROW.exec(raw)[1]
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean);
      blocks.push({ t: 'p', c: inline(cells.join(' · '), base) });
    } else {
      blocks.push({ t: 'p', c: inline(raw.trim(), base) });
    }
  }
  // Un bloc de code jamais refermé : son contenu, tel quel.
  if (fence !== null && fence.length) blocks.push({ t: 'pre', v: fence.join('\n') });
  return blocks;
}

/**
 * Un texte EN COURS d'écriture (la réponse s'affiche mot à mot) : referme le
 * gras et le code restés ouverts, et tait un lien dont on n'a que le début —
 * sinon on verrait des astérisques et des crochets passer, le temps que la
 * suite arrive.
 * @param {string} partial
 */
export function closeOpenMarkdown(partial) {
  let text = String(partial ?? '').replace(/\[{1,2}[^\]\n]*(?:\]\([^)\n]*)?$/, '');
  const lastLine = text.slice(text.lastIndexOf('\n') + 1);
  if ((lastLine.match(/`/g) || []).length % 2 === 1) text += '`';
  if ((lastLine.match(/\*\*/g) || []).length % 2 === 1) text += '**';
  return text;
}
