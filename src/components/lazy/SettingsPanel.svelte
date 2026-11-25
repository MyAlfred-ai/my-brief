<script>
  /** SettingsPanel, chargé à l'ouverture des réglages (lazy/panels.js). */
  import LazyComponent from './LazyComponent.svelte';
  import { settingsPanel } from './panels.js';
</script>

<LazyComponent component={settingsPanel} {...$$restProps} />
