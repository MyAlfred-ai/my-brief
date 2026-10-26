<script>
  /**
   * Carte « Son de l'ordinateur » de Ma configuration → Réglages audio —
   * Firefox et Safari sur ordinateur seulement (SettingsPanel décide de la
   * monter).
   *
   * Leur partage d'écran ne transporte jamais de son
   * (utils/browserAudioSupport.js) : un périphérique audio virtuel choisi ici
   * en tient lieu, ouvert en plus du micro à chaque « Réunion avec visio »
   * (lib/audio/systemAudio.js). Chrome et Edge partagent le son eux-mêmes, la
   * carte n'y a pas de sens.
   *
   * Le bouton « Tester le son » existe parce que le réglage rate presque
   * toujours au même endroit : la sortie de l'ordinateur n'est pas envoyée au
   * périphérique, qui reste muet. Sans test, on le découvre après la réunion.
   *
   * Le panneau parent énumère les entrées audio, pour le micro comme pour
   * cette carte : elles arrivent en props. Le choix, lui, vit dans
   * stores/audioDevices.js, par appareil.
   */
  import IconSpeaker from '~icons/solar/volume-loud-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import { uiText } from '../../store.js';
  import { audioDevices, chooseSystemAudio } from '../../stores/audioDevices.js';
  import { findSystemDevice } from '../../lib/audio/systemAudio.js';
  import { probeInputLevel } from '../../lib/audio/levelProbe.js';
  import { buildSystemAudioConstraints } from '../../utils/audioConstraints.js';

  /** Les entrées audio de l'ordinateur (enumerateDevices, `audioinput`). */
  export let devices = [];
  /** La liste est connue, noms compris : le micro est autorisé. */
  export let ready = false;

  $: c = $uiText.config;

  let selectedId = '';
  let saved = false;
  let savedTimer;
  // idle | listening | heard | silent | failed
  let probeState = 'idle';
  let probeLevel = 0;

  $: stored = $audioDevices.system;
  $: present = ready && stored ? findSystemDevice(devices, stored) : null;
  $: missing = ready && !!stored && !present;
  $: selectedId = present?.deviceId || '';
  // Retrouvé par son nom sous un nouvel identifiant (le navigateur renouvelle
  // les siens quand on efface les données du site) : on garde le nouveau, sans
  // quoi chaque réunion devrait encore le chercher par son nom.
  $: if (present && present.deviceId !== stored.id) chooseSystemAudio(present);
  // Le micro choisi n'est pas proposé : chaque mot serait transcrit deux fois.
  // Sauf s'il est DÉJÀ le son de l'ordinateur (micro changé depuis) : il reste
  // affiché, avec l'avertissement — la réunion, elle, ne l'ouvrira pas.
  $: sameAsMic = !!present && present.deviceId === $audioDevices.mic;
  $: candidates = devices.filter(
    (device) => device.deviceId !== $audioDevices.mic || device.deviceId === present?.deviceId,
  );

  function handleChange() {
    chooseSystemAudio(devices.find((device) => device.deviceId === selectedId) || null);
    probeState = 'idle';
    saved = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (saved = false), 2000);
  }

  /** Écoute le périphérique quelques secondes : quelque chose y arrive-t-il ? */
  async function test() {
    if (!present || probeState === 'listening') return;
    probeState = 'listening';
    probeLevel = 0;
    try {
      const { heard } = await probeInputLevel({
        mediaDevices: navigator.mediaDevices,
        constraints: buildSystemAudioConstraints(present.deviceId),
        onLevel: (level) => (probeLevel = level),
      });
      probeState = heard ? 'heard' : 'silent';
    } catch (e) {
      console.warn("Test du son de l'ordinateur impossible :", e);
      probeState = 'failed';
    }
    probeLevel = 0;
  }
</script>

