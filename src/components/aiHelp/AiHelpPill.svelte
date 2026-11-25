<script>
  /**
   * La pastille de l'Aide IA dans le dock d'une réunion : l'orbe allume ou
   * éteint l'Aide IA, « Demander » ouvre le pupitre — et, entre les deux, deux
   * petits boutons : couper son son pour cette réunion (AiHelpSoundButton), et
   * ouvrir le menu de ses domaines.
   *
   * ── Le mot d'appel, à côté de l'orbe ─────────────────────────────────────
   * Sous « Aide IA », en petit et dans sa teinte : « Alfred, … ». C'est le mot
   * qui la déclenche à voix haute, et rien ne le disait à l'écran — il fallait
   * l'avoir appris de l'administrateur (demandé le 2026-11-13). Il n'est écrit
   * que s'il SERT : Aide IA allumée, questions-réponses ouvertes. Fenêtre
   * étroite, le libellé cède la place : le mot reste dans l'infobulle de l'orbe.
   *
   * ── Les domaines, derrière un bouton ─────────────────────────────────────
   * Avant, quatre icônes — une par domaine — tenaient dans la pastille : cent
   * soixante pixels de dock pour un réglage qu'on touche une fois par réunion,
   * et des icônes qu'il fallait survoler pour comprendre (signalé le même
   * jour). Elles sont rangées dans un menu qui s'ouvre AU-DESSUS de la
   * pastille : chaque domaine y porte son nom, ce qu'il fait, et son état. Un
   * point sur le bouton dit qu'un domaine au moins est coupé — c'est tout ce
   * que la pastille a besoin d'en montrer.
   *
   * Le menu se ferme d'un clic ailleurs, d'Échap, ou quand l'Aide IA s'éteint.
   *
   * Absente pour un compte qui n'y a pas droit, et sur téléphone, où le dock
   * laisse la place à la barre de réunion (MobileMeetingBar) : les domaines s'y
   * règlent dans les réglages du pupitre.
   */
  import { onDestroy } from 'svelte';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    aiHelp,
    aiHelpOrb,
    aiHelpDeskOpen,
    AI_HELP_DOMAINS,
    toggleAiHelpDesk,
    aiHelpOpenItems,
    setAiHelpEnabled,
  } from '../../stores/aiHelp.js';
  import AiOrb from './AiOrb.svelte';
  import AiIcon from './AiIcon.svelte';
  import AiHelpDomains from './AiHelpDomains.svelte';
  import AiHelpSoundButton from './AiHelpSoundButton.svelte';

  const FLASH_MS = 1500;

  let flash = '';
  let flashKey = 0;
  let flashTimer = null;
  let root;
  let tune;
  let menuOpen = false;

  $: T = $uiText.aiHelp;
  $: on = $aiHelp.enabled;
  // Le mot d'appel ne s'écrit que s'il déclenche quelque chose : allumée, il
  // déclenche toujours — une question, ou un geste si les réponses sont coupées.
  $: wakeWord = on ? $aiHelp.wakeWord : '';
  $: wakeHint = wakeWord ? fill(T.wakeHint, { name: wakeWord }) : '';
  $: offered = AI_HELP_DOMAINS.filter((key) => $aiHelp.allowed[key]);
  $: active = offered.filter((key) => $aiHelp.domains[key] === true).length;
  $: tuneLabel =
    active < offered.length
      ? fill(T.domainsSome, { on: active, total: offered.length })
      : T.domainsOpen;
  // Éteinte, ou plus aucun domaine à régler : le menu n'a plus lieu d'être.
  $: if (!on || !offered.length) menuOpen = false;

  function say(message) {
    flash = message;
    flashKey += 1;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = ''), FLASH_MS);
  }
  onDestroy(() => clearTimeout(flashTimer));

  function toggle() {
    setAiHelpEnabled(!on);
    say(on ? T.turnedOff : T.turnedOn);
  }

  /** Un clic hors de la pastille referme le menu. */
  function onWindowClick(event) {
    if (menuOpen && root && !root.contains(event.target)) menuOpen = false;
  }
  /** Échap referme le menu, et rend le focus au bouton qui l'a ouvert. */
  function onWindowKeydown(event) {
    if (!menuOpen || event.key !== 'Escape') return;
    event.preventDefault();
    menuOpen = false;
    tune?.focus();
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onWindowKeydown} />

