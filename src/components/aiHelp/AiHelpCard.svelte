<script>
  /**
   * Une intervention de l'Aide IA. La même carte sur la scène d'une réunion en
   * cours, dans son journal et dans l'historique — c'est sa silhouette, plus
   * que son texte, qui dit « l'IA parle » : la teinte réservée à l'IA, l'orbe,
   * le nom d'appel, puis l'icône et le nom du TYPE d'intervention.
   *
   * Une contradiction se distingue des autres par un bandeau PLEIN (les autres
   * ont un en-tête clair) : un écart de clarté, pas seulement de teinte. Le
   * rappel de fin de réunion le porte aussi — c'est l'autre moment où l'IA ne
   * doit pas être manquée : on se lève, et un point n'a pas été abordé.
   *
   * Quand on lui a demandé un GESTE (« ajoute le tag… », « note que… »,
   * « rappelle-moi dans dix minutes… », « lance un minuteur… », « mets en
   * pause », « fais le compte rendu », « remplace… par… »), la carte dit ce
   * qui a été FAIT, ligne par
   * ligne (`item.acts`) : ces lignes viennent de myBrief, pas du modèle — un
   * tag ou un template qui n'existe pas, un passage absent de la transcription,
   * une pause demandée en pause y sont dits tels quels (`ok` faux). Un rappel
   * qui sonne est une carte à part entière, au bandeau plein comme une
   * contradiction.
   *
   * Deux interventions d'ordre du jour arrivent parfois SANS texte du modèle :
   * « points retenus » et « la réunion se termine » (`item.event`). Leur titre
   * est alors un libellé de l'IHM — c'est la liste des points qui parle.
   *
   * Le texte est du Markdown simple — myBrain écrit ainsi, le modèle le
   * reprend — rendu par AiMarkdown : gras, listes, liens, sans HTML brut.
   *
   * Le texte d'une intervention qui vient d'arriver (`item.fresh`) s'écrit mot
   * à mot : on voit l'IA répondre, et l'œil est attiré sans qu'aucun élément ne
   * clignote. Animation bornée — le texte est complet en deux secondes au plus —
   * et absente si l'utilisateur a demandé moins de mouvement.
   */
  import { onDestroy, onMount } from 'svelte';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { timerWords } from '../../utils/timerFormat.js';
  import AiOrb from './AiOrb.svelte';
  import AiIcon from './AiIcon.svelte';
  import AiHelpAgenda from './AiHelpAgenda.svelte';
  import AiMarkdown from './AiMarkdown.svelte';

  /** L'intervention, ou une pseudo-intervention (`kind: 'project'`, question en attente). */
  export let item;
  /** Le mot d'appel (« Alfred »). */
  export let name = '';
  /** Adresse de myBrain : une fiche citée devient un lien. */
  export let myBrainUrl = '';
  /** La carte de la scène est plus grande que celles d'une liste. */
  export let stage = false;
  /**
   * Dans le fil du pupitre : un message, pas une carte. Ni cadre ni en-tête —
   * la bulle est posée par le fil —, et la question n'est pas répétée : elle
   * est la bulle d'au-dessus. Seul le TYPE d'une intervention spontanée reste
   * dit (« Contradiction », « Rappel »…) : une réponse n'a pas à s'annoncer.
   */
  export let chat = false;
  /** En attente de réponse : l'orbe cherche, le corps est remplacé. */
  export let thinking = false;
  /** Choix à un clic (question du projet) : `[{ label, onPick, quiet }]`. */
  export let choices = [];
  export let onAcknowledge = null;
  export let onDismiss = null;

  const WORDS_PER_TICK = 2;
  const TICK_MS = 55;

  $: T = $uiText.aiHelp;
  // « Alerte » au sens de l'écran : ce qui porte le bandeau plein et « Compris ».
  $: isAlert = item.kind === 'alert' || item.kind === 'reminder' || item.event === 'closing';
  $: acts = Array.isArray(item.acts) ? item.acts : [];
  const ACT_ICONS = {
    tag: 'tag',
    note: 'note',
    reminder: 'bell',
    timer: 'timer',
    summary: 'note',
    replace: 'pen',
  };
  const MEETING_ICONS = { pause: 'pause', resume: 'play', end: 'stop' };
  const actIcon = (act) => (act.type === 'meeting' ? MEETING_ICONS[act.do] : ACT_ICONS[act.type]);
  /**
   * La ligne d'un geste, dans la langue de l'écran. `who` est passé, et non lu
   * dans la fonction : la réactivité ne suit que ce qu'elle voit dans l'appel.
   */
  function actText(act, texts, who) {
    const A = texts.acts;
    if (act.type === 'tag') return fill(act.ok ? A.tag : A.tagMissing, { label: act.label });
    if (act.type === 'note') return fill(A.note, { text: act.text });
    if (act.type === 'meeting') {
      if (act.do === 'end') return A.end;
      return fill(act.ok ? A[act.do] : A[`${act.do}Noop`], { name: who });
    }
    if (act.type === 'summary') {
      if (!act.ok) return fill(A.templateMissing, { template: act.template });
      const key = act.when === 'end' ? 'summaryLater' : 'summaryNow';
      return fill(act.template ? A[key] : A[`${key}Default`], { template: act.template });
    }
    if (act.type === 'replace') {
      if (!act.ok) return fill(A.replaceMissing, { find: act.find });
      if (!act.with) return fill(A.remove, { find: act.find });
      return fill(act.all ? A.replaceAll : A.replace, { find: act.find, with: act.with });
    }
    if (act.type === 'timer') {
      // « Ajoute deux minutes », « arrête-le » sans minuteur : dit, pas fait.
      if (!act.ok) return A.timerNone;
      if (act.do === 'stop') return A.timerStop;
      const time = timerWords(Math.abs(act.seconds));
      if (act.do === 'add') {
        return fill(act.seconds < 0 ? A.timerCut : A.timerAdd, {
          time,
          left: timerWords(act.left),
        });
      }
      return fill(act.label ? A.timerStartLabel : A.timerStart, { time, label: act.label });
    }
    return fill(act.label ? A.reminder : A.reminderBare, {
      minutes: act.minutes,
      label: act.label,
    });
  }
  $: title =
    item.title ||
    (item.event && T.agendaEvents[item.event]) ||
    (item.kind === 'reminder' ? T.reminderTitle : '');
  $: hasPoints = Array.isArray(item.points) && item.points.length > 0;
  // Une réponse tirée de la seule réunion dit POURQUOI myBrain n'y est pas :
  // il n'a rien, il n'a pas répondu, ou ce compte — cette clé — ne le lit pas.
  // Sous l'ordre du jour, rien : myBrain n'avait rien à en dire.
  // Sous un geste non plus : « ajoute le tag Atlas » ne demandait rien à myBrain.
  $: basis = hasPoints || acts.length ? '' : T.knowledgeNotes[item.knowledge] || '';
  $: words = String(item.body || '').split(' ');
  let shown = Infinity;
  let timer = null;

  onMount(() => {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!item.fresh || calm || words.length <= WORDS_PER_TICK) return;
    shown = 0;
    timer = setInterval(() => {
      shown += WORDS_PER_TICK;
      if (shown >= words.length) {
        shown = Infinity;
        clearInterval(timer);
      }
    }, TICK_MS);
  });
  onDestroy(() => clearInterval(timer));

  $: writing = shown !== Infinity;
  $: body = writing ? words.slice(0, shown).join(' ') : item.body || '';
  $: orbState = thinking ? 'think' : writing ? 'speak' : 'listen';
  $: sheetUrl =
    myBrainUrl && item.source?.path
      ? `${myBrainUrl}/cerveau?f=${encodeURIComponent(item.source.path)}`
      : '';
  $: sourceTitle = item.source?.title || item.source?.path || '';
