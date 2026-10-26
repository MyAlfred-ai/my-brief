<script>
  /**
   * Icône ⓘ discrète avec infobulle au survol / au focus.
   *
   * Sert aux en-têtes de panneaux (Notes, Actions) pour expliquer COMMENT la
   * zone est utilisée par l'app sans occuper d'espace à l'écran : l'aide
   * complète vit dans Réglages → Aide, ici on ne donne que la phrase qui évite
   * le contresens. Bouton (et pas un span) : au clavier comme au doigt, le
   * focus suffit à montrer la bulle — pas de survol requis sur mobile.
   *
   * La bulle est en `position: fixed`, posée au montage d'après la position de
   * l'icône : les panneaux qui l'accueillent sont tous en overflow:hidden, une
   * bulle absolue y serait rognée (vérifié sur le panneau Notes). `place`
   * choisit le côté : 'below' par défaut, 'above' pour un panneau collé au bas
   * de l'écran, où la bulle déborderait sous la fenêtre.
   */
  import IconInfo from '~icons/solar/info-circle-linear';

  export let label = '';
  export let text = '';
  /** 'below' | 'above' */
  export let place = 'below';

  const TIP_MAX_WIDTH = 250;
  let btnEl;
  let shown = false;
  let tipStyle = '';

  function show() {
    if (!btnEl) return;
    const r = btnEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - TIP_MAX_WIDTH - 16));
    tipStyle =
      place === 'above'
        ? `left:${left}px; bottom:${window.innerHeight - r.top + 6}px;`
        : `left:${left}px; top:${r.bottom + 6}px;`;
    shown = true;
  }

  function hide() {
    shown = false;
  }
</script>

<span class="ih-wrap">
  <button
    class="ih-btn"
    type="button"
    aria-label={label}
    bind:this={btnEl}
    on:mouseenter={show}
    on:mouseleave={hide}
    on:focus={show}
    on:blur={hide}
  >
    <IconInfo width="14" height="14" />
  </button>
  {#if shown}
    <span class="ih-tip" style={tipStyle} role="tooltip">{text}</span>
  {/if}
</span>

<style>
  .ih-wrap {
    display: inline-flex;
    flex-shrink: 0;
  }

  .ih-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: none;
    background: transparent;
    color: var(--mb-text-placeholder);
    cursor: help;
    border-radius: 50%;
    transition: color 0.15s;
  }

  .ih-btn:hover,
  .ih-btn:focus-visible {
    color: var(--brand-text);
  }

  .ih-tip {
    position: fixed;
    max-width: min(250px, 62vw);
    padding: 8px 11px;
    background: #fff;
    border: 1px solid var(--mb-border-subtle);
    border-radius: 10px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.1);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.45;
    color: var(--mb-text-secondary);
    text-align: left;
    white-space: normal;
    pointer-events: none;
    animation: ih-tip-in 0.15s ease-out;
    /* Au-dessus du fondu bas de .main-area (z-index 40) et des cartes. */
    z-index: 60;
  }

  @keyframes ih-tip-in {
    from {
      opacity: 0;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
