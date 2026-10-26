/**
 * Sérialisation scaffold ⇄ document TipTap (ProseMirror JSON).
 *
 * Le scaffold est stocké côté backend en markdown (sous-ensemble : titres `#`/`##`,
 * listes `-`, `**gras**`, `*italique*`, `<u>souligné</u>`, et placeholders
 * `{{variable}}`). L'éditeur WYSIWYG travaille en document ProseMirror. Ce module
 * fait l'aller-retour SANS toucher au format stocké → backend inchangé.
 *
 * Source unique de la grammaire (alignée sur renderPreviewHtml de UserTemplatesPanel).
 * Les marqueurs `{{var}}` ne deviennent des nœuds `variable` que pour les clés
 * connues (VARIABLE_CATALOG) — tout le reste reste du texte littéral. À la
 * sérialisation, un nœud variable ne ré-émet QUE sa clé d'allowlist → impossible
 * d'injecter un `{{...}}` arbitraire via le document.
 */

import { VARIABLE_CATALOG } from './templates.js';

// Clés produisant un chip. 'resume'/'summary' sont des alias anglais de 'résumé'
// (cf. SCAFFOLD_MARKER_RE) → normalisés vers la clé canonique du catalogue.
const CANON = { resume: 'résumé', summary: 'résumé' };
export const KNOWN_VARIABLE_KEYS = new Set(VARIABLE_CATALOG.map((v) => v.key));

function canonicalKey(raw) {
  const k = raw.trim();
  const c = CANON[k] || k;
  return KNOWN_VARIABLE_KEYS.has(c) ? c : null;
}

// ─── Parsing : scaffold markdown → document ProseMirror ─────────────────────

function marksArray(state) {
  const out = [];
  if (state.underline) out.push({ type: 'underline' });
  if (state.bold) out.push({ type: 'bold' });
  if (state.italic) out.push({ type: 'italic' });
  return out;
}

// Découpe une ligne en contenu inline : nœuds texte (avec marks) + nœuds variable.
function parseInline(line) {
  const out = [];
  const marks = { bold: false, italic: false, underline: false };
  let buf = '';

  const flush = () => {
    if (buf) {
      const m = marksArray(marks);
      out.push(m.length ? { type: 'text', text: buf, marks: m } : { type: 'text', text: buf });
      buf = '';
    }
  };

  let i = 0;
  while (i < line.length) {
    if (line.startsWith('{{', i)) {
      const end = line.indexOf('}}', i + 2);
      if (end !== -1) {
        const key = canonicalKey(line.slice(i + 2, end));
        if (key) {
          flush();
          const m = marksArray(marks);
          const node = { type: 'variable', attrs: { key } };
          if (m.length) node.marks = m;
          out.push(node);
          i = end + 2;
          continue;
        }
      }
      buf += '{{';
      i += 2;
      continue;
    }
    if (line.startsWith('<u>', i)) {
      flush();
      marks.underline = true;
      i += 3;
      continue;
    }
    if (line.startsWith('</u>', i)) {
      flush();
      marks.underline = false;
      i += 4;
      continue;
    }
    if (line.startsWith('**', i)) {
      flush();
      marks.bold = !marks.bold;
      i += 2;
      continue;
    }
    if (line[i] === '*') {
      flush();
      marks.italic = !marks.italic;
      i += 1;
      continue;
    }
    buf += line[i];
    i += 1;
  }
  flush();
  return out;
}

