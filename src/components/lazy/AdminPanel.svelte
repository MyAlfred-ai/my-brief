<script>
  /** AdminPanel, chargé à l'ouverture de l'administration (lazy/panels.js). */
  import LazyComponent from './LazyComponent.svelte';
  import { adminPanel } from './panels.js';
</script>

<LazyComponent component={adminPanel} {...$$restProps} />
