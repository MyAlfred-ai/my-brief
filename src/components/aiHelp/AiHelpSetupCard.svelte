<script>
  /**
   * L'Aide IA sur l'écran de démarrage : celui qui lance la réunion décide
   * AVANT de démarrer si l'IA y participe, et sur quoi. Elle se présente telle
   * qu'il l'a laissée la dernière fois — rien à toucher si rien ne change, un
   * geste pour l'allumer ou l'éteindre, un geste par domaine.
   *
   * Absente pour un compte qui n'y a pas droit : aucune case grisée, aucune
   * promesse. Ce qui est réglé ici reste local jusqu'au démarrage ; le store
   * l'envoie dès que la réunion existe (stores/aiHelp.js).
   */
  import { onMount } from 'svelte';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    aiHelp,
    aiHelpOrb,
    loadAiHelp,
    setAiHelpEnabled,
    setAiHelpAgenda,
  } from '../../stores/aiHelp.js';
  import AiOrb from './AiOrb.svelte';
  import AiHelpSwitch from './AiHelpSwitch.svelte';
  import AiHelpDomains from './AiHelpDomains.svelte';

  // À chaque retour sur l'accueil : les droits ont pu changer, et le dernier
  // réglage est celui de la réunion qu'on vient de quitter.
  onMount(() => {
    loadAiHelp();
  });

  $: T = $uiText.aiHelp;
  $: name = $aiHelp.wakeWord || T.name;
  $: on = $aiHelp.enabled;
  $: withAgenda = on && $aiHelp.domains.agenda && $aiHelp.allowed.agenda;
</script>

{#if $aiHelp.available}
  <section class="aisc" class:aisc-on={on} aria-label={T.setupSwitch}>
    <div class="aisc-head">
      <AiOrb state={$aiHelpOrb} size={42} />
      <div class="aisc-heading">
        <h2 class="aisc-title">{T.name}</h2>
        <p class="aisc-sub">{on ? fill(T.setupOn, { name }) : T.setupOff}</p>
      </div>
      <AiHelpSwitch checked={on} label={T.setupSwitch} onChange={setAiHelpEnabled} />
    </div>

    {#if on}
      <div class="aisc-body">
        <AiHelpDomains variant="cards" />
        {#if withAgenda}
          <div class="aisc-agenda">
            <label for="aisc-agenda" class="aisc-label">
              {T.agendaLabel} <span class="aisc-label-hint">— {T.agendaHint}</span>
            </label>
            <textarea
              id="aisc-agenda"
              rows="3"
              placeholder={T.agendaPlaceholder}
              value={$aiHelp.agenda}
              on:input={(e) => setAiHelpAgenda(e.currentTarget.value)}
            ></textarea>
            <p class="aisc-note">{fill(T.agendaVoiceHint, { name })}</p>
          </div>
        {/if}
        <p class="aisc-note">
          {$aiHelp.myBrain ? T.setupNote : fill(T.setupNoteNoBrain, { name })}
        </p>
      </div>
    {/if}
  </section>
{/if}

<style>
  .aisc {
    /* Largeur dite en `vw` : .welcome-content se dimensionne sur son contenu,
       un pourcentage n'y aurait pas de référence. */
    width: min(620px, calc(100vw - 40px));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 22px auto 0;
    padding: 16px 18px;
    border: 1.5px solid var(--line);
    border-radius: 20px;
    background: var(--surface);
    font-family: 'Lexend', sans-serif;
    text-align: left;
    transition:
      border-color 0.3s,
      box-shadow 0.3s;
  }
  .aisc-on {
    border-color: var(--ai-line);
    box-shadow: 0 24px 60px -24px var(--ai-glow);
  }
  .aisc-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .aisc-heading {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .aisc-title {
    margin: 0;
    font-size: 17px;
    font-weight: 500;
    color: var(--ink);
  }
  .aisc-sub {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--mb-text-secondary);
  }
  .aisc-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: aisc-unfold 0.35s ease both;
  }
  .aisc-agenda {
    display: flex;
    flex-direction: column;
    gap: 5px;
    animation: aisc-unfold 0.35s ease both;
  }
  .aisc-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--ink);
  }
  .aisc-label-hint {
    font-weight: 400;
    color: var(--mb-text-secondary);
  }
  .aisc-agenda textarea {
    resize: vertical;
    padding: 8px 10px;
    border: 1px solid var(--mb-border-input);
    border-radius: 10px;
    background: var(--surface);
    font-family: inherit;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink);
  }
  .aisc-agenda textarea:focus-visible {
    outline: 2px solid var(--ai);
    outline-offset: 1px;
  }
  .aisc-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--mb-text-secondary);
  }

  @keyframes aisc-unfold {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (max-width: 768px) {
    .aisc {
      margin-top: 16px;
      padding: 14px;
      border-radius: 16px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aisc,
    .aisc-body,
    .aisc-agenda {
      animation: none;
      transition: none;
    }
  }
</style>
