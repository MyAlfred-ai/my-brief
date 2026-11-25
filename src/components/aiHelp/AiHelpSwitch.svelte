<script>
  /**
   * L'interrupteur de l'Aide IA, dans la teinte de l'IA : allumer l'IA n'est
   * pas un réglage de l'application comme un autre (ToggleSwitch, à la marque).
   */
  export let checked = false;
  export let label = '';
  export let onChange = () => {};
</script>

<button
  type="button"
  class="ais"
  class:ais-on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  on:click={() => onChange(!checked)}
>
  <span class="ais-knob"></span>
</button>

<style>
  .ais {
    width: 52px;
    height: 30px;
    flex: none;
    display: flex;
    align-items: center;
    padding: 0 2px;
    border: none;
    border-radius: 15px;
    background: var(--ink-faint);
    cursor: pointer;
    transition: background 0.2s;
  }
  .ais-on {
    background: var(--ai);
  }
  .ais-knob {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1);
  }
  .ais-on .ais-knob {
    transform: translateX(22px);
  }
  .ais:focus-visible {
    outline: 2px solid var(--ai-ink);
    outline-offset: 2px;
  }
  /* Cible tactile de 44 px sans grossir le dessin. */
  @media (pointer: coarse) {
    .ais {
      position: relative;
    }
    .ais::after {
      content: '';
      position: absolute;
      inset: -7px 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ais,
    .ais-knob {
      transition: none;
    }
  }
</style>