{#if $aiHelp.available && $aiHelp.meetingId}
  <div class="aip" class:aip-on={on} bind:this={root}>
    {#if flash}
      {#key flashKey}
        <span class="aip-flash" role="status">{flash}</span>
      {/key}
    {/if}
    {#if menuOpen}
      <div class="aip-menu" id="aip-domains">
        <p class="aip-menu-title">{T.domainsLabel}</p>
        <AiHelpDomains variant="menu" />
      </div>
    {/if}
    <button
      type="button"
      class="aip-main"
      aria-pressed={on}
      aria-label={[on ? T.pillOn : T.pillOff, wakeHint].filter(Boolean).join('. ')}
      title={[on ? T.pillOn : T.pillOff, wakeHint].filter(Boolean).join('\n')}
      on:click={toggle}
    >
      <AiOrb state={$aiHelpOrb} size={33} />
      <span class="aip-text">
        <span class="aip-name">{T.name}</span>
        {#if wakeWord}
          <span class="aip-wake">{fill(T.wakeSay, { name: wakeWord })}</span>
        {/if}
      </span>
    </button>
    {#if on}
      <span class="aip-more">
        <AiHelpSoundButton variant="pill" on:say={(event) => say(event.detail)} />
        {#if offered.length}
          <button
            type="button"
            class="aip-tune"
            class:aip-tune-open={menuOpen}
            aria-expanded={menuOpen}
            aria-controls="aip-domains"
            aria-label={tuneLabel}
            title={tuneLabel}
            bind:this={tune}
            on:click={() => (menuOpen = !menuOpen)}
          >
            <AiIcon name="settings" size={16} />
            {#if active < offered.length}<span class="aip-tune-dot"></span>{/if}
          </button>
        {/if}
        <span class="aip-rule"></span>
        <button
          type="button"
          class="aip-ask"
          aria-expanded={$aiHelpDeskOpen}
          on:click={toggleAiHelpDesk}
        >
          <AiIcon name="qa" size={16} strokeWidth={1.9} />
          <span class="aip-ask-label">{T.ask}</span>
          {#if $aiHelpOpenItems.length}
            <span class="aip-count">{$aiHelpOpenItems.length}</span>
          {/if}
        </button>
      </span>
    {/if}
  </div>
{/if}

<style>
  .aip {
    position: relative;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 47px;
    box-sizing: border-box;
    padding: 0 5px 0 4px;
    border: 1.5px solid var(--line-strong);
    border-radius: 24px;
    background: var(--surface);
    box-shadow: 0 4px 24px rgb(0 0 0 / 0.08);
    font-family: 'Lexend', sans-serif;
    transition:
      border-color 0.3s,
      box-shadow 0.3s;
  }
  .aip-on {
    border-color: var(--ai-line);
    box-shadow: 0 4px 28px var(--ai-glow);
  }
  .aip-main {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 39px;
    padding: 0 10px 0 3px;
    border: none;
    border-radius: 20px;
    background: transparent;
    color: var(--mb-text-secondary);
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: transform 0.15s;
  }
  .aip-on .aip-main {
    color: var(--ai-ink);
  }
  .aip-main:active {
    transform: scale(0.96);
  }
  /* « Aide IA », et dessous le mot d'appel : plus petit, plus pâle — on le
     lit quand on le cherche, il ne pèse rien sinon. */
  .aip-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    line-height: 1.1;
    text-align: left;
  }
  .aip-wake {
    font-size: 10.5px;
    font-weight: 400;
    letter-spacing: 0.01em;
    opacity: 0.72;
  }
  /* Le bouton des domaines : une icône, sans cadre — il ne doit pas disputer
     la place à « Demander ». */
  .aip-tune {
    position: relative;
    width: 32px;
    height: 32px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-faint);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .aip-tune:hover,
  .aip-tune-open {
    background: var(--ai-soft-strong);
    color: var(--ai-ink);
  }
  /* Un domaine au moins est coupé. */
  .aip-tune-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 7px;
    height: 7px;
    box-sizing: border-box;
    border: 1.5px solid var(--surface);
    border-radius: 50%;
    background: var(--ai);
  }
  /* Le menu des domaines : au-dessus de la pastille, calé sur son bord DROIT —
     la pastille ferme le dock, et sur une fenêtre étroite elle est plus courte
     que le menu : calé à gauche, il sortirait de l'écran. */
  .aip-menu {
    position: absolute;
    right: 0;
    bottom: 57px;
    z-index: 2;
    width: 292px;
    box-sizing: border-box;
    padding: 10px 8px 8px;
    border: 1.5px solid var(--ai-line);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: 0 18px 44px -14px var(--ai-glow);
    animation: aip-menu 0.18s ease both;
  }
  .aip-menu-title {
    margin: 0 0 6px;
    padding: 0 8px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ai-ink);
  }
  /* La pastille se déroule quand on allume l'Aide IA. */
  .aip-more {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    overflow: hidden;
    white-space: nowrap;
    animation: aip-unroll 0.5s cubic-bezier(0.33, 1, 0.68, 1) both;
  }
  .aip-rule {
    width: 1px;
    height: 22px;
    margin: 0 4px;
    background: var(--ai-line);
  }
  .aip-ask {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 13px 0 11px;
    border: none;
    border-radius: 18px;
    background: var(--ai);
    color: #fff;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      filter 0.15s,
      transform 0.15s;
  }
  .aip-ask:hover {
    filter: brightness(1.1);
  }
  .aip-ask:active {
    transform: scale(0.96);
  }
  .aip-count {
    min-width: 18px;
    height: 18px;
    box-sizing: border-box;
    padding: 0 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: #fff;
    color: var(--ai-ink);
    font-size: 11px;
    font-weight: 600;
  }
  .aip-flash {
    position: absolute;
    left: 50%;
    bottom: 56px;
    padding: 6px 13px;
    border-radius: 14px;
    background: var(--ai);
    color: #fff;
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    animation: aip-flash 1.5s ease both;
  }
  .aip button:focus-visible {
    outline: 2px solid var(--ai-ink);
    outline-offset: 2px;
  }

  @keyframes aip-unroll {
    from {
      max-width: 0;
      opacity: 0;
    }
    to {
      max-width: 300px;
      opacity: 1;
    }
  }
  @keyframes aip-menu {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes aip-flash {
    0% {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    15%,
    80% {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -6px);
    }
  }

  /* Fenêtre étroite : les libellés cèdent la place, les gestes restent. Le
     seuil a baissé avec les quatre icônes de domaine parties de la pastille. */
  @media (max-width: 1120px) {
    .aip-text,
    .aip-ask-label {
      display: none;
    }
    .aip-main {
      padding-right: 3px;
    }
    .aip-ask {
      padding: 0 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aip-more,
    .aip-menu {
      animation: none;
    }
    .aip-flash {
      animation: none;
      transform: translate(-50%, 0);
    }
  }
</style>