<SettingsCard title={c.systemAudioSection} hint={c.systemAudioLabel} icon={IconSpeaker}>
  <svelte:fragment slot="badge">
    {#if saved}
      <span class="sy-ok"><IconCheck width="15" height="15" aria-hidden="true" /> {c.saved}</span>
    {/if}
  </svelte:fragment>

  <p class="sy-note">{c.systemAudioIntro}</p>

  {#if ready}
    <div class="sy-field">
      <label class="sy-label" for="sy-select">{c.systemAudioDeviceLabel}</label>
      <select id="sy-select" class="sy-select" bind:value={selectedId} on:change={handleChange}>
        <option value="">{c.systemAudioNone}</option>
        {#each candidates as device, i (device.deviceId)}
          <option value={device.deviceId}>
            {device.label || `${c.systemAudioDeviceLabel} ${i + 1}`}
          </option>
        {/each}
      </select>
      <p class="sy-hint">{c.systemAudioHint}</p>
    </div>

    {#if missing}
      <p class="sy-note sy-note-warn">{c.systemAudioMissing.replace('{device}', stored.label)}</p>
    {:else if sameAsMic}
      <p class="sy-note sy-note-warn">{c.systemAudioIsMic}</p>
    {/if}

    {#if present}
      <div class="sy-actions">
        <button
          type="button"
          class="sy-ghost"
          on:click={test}
          disabled={probeState === 'listening'}
        >
          {probeState === 'listening' ? c.systemAudioTesting : c.systemAudioTest}
        </button>
      </div>
      {#if probeState === 'listening'}
        <!-- La valeur de la jauge n'est pas une information, le verdict qui
             suit en est une : d'où aria-hidden ici, role=status dessous. -->
        <div class="sy-meter" aria-hidden="true">
          <span style="width: {Math.round(probeLevel * 100)}%"></span>
        </div>
      {/if}
      <!-- Présente AVANT le verdict, masquée et non retirée du DOM : le
           lecteur d'écran annonce le verdict quand il arrive. -->
      <p
        class="sy-note"
        class:sy-note-ok={probeState === 'heard'}
        class:sy-note-warn={probeState === 'silent' || probeState === 'failed'}
        class:sy-hidden={probeState === 'idle'}
        role="status"
      >
        {#if probeState === 'listening'}{c.systemAudioTestHint}
        {:else if probeState === 'heard'}{c.systemAudioHeard}
        {:else if probeState === 'silent'}{c.systemAudioSilent}
        {:else if probeState === 'failed'}{c.systemAudioFailed}{/if}
      </p>
    {/if}
  {/if}
</SettingsCard>

<style>
  .sy-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .sy-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sy-select {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.92rem;
    background: var(--surface);
    color: var(--ink);
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .sy-select:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .sy-hint {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .sy-note {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px dashed var(--line-strong);
    font-size: 0.82rem;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .sy-note-warn {
    background: var(--warn-bg);
    border-color: var(--warn-line);
    color: var(--warn-text);
  }
  .sy-note-ok {
    background: var(--success-bg);
    border-color: var(--success-line);
    color: var(--success-text);
  }
  .sy-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .sy-meter {
    height: 8px;
    border-radius: 4px;
    background: var(--line);
    overflow: hidden;
  }
  .sy-meter span {
    display: block;
    height: 100%;
    border-radius: 0 4px 4px 0;
    background: var(--success-text);
    transition: width 0.08s linear;
  }
  @media (prefers-reduced-motion: reduce) {
    .sy-meter span {
      transition: none;
    }
  }
  .sy-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--success-text);
    font-size: 0.85rem;
    font-weight: 500;
    align-self: center;
  }
  .sy-actions {
    display: flex;
    justify-content: flex-start;
  }
  .sy-ghost {
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-soft);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.88rem;
    transition: background 0.15s;
  }
  .sy-ghost:hover:not(:disabled) {
    background: var(--surface-tint);
  }
  .sy-ghost:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
