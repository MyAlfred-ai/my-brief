<svelte:options accessors />

<script>
  // Éditeur WYSIWYG markdown (façon Notion) basé sur TipTap.
  // Entrée/sortie en HTML : `html` en prop, événements `update` / `blur`.
  // Barre d'outils fixe (gras/italique/souligné, Titre/Sous-titre, listes,
  // lien, gomme) + slot `status` pour l'indicateur d'autosave du parent.
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { Editor, Extension } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import IconBold from '~icons/solar/text-bold-linear';
  import IconItalic from '~icons/solar/text-italic-linear';
  import IconUnderline from '~icons/solar/text-underline-linear';
  import IconLink from '~icons/solar/link-minimalistic-2-linear';
  import IconEraser from '~icons/solar/eraser-linear';

  export let html = '';
  /** Libellés i18n ($uiText.editor) — tooltips et popover de lien. */
  export let labels = {};
  /** Instance TipTap, exposée pour les tests de composant. */
  export let editorRef = null;

  const dispatch = createEventDispatcher();

  let element;
  let editor = null;
  // Compteur bumpé à chaque transaction ProseMirror : c'est LUI qui rend les
  // états actifs réactifs (Svelte ne voit pas les mutations internes de
  // l'éditeur). Dépendance nommée dans la déclaration `$: states = …`.
  let editTick = 0;

  let linkOpen = false;
  let linkUrl = '';
  let linkInputEl;
  let linkWrapEl;

  // Saut de ligne du template : la donnée voyage en `<p><br></p>` (robuste en
  // mail/PDF, où un <p> vide s'écrase). Mais ProseMirror parse ce <br> comme
  // un hardBreak RÉEL et lui ajoute son <br> décoratif de fin de paragraphe →
  // DEUX retours affichés pour un seul voulu. À l'entrée on le convertit en
  // paragraphe vide (une seule ligne à l'écran), à la sortie on le remet en
  // `<p><br></p>` pour garder la donnée robuste.
  const toEditorHtml = (h) => (h || '').replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, '<p></p>');
  const fromEditorHtml = (h) => (h || '').replace(/<p>\s*<\/p>/gi, '<p><br></p>');

  // Tabulation = 4 espaces insécables ( ). Contrairement aux espaces
  // normaux, ils ne sont pas fusionnés par le navigateur ni par ProseMirror
  // → la tabulation survit au HTML stocké, au rechargement et au PDF.
  const TAB = '    ';

  // Tab : hors liste, insère une tabulation au caret ; dans une liste,
  // imbrique l'item (comportement TipTap habituel). Shift+Tab fait l'inverse.
  const TabHandler = Extension.create({
    name: 'tabHandler',
    addKeyboardShortcuts() {
      return {
        Tab: ({ editor }) => {
          if (editor.isActive('listItem')) {
            editor.commands.sinkListItem('listItem');
          } else {
            editor.commands.insertContent(TAB);
          }
          return true;
        },
        'Shift-Tab': ({ editor }) => {
          if (editor.isActive('listItem')) {
            editor.commands.liftListItem('listItem');
            return true;
          }
          // Hors liste : retirer jusqu'à 4 espaces insécables avant le caret
          const { selection, doc } = editor.state;
          if (selection.empty) {
            const to = selection.from;
            const from = Math.max(selection.$from.start(), to - 4);
            const trailing = (doc.textBetween(from, to).match(/ +$/) || [''])[0];
            if (trailing) {
              editor.commands.deleteRange({ from: to - trailing.length, to });
            }
          }
          return true;
        },
      };
    },
  });

  // Cmd/Ctrl+K : raccourci universel « poser un lien » — ouvre le popover.
  const LinkShortcut = Extension.create({
    name: 'linkShortcut',
    addKeyboardShortcuts() {
      return {
        'Mod-k': () => {
          openLinkPopover();
          return true;
        },
      };
    },
  });

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          // Cliquer un lien pendant l'édition doit poser le caret, pas
          // naviguer. `autolink` : taper une URL + espace crée le lien.
          link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
        }),
        TabHandler,
        LinkShortcut,
      ],
      content: toEditorHtml(html),
      // L'élément éditable porte la classe `resume-text-area` → tout le CSS
      // existant du résumé s'applique sans changement.
      editorProps: {
        attributes: { class: 'resume-text-area' },
      },
      onUpdate: ({ editor }) => {
        dispatch('update', { html: fromEditorHtml(editor.getHTML()) });
      },
      onBlur: ({ editor }) => {
        dispatch('blur', { html: fromEditorHtml(editor.getHTML()) });
      },
    });
    editor.on('transaction', () => {
      editTick += 1;
    });
    editorRef = editor;
  });

  onDestroy(() => {
    if (editor) editor.destroy();
  });

  // Changement externe de `html` (changement de version, génération,
  // restauration…) → pousser dans l'éditeur. On compare au contenu RÉEL de
  // l'éditeur : si `html` provient de l'éditeur lui-même (via on:update), il
  // est déjà affiché → on ne fait rien. Sinon `setContent` ferait sauter le
  // caret (effet « retour à la ligne ») à chaque frappe. Comparaison et
  // injection dans la forme ÉDITEUR (cf. toEditorHtml).
  $: if (editor && toEditorHtml(html) !== editor.getHTML()) {
    editor.commands.setContent(toEditorHtml(html), { emitUpdate: false });
  }

  // États actifs des boutons — recalculés à chaque transaction (editTick).
  $: states = readStates(editor, editTick);
  function readStates(ed, _tick) {
    if (!ed) {
      return {
        bold: false,
        italic: false,
        underline: false,
        h2: false,
        h3: false,
        bullet: false,
        ordered: false,
        link: false,
        canLink: false,
      };
    }
    return {
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      h2: ed.isActive('heading', { level: 2 }),
      h3: ed.isActive('heading', { level: 3 }),
      bullet: ed.isActive('bulletList'),
      ordered: ed.isActive('orderedList'),
      link: ed.isActive('link'),
      // Un lien se pose sur une sélection, ou se modifie caret dedans.
      canLink: !ed.state.selection.empty || ed.isActive('link'),
    };
  }

  const run = (fn) => () => {
    if (editor) fn(editor.chain().focus()).run();
  };
  const cmd = {
    bold: run((c) => c.toggleBold()),
    italic: run((c) => c.toggleItalic()),
    underline: run((c) => c.toggleUnderline()),
    // Re-cliquer un titre actif le rebascule en paragraphe (comportement
    // toggleHeading) : c'est le retour au « normal ».
    h2: run((c) => c.toggleHeading({ level: 2 })),
    h3: run((c) => c.toggleHeading({ level: 3 })),
    bullet: run((c) => c.toggleBulletList()),
    ordered: run((c) => c.toggleOrderedList()),
    clear: run((c) => c.clearNodes().unsetAllMarks()),
  };

  function openLinkPopover() {
    if (!editor || !readStates(editor, 0).canLink) return;
    linkUrl = editor.getAttributes('link')?.href || '';
    linkOpen = true;
    tick().then(() => linkInputEl?.focus());
  }

  function applyLink() {
    const raw = (linkUrl || '').trim();
    linkOpen = false;
    if (!editor) return;
    if (!raw) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    // Sans protocole explicite → https. Jamais de javascript: (refusé par la
    // config Link de TipTap de toute façon).
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }

  function removeLink() {
    linkOpen = false;
    if (editor) editor.chain().focus().extendMarkRange('link').unsetLink().run();
  }

  function onLinkKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyLink();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      linkOpen = false;
      editor?.commands.focus();
    }
  }

  // Fermer le popover au clic hors de lui (le mousedown des boutons de la
  // barre est preventDefault → le focus de l'éditeur ne bouge pas).
  function onWindowPointerDown(e) {
    if (linkOpen && linkWrapEl && !linkWrapEl.contains(e.target)) {
      linkOpen = false;
    }
  }

  const L = (key, fallback) => labels?.[key] || fallback;
