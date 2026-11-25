<script>
  /**
   * Administration → Aide IA : ce que l'installation PROPOSE pendant une
   * réunion — les domaines d'intervention, le mot d'appel, ce que l'IA signale
   * d'elle-même. Qui s'en sert n'est pas réglé ici : c'est un droit de groupe
   * (onglet Groupes), et l'écran le dit.
   *
   * La carte « Lecture de myBrain » ne règle rien : elle dit pourquoi le
   * garde-fou du projet est, ou non, utilisable — une clé sans le droit
   * « lire » se découvrirait sinon réunion après réunion, chez les
   * utilisateurs.
   *
   * Comme les autres onglets : l'écran n'envoie que les champs modifiés.
   */
  import { onMount } from 'svelte';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    fetchAiHelpAdminSettings,
    saveAiHelpAdminSettings,
    testAiHelpReading,
  } from '../../services/aiHelpApi.js';
  import { listGroups } from '../../services/adminGroupsApi.js';
  import { selectPanelSection } from '../../stores/panels.js';
  import { auth } from '../../stores/auth.js';
  import IconGroups from '~icons/solar/users-group-two-rounded-linear';
  import GroupChip from '../ui/GroupChip.svelte';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconBrain from '../icons/BrainIcon.svelte';
  import IconAiHelp from '../icons/AiHelpIcon.svelte';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import AiIcon from '../aiHelp/AiIcon.svelte';

  const DOMAINS = ['project', 'qa', 'agenda', 'ideas'];
  const PACES = ['quiet', 'normal', 'busy'];
  const SAVED_MS = 2500;

  let loading = true;
  let errorMessage = '';
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let saved = null;
  let domains = { project: true, qa: true, agenda: true, ideas: true };
  let wakeWord = '';
  let pace = 'normal';
  let brain = { connected: false, canRead: false };
  // Ce que l'administrateur LUI-MÊME obtient en réunion — dit par le serveur,
  // avec la fonction qui décide en réunion. Il règle ici, puis teste chez lui :
  // « mon groupe a l'Aide IA, pas myBrain » doit se lire sans chercher.
  let me = null;
  // Les groupes de l'installation : l'onglet ne les règle pas, il dit lesquels
  // ont le droit. Sans cela, on règle les domaines, on voit myBrain en vert, et
  // on cherche l'Aide IA dans une réunion où elle n'apparaîtra jamais.
  let groups = [];

  $: T = $uiText.adminAiHelp;
  $: D = $uiText.aiHelp.domains;

  function adopt(data) {
    saved = data.settings;
    domains = { ...data.settings.domains };
    wakeWord = data.settings.wakeWord;
    pace = data.settings.pace;
    brain = data.myBrain || brain;
    me = data.me || me;
  }
  const messageFor = (data) => T.errors[data?.error] || T.errors.default;

  async function load() {
    const [res, listed] = await Promise.all([fetchAiHelpAdminSettings(), listGroups()]);
    loading = false;
    groups = listed.ok ? listed.data.groups || [] : [];
    if (!res.ok) {
      errorMessage = messageFor(res.data);
      return;
    }
    adopt(res.data);
  }
  onMount(load);

  // « Tester la lecture » : ce que myBrain rend pour une question. Sans cette
  // sonde, « la clé a le droit lire » est tout ce qu'on sait — pas si le cerveau
  // sait répondre à ce qu'on lui demande en réunion.
  let testQuestion = '';
  let testing = false;
  let testResult = null;
  let testError = '';

  async function runTest() {
    const question = testQuestion.trim();
    if (!question || testing) return;
    testing = true;
    testError = '';
    testResult = null;
    const res = await testAiHelpReading(question);
    testing = false;
    if (!res.ok) {
      testError = messageFor(res.data);
      return;
    }
    testResult = res.data;
  }
  /** La raison d'un refus de myBrain : notre libellé, sinon son propre message. */
  const reasonOf = (part) => T.errors[part.error] || part.upstreamMessage || part.error;

  $: allowed = groups.filter((group) => group.aiHelpAllowed);
  $: mine = me ? me.available : allowed.some((g) => g.id === $auth.user?.groups?.[0]?.id);
  $: myBrainNote = me?.available && !me.myBrain ? T.meReasons[me.reason] || '' : '';

  $: dirty =
    !!saved &&
    (DOMAINS.some((key) => domains[key] !== saved.domains[key]) ||
      wakeWord.trim() !== saved.wakeWord ||
      pace !== saved.pace);

  async function save() {
    const patch = {};
    const changed = DOMAINS.filter((key) => domains[key] !== saved.domains[key]);
    if (changed.length) patch.domains = Object.fromEntries(changed.map((k) => [k, domains[k]]));
    if (wakeWord.trim() !== saved.wakeWord) patch.wakeWord = wakeWord.trim();
    if (pace !== saved.pace) patch.pace = pace;
    saveState = 'saving';
    errorMessage = '';
    const res = await saveAiHelpAdminSettings(patch);
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    adopt(res.data);
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, SAVED_MS);
  }
