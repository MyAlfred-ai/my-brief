<script>
  /**
   * Contenu de la modale de bienvenue (premier lancement).
   *
   * Un accueil qu'on lit une fois, avant d'avoir touché à quoi que ce soit :
   * une phrase, trois gestes, un rappel pour la visio — et le bouton. Chaque
   * ligne ajoutée ici en fait lire une de moins : la version précédente
   * enchaînait exigences, cinq étapes commentées et un schéma du partage
   * d'écran, qu'on faisait défiler sans les lire.
   *
   * La visio n'est plus expliquée ici : l'écran « Quel type de réunion ? »
   * (MeetingTypeModal) la guide au démarrage, au moment où elle sert. Tout le
   * reste vit dans la documentation en ligne, qu'ouvre « Aide ».
   *
   * Le contenu vient de `uiText.welcome`. Le cadre de la modale
   * (`.welcome-modal-*`) est global (style.css) ; le corps est stylé ici.
   */
  import IconMic from '~icons/solar/microphone-2-bold-duotone';
  import IconChat from '~icons/solar/chat-round-dots-bold-duotone';
  import IconStars from '~icons/solar/stars-bold-duotone';
  import VisioMeetingIcon from './icons/VisioMeetingIcon.svelte';

  export let uiText;
  export let logoUrl;
  /** Le pied « C'est parti » ne vaut que pour la modale, qui se ferme. */
  export let onGetStarted = null;

  // Une icône par geste, dans l'ordre de `uiText.welcome.steps`.
  const STEP_ICONS = [IconMic, IconChat, IconStars];

  $: w = uiText.welcome;
  // Les libellés cités sont ceux des boutons : ils ne peuvent pas diverger.
  $: steps = w.steps.map((step, i) => ({
    ...step,
    icon: STEP_ICONS[i],
    text: step.text.replace('{start}', uiText.buttons.start),
  }));
  $: visio = w.visio.replace('{visio}', uiText.meetingType.visio);
</script>

<div class="welcome-modal-header">
  <img src={logoUrl} alt="MyBrief Logo" class="welcome-modal-logo" />
  <h2 class="welcome-modal-title">{w.title}</h2>
  <span class="welcome-modal-badge">{w.betaTag}</span>
</div>

<div class="welcome-modal-content">
  <p class="wc-tagline">{w.tagline}</p>

  <ol class="wc-steps">
    {#each steps as step (step.title)}
      <li class="wc-step">
        <span class="wc-step-icon">
          <svelte:component this={step.icon} width="26" height="26" aria-hidden="true" />
        </span>
        <span class="wc-step-body">
          <strong class="wc-step-title">{step.title}</strong>
          <span class="wc-step-text">{step.text}</span>
        </span>
      </li>
    {/each}
  </ol>

  <p class="wc-visio">
    <VisioMeetingIcon width="30" height="30" aria-hidden="true" />
    <span>{visio}</span>
  </p>

  <div class="welcome-modal-footer">
    {#if onGetStarted}
      <button class="welcome-modal-cta" on:click={onGetStarted}>
        {w.getStarted}
      </button>
    {/if}
    <div class="welcome-modal-creator">
      <span>{w.createdBy}</span>
      <strong>MyAlfred.ai</strong>
    </div>
  </div>
</div>

<style>
  .wc-tagline {
    margin: 0;
    font-size: 19px;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -0.2px;
    color: var(--ink);
    text-align: center;
    text-wrap: balance;
  }

  .wc-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .wc-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px 10px 14px;
    background: var(--surface-tint);
    border: 1px solid var(--line);
    border-radius: 12px;
    text-align: center;
  }
  .wc-step-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--brand-secondary-soft-15);
    color: var(--brand);
  }
  .wc-step-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .wc-step-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .wc-step-text {
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--ink-muted);
    text-wrap: balance;
  }

  .wc-visio {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    padding: 10px 14px;
    background: var(--brand-secondary-soft-08);
    border: 1px solid var(--brand-secondary-soft-18);
    border-radius: 10px;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--ink-soft);
  }
  .wc-visio :global(svg) {
    flex: none;
    color: var(--brand);
  }

  /* Téléphone : les trois gestes s'empilent, icône à gauche. */
  @media (max-width: 520px) {
    .wc-tagline {
      font-size: 17px;
    }
    .wc-steps {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .wc-step {
      flex-direction: row;
      gap: 12px;
      padding: 10px 12px;
      text-align: left;
    }
    .wc-step-icon {
      flex: none;
      width: 40px;
      height: 40px;
    }
  }
</style>
