<script>
  /**
   * Le pupitre de l'Aide IA — une CONVERSATION. Ouvert par « Demander »
   * (pastille du dock) ou le bouton « Aide IA » de la barre du téléphone, il
   * n'est presque que cela : le fil de ce qu'on lui a demandé et de ce qu'elle
   * a dit, qui s'empile vers le bas ; quelques questions d'exemple ; un champ.
   * On lui demande une synthèse, l'ordre du jour, les actions, des idées — ou
   * n'importe quoi sur la réunion en cours.
   *
   * Décision du 2026-11-12, contre le pupitre précédent, qui montrait d'abord
   * ses réglages (domaines, ordre du jour, projet) et refermait à la première
   * question : on y vient pour PARLER à l'IA. Les réglages restent à un geste,
   * derrière l'icône de l'en-tête (AiHelpSettings).
   *
   * Le fil montre TOUT ce qu'elle a dit — ses réponses comme ses interventions
   * spontanées — : c'est aussi l'endroit où relire une alerte rangée. Une
   * question posée ici reçoit sa réponse ici, et ne ressurgit pas sur la scène
   * quand on referme (`seen`).
   */
  import { afterUpdate, onDestroy, onMount } from 'svelte';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    aiHelp,
    aiHelpOrb,
    aiHelpDeskView,
    aiHelpDomainOn,
    aiHelpSize,
    AI_HELP_SIZE_MAX,
    askAiHelp,
    closeAiHelpCards,
    resizeAiHelp,
    setAiHelpEnabled,
  } from '../../stores/aiHelp.js';
  import AiOrb from './AiOrb.svelte';
  import AiIcon from './AiIcon.svelte';
  import AiHelpCard from './AiHelpCard.svelte';
  import AiHelpSwitch from './AiHelpSwitch.svelte';
  import AiHelpSettings from './AiHelpSettings.svelte';
  import AiHelpSoundButton from './AiHelpSoundButton.svelte';

  /** À cette distance du bas, on considère qu'on suit la conversation. */
  const NEAR_BOTTOM_PX = 48;

  let draft = '';
  let thread;
  let inner;
  let following = true;
  let observer = null;

  $: T = $uiText.aiHelp;
  $: name = $aiHelp.wakeWord || T.name;
  $: on = $aiHelp.enabled;
  // Questions-réponses coupées, le champ reste : on lui demande encore des
  // gestes. Les exemples, eux, sont des questions — ils s'effacent.
  $: answers = aiHelpDomainOn($aiHelp, 'qa');
  $: settings = $aiHelpDeskView === 'settings';
  // Un rappel n'entre dans le fil qu'une fois sonné.
  $: messages = $aiHelp.items.filter(
    (item) => !(item.kind === 'reminder' && Date.parse(item.dueAt) > Date.now()),
  );
  $: waiting = $aiHelp.pending;
  $: errorText = $aiHelp.error ? fill(T.errors[$aiHelp.error] || T.errors.default, { name }) : '';

  // Fermer la conversation ferme TOUT : ce qui restait ouvert s'y lisait, rien
  // ne doit ressurgir en carte derrière elle.
  const close = () => closeAiHelpCards();
  const toggleSettings = () => aiHelpDeskView.set(settings ? 'chat' : 'settings');

  function ask(question) {
    const text = String(question || '').trim();
    if (!text) return;
    draft = '';
    following = true;
    askAiHelp(text, { seen: true });
  }

  function toBottom() {
    if (thread && following) thread.scrollTop = thread.scrollHeight;
  }
  function onScroll() {
    following = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= NEAR_BOTTOM_PX;
  }

  // Un message de plus, une question en attente, le retour des réglages : la
  // conversation reste collée à son dernier message — sauf si on est remonté lire.
  afterUpdate(toBottom);

  // Une réponse s'écrit mot à mot : elle grandit APRÈS son arrivée. On suit la
  // hauteur du fil, pas seulement sa longueur.
  onMount(() => {
    if (typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(toBottom);
  });
  $: if (observer && inner) {
    observer.disconnect();
    observer.observe(inner);
  }
  onDestroy(() => observer?.disconnect());
</script>

<section class="aidk" aria-label={fill(T.askTitle, { name })}>
  <header class="aidk-head">
    <AiOrb state={$aiHelpOrb} size={30} />
    <!-- Le prénom seul : l'en-tête porte quatre boutons, et un téléphone n'a pas
         la place de « Demander à … » en plus. -->
    <span class="aidk-title">{settings ? T.settings : name}</span>
    <button
      type="button"
      class="aidk-icon-btn aidk-size-btn"
      aria-label={T.sizeDown}
      title={T.sizeDown}
      disabled={$aiHelpSize <= 0}
      on:click={() => resizeAiHelp(-1)}>A−</button
    >
    <button
      type="button"
      class="aidk-icon-btn aidk-size-btn aidk-size-up"
      aria-label={T.sizeUp}
      title={T.sizeUp}
      disabled={$aiHelpSize >= AI_HELP_SIZE_MAX}
      on:click={() => resizeAiHelp(1)}>A+</button
    >
    <!-- Couper le son : au téléphone, le seul endroit où le faire d'un geste. -->
    <AiHelpSoundButton variant="desk" />
    <button
      type="button"
      class="aidk-icon-btn"
      class:aidk-icon-on={settings}
      aria-pressed={settings}
      aria-label={T.settings}
      title={T.settings}
      on:click={toggleSettings}
    >
      <AiIcon name="settings" size={17} />
    </button>
    <button type="button" class="aidk-icon-btn" aria-label={T.close} on:click={close}>
      <AiIcon name="close" size={16} strokeWidth={2} />
    </button>
  </header>

  {#if settings}
    <AiHelpSettings />
  {:else}
    <div class="aidk-thread" bind:this={thread} on:scroll={onScroll} role="log" aria-live="polite">
      <div class="aidk-thread-inner" bind:this={inner}>
        {#if messages.length === 0 && waiting.length === 0}
          <p class="aidk-empty">
            {on ? fill(answers ? T.chatEmpty : T.chatEmptyCommands, { name }) : T.setupOff}
          </p>
        {/if}
        {#each messages as item (item.id)}
          {#if item.question}
            <p class="aidk-me">
              {#if item.voice}<AiIcon name="voice" size={13} />{/if}{item.question}
            </p>
          {/if}
          <div
            class="aidk-ai"
            class:aidk-ai-strong={item.kind === 'alert' ||
              item.kind === 'reminder' ||
              item.event === 'closing'}
          >
            <AiHelpCard chat {name} {item} myBrainUrl={$aiHelp.myBrainUrl} />
          </div>
        {/each}
        {#each waiting as wait (wait.key)}
          <p class="aidk-me">
            {#if wait.voice}<AiIcon name="voice" size={13} />{/if}{wait.question}
          </p>
          <div class="aidk-ai" role="status">
            <AiHelpCard chat thinking {name} item={{ kind: 'answer' }} />
          </div>
        {/each}
        {#if errorText}<p class="aidk-error" role="alert">{errorText}</p>{/if}
      </div>
    </div>

    {#if on}
      {#if answers}
        <div class="aidk-suggestions">
          {#each T.suggestions as suggestion (suggestion)}
            <button type="button" class="aidk-chip" on:click={() => ask(suggestion)}>
              {suggestion}
            </button>
          {/each}
        </div>
      {:else}
        <p class="aidk-muted">{fill(T.commandsOnly, { name })}</p>
      {/if}
      <form class="aidk-form" on:submit|preventDefault={() => ask(draft)}>
        <label for="aidk-ask" class="aidk-sr">
          {fill(answers ? T.askLabel : T.askLabelCommands, { name })}
        </label>
        <input
          id="aidk-ask"
          type="text"
          autocomplete="off"
          maxlength="400"
          placeholder={answers ? T.askPlaceholder : T.askPlaceholderCommands}
          bind:value={draft}
        />
        <button type="submit" class="aidk-send" aria-label={T.askSend} disabled={!draft.trim()}>
          <AiIcon name="send" size={17} strokeWidth={2.2} />
        </button>
      </form>
    {:else}
      <!-- Éteinte : un geste suffit à la rallumer, sans passer par les réglages. -->
      <div class="aidk-off">
        <span class="aidk-muted">{T.setupSwitch}</span>
        <AiHelpSwitch checked={on} label={T.setupSwitch} onChange={setAiHelpEnabled} />
      </div>
    {/if}
  {/if}
</section>

<style>
  .aidk {
    display: flex;
    flex-direction: column;
    gap: 10px;
    /* La hauteur suit le cran de taille (--ai-scale, posé par la scène). */
    height: min(calc(52vh + 12vh * var(--ai-scale, 1)), calc(540px * var(--ai-scale, 1)));
    box-sizing: border-box;
    padding: 12px 14px 14px;
    border: 1.5px solid var(--ai-line);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: 0 24px 60px -18px var(--ai-glow);
    font-family: 'Lexend', sans-serif;
    text-align: left;
  }
  .aidk-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .aidk-title {
    flex: 1;
    min-width: 0;
    font-size: calc(14.5px * var(--ai-scale, 1));
    font-weight: 600;
    color: var(--ai-ink);
  }
  .aidk-icon-btn {
    width: 34px;
    height: 34px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--mb-text-secondary);
    cursor: pointer;
    transition: background 0.15s;
  }
  .aidk-icon-btn:hover {
    background: var(--ai-soft);
  }
  .aidk-icon-on {
    background: var(--ai-soft-strong);
    color: var(--ai-ink);
  }
  .aidk-size-btn {
    font-family: inherit;
    font-size: calc(11.5px * var(--ai-scale, 1));
    font-weight: 600;
  }
  .aidk-size-up {
    font-size: calc(14.5px * var(--ai-scale, 1));
  }
  .aidk-icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .aidk-icon-btn:disabled:hover {
    background: transparent;
  }

  /* Le fil : c'est lui qui prend la place, et lui seul qui défile. */
  .aidk-thread {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: 0 -4px;
    padding: 2px 4px;
  }
  .aidk-thread-inner {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100%;
    /* Peu de messages : ils se posent en bas, près du champ, comme dans toute
       messagerie — puis s'empilent et font défiler. */
    justify-content: flex-end;
  }
  .aidk-empty {
    margin: auto 0;
    padding: 0 8px;
    font-size: calc(13px * var(--ai-scale, 1));
    line-height: 1.6;
    text-align: center;
    color: var(--mb-text-secondary);
  }
  /* Ce qu'on lui a demandé : à droite, dans la teinte pleine. */
  .aidk-me {
    align-self: flex-end;
    max-width: 86%;
    margin: 4px 0 0;
    padding: 8px 12px;
    border-radius: 16px 16px 4px 16px;
    background: var(--ai);
    color: #fff;
    font-size: calc(13px * var(--ai-scale, 1));
    line-height: 1.5;
    overflow-wrap: anywhere;
    animation: aidk-in 0.25s ease both;
  }
  .aidk-me :global(svg) {
    margin-right: 5px;
    vertical-align: -2px;
    opacity: 0.85;
  }
  /* Ce qu'elle a dit : à gauche, sur fond clair. */
  .aidk-ai {
    align-self: flex-start;
    max-width: 94%;
    padding: 9px 12px;
    border-radius: 16px 16px 16px 4px;
    background: var(--ai-soft);
    animation: aidk-in 0.25s ease both;
  }
  .aidk-ai-strong {
    box-shadow: inset 3px 0 0 var(--ai);
  }
  .aidk-muted {
    margin: 0;
    font-size: calc(12px * var(--ai-scale, 1));
    line-height: 1.5;
    color: var(--mb-text-secondary);
  }
  .aidk-error {
    margin: 0;
    padding: 7px 10px;
    border: 1px solid var(--danger-line);
    border-radius: 10px;
    background: var(--danger-bg);
    font-size: calc(12.5px * var(--ai-scale, 1));
    color: var(--danger-text);
  }
  .aidk-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .aidk-off {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  /* Les exemples : une seule rangée, qui défile de côté plutôt que de manger
     la hauteur du fil. */
  .aidk-suggestions {
    flex: none;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0 -14px;
    padding: 0 14px;
  }
  .aidk-suggestions::-webkit-scrollbar {
    display: none;
  }
  .aidk-chip {
    flex: none;
    min-height: 30px;
    padding: 0 12px;
    border: 1.5px solid var(--ai-line);
    border-radius: 15px;
    background: var(--surface);
    color: var(--ai-ink);
    font-family: inherit;
    font-size: calc(12px * var(--ai-scale, 1));
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.15s,
      transform 0.15s;
  }
  .aidk-chip:hover {
    background: var(--ai-soft);
  }
  .aidk-chip:active {
    transform: scale(0.96);
  }
  .aidk-form {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .aidk-form input {
    flex: 1;
    min-width: 0;
    height: 42px;
    padding: 0 16px;
    border: 1.5px solid var(--ai-line);
    border-radius: 21px;
    background: var(--surface);
    font-family: inherit;
    font-size: calc(13.5px * var(--ai-scale, 1));
    color: var(--ink);
  }
  .aidk-send {
    width: 42px;
    height: 42px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: var(--ai);
    color: #fff;
    cursor: pointer;
    transition:
      transform 0.15s,
      opacity 0.15s;
  }
  .aidk-send:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .aidk-send:not(:disabled):active {
    transform: scale(0.94);
  }
  .aidk button:focus-visible,
  .aidk input:focus-visible {
    outline: 2px solid var(--ai);
    outline-offset: 2px;
  }

  @keyframes aidk-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Téléphone : le clavier prend la moitié de l'écran — le pupitre s'en tient
     à ce qu'il reste. */
  @media (max-width: 768px) {
    .aidk {
      height: min(calc(48vh + 12vh * var(--ai-scale, 1)), calc(520px * var(--ai-scale, 1)));
    }
  }
  @media (pointer: coarse) {
    .aidk-icon-btn,
    .aidk-send {
      width: 44px;
      height: 44px;
    }
    .aidk-chip {
      min-height: 38px;
    }
    .aidk-form input {
      height: 46px;
      /* 16 px : en dessous, Safari iOS zoome sur le champ à la saisie. */
      font-size: calc(16px * var(--ai-scale, 1));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aidk-me,
    .aidk-ai {
      animation: none;
    }
  }
</style>
