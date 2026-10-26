/**
 * Nœud TipTap "variable" — un placeholder {{clé}} rendu comme un chip atomique
 * (icône + label) dans l'éditeur de template. Inline, atomique (non éditable au
 * caractère), sélectionnable et déplaçable (drag natif du chip).
 *
 * Le document ne porte que la `key` (allowlist VARIABLE_CATALOG) ; le rendu visuel
 * (icône/label) est dérivé du catalogue → aucune donnée libre stockée dans le nœud.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { VARIABLE_CATALOG } from '../../config/templates.js';

const BY_KEY = Object.fromEntries(VARIABLE_CATALOG.map((v) => [v.key, v]));

export const VariableNode = Node.create({
  name: 'variable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { lang: 'fr' };
  },

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-key'),
        renderHTML: (attrs) => (attrs.key ? { 'data-key': attrs.key } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-variable]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const v = BY_KEY[node.attrs.key];
    const icon = v ? v.icon : '🔖';
    const label = v ? (this.options.lang === 'en' ? v.labelEn : v.labelFr) : node.attrs.key;
    const ai = v && v.isAiBlock;
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-variable': '',
        class: 'ut-ed-chip' + (ai ? ' ut-ed-chip-ai' : ''),
        contenteditable: 'false',
        draggable: 'true',
        title: v ? (this.options.lang === 'en' ? v.descEn : v.descFr) : node.attrs.key,
      }),
      `${icon} ${label}`,
    ];
  },

  // Commande d'insertion : editor.commands.insertVariable('résumé')
  addCommands() {
    return {
      insertVariable:
        (key) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { key } }),
    };
  },
});