</script>

<article
  class="ai-card"
  class:ai-card-chat={chat}
  class:ai-card-stage={stage}
  class:ai-card-alert={isAlert}
  class:ai-card-fresh={item.fresh}
  class:ai-card-seen={item.state === 'acknowledged' && !chat}
>
  {#if chat && item.kind !== 'answer' && !thinking}
    <span class="ai-card-kind ai-card-kind-chat">
      <AiIcon name={item.kind === 'project' ? 'question' : item.kind} size={13} />
      {T.kinds[item.kind] || T.kinds.idea}
    </span>
  {/if}
  {#if !chat}
    <header class="ai-card-head">
      <AiOrb state={orbState} size={stage ? 28 : 24} inverse={isAlert} />
      <span class="ai-card-name">{name || T.name}</span>
      <span class="ai-card-kind">
        <AiIcon name={item.kind === 'project' ? 'question' : item.kind} size={stage ? 15 : 14} />
        {T.kinds[item.kind] || T.kinds.idea}
      </span>
      <span class="ai-card-spacer"></span>
      <slot name="actions" />
      {#if onDismiss}
        <button
          type="button"
          class="ai-card-icon-btn"
          on:click={onDismiss}
          aria-label={T.dismissLabel}
          title={T.dismiss}
        >
          <AiIcon name="close" size={15} strokeWidth={2} />
        </button>
      {/if}
    </header>
  {/if}

  <div class="ai-card-body">
    {#if item.question && !chat}
      <p class="ai-card-asked">
        {item.voice ? T.askedByVoice : T.askedInWriting} : « {item.question} »
      </p>
    {/if}
    {#if thinking}
      <p class="ai-card-thinking">
        <span class="ai-card-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        {fill(T.thinking, { name: name || T.name })}
      </p>
    {:else}
      {#if title}<h3 class="ai-card-title">{title}</h3>{/if}
      {#if item.body}
        <div class="ai-card-text">
          <AiMarkdown text={body} base={myBrainUrl} partial={writing} caret={writing} />
        </div>
      {/if}
      {#if item.quote && !writing}<p class="ai-card-quote">{item.quote}</p>{/if}
      {#if acts.length && !writing}
        <ul class="ai-card-acts">
          {#each acts as act, index (index)}
            {@const failed = act.ok === false}
            <li class:ai-card-act-failed={failed}>
              <AiIcon name={failed ? 'warn' : actIcon(act)} size={15} />
              <span>{actText(act, T, name || T.name)}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if basis && !writing}<p class="ai-card-basis">{basis}</p>{/if}
      {#if hasPoints && !writing}
        <div class="ai-card-points"><AiHelpAgenda points={item.points} /></div>
      {/if}
      {#if choices.length}
        <div class="ai-card-choices">
          {#each choices as choice (choice.label)}
            <button
              type="button"
              class="ai-card-choice"
              class:ai-card-choice-quiet={choice.quiet}
              on:click={choice.onPick}
            >
              {choice.label}
            </button>
          {/each}
        </div>
      {/if}
      {#if !writing && (sourceTitle || (isAlert && onAcknowledge))}
        <footer class="ai-card-foot">
          {#if sheetUrl}
            <a
              class="ai-card-source"
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={fill(T.openSheet, { title: sourceTitle })}
            >
              <AiIcon name="book" size={13} />{sourceTitle}
            </a>
          {:else if sourceTitle}
            <span class="ai-card-source"><AiIcon name="book" size={13} />{sourceTitle}</span>
          {/if}
          {#if isAlert && item.state === 'acknowledged'}
            <span class="ai-card-seen-mark">{T.acknowledged}</span>
          {:else if isAlert && onAcknowledge}
            <button type="button" class="ai-card-ack" on:click={onAcknowledge}>
              {T.acknowledge}
            </button>
          {/if}
        </footer>
      {/if}
    {/if}
  </div>
</article>

<style>
  .ai-card {
    border: 1.5px solid var(--ai-line);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: 0 12px 30px -14px var(--ai-glow);
    overflow: hidden;
    font-family: 'Lexend', sans-serif;
    text-align: left;
  }
  /* Dans le fil du pupitre : la bulle est celle du fil. */
  .ai-card-chat {
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }
  .ai-card-chat .ai-card-body {
    padding: 0;
    gap: 7px;
  }
  .ai-card-kind-chat {
    align-self: flex-start;
    margin-bottom: 6px;
    color: var(--ai-ink);
  }
  .ai-card-chat .ai-card-acts li {
    background: var(--surface);
  }
  .ai-card-chat .ai-card-quote {
    background: var(--surface);
  }
  .ai-card-stage {
    border-radius: 20px;
    box-shadow:
      0 24px 60px -18px var(--ai-glow),
      0 0 0 6px var(--ai-halo);
  }
  .ai-card-seen {
    opacity: 0.62;
  }

  .ai-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 10px;
    border-bottom: 1px solid var(--ai-soft-strong);
    color: var(--ai-ink);
  }
  .ai-card-stage .ai-card-head {
    padding: 8px 8px 8px 12px;
  }
  .ai-card-alert .ai-card-head {
    background: var(--ai);
    border-bottom-color: var(--ai);
    color: #fff;
  }
  /* Trois battements du bandeau à l'arrivée d'une contradiction, puis le calme :
     un compte FINI, comme les cartes d'action (style.css, ap-titlebar-pulse). */
  .ai-card-alert.ai-card-fresh .ai-card-head {
    animation: ai-card-band 0.8s ease-in-out 3;
  }
  .ai-card-name {
    font-size: calc(13px * var(--ai-scale, 1));
    font-weight: 600;
  }
  .ai-card-stage .ai-card-name {
    font-size: calc(14px * var(--ai-scale, 1));
  }
  .ai-card-kind {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px 2px 7px;
    border-radius: 10px;
    background: var(--ai-soft-strong);
    font-size: calc(11.5px * var(--ai-scale, 1));
    font-weight: 600;
    white-space: nowrap;
  }
  .ai-card-alert .ai-card-kind {
    background: rgb(255 255 255 / 0.22);
  }
  .ai-card-spacer {
    flex: 1;
    min-width: 0;
  }
  .ai-card-icon-btn {
    width: 30px;
    height: 30px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .ai-card-icon-btn:hover {
    background: rgb(var(--ai-rgb) / 0.12);
  }
  .ai-card-alert .ai-card-icon-btn:hover {
    background: rgb(255 255 255 / 0.2);
  }

  .ai-card-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 14px 13px;
  }
  .ai-card-stage .ai-card-body {
    gap: 9px;
    padding: 13px 18px 15px;
  }
  .ai-card-body p,
  .ai-card-title {
    margin: 0;
  }
  .ai-card-asked {
    font-size: calc(12px * var(--ai-scale, 1));
    line-height: 1.5;
    color: var(--mb-text-secondary);
  }
  .ai-card-thinking {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: calc(13px * var(--ai-scale, 1));
    color: var(--ai-ink);
  }
  .ai-card-dots {
    display: inline-flex;
    gap: 4px;
  }
  .ai-card-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: ai-card-dots 1.1s ease-in-out infinite;
  }
  .ai-card-dots span:nth-child(2) {
    animation-delay: 0.15s;
  }
  .ai-card-dots span:nth-child(3) {
    animation-delay: 0.3s;
  }
  .ai-card-title {
    font-size: calc(14px * var(--ai-scale, 1));
    font-weight: 600;
    line-height: 1.35;
    color: var(--ink);
  }
  .ai-card-stage .ai-card-title {
    font-size: calc(16.5px * var(--ai-scale, 1));
    line-height: 1.3;
  }
  .ai-card-text {
    font-size: calc(13px * var(--ai-scale, 1));
    line-height: 1.6;
    color: var(--ink);
  }
  /* Sur la scène, une longue réponse défile au lieu de couvrir la transcription. */
  .ai-card-stage .ai-card-body {
    max-height: min(46vh, 380px);
    overflow-y: auto;
  }
  .ai-card-stage .ai-card-text {
    font-size: calc(14px * var(--ai-scale, 1));
  }
  .ai-card-quote {
    padding: 7px 10px;
    border-radius: 10px;
    background: var(--ai-soft);
    font-size: calc(12px * var(--ai-scale, 1));
    line-height: 1.5;
    color: var(--ai-ink);
    animation: ai-card-in 0.35s ease both;
  }
  .ai-card-basis {
    font-size: calc(11.5px * var(--ai-scale, 1));
    line-height: 1.45;
    color: var(--mb-text-secondary);
  }
  .ai-card-acts {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: ai-card-in 0.35s ease both;
  }
  .ai-card-acts li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 10px;
    background: var(--ai-soft);
    font-size: calc(12.5px * var(--ai-scale, 1));
    line-height: 1.45;
    color: var(--ai-ink);
  }
  .ai-card-acts li :global(svg) {
    flex: none;
    margin-top: 1px;
  }
  .ai-card-acts span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .ai-card-acts .ai-card-act-failed {
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  /* Une longue liste ne pousse pas la carte hors de l'écran : elle défile. */
  .ai-card-points {
    max-height: 190px;
    overflow-y: auto;
    animation: ai-card-in 0.35s ease both;
  }
  .ai-card-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ai-card-choice {
    min-height: 36px;
    padding: 0 14px;
    border: 1.5px solid var(--ai-line);
    border-radius: 18px;
    background: var(--ai-soft);
    color: var(--ai-ink);
    font-family: inherit;
    font-size: calc(13px * var(--ai-scale, 1));
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.15s,
      transform 0.15s;
  }
  .ai-card-choice:hover {
    background: var(--ai-soft-strong);
  }
  .ai-card-choice:active {
    transform: scale(0.96);
  }
  .ai-card-choice-quiet {
    border-color: var(--line-faint);
    background: var(--surface);
    color: var(--mb-text-secondary);
  }
  .ai-card-foot {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 2px;
    animation: ai-card-in 0.35s ease both;
  }
  .ai-card-source {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 3px 9px;
    border: 1px solid var(--ai-line);
    border-radius: 10px;
    font-size: calc(11.5px * var(--ai-scale, 1));
    color: var(--ai-ink);
    text-decoration: none;
  }
  a.ai-card-source:hover {
    background: var(--ai-soft);
  }
  .ai-card-ack {
    margin-left: auto;
    min-height: 34px;
    padding: 0 16px;
    border: none;
    border-radius: 17px;
    background: var(--ai);
    color: #fff;
    font-family: inherit;
    font-size: calc(13px * var(--ai-scale, 1));
    font-weight: 600;
    cursor: pointer;
    transition:
      filter 0.15s,
      transform 0.15s;
  }
  .ai-card-ack:hover {
    filter: brightness(1.1);
  }
  .ai-card-ack:active {
    transform: scale(0.96);
  }
  .ai-card-seen-mark {
    margin-left: auto;
    font-size: calc(11.5px * var(--ai-scale, 1));
    color: var(--mb-text-secondary);
  }
  .ai-card button:focus-visible,
  .ai-card a:focus-visible {
    outline: 2px solid var(--ai-ink);
    outline-offset: 2px;
  }

  @keyframes ai-card-band {
    0%,
    100% {
      filter: brightness(1);
    }
    50% {
      filter: brightness(1.3);
    }
  }
  @keyframes ai-card-dots {
    0%,
    80%,
    100% {
      transform: translateY(0);
      opacity: 0.35;
    }
    40% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }
  @keyframes ai-card-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Téléphone : cibles tactiles de 44 px. */
  @media (pointer: coarse) {
    .ai-card-icon-btn {
      width: 44px;
      height: 44px;
    }
    .ai-card-choice,
    .ai-card-ack {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ai-card *,
    .ai-card-head {
      animation: none !important;
    }
  }
</style>
