<script>
  // Éditeur WYSIWYG du scaffold de template (façon Notion), basé sur TipTap.
  // Remplace l'ancienne textarea markdown brut : l'utilisateur voit le RÉSULTAT
  // (gras = gras, pas `**gras**`), les variables sont des chips atomiques, et les
  // blocs sont déplaçables en drag&drop (B1 : par bloc).
  //
  // I/O : prop `scaffold` (markdown, bindable) ⇄ document TipTap. Le format
  // stocké ne change pas → backend inchangé (cf. src/config/scaffold.js).
  import { onMount, onDestroy } from 'svelte';
  import { Editor, Extension } from '@tiptap/core';
  import { Plugin } from '@tiptap/pm/state';
  import StarterKit from '@tiptap/starter-kit';
  import { VariableNode } from '../lib/tiptap/VariableNode.js';
  import { BlockDragHandle } from '../lib/tiptap/BlockDragHandle.js';
  import { scaffoldToTiptapDoc, tiptapDocToScaffold } from '../config/scaffold.js';
  import { VARIABLE_CATALOG } from '../config/templates.js';

  export let scaffold = '';
  export let lang = 'fr';
  export let placeholder = '';
  // { bold, italic, underline, h1, h2, list, insertHint, aiGroup, metaGroup, alreadyInserted }
  export let labels = {};

  let element;
  let editor = null;
  let lastEmitted = null; // dernière valeur émise PAR l'éditeur (anti-boucle)
  let v = 0; // bump pour réactivité des états actifs de la toolbar
  let externalReload = false; // vrai pendant un setContent venu du parent

  // Pastilles en deux familles : les blocs générés par l'IA (résumé principal
  // + résumés complémentaires) et les infos de contexte de la réunion.
  const aiItems = VARIABLE_CATALOG.filter((item) => item.isAiBlock);
  const metaItems = VARIABLE_CATALOG.filter((item) => !item.isAiBlock);

  function docHasVariable(doc, key) {
    let found = false;
    doc.descendants((node) => {
      if (found) return false;
      if (node.type.name === 'variable' && node.attrs.key === key) {
        found = true;
        return false;
      }
      return true;
    });
    return found;
  }

  // Le bloc ✨ Résumé IA est OBLIGATOIRE : déplaçable, jamais supprimable.
  // Plutôt que de rejeter la transaction (un « tout effacer » semblerait en
  // panne), on laisse la suppression se faire puis on réinsère le bloc en fin
  // de document dans la même passe — l'utilisateur voit qu'il reste.
  const ResumeLock = Extension.create({
    name: 'resumeLock',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          appendTransaction(transactions, oldState, newState) {
            if (externalReload) return null; // rechargement piloté par le parent
            if (!transactions.some((tr) => tr.docChanged)) return null;
            if (!docHasVariable(oldState.doc, 'résumé')) return null;
            if (docHasVariable(newState.doc, 'résumé')) return null;
            const variable = newState.schema.nodes.variable.create({ key: 'résumé' });
            const paragraph = newState.schema.nodes.paragraph.create(null, variable);
            return newState.tr.insert(newState.doc.content.size, paragraph);
          },
        }),
      ];
    },
  });

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        VariableNode.configure({ lang }),
        BlockDragHandle.configure({ label: labels.dragBlock }),
        ResumeLock,
      ],
      content: scaffoldToTiptapDoc(scaffold),
      editorProps: { attributes: { class: 'ut-ed-surface-input' } },
      onUpdate: ({ editor }) => {
        const s = tiptapDocToScaffold(editor.getJSON());
        lastEmitted = s;
        scaffold = s; // propage via bind:scaffold
      },
      onTransaction: () => {
        v += 1;
      }, // force le recalcul des états de la barre d'outils
    });
  });

  onDestroy(() => {
    if (editor) editor.destroy();
  });

  // Changement externe de `scaffold` (sélection d'un autre template, reset…) →
  // recharger le doc. On ignore les valeurs issues de l'éditeur lui-même pour ne
  // pas faire sauter le caret à chaque frappe. Le verrou du résumé est levé le
  // temps du rechargement : c'est le parent qui garantit son scaffold.
  $: if (editor && scaffold !== lastEmitted) {
    externalReload = true;
    editor.commands.setContent(scaffoldToTiptapDoc(scaffold), { emitUpdate: false });
    externalReload = false;
    lastEmitted = scaffold;
  }

  // États de la barre d'outils, recalculés à chaque transaction : `v` figure
  // dans l'expression, sinon Svelte ne relancerait pas le calcul.
  $: active = toolbarState(editor, v);
  // Un bloc IA ne s'insère qu'une fois : le même marqueur reçoit le même
  // contenu, un doublon ne produirait qu'une copie conforme.
  $: insertedAiKeys = insertedKeys(editor, v);

  function toolbarState(ed, _v) {
    const on = (name, attrs) => !!(ed && ed.isActive(name, attrs));
    return {
      bold: on('bold'),
      italic: on('italic'),
      underline: on('underline'),
      h1: on('heading', { level: 1 }),
      h2: on('heading', { level: 2 }),
      list: on('bulletList'),
    };
  }

  function insertedKeys(ed, _v) {
    if (!ed) return new Set();
    return new Set(aiItems.filter((i) => docHasVariable(ed.state.doc, i.key)).map((i) => i.key));
  }

  const cmd = (fn) => () => {
    if (editor) fn(editor.chain().focus()).run();
  };
  // Un bloc IA est un CONTENU DE BLOC (le LLM y insère un pavé HTML) : il
  // s'insère dans son propre paragraphe, jamais collé inline à un autre chip —
  // deux marqueurs sur la même ligne fusionnaient en un seul emplacement dans
  // le prompt. Les infos réunion restent inline (utilisables dans une phrase).
  const insertVar = (key) => {
    if (!editor) return;
    const item = VARIABLE_CATALOG.find((i) => i.key === key);
    if (item?.isAiBlock) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'paragraph', content: [{ type: 'variable', attrs: { key } }] })
        .run();
    } else {
      editor.chain().focus().insertVariable(key).run();
    }
  };
