<script>
  /**
   * « Qui parle ici ? » — petit menu ancré sur une pastille de locuteur
   * distante (EditableTranscript). L'utilisateur nomme un participant de la
   * visio : raccourcis vers les noms déjà posés, « Visio » pour retirer un
   * nom, ou un nom neuf. Deux portées (cf. utils/transcriptSpeakers.js) :
   * d'ici jusqu'au prochain changement de voix (défaut), ou partout où cette
   * étiquette parle (case à cocher).
   *
   * Rendu dans <body> (portal) : les zones de transcription défilent avec
   * `overflow`, un menu posé dedans serait coupé sur la dernière ligne. Le
   * menu se repositionne quand la zone défile, et après chaque rendu de la
   * transcription (`place`, appelé par EditableTranscript) : en direct, sa
   * ligne peut changer d'élément sous lui. Il ne se ferme pas pour autant —
   * c'est EditableTranscript qui le réancre, ou le ferme si la ligne a disparu.
   *
   * Émet `pick` { name, everywhere } et `close`.
   */
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { portal } from '../utils/portal.js';
  import { uiText } from '../store.js';
  import { REMOTE_SPEAKER_LABEL } from '../utils/transcriptAttribution.js';
  import { normalizeSpeakerName } from '../utils/transcriptSpeakers.js';

  /** @type {HTMLElement} bouton (pastille ou « d'ici ») qui a ouvert le menu */
  export let anchor;
  /** Étiquette effective de la ligne visée (« Visio » ou un nom déjà posé). */
  export let current = '';
  /** Noms distants déjà posés dans la réunion, dans l'ordre d'apparition. */
  export let names = [];
  /** 'start' : bord gauche sur l'ancre (pastille) ; 'end' : bord droit sur
   *  l'ancre (bouton « d'ici », au bord droit de la ligne). */
  export let align = 'start';

  const dispatch = createEventDispatcher();
  $: T = $uiText.transcription.speakers;
  $: everywhereLabel = T.everywhere.replace('{name}', current || REMOTE_SPEAKER_LABEL);

  let el;
  let inputEl;
  let value = '';
  let everywhere = false;
  let style = 'visibility: hidden';

  // Sous l'ancre, aligné à gauche ; au-dessus s'il manque la place en bas ;
  // toujours dans la fenêtre, même quand l'ancre a défilé hors de vue. Ancre
  // détachée (la ligne change d'élément) : rester où l'on est, en attendant
  // la nouvelle.
  export function place() {
    if (!el || !anchor?.isConnected) return;
    const a = anchor.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const wanted = align === 'end' ? a.right - w : a.left;
    const left = Math.max(margin, Math.min(wanted, window.innerWidth - w - margin));
    let top = a.bottom + gap;
    if (top + h > window.innerHeight - margin) top = a.top - h - gap;
    top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));
    style = `top: ${Math.round(top)}px; left: ${Math.round(left)}px`;
  }

  // Nouvelle ancre (sa ligne a changé d'élément) : s'y replacer, une fois le
  // rendu fait. Le rappel d'EditableTranscript ne suffit pas : un afterUpdate
  // ne tourne qu'une fois par flush, avant que la nouvelle ancre n'arrive ici.
  $: if (el && anchor) tick().then(place);

  // Le menu naît en `visibility: hidden` (on ne le voit pas sauter à sa
  // place) : le focus doit attendre le flush qui l'affiche, un élément
  // invisible ignore `focus()`.
  onMount(async () => {
    await tick();
    place();
    await tick();
    inputEl?.focus();
  });

  function pick(name) {
    const clean = normalizeSpeakerName(name);
    if (clean) dispatch('pick', { name: clean, everywhere });
  }

  // Entrée dans le champ = nommer. Géré ici et non par la soumission implicite
  // du formulaire seule : elle dépend de l'état du bouton et du navigateur.
  function onInputKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(value);
    }
  }

  function onWindowKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      dispatch('close');
    }
  }

  // Clic hors du menu : fermer. L'ancre est exclue — c'est elle qui bascule
  // le menu (sinon fermeture ici puis réouverture par son propre clic).
  function onWindowPointerDown(e) {
    if (!el || el.contains(e.target) || anchor?.contains(e.target)) return;
    dispatch('close');
  }
</script>

<svelte:window
  on:keydown={onWindowKeydown}
  on:pointerdown={onWindowPointerDown}
  on:resize={place}
  on:scroll|capture={place}
/>

<div
  class="spk-pop"
  bind:this={el}
  use:portal
  {style}
  role="dialog"
  aria-label={T.title}
  data-testid="speaker-popover"
