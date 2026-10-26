<script>
  /**
   * Pastille de configuration — posée sur une entrée de menu (section d'un
   * panneau, bouton qui ouvre ce panneau) pour dire qu'il reste là quelque
   * chose à régler. Les constats viennent de stores/configChecks.js, mis en
   * phrases par utils/configAlerts.js.
   *
   * Sa bulle s'ouvre AU-DESSUS d'elle quand on survole — ou qu'on atteint au
   * clavier — l'élément qui la porte : une pastille de 8 px ne se vise pas,
   * c'est l'entrée entière qui l'annonce. Même habillage que InfoHint, mais
   * téléportée dans <body> (utils/portal.js) : la colonne de gauche défile et le
   * drawer mobile est transformé, une bulle restée dans le flux y serait coupée.
   *
   * Pas de survol sur un écran tactile : la bulle ne s'y ouvre pas (un tap
   * suit le lien), la phrase est écrite dans le menu lui-même (Sidebar,
   * PanelTabs) et la pastille ne fait que la signaler.
   *
   * Lecteur d'écran : les phrases DÉCRIVENT l'élément porteur
   * (`aria-describedby` vers un texte masqué), sans toucher à son nom — un
   * bouton-icône nommé par `aria-label` ignorerait tout texte glissé dedans. La
   * bulle, elle, reste décorative.
   */
  import { onMount, onDestroy, tick } from 'svelte';
  import { portal } from '../../utils/portal.js';

  /** Le plus grave des constats : 'error' | 'warning' | 'tip'. */
  export let level = 'warning';
  /** @type {Array<{level: string, text: string}>} */
  export let items = [];
  /** Intertitre de la bulle (« À régler dans l'administration »), facultatif. */
  export let title = '';
  /** Ligne de fin, quand la bulle n'énumère pas tout (« + 2 autres »). */
  export let more = '';
  /** 'inline' : dans le flux d'une ligne de menu ; 'corner' : sur le coin d'un bouton-icône. */
  export let placement = 'inline';

  const GAP = 9;
  const MARGIN = 8;
  const descriptionId = `cad-${Math.random().toString(36).slice(2, 10)}`;

  let dot;
  let bubble;
  let host = null;
  let open = false;
  let placed = false;
  let below = false;
  let left = 0;
  let top = 0;
  let arrowX = 0;

  $: srText = [title, ...items.map((item) => item.text), more].filter(Boolean).join(' — ');

  const canHover = () => !!window.matchMedia?.('(hover: hover)').matches;

  async function show() {
    if (!items.length || open) return;
    placed = false;
    open = true;
    await tick();
    place();
  }

  function hide() {
    open = false;
  }

  function onEnter() {
    if (canHover()) show();
  }

  function onFocus() {
    // Un tap donne aussi le focus : seul le clavier ouvre la bulle ici.
    if (host?.matches?.(':focus-visible')) show();
  }

  /** Centrée sur la pastille, gardée dans l'écran ; dessous s'il n'y a pas la place au-dessus. */
  function place() {
    if (!dot || !bubble) return;
    const anchor = dot.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();
    const centre = anchor.left + anchor.width / 2;
    left = Math.min(
      Math.max(centre - box.width / 2, MARGIN),
      window.innerWidth - box.width - MARGIN,
    );
    below = anchor.top - box.height - GAP < MARGIN;
    top = below ? anchor.bottom + GAP : anchor.top - box.height - GAP;
    arrowX = Math.min(Math.max(centre - left, 12), box.width - 12);
    placed = true;
  }

  const LISTENERS = [
    ['mouseenter', onEnter],
    ['mouseleave', hide],
    ['focusin', onFocus],
    ['focusout', hide],
    ['click', hide],
  ];

  const describedBy = () => (host?.getAttribute('aria-describedby') || '').split(' ');

  onMount(() => {
    host = dot.closest('button, a') || dot.parentElement;
    if (!host) return;
    for (const [event, handler] of LISTENERS) host.addEventListener(event, handler);
    host.setAttribute(
      'aria-describedby',
      [...describedBy(), descriptionId].filter(Boolean).join(' '),
    );
  });

  onDestroy(() => {
    if (!host) return;
    for (const [event, handler] of LISTENERS) host.removeEventListener(event, handler);
    const rest = describedBy().filter((id) => id && id !== descriptionId);
    if (rest.length) host.setAttribute('aria-describedby', rest.join(' '));
    else host.removeAttribute('aria-describedby');
  });