</script>

<div class="aht">
  {#if loading}
    <div class="aht-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorMessage}<div class="aht-error" role="alert">{errorMessage}</div>{/if}
    <p class="aht-intro">{T.intro}</p>

    {#if saved}
      <SettingsCard title={T.accessTitle} icon={IconGroups} on={allowed.length > 0}>
        <StatusBadge
          slot="badge"
          tone={allowed.length ? 'ok' : 'warn'}
          text={allowed.length === 0
            ? T.accessNoneBadge
            : allowed.length === 1
              ? T.accessBadgeOne
              : fill(T.accessBadgeMany, { count: allowed.length })}
        />
        {#if allowed.length === 0}
          <p class="aht-warn" role="status">{T.accessNone}</p>
        {:else}
          <p class="aht-intro">{T.accessSome}</p>
          <ul class="aht-groups">
            {#each allowed as group (group.id)}
              <li>
                <GroupChip {group} />
                {#if group.aiHelpMyBrainAllowed}<span class="aht-tag">{T.accessWithBrain}</span
                  >{/if}
              </li>
            {/each}
          </ul>
          {#if !mine}
            <p class="aht-warn" role="status">{T.accessNotYou}</p>
          {:else if myBrainNote}
            <p class="aht-warn" role="status">{myBrainNote}</p>
          {:else if me?.myBrain}
            <p class="aht-ok" role="status">{T.meOk}</p>
          {/if}
        {/if}
        <button type="button" class="aht-open" on:click={() => selectPanelSection('groups')}>
          {T.accessOpenGroups}
        </button>
      </SettingsCard>

      <SettingsCard
        title={T.domainsTitle}
        hint={T.domainsHint}
        icon={IconAiHelp}
        on={DOMAINS.some((key) => domains[key])}
      >
        <div class="aht-domains">
          {#each DOMAINS as key (key)}
            {@const locked = key === 'project' && !brain.canRead}
            <div class="aht-domain" class:aht-domain-on={domains[key] && !locked}>
              <span class="aht-domain-icon" aria-hidden="true"><AiIcon name={key} size={17} /></span
              >
              <span class="aht-domain-text">
                <span class="aht-domain-title">
                  {D[key].title}
                  {#if key === 'project'}<span class="aht-tag">{T.needsMyBrain}</span>{/if}
                </span>
                <span class="aht-domain-hint">{locked ? T.domainLocked : T.domains[key]}</span>
              </span>
              <ToggleSwitch
                bind:checked={domains[key]}
                label={D[key].title}
                disabled={locked || saveState === 'saving'}
              />
            </div>
          {/each}
        </div>
      </SettingsCard>

      <div class="aht-pair">
        <SettingsCard title={T.wakeTitle} hint={T.wakeHint} on={true}>
          <label class="aht-sr" for="aht-wake">{T.wakeTitle}</label>
          <input id="aht-wake" class="aht-input" type="text" maxlength="24" bind:value={wakeWord} />
          <p class="aht-note">{fill(T.wakeExample, { name: wakeWord.trim() || saved.wakeWord })}</p>
        </SettingsCard>

        <SettingsCard title={T.paceTitle} hint={T.paceHint} on={true}>
          <div class="aht-seg" role="radiogroup" aria-label={T.paceTitle}>
            {#each PACES as value (value)}
              <button
                type="button"
                role="radio"
                aria-checked={pace === value}
                class="aht-seg-btn"
                class:aht-seg-on={pace === value}
                on:click={() => (pace = value)}
              >
                {T.paces[value].label}
              </button>
            {/each}
          </div>
          <p class="aht-note">{T.paces[pace].hint}</p>
        </SettingsCard>
      </div>

      <SettingsCard title={T.brainTitle} icon={IconBrain} on={brain.canRead}>
        <StatusBadge
          slot="badge"
          tone={brain.canRead ? 'ok' : 'warn'}
          text={brain.canRead ? T.brainOk : brain.connected ? T.brainNoRead : T.brainOff}
        />
        <p class="aht-note">{T.brainScope}</p>

        {#if brain.connected}
          <form class="aht-test" on:submit|preventDefault={runTest}>
            <label class="aht-test-label" for="aht-test">{T.testTitle}</label>
            <p class="aht-test-hint">{T.testHint}</p>
            <div class="aht-test-row">
              <input
                id="aht-test"
                class="aht-input aht-input-wide"
                type="text"
                maxlength="400"
                placeholder={T.testPlaceholder}
                bind:value={testQuestion}
              />
              <button
                type="submit"
                class="aht-open aht-test-btn"
                disabled={testing || !testQuestion.trim()}
              >
                {testing ? T.testing : T.testButton}
              </button>
            </div>
          </form>
          {#if testError}<p class="aht-warn" role="alert">{testError}</p>{/if}
          {#if testResult}
            <div class="aht-result" role="status">
              {#if !testResult.context.ok}
                <p class="aht-warn">
                  {fill(T.testFailed, { reason: reasonOf(testResult.context) })}
                </p>
              {:else if testResult.context.sheets.length === 0}
                <p class="aht-warn">{fill(T.testContextNone, { ms: testResult.ms })}</p>
              {:else}
                <p class="aht-result-line">
                  {testResult.context.sheets.length === 1
                    ? fill(T.testContextOne, { ms: testResult.ms })
                    : fill(T.testContextMany, {
                        count: testResult.context.sheets.length,
                        ms: testResult.ms,
                      })}
                </p>
                <ul class="aht-result-list">
                  {#each testResult.context.sheets as title, index (index)}<li>{title}</li>{/each}
                </ul>
                <p class="aht-excerpt">{testResult.context.excerpt}</p>
              {/if}

              {#if !testResult.keywords}
                <p class="aht-result-line">{T.testNoKeywords}</p>
              {:else if !testResult.search.ok}
                <p class="aht-warn">
                  {fill(T.testFailed, { reason: reasonOf(testResult.search) })}
                </p>
              {:else}
                <p class="aht-result-line">
                  {fill(T.testSearch, { keywords: testResult.keywords })}
                  {#if testResult.search.results.length === 0}{T.testSearchNone}{/if}
                </p>
                {#if testResult.search.results.length}
                  <ul class="aht-result-list">
                    {#each testResult.search.results as hit, index (index)}
                      <li>
                        {hit.title}{#if hit.type}
                          <span class="aht-tag">{hit.type}</span>{/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            </div>
          {/if}
        {/if}
      </SettingsCard>

      <div class="aht-actions">
        {#if saveState === 'saved' && !dirty}
          <span class="aht-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {T.saved}</span
          >
        {/if}
        <button
          type="button"
          class="aht-save"
          on:click={save}
          disabled={!dirty || saveState === 'saving'}
        >
          {saveState === 'saving' ? T.saving : T.save}
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .aht {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .aht-skeleton {
    height: 220px;
    border-radius: 12px;
    background: var(--surface-tint);
  }
  .aht-intro {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .aht-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .aht-domains {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0.5rem;
  }
  .aht-domain {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.7rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }
  .aht-domain-on {
    border-color: var(--ai-line);
    background: var(--ai-soft);
  }
  .aht-domain-icon {
    flex: none;
    margin-top: 1px;
    color: var(--ink-muted);
  }
  .aht-domain-on .aht-domain-icon {
    color: var(--ai-ink);
  }
  .aht-domain-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .aht-domain-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--ink);
  }
  .aht-domain-hint {
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--ink-muted);
  }
  .aht-tag {
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--ai-soft-strong);
    color: var(--ai-ink);
    font-size: 0.7rem;
    font-weight: 500;
  }
  .aht-pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0.9rem;
  }
  .aht-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .aht-input {
    width: min(260px, 100%);
    height: 40px;
    box-sizing: border-box;
    padding: 0 0.75rem;
    border: 1px solid var(--mb-border-input);
    border-radius: 8px;
    background: var(--surface);
    font-family: inherit;
    font-size: 0.92rem;
    color: var(--ink);
  }
  .aht-input:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .aht-note {
    margin: 0.6rem 0 0;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    background: var(--surface-tint);
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .aht-warn {
    margin: 0.6rem 0 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--warn-line);
    border-radius: 8px;
    background: var(--warn-bg);
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--warn-text);
  }
  .aht-ok {
    margin: 0.6rem 0 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--success-line);
    border-radius: 8px;
    background: var(--success-bg);
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--success-text);
  }
  .aht-groups {
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
  }
  .aht-groups li {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .aht-open {
    margin-top: 0.75rem;
    padding: 0.5rem 0.95rem;
    border: 1px solid var(--mb-border-card);
    border-radius: 8px;
    background: var(--surface);
    color: var(--brand-text);
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }
  .aht-open:hover {
    background: var(--mb-bg-warm);
  }
  .aht-open:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .aht-test {
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .aht-test-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--ink);
  }
  .aht-test-hint {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .aht-test-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .aht-input-wide {
    flex: 1 1 260px;
    width: auto;
  }
  .aht-test-btn {
    margin-top: 0;
    height: 40px;
  }
  .aht-test-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .aht-result {
    margin-top: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .aht-result .aht-warn {
    margin: 0;
  }
  .aht-result-line {
    margin: 0;
    font-size: 0.86rem;
    color: var(--ink);
  }
  .aht-result-list {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.86rem;
    line-height: 1.6;
    color: var(--ink);
  }
  .aht-excerpt {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-tint);
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--ink-muted);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 180px;
    overflow-y: auto;
  }
  .aht-seg {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: var(--mb-bg-tabs);
  }
  .aht-seg-btn {
    flex: 1;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
  }
  .aht-seg-on {
    background: var(--surface);
    color: var(--brand-text);
    box-shadow: 0 1px 3px rgb(var(--brand-rgb) / 0.25);
  }
  .aht-seg-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .aht-actions {
    position: sticky;
    bottom: -22px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin: 0 -22px -22px;
    padding: 0.85rem 22px 22px;
    border-top: 1px solid var(--line);
    background: #fff;
  }
  .aht-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--success-text);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .aht-save {
    padding: 0.6rem 1.3rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-family: inherit;
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
    transition:
      background 0.15s,
      transform 0.1s;
  }
  .aht-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .aht-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .aht-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }
  @media (max-width: 640px) {
    .aht-actions {
      justify-content: stretch;
      bottom: -14px;
      margin: 0 -16px -14px;
      padding: 0.85rem 16px 14px;
    }
    .aht-actions button {
      flex: 1 1 auto;
    }
  }
</style>