>
  <div class="spk-title">{T.title}</div>

  <div class="spk-chips">
    {#each names as name (name)}
      <button
        type="button"
        class="spk-chip"
        class:spk-chip-current={name === current}
        aria-pressed={name === current}
        on:click={() => pick(name)}>{name}</button
      >
    {/each}
    <button
      type="button"
      class="spk-chip spk-chip-unnamed"
      class:spk-chip-current={current === REMOTE_SPEAKER_LABEL}
      aria-pressed={current === REMOTE_SPEAKER_LABEL}
      on:click={() => pick(REMOTE_SPEAKER_LABEL)}
      >{REMOTE_SPEAKER_LABEL}<span class="spk-chip-hint">· {T.unidentified}</span></button
    >
  </div>

  <form class="spk-form" on:submit|preventDefault={() => pick(value)}>
    <input
      class="spk-input"
      type="text"
      bind:this={inputEl}
      bind:value
      on:keydown={onInputKeydown}
      placeholder={T.placeholder}
      maxlength="60"
      autocomplete="off"
      spellcheck="false"
    />
    <button type="submit" class="spk-apply" disabled={!normalizeSpeakerName(value)}
      >{T.apply}</button
    >
  </form>

  <label class="spk-everywhere">
    <input type="checkbox" bind:checked={everywhere} />
    <span>{everywhereLabel}</span>
  </label>
  {#if !everywhere}
    <div class="spk-hint">{T.scopeHint}</div>
  {/if}
</div>

<style>
  .spk-pop {
    position: fixed;
    z-index: 1100;
    width: 280px;
    max-width: calc(100vw - 16px);
    padding: 12px;
    border-radius: 12px;
    background: var(--surface, #fff);
    border: 1px solid var(--line-faint, rgb(0 0 0 / 0.1));
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.16);
    color: var(--ink, #222);
    font-family: 'Lexend', sans-serif;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: spk-in 0.12s ease;
  }

  @keyframes spk-in {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .spk-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-muted, #6a6a6a);
  }

  .spk-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .spk-chip {
    appearance: none;
    cursor: pointer;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgb(var(--brand-rgb) / 0.55);
    background: rgb(var(--brand-rgb) / 0.1);
    color: var(--brand-text);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    transition:
      background 0.12s ease,
      border-color 0.12s ease;
  }
  .spk-chip:hover,
  .spk-chip:focus-visible {
    background: rgb(var(--brand-rgb) / 0.2);
    border-color: rgb(var(--brand-rgb) / 0.85);
  }
  .spk-chip:focus-visible {
    outline: 2px solid rgb(var(--brand-rgb) / 0.5);
    outline-offset: 1px;
  }
  .spk-chip-current {
    background: rgb(var(--brand-rgb) / 0.22);
    border-color: rgb(var(--brand-rgb) / 0.9);
  }
  /* « Visio » : la voix non identifiée, en neutre — c'est le retrait d'un nom. */
  .spk-chip-unnamed {
    border-color: var(--line-faint, rgb(0 0 0 / 0.14));
    background: var(--surface-tint, rgb(0 0 0 / 0.04));
    color: var(--ink-soft, #4a4a4a);
  }
  .spk-chip-unnamed:hover,
  .spk-chip-unnamed:focus-visible,
  .spk-chip-unnamed.spk-chip-current {
    background: var(--line, rgb(0 0 0 / 0.09));
    border-color: var(--ink-faint, rgb(0 0 0 / 0.28));
  }
  .spk-chip-hint {
    margin-left: 5px;
    font-weight: 400;
    color: var(--ink-faint, #7d7d7d);
  }

  .spk-form {
    display: flex;
    gap: 6px;
  }
  .spk-input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--line-faint, rgb(0 0 0 / 0.14));
    background: var(--surface, #fff);
    color: var(--ink, #222);
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  .spk-input:focus {
    border-color: rgb(var(--brand-rgb) / 0.7);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .spk-apply {
    appearance: none;
    cursor: pointer;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid rgb(var(--brand-rgb) / 0.6);
    background: rgb(var(--brand-rgb) / 0.12);
    color: var(--brand-text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    transition: background 0.12s ease;
  }
  .spk-apply:hover:not(:disabled) {
    background: rgb(var(--brand-rgb) / 0.22);
  }
  .spk-apply:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .spk-everywhere {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12.5px;
    color: var(--ink-soft, #3a3a3a);
    cursor: pointer;
    line-height: 1.35;
  }
  .spk-everywhere input {
    margin: 2px 0 0;
    accent-color: rgb(var(--brand-rgb));
    flex-shrink: 0;
  }
  .spk-hint {
    margin-top: -4px;
    padding-left: 21px;
    font-size: 11.5px;
    color: var(--ink-faint, #7d7d7d);
    line-height: 1.35;
  }
</style>