</script>

<svelte:window on:scroll|capture={hide} on:resize={hide} />

<span
  bind:this={dot}
  class="cad cad-{level}"
  class:cad-corner={placement === 'corner'}
  aria-hidden="true"
></span>
<!-- Hors du porteur (dans <body>) : décrit sans s'ajouter à son nom. -->
<span use:portal id={descriptionId} class="cad-sr">{srText}</span>

{#if open}
  <div
    use:portal
    bind:this={bubble}
    class="cad-bubble"
    class:cad-below={below}
    class:cad-placed={placed}
    style="left: {left}px; top: {top}px; --cad-arrow-x: {arrowX}px;"
    aria-hidden="true"
  >
    {#if title}<p class="cad-title">{title}</p>{/if}
    <ul class="cad-list">
      {#each items as item, i (i)}
        <li class="cad-line">
          <span class="cad-mini cad-{item.level}"></span>
          <span>{item.text}</span>
        </li>
      {/each}
    </ul>
    {#if more}<p class="cad-more">{more}</p>{/if}
  </div>
{/if}

<style>
  .cad {
    display: inline-block;
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--alert-warning);
  }
  /* Sur un bouton-icône : au coin haut-droit, cerclée de blanc pour se
     détacher de l'icône qu'elle chevauche. Le porteur est en position
     relative (cf. Sidebar, MobileAppBar) et règle l'écart au coin par
     `--cad-corner-offset` — négatif, la pastille déborde de la boîte. */
  .cad-corner {
    position: absolute;
    top: var(--cad-corner-offset, 3px);
    right: var(--cad-corner-offset, 3px);
    box-shadow: 0 0 0 2px var(--surface);
  }
  .cad-error {
    background: var(--alert-error);
  }
  .cad-warning {
    background: var(--alert-warning);
  }
  .cad-tip {
    background: var(--alert-tip);
  }

  .cad-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  /* Même habillage que InfoHint : carte blanche, filet, ombre douce. */
  .cad-bubble {
    position: fixed;
    /* Au-dessus du drawer mobile et des panneaux : elle est dans <body>. */
    z-index: 10005;
    box-sizing: border-box;
    width: max-content;
    max-width: min(280px, calc(100vw - 16px));
    padding: 9px 12px;
    background: #fff;
    border: 1px solid var(--mb-border-subtle);
    border-radius: 10px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
    font-size: 12px;
    line-height: 1.45;
    color: var(--mb-text-secondary);
    text-align: left;
    pointer-events: none;
    visibility: hidden;
  }
  .cad-placed {
    visibility: visible;
    animation: cad-in 0.15s ease-out;
  }
  /* La pointe, vers la pastille : un carré tourné qui reprend le filet. */
  .cad-bubble::after {
    content: '';
    position: absolute;
    left: calc(var(--cad-arrow-x) - 5px);
    bottom: -6px;
    width: 10px;
    height: 10px;
    background: #fff;
    border-right: 1px solid var(--mb-border-subtle);
    border-bottom: 1px solid var(--mb-border-subtle);
    transform: rotate(45deg);
  }
  .cad-below::after {
    bottom: auto;
    top: -6px;
    transform: rotate(225deg);
  }
  .cad-title {
    margin: 0 0 5px;
    font-weight: 600;
    color: var(--ink);
  }
  .cad-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .cad-line {
    display: flex;
    align-items: baseline;
    gap: 7px;
  }
  .cad-mini {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transform: translateY(-1px);
  }
  .cad-more {
    margin: 5px 0 0 13px;
    color: var(--ink-faint);
  }

  @keyframes cad-in {
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
