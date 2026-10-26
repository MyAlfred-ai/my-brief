<script>
  /**
   * Un réglage de couleur de l'onglet « Configuration » : sélecteur natif,
   * champ hexadécimal et retour au défaut.
   *
   * Extrait plutôt que dupliqué : la carte en porte DEUX (primaire et
   * secondaire), et le trio sélecteur/hexa/réinitialisation a assez de règles
   * tacites — le sélecteur natif ne rend que des `#rrggbb`, donc c'est lui qui
   * garantit le format et le champ texte n'est qu'un raccourci ; un hexa
   * invalide ne doit pas casser l'aperçu du sélecteur — pour être écrit deux
   * fois côte à côte sans finir par diverger.
   */
  import { HEX_COLOR_PATTERN } from '../../stores/branding.js';

  /** Identifiant de base des champs (deux instances sur la même page). */
  export let id;
  export let label;
  export let hexLabel;
  /** Teinte intégrée : valeur de repli de l'aperçu et cible du bouton. */
  export let defaultColor;
  export let invalidText;
  export let resetText;
  export let value = '';

  $: valid = HEX_COLOR_PATTERN.test(value.trim());
  $: isDefault = value.trim().toLowerCase() === defaultColor;
</script>

<!-- Groupe nommé : les deux instances de la carte portent le même libellé de
     champ hexadécimal, et sans nom de groupe un lecteur d'écran annoncerait
     deux fois « Code hexadécimal » sans dire de quelle couleur il s'agit. -->
<div class="bc-row" role="group" aria-label={label}>
  <div class="bc-field">
    <label class="bc-label" for={id}>{label}</label>
    <input
      {id}
      class="bc-color-input"
      type="color"
      value={valid ? value.trim().toLowerCase() : defaultColor}
      on:input={(e) => (value = e.currentTarget.value)}
    />
  </div>
  <div class="bc-field bc-hex">
    <label class="bc-label" for={`${id}-hex`}>{hexLabel}</label>
    <input
      id={`${id}-hex`}
      class="bc-input"
      type="text"
      spellcheck="false"
      placeholder={defaultColor}
      bind:value
    />
    {#if !valid}
      <p class="bc-warn">{invalidText}</p>
    {/if}
  </div>
  {#if !isDefault}
    <button type="button" class="bc-ghost" on:click={() => (value = defaultColor)}>
      {resetText}
    </button>
  {/if}
</div>

<style>
  .bc-row {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .bc-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .bc-hex {
    flex: 0 1 180px;
  }
  .bc-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bc-color-input {
    width: 72px;
    height: 44px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    cursor: pointer;
  }
  .bc-input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.92rem;
    background: #fff;
    color: #1a1a1a;
    width: 100%;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .bc-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .bc-warn {
    margin: 0.3rem 0 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 0.85rem;
  }
  /* Aligné sur le bas du champ hexa, comme l'ancien .bt-color-reset. */
  .bc-ghost {
    align-self: flex-end;
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.88rem;
    transition: background 0.15s;
  }
  .bc-ghost:hover {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
</style>
