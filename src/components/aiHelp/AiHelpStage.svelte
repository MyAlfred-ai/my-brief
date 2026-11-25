<script>
  /**
   * La scène de l'Aide IA — au bas de la transcription en direct, une
   * intervention À LA FOIS. C'est la disposition retenue (2026-11-12) contre
   * deux autres : des bulles dans le fil de la transcription (elles défilent et
   * disparaissent avec la conversation) et une colonne dédiée (elle cache les
   * actions et les notes). Ici rien n'est ajouté à l'écran tant que l'IA n'a
   * rien à dire, et ce qu'elle dit ne peut pas être manqué.
   *
   * UNE fenêtre, jamais deux : la conversation si elle est ouverte, sinon la
   * carte de la DERNIÈRE intervention. S'il en reste d'autres, la carte le dit
   * et mène à la conversation, où elles s'empilent. Et la fermer ferme tout —
   * sa croix, « Compris », Échap : une seule fermeture, quel que soit le nombre
   * d'interventions en attente (avant : une carte par question, à fermer une à
   * une — signalé le 2026-11-12).
   *
   * Sa taille se règle sur trois crans (A− / A+, ou « Alfred, agrandis ») :
   * la fenêtre s'élargit et tout son texte grossit, par une seule variable
   * (`--ai-scale`) que lisent les composants de l'Aide IA.
   *
   * Ordre de ce qui s'y montre : le pupitre s'il est ouvert (une conversation :
   * ce qu'elle dit pendant ce temps s'y lit) ; sinon une
   * question en attente de réponse ; sinon la question du projet ; sinon
   * l'intervention ouverte la plus récente (ou celle qu'on a rappelée) ;
   * sinon la proposition de relier le tag de la réunion à son projet
   * (stores/aiHelpTagLink.js) — après les interventions : une alerte ne
   * doit pas attendre qu'on ait répondu à une question de rangement.
   *
   * Montée dans LiveTranscript, qui lui passe les lignes : c'est par elle que
   * le store observe le direct (`observeAiHelpTranscript`) — App.svelte n'a
   * rien à savoir de l'Aide IA. Elle annonce sa hauteur (`resize`) pour que la
   * transcription garde ses dernières lignes au-dessus de la carte.
   *
   * C'est aussi elle, parce qu'elle a les lignes, qui FAIT les corrections de
   * la transcription demandées à l'IA (`aiHelpEdits`) : elle calcule les lignes
   * à réécrire (utils/transcriptReplace.js) et les rend par l'événement `edit`
   * — celui de la correction à la main, que LiveTranscript relaie déjà à App.
   * Une correction passe donc par le même enregistrement qu'un double-clic.
   */
  import { createEventDispatcher } from 'svelte';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    aiHelp,
    aiHelpCalledLines,
    aiHelpOpenItems,
    aiHelpDeskOpen,
    aiHelpDeskView,
    aiHelpDomainOn,
    aiHelpEdits,
    aiHelpLineKey,
    aiHelpSize,
    AI_HELP_SCALES,
    AI_HELP_SIZE_MAX,
    observeAiHelpTranscript,
    takeAiHelpEdits,
    setAiHelpItemState,
    closeAiHelpCards,
    resizeAiHelp,
    chooseAiHelpProject,
    declineAiHelpProject,
    clearAiHelpNotice,
  } from '../../stores/aiHelp.js';
  import {
    aiHelpTagLink,
    aiHelpTagLinkStatus,
    linkAiHelpTag,
    skipAiHelpTagLink,
  } from '../../stores/aiHelpTagLink.js';
  import { transcriptEdits } from '../../utils/transcriptReplace.js';
  import AiHelpCard from './AiHelpCard.svelte';
  import AiHelpDesk from './AiHelpDesk.svelte';
  import AiHelpVoice from './AiHelpVoice.svelte';

  /** Les lignes de la transcription en direct (LiveTranscript.items). */
  export let items = [];
  /** Le nom du compte : l'étiquette du micro, comme dans la transcription. */
  export let selfName = '';

  const dispatch = createEventDispatcher();

  // `meetingId` figure dans l'appel pour que l'observation REPARTE à l'instant
  // où la réunion existe. Sans lui, la scène — montée avant la réunion —
  // n'observait qu'à la première phrase, et le store la prenait pour une ligne
  // « déjà là » : la première phrase d'une réunion ne déclenchait rien. Or
  // c'est elle, le plus souvent, qui annonce l'ordre du jour.
  $: meetingId = $aiHelp.meetingId;
  $: observeAiHelpTranscript(items, selfName, meetingId);

  // Seule la file déclenche : les lignes sont lues telles qu'elles sont à
  // l'instant de la correction, pas suivies.
  $: if ($aiHelpEdits.length) applyEdits();
  function applyEdits() {
    const edits = takeAiHelpEdits();
    for (const change of transcriptEdits(items, edits, aiHelpLineKey, $aiHelpCalledLines)) {
      dispatch('edit', change);
    }
  }

  $: T = $uiText.aiHelp;
  $: name = $aiHelp.wakeWord || T.name;
  $: active = $aiHelp.available && !!meetingId;
  $: speaking = active && $aiHelp.enabled;

  // L'échelle du texte suit le cran (AI_HELP_SCALES) ; la largeur aussi (cf. les styles).
  $: size = Math.min(AI_HELP_SIZE_MAX, Math.max(0, $aiHelpSize));

  $: open = $aiHelpOpenItems;
  $: current = speaking ? open.at(-1) || null : null;
  $: others = current ? open.length - 1 : 0;
  $: pending = speaking ? $aiHelp.pending.at(-1) || null : null;
  $: askProject =
    speaking &&
    aiHelpDomainOn($aiHelp, 'project') &&
    !$aiHelp.project &&
    !$aiHelp.projectDeclined &&
    $aiHelp.candidates.length > 0;
  $: projectChoices = [
    ...$aiHelp.candidates.map((candidate) => ({
      label: candidate.title || candidate.path,
      onPick: () => chooseAiHelpProject(candidate.path),
    })),
    { label: T.projectNoneChoice, quiet: true, onPick: declineAiHelpProject },
  ];
  // Le tag de la réunion ne mène pas (ou plus) à ce projet : le relier, une fois.
  $: tagLink = speaking ? $aiHelpTagLink : null;
  $: tagLinkError =
    tagLink && $aiHelpTagLinkStatus.key === tagLink.key ? $aiHelpTagLinkStatus.error : '';
  $: tagLinkItem = tagLink
    ? {
        kind: 'project',
        title: fill(T.tagLinkTitle, { tag: tagLink.tag }),
        body: [
          fill(tagLink.linked ? T.tagRelinkBody : T.tagLinkBody, tagLink),
          tagLinkError ? T.tagLinkFailed : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      }
    : null;
  $: tagLinkChoices = [
    { label: T.tagLinkYes, onPick: linkAiHelpTag },
    { label: T.tagLinkNo, quiet: true, onPick: skipAiHelpTagLink },
  ];
  // « J'ai noté l'ordre du jour » : un clic mène au pupitre, où l'on retire le
  // point que l'IA aurait mal compris.
  function openAgenda() {
    aiHelpDeskOpen.set(true);
    aiHelpDeskView.set('settings');
  }
  // D'autres interventions attendent : elles se lisent dans la conversation,
  // pas en cartes à fermer l'une après l'autre.
  $: cardChoices = [
    ...(current?.event === 'noted'
      ? [{ label: T.agendaEdit, quiet: true, onPick: openAgenda }]
      : []),
    ...(others > 0
      ? [
          {
            label: others === 1 ? T.othersOpenOne : fill(T.othersOpenMany, { count: others }),
            quiet: true,
            onPick: () => aiHelpDeskOpen.set(true),
          },
        ]
      : []),
  ];
  $: view = !active
    ? 'none'
    : $aiHelpDeskOpen
      ? 'desk'
      : pending
        ? 'pending'
        : askProject
          ? 'project'
          : current
            ? 'card'
            : tagLink
              ? 'tagLink'
              : 'none';

  // Le bandeau peut venir SEUL : une question dictée, réponses coupées, ne
  // laisse aucune carte — la sienne « en attente » vient de s'effacer.
  $: notice =
    active && $aiHelp.notice && view !== 'desk'
      ? fill(T.notices[$aiHelp.notice] || T.notice, { name })
      : '';
  $: shown = view !== 'none' || !!notice;

  let height = 0;
  $: dispatch('resize', shown ? height : 0);

  /** « Compris » : cette alerte est vue — et la fenêtre se ferme, tout entière. */
  function acknowledge(item) {
    setAiHelpItemState(item.id, 'acknowledged');
    closeAiHelpCards();
  }

  /** Échap, le focus étant dans la fenêtre : elle se ferme — la proposition du tag vaut « Pas maintenant ». */
  function onKeydown(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    if (view === 'tagLink') skipAiHelpTagLink();
    else closeAiHelpCards();
  }
</script>

<AiHelpVoice />

{#if shown}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="ais ais-size-{size}"
    style:--ai-scale={AI_HELP_SCALES[size]}
    bind:clientHeight={height}
    on:keydown={onKeydown}
  >
    {#if notice}
      <button type="button" class="ais-notice" on:click={clearAiHelpNotice}>{notice}</button>
    {/if}
    {#if view === 'desk'}
      <div class="ais-in"><AiHelpDesk /></div>
    {:else if view === 'pending'}
      {#key pending.key}
        <div class="ais-in" role="status">
          <AiHelpCard
            stage
            thinking
            {name}
            item={{ kind: 'answer', question: pending.question, voice: pending.voice }}
          />
        </div>
      {/key}
    {:else if view === 'project'}
      <div class="ais-in" role="status">
        <AiHelpCard
          stage
          {name}
          item={{ kind: 'project', title: T.projectAskTitle, body: T.projectAskBody }}
          choices={projectChoices}
        />
      </div>
    {:else if view === 'tagLink'}
      {#key tagLink.key}
        <div class="ais-in" role="status">
          <AiHelpCard stage {name} item={tagLinkItem} choices={tagLinkChoices} />
        </div>
      {/key}
    {:else if view === 'card'}
      {#key current.id}
        <div class="ais-in" role="status" aria-label={T.stageLabel}>
          <AiHelpCard
            stage
            {name}
            item={current}
            choices={cardChoices}
            myBrainUrl={$aiHelp.myBrainUrl}
            onAcknowledge={() => acknowledge(current)}
            onDismiss={closeAiHelpCards}
          >
            <svelte:fragment slot="actions">
              <span class="ais-sizes">
                <button
                  type="button"
                  class="ais-size-btn"
                  aria-label={T.sizeDown}
                  title={T.sizeDown}
                  disabled={size === 0}
                  on:click={() => resizeAiHelp(-1)}>A−</button
                >
                <button
                  type="button"
                  class="ais-size-btn ais-size-up"
                  aria-label={T.sizeUp}
                  title={T.sizeUp}
                  disabled={size === AI_HELP_SIZE_MAX}
                  on:click={() => resizeAiHelp(1)}>A+</button
                >
              </span>
            </svelte:fragment>
          </AiHelpCard>
        </div>
      {/key}
    {/if}
  </div>
{/if}

<style>
  /* Au-dessus du fondu bas de .main-area (voile z 40, style.css), sous le dock
     (z 50). Sur ordinateur, au-dessus du dock d'enregistrement (même réserve
     que la flèche « revenir au direct » de LiveTranscript). */
  .ais {
    position: absolute;
    left: 50%;
    bottom: 96px;
    z-index: 46;
    width: min(640px, calc(100% - 24px));
    transform: translateX(-50%);
    transition: width 0.25s ease;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* La carte surgit du bas, vers la pastille du dock où vit l'orbe. */
  .ais-in {
    transform-origin: 75% 100%;
    animation: ais-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .ais-notice {
    align-self: center;
    max-width: 100%;
    padding: 6px 12px;
    border: 1px solid var(--warn-line);
    border-radius: 12px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-family: 'Lexend', sans-serif;
    font-size: calc(12px * var(--ai-scale, 1));
    cursor: pointer;
  }
  /* Les trois crans : la fenêtre s'élargit, son texte grossit (--ai-scale). */
  .ais-size-1 {
    width: min(780px, calc(100% - 24px));
  }
  .ais-size-2 {
    width: min(940px, calc(100% - 24px));
  }
  .ais-sizes {
    display: inline-flex;
    gap: 2px;
  }
  .ais-size-btn {
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    border: none;
    border-radius: 15px;
    background: transparent;
    color: inherit;
    font-family: 'Lexend', sans-serif;
    font-size: calc(11.5px * var(--ai-scale, 1));
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .ais-size-up {
    font-size: calc(14px * var(--ai-scale, 1));
  }
  .ais-size-btn:hover:not(:disabled) {
    background: rgb(var(--ai-rgb) / 0.12);
  }
  .ais-size-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .ais-size-btn:focus-visible,
  .ais-notice:focus-visible {
    outline: 2px solid var(--ai-ink);
    outline-offset: 2px;
  }

  @keyframes ais-rise {
    0% {
      opacity: 0;
      transform: translateY(36px) scale(0.9);
    }
    60% {
      opacity: 1;
      transform: translateY(-5px) scale(1.012);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Téléphone : .content-layout réserve déjà la place de la barre de réunion
     (style.css) — la scène se pose au bas de la zone de transcription. */
  @media (max-width: 768px) {
    .ais {
      bottom: 12px;
      width: calc(100% - 12px);
    }
    .ais-in {
      transform-origin: 50% 100%;
    }
  }
  /* Téléphone : la carte n'a pas la place de deux boutons de plus dans son
     en-tête — la taille s'y règle depuis la conversation, ou à la voix. */
  @media (pointer: coarse) and (max-width: 560px) {
    .ais-sizes {
      display: none;
    }
  }
  @media (pointer: coarse) {
    .ais-size-btn {
      min-width: 44px;
      height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ais-in {
      animation: none;
    }
  }
</style>
