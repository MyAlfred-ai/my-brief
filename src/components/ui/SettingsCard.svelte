<script>
  /**
   * Carte de réglages — l'anatomie qui était recopiée dans chaque panneau
   * (`.sa-card`, `.ac-card`, `.sp-card` : mêmes valeurs oklch en littéral, même
   * icône 38×38, même titre + hint).
   *
   * `on` allume le liseré gauche. Le signal existait déjà partout ailleurs
   * (`class:sp-card-on`, `class:ai-card-on`) mais manquait précisément aux
   * cartes d'actions, où il est le plus utile : il dit d'un coup d'œil quelle
   * action est réellement en service.
   *
   * L'icône passe par la prop `icon` pour un jeu d'icônes (props width/height)
   * et par le slot `icon` pour un logo de fournisseur (prop `size`) : les deux
   * familles ne se pilotent pas de la même façon, et passer les deux jeux de
   * props produirait un avertissement de prop inconnue à chaque rendu.
   */
  export let title = '';
  export let hint = '';
  export let icon = null;
  export let on = false;
</script>

<section class="sc" class:sc-on={on}>
  <header class="sc-head">
    {#if $$slots.icon}
      <span class="sc-icon" aria-hidden="true"><slot name="icon" /></span>
    {:else if icon}
      <span class="sc-icon" aria-hidden="true">
        <svelte:component this={icon} width="20" height="20" />
      </span>
    {/if}
    <div class="sc-title">
      <h4>{title}</h4>
      {#if hint}<p class="sc-hint">{hint}</p>{/if}
    </div>
    <slot name="badge" />
  </header>
  <slot />
</section>

<style>
  .sc {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-tint);
    transition: box-shadow 0.15s;
  }
  .sc-on {
    border-color: var(--line-strong);
    box-shadow: inset 3px 0 0 var(--brand);
  }
  .sc-head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .sc-icon {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--brand-text);
  }
  .sc-title {
    flex: 1 1 220px;
    min-width: 0;
  }
  .sc-title h4 {
    margin: 0 0 0.15rem;
    font-size: 0.98rem;
    font-weight: 600;
    color: var(--ink);
  }
  .sc-hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  @media (max-width: 640px) {
    .sc {
      padding: 0.85rem 0.9rem;
    }
  }
</style>
