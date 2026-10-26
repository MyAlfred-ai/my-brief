<script>
  /**
   * Section « Mes templates » de « Ma configuration ».
   *
   * C'était un panneau plein écran à part (avec sa propre coquille et son
   * propre hash) ; tous les réglages de l'utilisateur tiennent désormais dans
   * un seul panneau dont la colonne de gauche porte la navigation. Ne reste
   * ici que ce qui est propre aux templates PERSONNELS : les endpoints, le
   * plafond, et le compteur — l'éditeur lui-même est partagé avec
   * l'administration (TemplateEditor).
   */
  import { uiText, currentLanguageStore } from '../../store.js';
  import { get as apiGet, post as apiPost } from '../../services/apiClient.js';
  import TemplateEditor from '../TemplateEditor.svelte';

  const MAX_TEMPLATES = 5;

  const api = {
    list: () => apiGet('/user-templates'),
    save: (payload) => apiPost('/user-templates/save', payload),
    remove: (value) => apiPost('/user-templates/delete', { value }),
  };

  let count = 0;

  $: t = {
    ...$uiText.userTemplatesPanel,
    // Clé transverse du dictionnaire (déjà traduite) absente de la section.
    sessionExpired: $uiText.history.sessionExpired,
  };
  $: limitReached = count >= MAX_TEMPLATES;
</script>

<div class="ts-head">
  <h4>{t.title}</h4>
  <span class="ts-counter" class:ts-counter-max={limitReached}>
    {count} / {MAX_TEMPLATES}
  </span>
</div>

<TemplateEditor
  {api}
  texts={t}
  lang={$currentLanguageStore}
  maxTemplates={MAX_TEMPLATES}
  onCountChange={(n) => (count = n)}
/>

<style>
  /* Ligne de titre de la section : le nom de l'écran et son plafond. Le header
     du panneau, lui, porte « Ma configuration » — il ne peut plus nommer la
     section, il y en a huit. */
  .ts-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 22px 12px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }
  .ts-head h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .ts-counter {
    font-size: 11px;
    font-weight: 600;
    color: var(--brand-text);
    background: var(--brand-secondary-soft-08);
    border: 1px solid var(--brand-secondary-soft-18);
    padding: 4px 10px;
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }
  .ts-counter-max {
    color: var(--danger-strong);
    background: oklch(50% 0.2 25 / 0.08);
    border-color: oklch(50% 0.2 25 / 0.25);
  }
</style>
