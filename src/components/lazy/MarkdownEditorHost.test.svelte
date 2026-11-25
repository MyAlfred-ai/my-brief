<script>
  // Hôte des tests : l'enveloppe telle qu'App l'utilise, emplacement compris.
  import MarkdownEditor from './MarkdownEditor.svelte';
  export let html = '';
</script>

<MarkdownEditor {html} labels={{}}>
  <span slot="status" class="statut-temoin">enregistré</span>
</MarkdownEditor>
