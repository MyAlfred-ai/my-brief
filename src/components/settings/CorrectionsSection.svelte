<script>
  /**
   * Onglet « Mots remplacés » de « Réglages → Pendant la réunion » : la liste de
   * corrections de la transcription du COMPTE.
   *
   * L'organisation a la sienne (Administration → Entreprise), valable pour
   * tous. Celle-ci ne touche que les réunions de son auteur, et s'y ajoute :
   * sur une même écriture, c'est le mot juste du compte qui gagne
   * (stores/transcriptCorrections.js).
   *
   * Elle se remplit de deux façons, et l'écran dit les deux :
   *  - à la main, ici — la carte est celle de l'administration
   *    (admin/TranscriptCorrectionsCard), avec son essai ;
   *  - toute seule, depuis les notes : « Remplace Durend par Durand » écrit
   *    pendant une réunion y est versé (utils/noteReplacements.js). C'est le
   *    premier réglage de la page, parce que c'est lui qui explique d'où
   *    viennent des lignes que l'utilisateur n'a jamais tapées ici — et où
   *    l'éteindre.
   *
   * La liste est relue à l'ouverture : elle a pu grandir pendant une réunion.
   */
  import { onMount } from 'svelte';
  import IconNotes from '~icons/solar/notes-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import TranscriptCorrectionsCard from '../admin/TranscriptCorrectionsCard.svelte';
  import {
    userCorrections,
    refreshUserCorrections,
    saveUserCorrections,
  } from '../../stores/transcriptCorrections.js';
  import {
    USER_CORRECTIONS_MAX,
    checkRows,
    rowsKey,
    rowsToRules,
    rulesToRows,
  } from '../../utils/transcriptCorrections.js';
  import { uiText } from '../../store.js';

  let rows = [];
  let learn = true;
  let savedKey = '[]';
  let savedLearn = true;

  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';

  $: texts = $uiText.configCorrections;
  // La carte parle avec les mots de l'administration, sauf là où la liste d'un
  // compte dit autre chose (portée, exemples, « remplacement »).
  $: cardTexts = { ...$uiText.adminTranscriptCorrections, ...texts.card };

  // Déclarations réactives, jamais des appels dans le gabarit : Svelte ne suit
  // que les identifiants qu'il voit.
  $: dirty = !loading && (rowsKey(rows) !== savedKey || learn !== savedLearn);
  $: valid = checkRows(rows).every((verdict) => verdict?.level !== 'error');
  $: canSave = dirty && valid && saveState !== 'saving';

  onMount(load);

  function adopt(settings) {
    rows = rulesToRows(settings.rules, USER_CORRECTIONS_MAX);
    learn = settings.learn !== false;
    savedKey = rowsKey(rows);
    savedLearn = learn;
  }

  const messageFor = (slug) => texts.errors[slug] || texts.errors.unknown;

  async function load() {
    loading = true;
    errorMessage = '';
    const res = await refreshUserCorrections();
    loading = false;
    if (!res.ok) errorMessage = messageFor(res.error);
    // En échec, l'écran montre ce que le démarrage a chargé : mieux qu'une
    // liste vide, qu'un « Enregistrer » écraserait.
    adopt($userCorrections);
  }

  function discard() {
    adopt($userCorrections);
    errorMessage = '';
  }

  async function save() {
    saveState = 'saving';
    errorMessage = '';
    const res = await saveUserCorrections({
      rules: rowsToRules(rows, USER_CORRECTIONS_MAX),
      learn,
    });
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.error);
      return;
    }
    adopt($userCorrections);
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
  }
</script>

<div class="uc-wrap">
  {#if loading}
    <div class="uc-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorMessage}
      <div class="uc-error" role="alert">{errorMessage}</div>
    {/if}

    <p class="uc-intro">{texts.intro}</p>

    <SettingsCard title={texts.learnTitle} hint={texts.learnHint} icon={IconNotes} on={learn}>
      <div class="uc-row">
        <label class="uc-row-label" for="uc-learn">{texts.learnLabel}</label>
        <ToggleSwitch id="uc-learn" bind:checked={learn} label={texts.learnLabel} />
      </div>
      <p class="uc-hint">{learn ? texts.learnScope : texts.learnOff}</p>
    </SettingsCard>

    <TranscriptCorrectionsCard bind:rows texts={cardTexts} max={USER_CORRECTIONS_MAX} personal />

    <div class="uc-actions">
      {#if dirty}
        <button class="uc-ghost" type="button" on:click={discard}>{texts.discardChanges}</button>
      {/if}
      {#if saveState === 'saved'}
        <span class="uc-ok"><IconCheck width="16" height="16" />{texts.saved}</span>
      {/if}
      <button class="uc-save" type="button" on:click={save} disabled={!canSave}>
        {saveState === 'saving' ? texts.saving : texts.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .uc-wrap {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .uc-intro {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .uc-error {
    padding: 0.7rem 0.85rem;
    border-radius: 8px;
    border: 1px solid var(--danger-line);
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.85rem;
  }
  .uc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .uc-row-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
  }
  .uc-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  /* Collée au bas du panneau : le bouton reste visible sans scroller — une
     liste de cent lignes le repousserait hors de l'écran. */
  .uc-actions {
    position: sticky;
    bottom: -22px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.6rem;
    margin: 0 -22px -22px;
    padding: 0.85rem 22px 22px;
    background: var(--surface);
    border-top: 1px solid var(--line-faint);
  }
  .uc-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    color: var(--success-text);
  }
  .uc-ghost {
    padding: 0.5rem 0.85rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .uc-save {
    padding: 0.55rem 1.1rem;
    border-radius: 10px;
    border: 0;
    background: var(--brand);
    color: #fff;
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  .uc-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .uc-skeleton {
    height: 220px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    /* Nom préfixé : les @keyframes ne sont pas scopés par Svelte. */
    animation: uc-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes uc-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .uc-skeleton {
      animation: none;
    }
  }
  @media (max-width: 640px) {
    .uc-actions {
      justify-content: stretch;
      bottom: -14px;
      margin: 0 -16px -16px;
      padding: 0.75rem 16px 16px;
    }
  }
</style>
