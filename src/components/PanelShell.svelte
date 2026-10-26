<script>
  /**
   * Coquille commune des panneaux plein écran (« Ma configuration »,
   * « Mes templates », Administration) — structure et CSS qui étaient
   * copiés-collés trois fois avec un préfixe différent (ap-, sp-, ut-).
   *
   * Montage : DANS le layout flex, à droite de l'historique (`flex: 1`
   * suffit, pas de backdrop ni de centrage — ce ne sont plus des modales).
   * Mobile : la sidebar est un drawer hors flux, le panneau passe en
   * plein écran au-dessus (position fixed + z-index).
   *
   * Slots :
   *   - title-extra : à droite du titre (compteur, email du compte…)
   *   - tabs        : barre d'onglets sous le header (optionnelle)
   *   - défaut      : le corps du panneau (chaque enfant gère son scroll)
   */
  import IconClose from '~icons/solar/close-circle-linear';

  export let title = '';
  /** Composant d'icône (unplugin-icons) affiché dans la pastille du titre. */
  export let icon = null;
  export let onClose = () => {};
  export let closeLabel = 'Fermer';
</script>

<div class="shell-overlay" role="dialog" aria-modal="true" aria-label={title}>
  <div class="shell-panel">
    <div class="shell-header">
      <div class="shell-title">
        {#if icon}
          <span class="shell-title-icon" aria-hidden="true">
            <svelte:component this={icon} width="18" height="18" />
          </span>
        {/if}
        <h2>{title}</h2>
        <slot name="title-extra" />
      </div>
      <button class="shell-close" on:click={onClose} aria-label={closeLabel}>
        <IconClose width="18" height="18" />
        <span class="shell-close-label">{closeLabel}</span>
      </button>
    </div>

    <slot name="tabs" />

    <slot />
  </div>
</div>

<style>
  .shell-overlay {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: inherit;
  }
  .shell-panel {
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .shell-header {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-tint);
    flex-shrink: 0;
  }
  .shell-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .shell-title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--brand-secondary-soft-12);
    color: var(--brand-text);
    flex-shrink: 0;
  }
  .shell-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  /* Bouton de sortie du panneau : pill bordée AVEC libellé — la croix grise
     seule passait inaperçue, « on ne voit pas comment fermer ». */
  .shell-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-shrink: 0;
    background: #fff;
    border: 1.5px solid var(--brand);
    color: var(--brand-text);
    cursor: pointer;
    padding: 7px 14px 7px 11px;
    border-radius: 10px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 1px 4px rgb(var(--brand-rgb) / 0.18);
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .shell-close-label {
    white-space: nowrap;
  }
  .shell-close:hover {
    background: var(--brand);
    color: #fff;
    box-shadow: 0 3px 10px rgb(var(--brand-rgb) / 0.35);
  }

  @media (max-width: 768px) {
    /* Plein écran SOUS la barre d'app mobile : elle reste le repère permanent
       (logo + menu), donc le panneau démarre dessous et se range sous elle
       dans l'échelle de z-index mobile (8000 < barre 8500 < drawer 8700,
       voir style.css). La barre porte déjà la safe-area top — le header du
       panneau n'a plus à s'en occuper. */
    .shell-overlay {
      position: fixed;
      inset: calc(var(--mobile-appbar-h, 52px) + var(--safe-top, 0px)) 0 0 0;
      z-index: 8000;
    }
    .shell-panel {
      padding-bottom: var(--safe-bottom, 0px);
    }
  }
  @media (max-width: 640px) {
    /* 100 % de la zone sous la barre ; la barre d'adresse mobile ne doit pas
       masquer le bas du panneau (l'overlay est borné par inset). */
    .shell-panel {
      width: 100vw;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
      border: none;
    }
    .shell-header {
      padding: 14px 16px;
    }
  }
</style>
