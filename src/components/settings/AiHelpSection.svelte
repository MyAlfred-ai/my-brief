<script>
  /**
   * Réglages → Aide IA : ce qui vaut pour TOUTES les réunions du compte.
   *
   * Trois cartes, trois questions qu'on se pose dans cet ordre :
   *   « Au démarrage d'une réunion »  l'Aide IA allumée ou non, ses domaines ;
   *   « Sons »                        un son par sens, chacun s'écoute et se
   *                                   coupe ;
   *   « Voix »                        lire à voix haute, quoi, avec quel moteur
   *                                   et quelle voix — à écouter avant
   *                                   d'enregistrer.
   * Pendant une réunion, tout se change pour elle seule (pastille, pupitre) :
   * cette page ne touche pas la réunion en cours, sauf ses sons et sa voix,
   * appliqués dès l'enregistrement.
   *
   * ── Les moteurs proposés sont ceux qui MARCHENT ───────────────────────────
   * Le navigateur, s'il sait lire à voix haute ; OpenAI et Mistral, si le
   * serveur vient de les ESSAYER avec la clé de l'organisation
   * (`/ai-help/voices`, lib/aiHelp/voices.js). Demande du 2026-11-13 : « tout
   * doit être bien testé avant d'être proposé ». Un moteur enregistré qui ne
   * l'est plus (clé retirée) est signalé, et la page refuse de l'enregistrer
   * allumé.
   *
   * Un écran, un bouton Enregistrer : le patron de « Détection d'actions ».
   */
  import { onDestroy, onMount } from 'svelte';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    aiHelp,
    AI_HELP_DOMAINS,
    loadAiHelp,
    loadAiHelpVoices,
    saveAiHelpPreferences,
  } from '../../stores/aiHelp.js';
  import {
    playAck,
    playBell,
    playChime,
    playTimerMelody,
    unlockAiHelpAudio,
  } from '../../utils/chime.js';
  import {
    browserSpeechSupported,
    browserVoices,
    speakNow,
    stopSpeaking,
  } from '../../lib/aiHelp/voice.js';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import AiIcon from '../aiHelp/AiIcon.svelte';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconPlay from '~icons/solar/play-linear';
  import IconRocket from '~icons/solar/play-circle-linear';
  import IconBell from '~icons/solar/bell-linear';
  import IconVoice from '~icons/solar/soundwave-linear';

  const SOUND_KINDS = ['alerts', 'ideas', 'actions', 'timer'];
  const READ_KINDS = ['answers', 'alerts', 'ideas'];
  const SOUNDS = { alerts: playChime, ideas: playBell, actions: playAck, timer: playTimerMelody };

  const copy = (value) => JSON.parse(JSON.stringify(value));

  let draft = null;
  let savedJson = '';
  /** Les moteurs essayés par le serveur ; null tant qu'il vérifie. */
  let providers = null;
  let localVoices = [];
  let saveState = '';
  let errorText = '';
  /** '' | 'speaking' | 'done' | un slug d'échec */
  let sampleState = '';

  $: T = $uiText.aiHelp;
  $: P = T.prefs;
  $: name = $aiHelp.wakeWord || T.name;
  $: lang = $currentLanguageStore;

  function reset() {
    draft = copy($aiHelp.preferences);
    savedJson = JSON.stringify(draft);
  }

  onMount(async () => {
    if (!$aiHelp.loaded) await loadAiHelp();
    reset();
    browserVoices().then((voices) => (localVoices = voices));
    const res = await loadAiHelpVoices();
    providers = res.ok ? res.providers : [];
  });
  onDestroy(() => stopSpeaking());

  $: dirty = !!draft && JSON.stringify(draft) !== savedJson;
  $: offered = AI_HELP_DOMAINS.filter((key) => $aiHelp.allowed[key]);

  // ── Les moteurs ──────────────────────────────────────────────────────────
  $: engines = [
    ...(browserSpeechSupported() ? [{ id: 'browser', models: [] }] : []),
    ...(providers || []).map((provider) => ({ id: provider.id, models: provider.models })),
  ];
  $: engine = draft ? engines.find((entry) => entry.id === draft.voice.provider) : null;
  // Le moteur enregistré n'est plus proposé (clé retirée, essai raté).
  $: engineGone = !!draft && providers !== null && !engine;
  $: models = engine?.models || [];
  $: model = draft ? models.find((entry) => entry.id === draft.voice.model) || null : null;
  $: retiresAt = model?.retiresAt
    ? new Date(model.retiresAt).toLocaleDateString(lang, { dateStyle: 'long' })
    : '';
  // Les voix du navigateur : celles de la langue de l'interface d'abord.
  $: sameLanguage = localVoices.filter((voice) => voice.lang?.toLowerCase().startsWith(lang));
  $: otherLanguages = localVoices.filter((voice) => !sameLanguage.includes(voice));
  $: providerVoices = model?.voices || [];
  $: canSave = dirty && saveState !== 'saving' && !(draft?.voice.enabled && engineGone);

  function bestBrowserVoice() {
    // Une voix « en ligne » ou « naturelle » se comprend mieux qu'une voix
    // embarquée : à langue égale, elle passe devant.
    const pick = sameLanguage.find((voice) => !voice.local) || sameLanguage[0];
    return pick?.id || '';
  }

  function bestVoiceOf(entry) {
    const voices = entry?.voices || [];
    const native = voices.find((voice) => voice.languages?.some((code) => code.startsWith(lang)));
    return (voices.find((voice) => voice.id === 'marin') || native || voices[0])?.id || '';
  }

  function chooseEngine(id) {
    const next = engines.find((entry) => entry.id === id);
    if (!next) return;
    const first = next.models[0];
    draft.voice = {
      ...draft.voice,
      provider: id,
      model: first?.id || '',
      voice: id === 'browser' ? bestBrowserVoice() : bestVoiceOf(first),
    };
    sampleState = '';
  }

  function chooseModel(id) {
    const next = models.find((entry) => entry.id === id);
    const keep = next?.voices.some((voice) => voice.id === draft.voice.voice);
    draft.voice = {
      ...draft.voice,
      model: id,
      voice: keep ? draft.voice.voice : bestVoiceOf(next),
    };
    sampleState = '';
  }

  async function listenSound(kind) {
    // Dans le clic : c'est le geste qui déverrouille le son de la page.
    await unlockAiHelpAudio();
    SOUNDS[kind]();
  }

  async function listenVoice() {
    await unlockAiHelpAudio();
    sampleState = 'speaking';
    const res = await speakNow(fill(P.sample, { name }), draft.voice, { language: lang });
    if (res.stopped) sampleState = '';
    else sampleState = res.ok ? 'done' : res.error || 'voice_failed';
  }

  async function save() {
    if (!canSave) return;
    // Voix éteinte sur un moteur disparu : on la range sur le navigateur
    // plutôt que de garder un réglage que le serveur refuserait.
    if (!draft.voice.enabled && engineGone) {
      draft.voice = { ...draft.voice, provider: 'browser', model: '', voice: '' };
    }
    saveState = 'saving';
    errorText = '';
    const res = await saveAiHelpPreferences(draft);
    if (!res.ok) {
      saveState = '';
      errorText = P.errors[res.error] || P.errors.default;
      return;
    }
    reset();
    saveState = 'saved';
  }

  function discard() {
    reset();
    saveState = '';
    errorText = '';
    sampleState = '';
  }

  $: if (dirty && saveState === 'saved') saveState = '';