</script>

<svelte:window on:mousedown={onWindowPointerDown} />

<div class="md-editor-host">
  <div class="md-toolbar" role="toolbar" aria-label={L('toolbarLabel', 'Mise en forme')}>
    <button
      type="button"
      class="md-tb-btn"
      class:active={states.bold}
      aria-pressed={states.bold}
      aria-label={L('bold', 'Gras')}
      title="{L('bold', 'Gras')} (⌘B)"
      on:mousedown|preventDefault
      on:click={cmd.bold}
    >
      <IconBold width="17" height="17" />
    </button>
    <button
      type="button"
      class="md-tb-btn"
      class:active={states.italic}
      aria-pressed={states.italic}
      aria-label={L('italic', 'Italique')}
      title="{L('italic', 'Italique')} (⌘I)"
      on:mousedown|preventDefault
      on:click={cmd.italic}
    >
      <IconItalic width="17" height="17" />
    </button>
    <button
      type="button"
      class="md-tb-btn"
      class:active={states.underline}
      aria-pressed={states.underline}
      aria-label={L('underline', 'Souligné')}
      title="{L('underline', 'Souligné')} (⌘U)"
      on:mousedown|preventDefault
      on:click={cmd.underline}
    >
      <IconUnderline width="17" height="17" />
    </button>

    <span class="md-tb-sep" aria-hidden="true"></span>

    <button
      type="button"
      class="md-tb-btn md-tb-btn-text"
      class:active={states.h2}
      aria-pressed={states.h2}
      aria-label={L('title', 'Titre')}
      title={L('title', 'Titre')}
      on:mousedown|preventDefault
      on:click={cmd.h2}
    >
      {L('title', 'Titre')}
    </button>
    <button
      type="button"
      class="md-tb-btn md-tb-btn-text md-tb-btn-subtitle"
      class:active={states.h3}
      aria-pressed={states.h3}
      aria-label={L('subtitle', 'Sous-titre')}
      title={L('subtitle', 'Sous-titre')}
      on:mousedown|preventDefault
      on:click={cmd.h3}
    >
      {L('subtitle', 'Sous-titre')}
    </button>

    <span class="md-tb-sep" aria-hidden="true"></span>

    <button
      type="button"
      class="md-tb-btn"
      class:active={states.bullet}
      aria-pressed={states.bullet}
      aria-label={L('bulletList', 'Liste à puces')}
      title={L('bulletList', 'Liste à puces')}
      on:mousedown|preventDefault
      on:click={cmd.bullet}
    >
      <!-- Solar n'a pas de « liste à puces / numérotée » : SVG maison, même
           trait (stroke 1.5, round) que les icônes linear voisines. -->
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="4.5" cy="6" r="1.4" fill="currentColor" />
        <circle cx="4.5" cy="12" r="1.4" fill="currentColor" />
        <circle cx="4.5" cy="18" r="1.4" fill="currentColor" />
        <path
          d="M9.5 6H20M9.5 12H20M9.5 18H20"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </button>
    <button
      type="button"
      class="md-tb-btn"
      class:active={states.ordered}
      aria-pressed={states.ordered}
      aria-label={L('orderedList', 'Liste numérotée')}
      title={L('orderedList', 'Liste numérotée')}
      on:mousedown|preventDefault
      on:click={cmd.ordered}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <text x="2.4" y="8" font-size="7.5" font-family="inherit" fill="currentColor" stroke="none"
          >1</text
        >
        <text
          x="2.4"
          y="20.5"
          font-size="7.5"
          font-family="inherit"
          fill="currentColor"
          stroke="none">2</text
        >
        <path
          d="M9.5 6H20M9.5 12H20M9.5 18H20"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <span class="md-tb-sep" aria-hidden="true"></span>

    <span class="md-tb-linkwrap" bind:this={linkWrapEl}>
      <button
        type="button"
        class="md-tb-btn"
        class:active={states.link}
        aria-pressed={states.link}
        disabled={!states.canLink}
        aria-label={L('link', 'Lien hypertexte')}
        title={states.canLink
          ? `${L('link', 'Lien hypertexte')} (⌘K)`
          : L('linkHint', 'Sélectionnez du texte pour créer un lien')}
        on:mousedown|preventDefault
        on:click={() => (linkOpen ? (linkOpen = false) : openLinkPopover())}
      >
        <IconLink width="17" height="17" />
      </button>
      {#if linkOpen}
        <div class="md-link-popover">
          <!-- svelte-ignore a11y-autofocus -->
          <input
            type="url"
            class="md-link-input"
            bind:this={linkInputEl}
            bind:value={linkUrl}
            placeholder={L('linkUrlPlaceholder', 'Adresse du lien (https://…)')}
            aria-label={L('linkUrlPlaceholder', 'Adresse du lien')}
            on:keydown={onLinkKeydown}
          />
          <button type="button" class="md-link-apply" on:click={applyLink}>
            {L('linkApply', 'Appliquer')}
          </button>
          {#if states.link}
            <button type="button" class="md-link-remove" on:click={removeLink}>
              {L('linkRemove', 'Retirer')}
            </button>
          {/if}
        </div>
      {/if}
    </span>

    <span class="md-tb-sep" aria-hidden="true"></span>

    <button
      type="button"
      class="md-tb-btn"
      aria-label={L('clearFormatting', 'Effacer la mise en forme')}
      title={L('clearFormatting', 'Effacer la mise en forme')}
      on:mousedown|preventDefault
      on:click={cmd.clear}
    >
      <IconEraser width="17" height="17" />
    </button>

    <span class="md-tb-spacer"></span>
    <slot name="status" />
  </div>
  <div class="md-editor-body" bind:this={element}></div>
</div>

<style>
  /* L'hôte et le corps ne génèrent pas de boîte : barre d'outils et élément
     .ProseMirror sont mis en page comme enfants directs de .tab-resume-wrap
     (scroll container) — d'où le sticky de la barre et le min-height: 100%
     du texte qui continuent de fonctionner. */
  .md-editor-host,
  .md-editor-body {
    display: contents;
  }

  /* Barre d'outils — collée en haut de la zone de scroll, sous le voile de
     chargement (z 5, cf. .resume-loading-state) mais au-dessus du contenu. */
  .md-toolbar {
    position: sticky;
    top: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 7px 12px;
    background: color-mix(in srgb, var(--brand-secondary) 2.2%, #fff);
    border-bottom: 1px solid var(--mb-border-card);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .md-toolbar::-webkit-scrollbar {
    display: none;
  }

  .md-tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--ink-soft, #6b6b6b);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .md-tb-btn:hover:not(:disabled) {
    background: var(--brand-secondary-soft-12);
    color: var(--ink, #2b2b2b);
  }
  .md-tb-btn.active {
    background: var(--brand-soft-15);
    color: var(--brand-text-strong);
  }
  .md-tb-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .md-tb-btn-text {
    font-family: 'Lexend', sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.1px;
  }
  .md-tb-btn-subtitle {
    font-size: 11.5px;
    font-weight: 500;
  }

  .md-tb-sep {
    width: 1px;
    height: 18px;
    margin: 0 6px;
    background: var(--mb-border-card);
    flex-shrink: 0;
  }

  .md-tb-spacer {
    flex: 1;
    min-width: 8px;
  }

  /* Popover de lien — ancré sous le bouton. */
  .md-tb-linkwrap {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
  }
  .md-link-popover {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    background: #fff;
    border: 1px solid var(--mb-border-card);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
    z-index: 10;
  }
  .md-link-input {
    width: min(280px, 56vw);
    padding: 7px 10px;
    border: 1px solid var(--mb-border-card);
    border-radius: 7px;
    font-family: 'Lexend', sans-serif;
    font-size: 12.5px;
    color: var(--ink, #2b2b2b);
    outline: none;
  }
  .md-link-input:focus {
    border-color: rgb(var(--brand-rgb) / 0.5);
  }
  .md-link-apply,
  .md-link-remove {
    padding: 7px 10px;
    border: none;
    border-radius: 7px;
    font-family: 'Lexend', sans-serif;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .md-link-apply {
    background: var(--brand);
    color: #fff;
  }
  .md-link-apply:hover {
    background: var(--brand-strong);
  }
  .md-link-remove {
    background: transparent;
    color: var(--ink-soft, #6b6b6b);
  }
  .md-link-remove:hover {
    background: var(--brand-secondary-soft-12);
  }

  @media (max-width: 768px) {
    .md-toolbar {
      padding: 6px 8px;
    }
    .md-tb-sep {
      margin: 0 3px;
    }
  }
</style>
