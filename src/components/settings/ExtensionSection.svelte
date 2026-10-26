<script>
  /**
   * Section « Extension Chrome » de « Ma configuration ».
   *
   * Une page qui explique, installe et lie — dans cet ordre, parce que c'est
   * l'ordre des gestes. Elle n'a aucun réglage : tout ce qu'elle sait de
   * l'extension lui vient du pont (stores/extensionBridge.js), qui dit si
   * l'extension est là et en quelle version. La ligne d'état passe au vert
   * seule, dès que le script de contenu se signale — c'est la seule
   * confirmation que la liaison a réussi, et elle arrive sans recharger.
   *
   * Deux chemins d'installation, jamais les deux à la fois : la fiche du
   * Chrome Web Store dès qu'elle existe (EXTENSION_STORE_URL), sinon le .zip
   * servi par l'installation avec les étapes du chargement manuel.
   */
  import { onMount } from 'svelte';
  import IconExtension from '~icons/solar/widget-add-linear';
  import IconDownload from '~icons/solar/download-minimalistic-linear';
  import IconLink from '~icons/solar/link-minimalistic-2-linear';
  import IconPlay from '~icons/solar/play-circle-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconWarn from '~icons/solar/danger-triangle-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import HelpSteps from '../help/HelpSteps.svelte';
  import ExtensionFigure from '../help/ExtensionFigure.svelte';
  import { EXTENSION_STORE_URL, EXTENSION_ZIP_PATH } from '../../config/constants.js';
  import { extensionInfo, pingExtension } from '../../stores/extensionBridge.js';

  export let texts;

  // Chrome et ses dérivés (Edge, Brave, Opera…) annoncent tous `Chrome/`.
  // Firefox et Safari, non — et l'extension n'y existe pas.
  const chromium =
    typeof navigator !== 'undefined' && /Chrome\/|Chromium\//.test(navigator.userAgent);

  $: installed = $extensionInfo.installed;
  $: stateText = installed
    ? texts.extStateVersion.replace('{version}', $extensionInfo.version)
    : texts.extStateMissingHint;

  // L'extension s'est signalée au chargement de la page, peut-être bien
  // avant que cette section n'existe : on lui redemande à l'ouverture.
  onMount(() => pingExtension());
</script>

<div class="es-head">
  <IconExtension width="17" height="17" aria-hidden="true" />
  <h4>{texts.extensionSection}</h4>
</div>

<div class="es-body">
  <p class="es-intro">{texts.extIntro}</p>

  {#if !chromium}
    <p class="es-note es-note-warn">{texts.extBrowserNote}</p>
  {/if}

  <div class="es-state" class:es-state-on={installed} role="status">
    {#if installed}
      <IconCheck width="20" height="20" aria-hidden="true" />
    {:else}
      <IconWarn width="20" height="20" aria-hidden="true" />
    {/if}
    <div>
      <strong>{installed ? texts.extStateInstalled : texts.extStateMissing}</strong>
      <span>{stateText}</span>
    </div>
  </div>

  <div class="es-figure">
    <ExtensionFigure labels={texts.extFigure} />
  </div>

  <SettingsCard title={texts.extInstallTitle} icon={IconDownload}>
    <div class="es-card-body">
      {#if EXTENSION_STORE_URL}
        <a class="es-cta" href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
          <IconDownload width="17" height="17" aria-hidden="true" />
          {texts.extInstallStore}
        </a>
        <p class="es-hint">{texts.extInstallStoreHint}</p>
      {:else}
        <a class="es-cta" href={EXTENSION_ZIP_PATH} download>
          <IconDownload width="17" height="17" aria-hidden="true" />
          {texts.extInstallZip}
        </a>
        <p class="es-hint">{texts.extInstallZipHint}</p>
        <HelpSteps steps={texts.extInstallZipSteps} icons={false} />
      {/if}
    </div>
  </SettingsCard>

  <SettingsCard title={texts.extLinkTitle} icon={IconLink} on={installed}>
    <div class="es-card-body">
      <p class="es-hint">{texts.extLinkIntro}</p>
      <HelpSteps steps={texts.extLinkSteps} icons={false} />
    </div>
  </SettingsCard>

  <SettingsCard title={texts.extUseTitle} icon={IconPlay}>
    <ul class="es-use">
      {#each texts.extUseItems as item}
        <li>
          <strong>{item.label}</strong>
          <span>{item.desc}</span>
        </li>
      {/each}
    </ul>
  </SettingsCard>

  <p class="es-note">{texts.extAdminNote}</p>
</div>

<style>
  .es-head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 16px 22px 12px;
    border-bottom: 1px solid var(--line);
    color: var(--brand-text);
    flex-shrink: 0;
  }
  .es-head h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .es-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 22px;
    max-width: 620px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .es-intro,
  .es-note {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--ink-muted);
  }
  .es-note-warn {
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--surface-tint);
    border: 1px solid var(--line-strong);
    color: var(--ink);
  }
  .es-state {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--line-strong);
    background: var(--surface-tint);
    color: var(--ink-muted);
  }
  .es-state-on {
    border-color: rgb(46 158 91 / 0.45);
    background: rgb(46 158 91 / 0.08);
    color: #2e9e5b;
  }
  .es-state div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .es-state strong {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .es-state span {
    font-size: 12px;
    line-height: 1.45;
    color: var(--ink-muted);
  }
  .es-figure {
    padding: 8px 0 4px;
  }
  .es-card-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 4px 0 0;
  }
  .es-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0.65rem 1.2rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-family: inherit;
    font-size: 0.92rem;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
    transition:
      background 0.15s,
      transform 0.1s;
  }
  .es-cta:hover {
    background: var(--brand-strong);
  }
  .es-cta:active {
    transform: scale(0.97);
  }
  .es-hint {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
  .es-use {
    list-style: none;
    margin: 0;
    padding: 4px 0 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .es-use li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .es-use strong {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .es-use span {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
</style>
