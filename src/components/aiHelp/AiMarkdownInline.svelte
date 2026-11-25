<script>
  /**
   * Les nœuds « en ligne » d'un Markdown simple (utils/miniMarkdown.js) : du
   * texte, du gras, de l'italique, du code, des liens — imbriqués, d'où le
   * composant qui s'appelle lui-même.
   *
   * Chaque nœud devient un élément ou un texte de Svelte : rien n'est inséré en
   * HTML brut. Un lien s'ouvre ailleurs, sans donner la main à la page ouverte.
   *
   * Le gabarit tient sur UNE ligne, sans espace entre les blocs : un retour à
   * la ligne entre deux nœuds serait un espace à l'écran (« gras , » au lieu de
   * « gras, »). D'où `prettier-ignore`.
   */
  /** @type {import('../../utils/miniMarkdown.js').InlineNode[]} */
  export let nodes = [];
</script>

<!-- prettier-ignore -->
{#each nodes as node}{#if node.t === 'text'}{node.v}{:else if node.t === 'code'}<code>{node.v}</code>{:else if node.t === 'strong'}<strong><svelte:self nodes={node.c} /></strong>{:else if node.t === 'em'}<em><svelte:self nodes={node.c} /></em>{:else if node.t === 'link'}<a href={node.href} target="_blank" rel="noopener noreferrer"><svelte:self nodes={node.c} /></a>{/if}{/each}

<style>
  strong {
    font-weight: 600;
  }
  code {
    padding: 1px 5px;
    border-radius: 5px;
    background: rgb(var(--ai-rgb) / 0.1);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.92em;
  }
  a {
    color: var(--ai-ink);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  a:focus-visible {
    outline: 2px solid var(--ai);
    outline-offset: 2px;
    border-radius: 3px;
  }
</style>