export function scaffoldToTiptapDoc(scaffold) {
  const lines = String(scaffold || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const content = [];
  let list = null; // bulletList en cours d'accumulation

  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      list = null;
      continue;
    } // ligne vide = séparateur

    // Ligne `<br>` seule = paragraphe VIDE voulu (saut de ligne visuel dans le
    // compte rendu). Sans ce marqueur, la ligne vide du markdown n'est qu'un
    // séparateur de blocs : les paragraphes vides tapés dans l'éditeur
    // disparaissaient à l'enregistrement.
    if (/^<br\s*\/?>$/i.test(line.trim())) {
      list = null;
      content.push({ type: 'paragraph' });
      continue;
    }

    let m;
    if ((m = line.match(/^##\s+(.*)$/))) {
      list = null;
      content.push({ type: 'heading', attrs: { level: 2 }, content: parseInline(m[1]) });
    } else if ((m = line.match(/^#\s+(.*)$/))) {
      list = null;
      content.push({ type: 'heading', attrs: { level: 1 }, content: parseInline(m[1]) });
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      const item = {
        type: 'listItem',
        content: [{ type: 'paragraph', content: parseInline(m[1]) }],
      };
      if (!list) {
        list = { type: 'bulletList', content: [] };
        content.push(list);
      }
      list.content.push(item);
    } else {
      list = null;
      content.push({ type: 'paragraph', content: parseInline(line) });
    }
  }

  if (content.length === 0) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}

// ─── Sérialisation : document ProseMirror → scaffold markdown ───────────────

// Ordre de nesting des marks (extérieur → intérieur), stable pour un round-trip.
const MARK_ORDER = ['underline', 'bold', 'italic'];
const MARK_OPEN = { underline: '<u>', bold: '**', italic: '*' };
const MARK_CLOSE = { underline: '</u>', bold: '**', italic: '*' };

function nodeMarks(node) {
  const s = { bold: false, italic: false, underline: false };
  for (const m of node.marks || []) {
    if (m.type === 'bold') s.bold = true;
    else if (m.type === 'italic') s.italic = true;
    else if (m.type === 'underline') s.underline = true;
  }
  return s;
}

function serializeInline(content) {
  let out = '';
  const open = { underline: false, bold: false, italic: false };

  const setMarks = (target) => {
    // ferme les marks ouvertes mais plus actives (ordre inverse → nesting correct)
    for (let k = MARK_ORDER.length - 1; k >= 0; k--) {
      const name = MARK_ORDER[k];
      if (open[name] && !target[name]) {
        out += MARK_CLOSE[name];
        open[name] = false;
      }
    }
    // ouvre les marks actives pas encore ouvertes (ordre direct)
    for (const name of MARK_ORDER) {
      if (!open[name] && target[name]) {
        out += MARK_OPEN[name];
        open[name] = true;
      }
    }
  };

  for (const node of content || []) {
    setMarks(nodeMarks(node));
    if (node.type === 'variable') out += `{{${node.attrs.key}}}`;
    else if (node.type === 'text') out += node.text || '';
    else if (node.type === 'hardBreak') out += '\n';
  }
  setMarks({ underline: false, bold: false, italic: false }); // ferme tout
  return out;
}

function serializeListItem(li) {
  // un listItem contient un (ou plusieurs) paragraphes
  return (li.content || [])
    .map((p) => serializeInline(p.content || []))
    .join(' ')
    .trim();
}

export function tiptapDocToScaffold(doc) {
  const blocks = [];
  for (const node of (doc && doc.content) || []) {
    switch (node.type) {
      case 'heading': {
        const prefix = node.attrs && node.attrs.level === 2 ? '## ' : '# ';
        blocks.push(prefix + serializeInline(node.content || []));
        break;
      }
      case 'paragraph': {
        const text = serializeInline(node.content || []);
        // Paragraphe vide → marqueur `<br>` : une chaîne vide serait avalée
        // par le join('\n\n') + la compression des lignes vides ci-dessous.
        blocks.push(text === '' ? '<br>' : text);
        break;
      }
      case 'bulletList':
        blocks.push((node.content || []).map((li) => '- ' + serializeListItem(li)).join('\n'));
        break;
      case 'orderedList':
        blocks.push(
          (node.content || []).map((li, idx) => `${idx + 1}. ` + serializeListItem(li)).join('\n'),
        );
        break;
      default:
        // nœud hors sous-ensemble (collé) → on aplati son texte inline
        blocks.push(serializeInline(node.content || []));
    }
  }
  const joined = blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Un document fait uniquement de paragraphes vides reste un scaffold vide.
  return /^(?:<br>(?:\n\n)?)*$/.test(joined) ? '' : joined;
}