</script>

<div class="ah-wrap">
  {#if !draft}
    <div class="ah-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorText}
      <div class="ah-error" role="alert">{errorText}</div>
    {/if}

    <p class="ah-intro">{P.intro}</p>

    <!-- ── Au démarrage d'une réunion ── -->
    <SettingsCard
      title={P.startTitle}
      hint={P.startHint}
      icon={IconRocket}
      on={draft.start.enabled}
    >
      <div class="ah-row">
        <label class="ah-row-label" for="ah-start">{P.startSwitch}</label>
        <ToggleSwitch id="ah-start" bind:checked={draft.start.enabled} label={P.startSwitch} />
      </div>
      {#if draft.start.enabled}
        {#if offered.length}
          <ul class="ah-list" aria-label={T.domainsLabel}>
            {#each offered as key (key)}
              <li class="ah-item">
                <span class="ah-item-icon" aria-hidden="true"><AiIcon name={key} size={18} /></span>
                <span class="ah-item-text">
                  <label class="ah-item-label" for="ah-domain-{key}">{T.domains[key].title}</label>
                  <span class="ah-item-hint">{fill(T.domains[key].hint, { name })}</span>
                </span>
                <ToggleSwitch
                  id="ah-domain-{key}"
                  bind:checked={draft.start.domains[key]}
                  label={T.domains[key].title}
                />
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <p class="ah-hint">{P.startOff}</p>
      {/if}
    </SettingsCard>

    <!-- ── Sons ── -->
    <SettingsCard title={P.soundsTitle} hint={P.soundsHint} icon={IconBell}>
      <ul class="ah-list">
        {#each SOUND_KINDS as kind (kind)}
          <li class="ah-item">
            <span class="ah-item-text">
              <label class="ah-item-label" for="ah-sound-{kind}">{P.sounds[kind].label}</label>
              <span class="ah-item-hint">{P.sounds[kind].hint}</span>
            </span>
            <button
              type="button"
              class="ah-listen"
              aria-label={fill(P.listenTo, { label: P.sounds[kind].label })}
              on:click={() => listenSound(kind)}
            >
              <IconPlay width="14" height="14" />
              <span>{P.listen}</span>
            </button>
            <ToggleSwitch
              id="ah-sound-{kind}"
              bind:checked={draft.sounds[kind]}
              label={P.sounds[kind].label}
            />
          </li>
        {/each}
      </ul>
    </SettingsCard>

    <!-- ── Voix ── -->
    <SettingsCard title={P.voiceTitle} hint={P.voiceHint} icon={IconVoice} on={draft.voice.enabled}>
      <div class="ah-row">
        <label class="ah-row-label" for="ah-voice">{P.voiceSwitch}</label>
        <ToggleSwitch id="ah-voice" bind:checked={draft.voice.enabled} label={P.voiceSwitch} />
      </div>

      {#if draft.voice.enabled}
        <fieldset class="ah-field ah-fieldset">
          <legend class="ah-label">{P.readLabel}</legend>
          <div class="ah-chips">
            {#each READ_KINDS as kind (kind)}
              <label class="ah-chip" class:ah-chip-on={draft.voice.read[kind]}>
                <input type="checkbox" bind:checked={draft.voice.read[kind]} />
                {#if draft.voice.read[kind]}<AiIcon name="check" size={14} strokeWidth={2.2} />{/if}
                <span>{P.read[kind]}</span>
              </label>
            {/each}
          </div>
        </fieldset>

        <fieldset class="ah-field ah-fieldset">
          <legend class="ah-label">{P.engineLabel}</legend>
          {#if engineGone}
            <p class="ah-warn" role="alert">{P.engineGone}</p>
          {/if}
          {#each engines as entry (entry.id)}
            <label class="ah-choice" class:ah-choice-on={draft.voice.provider === entry.id}>
              <input
                type="radio"
                name="ah-engine"
                value={entry.id}
                checked={draft.voice.provider === entry.id}
                on:change={() => chooseEngine(entry.id)}
              />
              <span>
                <strong>{P.engines[entry.id].label}</strong>
                <em>{P.engines[entry.id].hint}</em>
              </span>
            </label>
          {/each}
          {#if providers === null}
            <p class="ah-hint">{P.enginesChecking}</p>
          {:else}
            <p class="ah-hint">{P.enginesNote}</p>
          {/if}
          {#if !browserSpeechSupported()}
            <p class="ah-hint">{P.noBrowserVoice}</p>
          {/if}
        </fieldset>

        {#if engine}
          <div class="ah-selects">
            {#if models.length > 1}
              <div class="ah-field">
                <label class="ah-label" for="ah-model">{P.modelLabel}</label>
                <select
                  id="ah-model"
                  class="ah-input"
                  value={draft.voice.model}
                  on:change={(event) => chooseModel(event.currentTarget.value)}
                >
                  {#each models as entry (entry.id)}
                    <option value={entry.id}>{entry.id}</option>
                  {/each}
                </select>
              </div>
            {/if}
            <div class="ah-field">
              <label class="ah-label" for="ah-voice-name">{P.voiceLabel}</label>
              <select
                id="ah-voice-name"
                class="ah-input"
                bind:value={draft.voice.voice}
                on:change={() => (sampleState = '')}
              >
                {#if draft.voice.provider === 'browser'}
                  <option value="">{P.voiceDefault}</option>
                  {#each sameLanguage as voice (voice.id)}
                    <option value={voice.id}>{voice.label}</option>
                  {/each}
                  {#if otherLanguages.length}
                    <optgroup label={P.otherLanguages}>
                      {#each otherLanguages as voice (voice.id)}
                        <option value={voice.id}>{voice.label} — {voice.lang}</option>
                      {/each}
                    </optgroup>
                  {/if}
                {:else}
                  {#each providerVoices as voice (voice.id)}
                    <option value={voice.id}
                      >{voice.label}{voice.languages?.length
                        ? ` — ${voice.languages.join(', ')}`
                        : ''}</option
                    >
                  {/each}
                {/if}
              </select>
            </div>
          </div>
          {#if retiresAt}
            <p class="ah-hint">{fill(P.engineRetires, { date: retiresAt })}</p>
          {/if}

          <div class="ah-test">
            <button
              type="button"
              class="ah-test-btn"
              disabled={sampleState === 'speaking'}
              on:click={listenVoice}
            >
              <IconPlay width="15" height="15" />
              {P.listen}
            </button>
            {#if sampleState === 'speaking'}
              <span class="ah-status" role="status">{P.sampleSpeaking}</span>
            {:else if sampleState === 'done'}
              <span class="ah-status ah-status-ok" role="status">
                <IconCheck width="15" height="15" />{P.sampleDone}
              </span>
            {:else if sampleState}
              <span class="ah-status ah-status-error" role="alert">
                {P.errors[sampleState] || P.errors.voice_failed}
              </span>
            {/if}
          </div>
        {/if}
      {/if}
    </SettingsCard>

    <div class="ah-actions">
      {#if dirty}
        <button class="ah-ghost" type="button" on:click={discard}>{P.discard}</button>
      {/if}
      {#if saveState === 'saved'}
        <span class="ah-ok" role="status"><IconCheck width="16" height="16" />{P.saved}</span>
      {/if}
      <button class="ah-save" type="button" on:click={save} disabled={!canSave}>
        {saveState === 'saving' ? P.saving : P.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .ah-wrap {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .ah-skeleton {
    height: 420px;
    border-radius: 10px;
    background: var(--surface-tint);
  }
  .ah-intro {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .ah-error {
    padding: 0.7rem 0.85rem;
    border-radius: 8px;
    border: 1px solid var(--danger-line);
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.85rem;
  }
  .ah-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .ah-row-label,
  .ah-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
    padding: 0;
  }
  .ah-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .ah-warn {
    margin: 0 0 0.35rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--warn-line);
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 0.8rem;
  }
  /* Une ligne par domaine, par son : intitulé et explication à gauche,
     interrupteur à droite — la colonne d'interrupteurs se lit d'un coup d'œil. */
  .ah-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .ah-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
  }
  .ah-item + .ah-item {
    border-top: 1px solid var(--line-faint);
  }
  .ah-item-icon {
    flex: none;
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--ai-soft);
    color: var(--ai-ink);
  }
  .ah-item-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .ah-item-label {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--ink);
  }
  .ah-item-hint {
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.4;
  }
  .ah-listen {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.32rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  .ah-listen:hover {
    border-color: var(--ai-line);
    color: var(--ai-ink);
  }
  .ah-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ah-fieldset {
    border: 0;
    padding: 0;
    margin: 0;
  }
  .ah-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .ah-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.38rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-soft);
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s,
      color 0.15s;
  }
  .ah-chip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .ah-chip:focus-within {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .ah-chip-on {
    border-color: var(--ai-line);
    background: var(--ai-soft);
    color: var(--ai-ink);
    font-weight: 500;
  }
  .ah-choice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.6rem 0.7rem;
    margin-top: 0.35rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .ah-choice input {
    margin-top: 0.2rem;
    accent-color: var(--brand);
  }
  .ah-choice-on {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
  }
  .ah-choice span {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .ah-choice strong {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--ink);
  }
  .ah-choice em {
    font-style: normal;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.4;
  }
  .ah-selects {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }
  .ah-input {
    width: 100%;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font-family: inherit;
    font-size: 0.88rem;
  }
  .ah-input:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .ah-test {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .ah-test-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--brand);
    background: var(--brand-secondary-soft-08);
    color: var(--brand-text-strong);
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ah-test-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .ah-status {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .ah-status-ok {
    color: var(--success-text);
    font-weight: 600;
  }
  .ah-status-error {
    color: var(--danger-text);
  }
  /* Collée au bas du panneau : le bouton reste visible sans scroller. */
  .ah-actions {
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
  .ah-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    color: var(--success-text);
  }
  .ah-ghost {
    padding: 0.5rem 0.85rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .ah-save {
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
  .ah-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (max-width: 560px) {
    .ah-listen span {
      display: none;
    }
  }
</style>
