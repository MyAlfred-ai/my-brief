<script>
  /**
   * Sélecteur de tag pour la conversation ouverte : bouton (tag posé, ou
   * invite) + menu déroulant portant TagPicker.
   *
   * Utilisé à deux endroits — en-tête de la conversation et zone du résumé
   * généré. Un seul composant : les deux doivent afficher le même état et le
   * modifier de la même façon.
   *
   * L'appel réseau est délégué à `tagMeeting` (optimiste, avec rétractation en
   * cas d'échec) ; ce composant ne fait que remonter l'échec à l'appelant, qui
   * décide du toast.
   */
  import { tick } from 'svelte';
  import { tagsById, tagMeeting } from '../stores/tags.js';
  import { uiText } from '../store.js';
  import TagChip from './TagChip.svelte';
  import TagPicker from './TagPicker.svelte';
  import IconTag from '~icons/solar/tag-linear';

  /** Conversation ciblée. Sans elle, le sélecteur est inerte (rien à ranger) —
   *  sauf si `onPick` prend le relai. */
  export let meetingId = null;
  export let tagId = null;
  /** @type {(slug: string) => void} appelé avec le slug d'erreur du serveur */
  export let onError = () => {};
  /** Ouvre « Mes tags ». Omis = entrée masquée. */
  export let onManage = null;
  /**
   * @type {((tagId: string|null) => void)|null} Remplace l'appel réseau par un
   * rangement porté par l'appelant — cas de l'enregistrement en cours, où la
   * réunion n'a pas encore de meetingId : le tag choisi est mis en attente et
   * posé dès que l'id existe.
   */
  export let onPick = null;

  let open = false;
  let btnEl;
  let menuEl;
  // Menu en position:fixed, ancré sur le bouton : en absolute il était
  // rogné par l'overflow:hidden du panneau (bouton collé au bord droit
  // de la barre d'onglets, menu invisible sur mobile).
  let menuX = 0;
  let menuY = 0;

  async function toggle() {
    open = !open;
    if (!open || !btnEl) return;
    const r = btnEl.getBoundingClientRect();
    menuX = r.left;
    menuY = r.bottom + 6;
    // Recalé sur la taille RÉELLE du menu une fois rendu (avant la peinture) :
    // un menu court reste sous le bouton, un menu long remonte juste assez
    // pour tenir dans la fenêtre — la liste des tags y défile, jamais le menu.
    await tick();
    const m = menuEl?.getBoundingClientRect();
    if (!m) return;
    menuX = Math.max(8, Math.min(menuX, window.innerWidth - m.width - 8));
    menuY = Math.max(8, Math.min(menuY, window.innerHeight - m.height - 8));
  }

  $: t = $uiText.sidebar;
  $: current = tagId ? $tagsById.get(tagId) || null : null;

  async function pick(nextId) {
    open = false;
    if (nextId === tagId) return;
    if (onPick) return void onPick(nextId);
    const res = await tagMeeting(meetingId, nextId);
    if (!res.ok) onError(res.error);
  }

  function manage() {
    open = false;
    onManage?.();
  }
</script>

<svelte:window on:click={() => (open = false)} />

<div class="ts" on:click|stopPropagation role="none">
  <button
    class="ts-btn"
    class:ts-btn-empty={!current}
    bind:this={btnEl}
    on:click={toggle}
    disabled={!meetingId && !onPick}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t.tagSelectLabel}
  >
    {#if current}
      <TagChip tag={current} />
    {:else}
      <IconTag width="13" height="13" />
      <span>{t.tagNone}</span>
    {/if}
  </button>

  {#if open}
    <div class="ts-menu" bind:this={menuEl} style="left: {menuX}px; top: {menuY}px">
      <TagPicker selectedId={tagId} onPick={pick} onManage={onManage ? manage : null} />
    </div>
  {/if}
</div>

<style>
  .ts {
    position: relative;
    display: inline-flex;
  }
  .ts-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-soft);
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .ts-btn:hover:not(:disabled) {
    border-color: var(--line-strong);
    background: var(--surface-tint);
  }
  .ts-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ts-btn-empty {
    color: var(--ink-muted);
    border-style: dashed;
  }
  /* Le menu ne défile JAMAIS lui-même (sinon deux ascenseurs imbriqués et un
     pied « Gérer les tags… » sous le pli) : colonne flex bornée à la fenêtre,
     et c'est la liste des tags de TagPicker qui prend la place restante et
     défile, tête et pied restant visibles. */
  .ts-menu {
    --tp-list-max: none;
    position: fixed;
    z-index: 10001;
    display: flex;
    flex-direction: column;
    max-height: min(400px, calc(100dvh - 16px));
    max-width: calc(100vw - 16px);
    padding: 4px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 14%, transparent);
  }
</style>
