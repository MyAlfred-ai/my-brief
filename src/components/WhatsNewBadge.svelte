<script context="module">
  import { writable } from 'svelte/store';

  /** Dernière nouveauté déjà vue par CE navigateur — la pastille en dépend. */
  const SEEN_KEY = 'mybrief_whatsnew_seen';

  function readSeen() {
    try {
      return localStorage.getItem(SEEN_KEY) || '';
    } catch {
      return '';
    }
  }

  // Partagés par les deux déclencheurs (coin de l'écran, pied du tiroir sur
  // téléphone) : une seule popup ouverte, une seule pastille « non lu ».
  const open = writable(false);
  const seenId = writable('');
</script>

<script>
  /**
   * Numéro de version en bas à droite — et la popup « Quoi de neuf ? » qu'il
   * ouvre. Le badge était un `<span>` muet : c'est le seul endroit de
   * l'interface où l'on vient voir « ce qui a changé », il devient donc le
   * bouton qui le montre.
   *
   * Sur téléphone (≤ 768 px), le coin bas-droit appartient aux commandes :
   * « Terminer » de la barre de réunion, « Enregistrer » des réglages, le
   * bouton « Actions » d'une réunion rouverte. Le badge, au-dessus de tout,
   * s'y posait dessus. Il y est donc masqué, et le même déclencheur vit en pied
   * du tiroir de navigation (`placement="drawer"`, monté par Sidebar) — le
   * tiroir n'a plus de ligne de compte sur téléphone, sa place est libre.
   *
   * La popup n'est rendue QUE par l'instance du coin, montée au niveau d'App :
   * le tiroir porte une `transform`, une popup `position: fixed` rendue dedans
   * y serait enfermée. Le tiroir ne fait qu'ouvrir l'état partagé.
   *
   * Le contenu vient de src/whats-new.json, publié par le hook post-commit à
   * partir de NOUVEAUTES.md — des nouveautés rédigées à la main, une par
   * fonctionnalité (cf. scripts/whats-new-lib.mjs). Le composant ne fait
   * aucun tri : il AFFICHE ce qu'on a jugé bon d'annoncer, dans l'ordre reçu
   * (la plus récente en premier). Une nouveauté d'administration porte une
   * pastille, mais reste visible de tous.
   *
   * Tout est ici — badge, popup, styles — pour ne rien ajouter à App.svelte,
   * qui vit sous un cliquet max-lines.
   */
  import { onDestroy } from 'svelte';
  import IconStars from '~icons/solar/stars-minimalistic-linear';
  import { uiText, currentLanguageStore } from '../store.js';
  import appVersion from '../version.json';
  import whatsNew from '../whats-new.json';

  /** 'corner' : badge du coin + popup (App) ; 'drawer' : entrée du tiroir, téléphone (Sidebar). */
  export let placement = 'corner';

  const entries = Array.isArray(whatsNew?.entries) ? whatsNew.entries.slice(0, 10) : [];
  const latestId = entries.length ? entries[0].id : '';
  const isCorner = placement !== 'drawer';

  // Le navigateur fait foi : relu à chaque montage.
  seenId.set(readSeen());
  if (isCorner) {
    open.set(false);
    onDestroy(() => open.set(false));
  }

  let dialog;

  $: hasUnseen = Boolean(latestId) && $seenId !== latestId;
  $: texts = $uiText.whatsNew;
  $: locale = $currentLanguageStore === 'en' ? 'en-GB' : 'fr-FR';

  function openDialog() {
    open.set(true);
    seenId.set(latestId);
    try {
      localStorage.setItem(SEEN_KEY, latestId);
    } catch {
      // navigation privée : la pastille réapparaîtra, sans conséquence
    }
    // Le focus part sur la popup : au clavier, la suite de la tabulation doit
    // se dérouler DANS le dialogue, pas dans la page laissée derrière.
    queueMicrotask(() => dialog?.focus());
  }

  function close() {
    open.set(false);
  }

  function onKeydown(event) {
    if (isCorner && $open && event.key === 'Escape') close();
  }

  /** Un texte traduit n'existe que si quelqu'un l'a écrit : sinon, le français. */
  function localized(entry) {
    return $currentLanguageStore === 'en' && entry.en ? { ...entry, ...entry.en } : entry;
  }

  function formatDate(isoDay) {
    if (!isoDay) return '';
    // 'T00:00:00' : sans heure, la date est lue en UTC et recule d'un jour à
    // l'ouest de Greenwich.
    const date = new Date(`${isoDay}T00:00:00`);
    if (Number.isNaN(date.getTime())) return isoDay;
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  function fill(template, version) {
    return String(template || '').replace('{version}', version);
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if isCorner}
  <button
    class="app-version-badge"
    class:has-unseen={hasUnseen}
    type="button"
    aria-haspopup="dialog"
    aria-expanded={$open}
    title={fill(texts.badgeLabel, appVersion.version)}
    aria-label={fill(texts.badgeLabel, appVersion.version)}
    on:click={openDialog}
  >
    v{appVersion.version}
  </button>
{:else}
  <button
    class="wn-drawer-btn"
    class:has-unseen={hasUnseen}
    type="button"
    aria-haspopup="dialog"
    aria-expanded={$open}
    aria-label={fill(texts.badgeLabel, appVersion.version)}
    on:click={openDialog}
  >
    <IconStars width="17" height="17" aria-hidden="true" class="wn-drawer-icon" />
    <span class="wn-drawer-label">{texts.title}</span>
    <span class="wn-drawer-version">v{appVersion.version}</span>
  </button>
{/if}

{#if isCorner && $open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div class="wn-backdrop" on:click|self={close} role="presentation">
    <div
      class="wn-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      tabindex="-1"
      bind:this={dialog}
    >
      <header class="wn-header">
        <div>
          <h2 id="whats-new-title" class="wn-title">{texts.title}</h2>
          <p class="wn-subtitle">{texts.subtitle}</p>
        </div>
        <button class="wn-close" type="button" on:click={close} aria-label={texts.close}>✕</button>
      </header>

      <div class="wn-scroll">
        {#if entries.length === 0}
          <p class="wn-empty">{texts.empty}</p>
        {:else}
          <ol class="wn-list">
            {#each entries as entry (entry.id)}
              {@const item = localized(entry)}
              <li class="wn-item">
                <span class="wn-dot" aria-hidden="true"></span>
                <div class="wn-item-head">
                  <span
                    class="wn-kind"
                    class:is-improvement={entry.kind === 'improvement'}
                    class:is-fix={entry.kind === 'fix'}
                  >
                    {texts[entry.kind] || texts.new}
                  </span>
                  {#if entry.audience === 'admins'}
                    <span class="wn-audience">{texts.admins}</span>
                  {/if}
                  <span class="wn-meta">
                    {formatDate(entry.date)}{entry.version ? ` · v${entry.version}` : ''}
                  </span>
                </div>
                <h3 class="wn-item-title">{item.title}</h3>
                {#if item.body}<p class="wn-item-body">{item.body}</p>{/if}
              </li>
            {/each}
          </ol>
        {/if}
      </div>

      <footer class="wn-footer">
        <span class="wn-version">{fill(texts.version, appVersion.version)}</span>
        <button class="wn-cta" type="button" on:click={close}>{texts.close}</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* ─── Badge ─────────────────────────────────────────────────────────── */
  .app-version-badge {
    position: fixed;
    right: calc(8px + var(--safe-right, 0px));
    /* safe-bottom : hors de la barre du geste d'accueil iOS, comme le dock. */
    bottom: calc(6px + var(--safe-bottom, 0px));
    z-index: 2147483000;
    padding: 3px 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font-family: inherit;
    font-size: 10px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    color: var(--mb-text-muted, #7d7d7d);
    opacity: 0.45;
    cursor: pointer;
    pointer-events: auto;
    user-select: none;
    transition:
      opacity 0.15s ease,
      color 0.15s ease;
  }
  .app-version-badge:hover,
  .app-version-badge:focus-visible {
    opacity: 1;
    color: var(--brand-text);
  }
  /* Pastille : une nouveauté n'a pas encore été ouverte sur ce navigateur. */
  .app-version-badge.has-unseen {
    opacity: 0.9;
  }
  .app-version-badge.has-unseen::after {
    content: '';
    position: absolute;
    top: 1px;
    right: 1px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 2px var(--mb-bg-app, #fffefc);
  }

  /* ─── Entrée du tiroir (téléphone) ──────────────────────────────────── */
  /* Masquée hors téléphone : sur ordinateur et tablette, le coin suffit. */
  .wn-drawer-btn {
    display: none;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 10px 18px;
    border: 0;
    border-top: 1px solid var(--line-faint, #f2f2f2);
    background: transparent;
    color: var(--ink-muted, #6a6a6a);
    font-family: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s ease;
  }
  .wn-drawer-btn:active {
    background: var(--brand-secondary-soft-08);
  }
  .wn-drawer-btn :global(.wn-drawer-icon) {
    flex: 0 0 auto;
    color: var(--brand-text);
  }
  .wn-drawer-label {
    flex: 1 1 auto;
    min-width: 0;
  }
  .wn-drawer-version {
    position: relative;
    flex: 0 0 auto;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    color: var(--ink-faint, #8a8a8a);
  }
  .wn-drawer-btn.has-unseen .wn-drawer-label {
    color: var(--ink, #1a1a1a);
    font-weight: 600;
  }
  .wn-drawer-btn.has-unseen .wn-drawer-version {
    padding-right: 11px;
  }
  .wn-drawer-btn.has-unseen .wn-drawer-version::after {
    content: '';
    position: absolute;
    top: 50%;
    right: 0;
    width: 6px;
    height: 6px;
    margin-top: -3px;
    border-radius: 50%;
    background: var(--brand);
  }

  /* Téléphone : le coin aux commandes, la version au tiroir. APRÈS les règles
     de base — à spécificité égale, c'est l'ordre qui décide. */
  @media (max-width: 768px) {
    .app-version-badge {
      display: none;
    }
    .wn-drawer-btn {
      display: flex;
    }
  }

  /* ─── Popup ─────────────────────────────────────────────────────────── */
  .wn-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(6px);
    animation: wn-fade 0.2s ease-out;
  }
  @keyframes wn-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .wn-modal {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 560px;
    max-height: min(80vh, 720px);
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 30px 80px rgba(15, 23, 42, 0.18);
    font-family:
      'Lexend',
      -apple-system,
      BlinkMacSystemFont,
      sans-serif;
    color: #0f172a;
    outline: none;
    animation: wn-rise 0.24s cubic-bezier(0.33, 1, 0.68, 1);
  }
  @keyframes wn-rise {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .wn-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 22px 22px 14px;
    border-bottom: 1px solid #f1f5f9;
    border-radius: 12px 12px 0 0;
    background: linear-gradient(
      180deg,
      rgb(var(--brand-rgb) / 0.1) 0%,
      rgb(var(--brand-rgb) / 0) 100%
    );
  }
  .wn-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }
  .wn-subtitle {
    margin: 4px 0 0;
    font-size: 13px;
    color: #64748b;
  }
  .wn-close {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    background: #f3f4f6;
    color: #475569;
    font-size: 14px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .wn-close:hover {
    background: #e5e7eb;
    color: #0f172a;
  }

  .wn-scroll {
    overflow-y: auto;
    padding: 6px 22px 4px;
  }
  .wn-empty {
    padding: 24px 0;
    text-align: center;
    color: #64748b;
    font-size: 14px;
  }

  .wn-list {
    margin: 0;
    padding: 0 0 0 18px;
    list-style: none;
    border-left: 2px solid rgb(var(--brand-rgb) / 0.18);
  }
  .wn-item {
    position: relative;
    padding: 16px 0;
  }
  .wn-item + .wn-item {
    border-top: 1px solid #f1f5f9;
  }
  /* Pastille de frise, posée SUR le trait vertical de la liste. */
  .wn-dot {
    position: absolute;
    left: -24px;
    top: 22px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 3px #fff;
  }
  .wn-item:not(:first-child) .wn-dot {
    background: rgb(var(--brand-rgb) / 0.35);
  }

  .wn-item-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }
  .wn-kind {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgb(var(--brand-rgb) / 0.14);
    color: var(--brand-text);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .wn-kind.is-improvement {
    background: #eef2ff;
    color: #4338ca;
  }
  .wn-kind.is-fix {
    background: var(--success-bg, #ecfdf5);
    color: var(--success-text, #047857);
  }
  .wn-audience {
    padding: 1px 8px;
    border: 1px solid var(--line, #ebebeb);
    border-radius: 999px;
    color: var(--ink-muted, #6a6a6a);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .wn-meta {
    font-size: 11px;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
  }
  .wn-item-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
  }
  .wn-item-body {
    margin: 6px 0 0;
    font-size: 13.5px;
    line-height: 1.55;
    color: #475569;
    /* Les paragraphes d'une entrée arrivent séparés par une ligne vide. */
    white-space: pre-line;
  }

  .wn-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 22px 18px;
    border-top: 1px solid #f1f5f9;
  }
  .wn-version {
    font-size: 11px;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
  }
  .wn-cta {
    padding: 9px 18px;
    border: 0;
    border-radius: 10px;
    background: var(--brand);
    color: #fff;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .wn-cta:hover {
    background: var(--brand-strong);
  }

  @media (max-width: 640px) {
    .wn-backdrop {
      padding: 0;
      align-items: flex-end;
    }
    .wn-modal {
      max-width: none;
      /* dvh : 88vh déborde sous la barre d'URL iOS (viewport « large »). */
      max-height: 88dvh;
      border-radius: 12px 12px 0 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
  }

  /* Cible tactile : le plancher global 44px de style.css ne liste que des
     classes globales — la classe scopée doit porter le sien. */
  @media (pointer: coarse) {
    .wn-close {
      width: 44px;
      height: 44px;
    }
  }
</style>
