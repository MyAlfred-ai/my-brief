<script>
  // Titre de section : pastille ronde en dégradé, libellé, filet qui s'efface.
  import GradIcon from './GradIcon.svelte';

  export let title = '';
  export let icon = 'point';
  export let pal;
  /** `p` | `s` | `ok` | `warn` */
  export let tone = 'p';
</script>

<div class="ig-stitle">
  <GradIcon name={icon} {tone} {pal} size={4.4} shape="round" />
  <span class="ig-stitle-text">{title}</span>
  <span class="ig-stitle-line ig-stitle-line-{tone}"></span>
</div>