</script>

<div class="ut-ed-wrap">
  <div class="ut-format-toolbar" role="toolbar" aria-label={labels.formatHint || ''}>
    <button
      type="button"
      class="ut-fmt-btn ut-fmt-bold"
      class:is-active={active.bold}
      title={`${labels.bold || 'Gras'} (Ctrl/⌘+B)`}
      on:click={cmd((c) => c.toggleBold())}>B</button
    >
    <button
      type="button"
      class="ut-fmt-btn ut-fmt-italic"
      class:is-active={active.italic}
      title={`${labels.italic || 'Italique'} (Ctrl/⌘+I)`}
      on:click={cmd((c) => c.toggleItalic())}>I</button
    >
    <button
      type="button"
      class="ut-fmt-btn ut-fmt-underline"
      class:is-active={active.underline}
      title={`${labels.underline || 'Souligné'} (Ctrl/⌘+U)`}
      on:click={cmd((c) => c.toggleUnderline())}>U</button
    >
    <span class="ut-fmt-sep" aria-hidden="true"></span>
    <button
      type="button"
      class="ut-fmt-btn ut-fmt-h"
      class:is-active={active.h1}
      title={labels.h1 || 'Titre 1'}
      on:click={cmd((c) => c.toggleHeading({ level: 1 }))}>{labels.h1 || 'Titre 1'}</button
    >
    <button
      type="button"
      class="ut-fmt-btn ut-fmt-h"
      class:is-active={active.h2}
      title={labels.h2 || 'Titre 2'}
      on:click={cmd((c) => c.toggleHeading({ level: 2 }))}>{labels.h2 || 'Titre 2'}</button
    >
    <span class="ut-fmt-sep" aria-hidden="true"></span>
    <button
      type="button"
      class="ut-fmt-btn ut-fmt-list"
      class:is-active={active.list}
      title={labels.list || 'Liste'}
      on:click={cmd((c) => c.toggleBulletList())}>•—</button
    >
  </div>

  <div class="ut-var-toolbar" role="toolbar" aria-label={labels.insertHint || ''}>
    <div class="ut-var-group">
      <span class="ut-var-group-label">{labels.aiGroup || 'Blocs IA'}</span>
      {#each aiItems as item}
        <button
          type="button"
          class="ut-var-chip ut-var-chip-ai"
          disabled={insertedAiKeys.has(item.key)}
          title={insertedAiKeys.has(item.key)
            ? labels.alreadyInserted || ''
            : lang === 'en'
              ? item.descEn
              : item.descFr}
          on:click={() => insertVar(item.key)}
        >
          <span class="ut-var-icon">{item.icon}</span>
          <span class="ut-var-label">{lang === 'en' ? item.labelEn : item.labelFr}</span>
        </button>
      {/each}
    </div>
    <div class="ut-var-group">
      <span class="ut-var-group-label">{labels.metaGroup || 'Infos réunion'}</span>
      {#each metaItems as item}
        <button
          type="button"
          class="ut-var-chip"
          title={lang === 'en' ? item.descEn : item.descFr}
          on:click={() => insertVar(item.key)}
        >
          <span class="ut-var-icon">{item.icon}</span>
          <span class="ut-var-label">{lang === 'en' ? item.labelEn : item.labelFr}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="ut-ed-surface" data-placeholder={placeholder} bind:this={element}></div>
</div>
