<script>
  /**
   * Puce d'un groupe d'utilisateurs : pastille de couleur + nom.
   *
   * Un seul composant pour tous les endroits où un groupe se lit en ligne :
   * la ligne d'un compte et sa fiche (administration), le menu de compte de
   * l'utilisateur. C'est la seule garantie que le même groupe se reconnaisse
   * d'un écran à l'autre. La couleur passe par `groupColorVars` : un slug sans
   * jeton retombe sur le repli.
   */
  import { groupColorVars } from '../../utils/groupColors.js';

  /** @type {{id: string, name: string, color: string, isDefault?: boolean}|null} */
  export let group = null;
  /** Rendu plus grand (en-tête d'une fiche). */
  export let large = false;
  export let title = '';

  $: vars = groupColorVars(group?.color);
</script>

{#if group}
  <span
    class="gc"
    class:gc-large={large}
    style="--gc-dot: {vars.dot}; --gc-soft: {vars.soft}"
    title={title || null}
  >
    <span class="gc-dot" aria-hidden="true"></span>
    <span class="gc-name">{group.name}</span>
  </span>
{/if}

<style>
  .gc {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 2px 9px 2px 7px;
    border-radius: 999px;
    background: var(--gc-soft);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--ink-soft);
    vertical-align: middle;
  }
  .gc-large {
    padding: 4px 12px 4px 9px;
    font-size: 13px;
    gap: 8px;
  }
  .gc-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gc-dot);
    flex-shrink: 0;
  }
  .gc-large .gc-dot {
    width: 10px;
    height: 10px;
  }
  .gc-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
