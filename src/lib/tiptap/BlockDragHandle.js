/**
 * BlockDragHandle — poignée de drag&drop par bloc (B1), maison, zéro dépendance.
 *
 * Affiche une poignée flottante (⋮⋮) dans la gouttière gauche, alignée sur le bloc
 * top-level survolé. Au drag, sélectionne ce bloc (NodeSelection) et délègue le
 * déplacement au drop natif de ProseMirror (move:true) → PM supprime la source et
 * réinsère au point de dépôt ; le Dropcursor de StarterKit montre l'indicateur.
 *
 * B1 = déplacement bloc par bloc (titre, paragraphe, liste entière). Le regroupement
 * "section" heading-aware (déplacer un titre + son corps) = B2, à venir.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';

const KEY = new PluginKey('blockDragHandle');

/** @param {string} label - aria-label de la poignée, dans la langue de l'interface */
function blockDragHandlePlugin(label) {
  return new Plugin({
    key: KEY,
    view(editorView) {
      const wrapper = editorView.dom.closest('.ut-ed-wrap') || editorView.dom.parentElement;
      let blockPos = null;
      let blockDom = null;
      let dragging = false;

      const handle = document.createElement('div');
      handle.className = 'ut-ed-drag-handle';
      handle.setAttribute('draggable', 'true');
      handle.setAttribute('contenteditable', 'false');
      handle.setAttribute('aria-label', label);
      handle.innerHTML = '<span aria-hidden="true">⠿</span>';
      handle.style.display = 'none';
      if (wrapper) wrapper.appendChild(handle);

      const hide = () => {
        if (!dragging) handle.style.display = 'none';
      };

      // Position du bloc top-level sous le pointeur → place et montre la poignée.
      const onMove = (e) => {
        if (dragging) return;
        const coords = editorView.posAtCoords({ left: e.clientX, top: e.clientY });
        if (!coords) {
          hide();
          return;
        }
        let pos;
        try {
          const $pos = editorView.state.doc.resolve(coords.pos);
          if ($pos.depth === 0) {
            hide();
            return;
          }
          pos = $pos.before(1);
        } catch {
          hide();
          return;
        }

        const dom = editorView.nodeDOM(pos);
        if (!dom || dom.nodeType !== 1) {
          hide();
          return;
        }

        blockPos = pos;
        blockDom = dom;
        const r = dom.getBoundingClientRect();
        const wr = wrapper.getBoundingClientRect();
        handle.style.top = `${r.top - wr.top}px`;
        handle.style.display = 'flex';
      };

      const onDragStart = (e) => {
        if (blockPos == null) return;
        dragging = true;
        try {
          const sel = NodeSelection.create(editorView.state.doc, blockPos);
          editorView.dispatch(editorView.state.tr.setSelection(sel));
          editorView.dragging = { slice: sel.content(), move: true };
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', blockDom ? blockDom.outerHTML : '');
            if (blockDom) e.dataTransfer.setDragImage(blockDom, 0, 0);
          }
        } catch {
          dragging = false;
        }
      };

      const onDragEnd = () => {
        dragging = false;
        editorView.dragging = null;
        handle.style.display = 'none';
      };

      handle.addEventListener('dragstart', onDragStart);
      handle.addEventListener('dragend', onDragEnd);
      editorView.dom.addEventListener('mousemove', onMove);
      wrapper && wrapper.addEventListener('mouseleave', hide);

      return {
        destroy() {
          handle.removeEventListener('dragstart', onDragStart);
          handle.removeEventListener('dragend', onDragEnd);
          editorView.dom.removeEventListener('mousemove', onMove);
          wrapper && wrapper.removeEventListener('mouseleave', hide);
          handle.remove();
        },
      };
    },
  });
}

export const BlockDragHandle = Extension.create({
  name: 'blockDragHandle',
  addOptions() {
    return { label: 'Déplacer le bloc' };
  },
  addProseMirrorPlugins() {
    return [blockDragHandlePlugin(this.options.label || 'Déplacer le bloc')];
  },
});
