<script>
  /**
   * Le texte d'une intervention de l'Aide IA, mis en forme : gras, listes,
   * liens, code. myBrain écrit ses fiches en Markdown et le modèle le reprend ;
   * affiché brut, on lisait des astérisques (signalé en recette, 2026-11-12).
   *
   * Le texte est lu en un arbre (utils/miniMarkdown.js) puis rendu nœud par
   * nœud : AUCUN HTML brut n'est inséré — ce texte vient d'un modèle qui a lu
   * une transcription et un wiki.
   *
   * `partial` : la réponse est en train de s'écrire mot à mot — le gras et le
   * code restés ouverts sont refermés, pour qu'on ne voie pas passer la
   * syntaxe. `caret` pose le curseur d'écriture à la fin du dernier bloc.
   */
  import { closeOpenMarkdown, parseMarkdown } from '../../utils/miniMarkdown.js';
  import AiMarkdownInline from './AiMarkdownInline.svelte';

  export let text = '';
  /** D'où partent les liens relatifs — l'adresse de myBrain. */
  export let base = '';
  export let partial = false;
  export let caret = false;

  $: blocks = parseMarkdown(partial ? closeOpenMarkdown(text) : text, { base });
  $: last = blocks.length - 1;
</script>

<div class="aimd">
  {#each blocks as block, index}
    {#if block.t === 'ul' || block.t === 'ol'}
      <svelte:element this={block.t}>
        {#each block.items as item, at}
          <li>
            <AiMarkdownInline
              nodes={item}
            />{#if caret && index === last && at === block.items.length - 1}<span
                class="aimd-caret"
                aria-hidden="true"
              ></span>{/if}
          </li>
        {/each}
      </svelte:element>
    {:else if block.t === 'pre'}
      <pre>{block.v}</pre>
    {:else if block.t === 'quote'}
      <blockquote>
        <AiMarkdownInline nodes={block.c} />{#if caret && index === last}<span
            class="aimd-caret"
            aria-hidden="true"
          ></span>{/if}
      </blockquote>
    {:else}
      <p class:aimd-heading={block.t === 'h'}>
        <AiMarkdownInline nodes={block.c} />{#if caret && index === last}<span
            class="aimd-caret"
            aria-hidden="true"
          ></span>{/if}
      </p>
    {/if}
  {/each}
</div>

<style>
  .aimd {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .aimd p,
  .aimd blockquote,
  .aimd pre {
    margin: 0;
  }
  .aimd-heading {
    font-weight: 600;
  }
  .aimd :global(ul),
  .aimd :global(ol) {
    margin: 0;
    padding-left: 1.25em;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .aimd li::marker {
    color: var(--ai);
  }
  .aimd blockquote {
    padding-left: 10px;
    border-left: 3px solid var(--ai-line);
    color: var(--mb-text-secondary);
  }
  .aimd pre {
    padding: 8px 10px;
    border-radius: 8px;
    background: rgb(var(--ai-rgb) / 0.08);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .aimd-caret {
    display: inline-block;
    width: 2px;
    height: 1em;
    margin-left: 3px;
    vertical-align: -2px;
    background: var(--ai);
    animation: aimd-caret 0.7s steps(1) infinite;
  }
  @keyframes aimd-caret {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aimd-caret {
      animation: none;
    }
  }
</style>
