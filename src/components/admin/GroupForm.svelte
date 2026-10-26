<script>
  /**
   * Création et modification d'un groupe d'utilisateurs : nom, description,
   * couleur, quota de minutes et droits. Même machine à états `saveState` que
   * UserForm.svelte.
   *
   * Les droits sont des interrupteurs, un par droit : ils s'additionnent d'un
   * groupe à l'autre (cf. services/api/lib/repositories/groups.js, `rightsOf`).
   * Un groupe neuf naît sans aucun droit : un droit se donne explicitement.
   *
   * La palette proposée est celle que l'API a renvoyée (`GET /admin/groups`),
   * jamais une liste écrite ici : c'est le serveur qui arbitre les slugs
   * valides, et une couleur affichée qu'il refuserait serait un formulaire qui
   * échoue à l'envoi. L'aperçu montre la puce telle qu'elle apparaîtra sur les
   * comptes : on choisit une couleur pour la reconnaître, autant la voir.
   */
  import { createEventDispatcher } from 'svelte';
  import IconBack from '~icons/solar/arrow-left-linear';
  import IconGallery from '~icons/solar/gallery-linear';
  import GroupChip from '../ui/GroupChip.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import { auth } from '../../stores/auth.js';
  import { createGroup, updateGroup } from '../../services/adminGroupsApi.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { groupColorVars } from '../../utils/groupColors.js';

  export let texts; // $uiText.adminGroups
  /** Slugs de couleur proposés — ceux que l'API a renvoyés. */
  export let palette = [];
  /** null = création */
  export let group = null;

  const dispatch = createEventDispatcher();

  let name = group?.name || '';
  let description = group?.description || '';
  let color = group?.color || palette[0] || 'slate';
  // Quota de minutes : « Illimité » (null) ou « Limité à N ». Le nombre reste
  // saisi quand on rebascule sur Illimité, pour ne pas le retaper.
  let quotaMode = Number.isInteger(group?.meetingMinutesPerMonth) ? 'limited' : 'unlimited';
  let quotaMinutes = Number.isInteger(group?.meetingMinutesPerMonth)
    ? group.meetingMinutesPerMonth
    : 120;
  let infographicAllowed = group?.infographicAllowed === true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'error'
  let errorMessage = '';

  $: isEdit = !!group;
  // Interrupteur général de l'onglet IA : coupé, le droit ne sert à rien tant
  // qu'il l'est. On le dit ici plutôt que de laisser l'administrateur chercher.
  $: infographicOffered = $auth.capabilities.infographic?.enabled === true;
  $: preview = { id: 'preview', name: name.trim() || texts.namePlaceholder.split(',')[0], color };
  $: quotaLimited = quotaMode === 'limited';
  $: previewQuota = quotaLimited
    ? fill(texts.quotaPill, {
        minutes: Number.isInteger(Number(quotaMinutes)) ? quotaMinutes : '…',
      })
    : texts.quotaPillUnlimited;

  /** Le curseur arrive dans le nom dès que le formulaire s'ouvre : on vient pour écrire. */
  function focusOnMount(node) {
    node.focus();
  }

  async function submit() {
    errorMessage = '';
    if (!name.trim()) {
      errorMessage = texts.errors.name_required;
      return;
    }
    // Champ vidé : Svelte lie `null`, que Number() lirait comme 0 — un quota
    // à zéro posé par mégarde interdirait tout démarrage au groupe.
    const blank = quotaMinutes === '' || quotaMinutes === null || quotaMinutes === undefined;
    const minutes = quotaLimited ? (blank ? Number.NaN : Number(quotaMinutes)) : null;
    if (quotaLimited && (!Number.isInteger(minutes) || minutes < 0)) {
      errorMessage = texts.errors.quota_required;
      return;
    }
    saveState = 'saving';
    const payload = {
      name: name.trim(),
      description: description.trim(),
      color,
      meetingMinutesPerMonth: minutes,
      infographicAllowed,
    };
    const res = isEdit
      ? await updateGroup({ id: group.id, ...payload })
      : await createGroup(payload);
    if (res.ok) {
      saveState = 'idle';
      dispatch('saved', { group: res.data.group, created: !isEdit });
      return;
    }
    saveState = 'error';
    const template = texts.errors[res.data.error] || texts.errors.unknown;
    errorMessage = fill(template, { max: res.data.max ?? '' });
  }
</script>

<div class="gf-wrap">
  <button type="button" class="gf-back" on:click={() => dispatch('cancel')}>
    <IconBack width="13" height="13" aria-hidden="true" />
    {texts.back}
  </button>
  <h3 class="gf-title">{isEdit ? texts.editTitle : texts.createTitle}</h3>

  <form class="gf-form" on:submit|preventDefault={submit}>
    <div class="gf-columns">
      <div class="gf-fields">
        <label class="gf-label" for="gf-name">{texts.nameLabel}</label>
        <input
          id="gf-name"
          class="gf-input"
          type="text"
          required
          maxlength="40"
          autocomplete="off"
          placeholder={texts.namePlaceholder}
          disabled={saveState === 'saving'}
          bind:value={name}
          use:focusOnMount
        />

        <label class="gf-label" for="gf-description">{texts.descriptionLabel}</label>
        <textarea
          id="gf-description"
          class="gf-input gf-textarea"
          rows="3"
          maxlength="200"
          placeholder={texts.descriptionPlaceholder}
          disabled={saveState === 'saving'}
          bind:value={description}
        ></textarea>

        <span class="gf-label" id="gf-color-label">{texts.colorLabel}</span>
        <div class="gf-swatches" role="radiogroup" aria-labelledby="gf-color-label">
          {#each palette as slug (slug)}
            <button
              type="button"
              class="gf-swatch"
              class:gf-swatch-on={color === slug}
              style="--sw: {groupColorVars(slug).dot}"
              role="radio"
              aria-checked={color === slug}
              aria-label={slug}
              disabled={saveState === 'saving'}
              on:click={() => (color = slug)}
            ></button>
          {/each}
        </div>

        <!-- Quota : deux choix, le nombre n'est saisissable qu'en limité. -->
        <fieldset class="gf-quota">
          <legend class="gf-label">{texts.quotaLabel}</legend>
          <label class="gf-radio" class:gf-radio-on={!quotaLimited}>
            <input
              type="radio"
              name="gf-quota"
              value="unlimited"
              bind:group={quotaMode}
              disabled={saveState === 'saving'}
            />
            <span>{texts.quotaUnlimited}</span>
          </label>
          <label class="gf-radio" class:gf-radio-on={quotaLimited}>
            <input
              type="radio"
              name="gf-quota"
              value="limited"
              bind:group={quotaMode}
              disabled={saveState === 'saving'}
            />
            <span>{texts.quotaLimited}</span>
            <input
              class="gf-input gf-quota-input"
              type="number"
              inputmode="numeric"
              min="0"
              max="100000"
              step="1"
              aria-label={texts.quotaMinutesLabel}
              disabled={!quotaLimited || saveState === 'saving'}
              bind:value={quotaMinutes}
              on:focus={() => (quotaMode = 'limited')}
            />
            <span class="gf-quota-unit">{texts.quotaUnit}</span>
          </label>
          <p class="gf-hint">{texts.quotaHint}</p>
        </fieldset>

        <!-- Droits : un interrupteur par droit, cumulatifs d'un groupe à l'autre. -->
        <fieldset class="gf-rights">
          <legend class="gf-label">{texts.rightsLabel}</legend>
          <div class="gf-right" class:gf-right-on={infographicAllowed}>
            <span class="gf-right-icon" aria-hidden="true">
              <IconGallery width="17" height="17" />
            </span>
            <span class="gf-right-text">
              <span class="gf-right-title">{texts.infographicLabel}</span>
              <span class="gf-right-hint">{texts.infographicHint}</span>
            </span>
            <ToggleSwitch
              bind:checked={infographicAllowed}
              label={texts.infographicLabel}
              disabled={saveState === 'saving'}
            />
          </div>
          {#if infographicAllowed && !infographicOffered}
            <p class="gf-hint gf-hint-warn">{texts.infographicGlobalOff}</p>
          {/if}
        </fieldset>
      </div>

      <!-- Aperçu : la puce telle qu'elle s'affichera sur les comptes et dans
           le menu de compte de chaque membre. -->
      <aside class="gf-preview" aria-live="polite">
        <span class="gf-preview-label">{texts.previewLabel}</span>
        <div class="gf-preview-card" style="--pv-soft: {groupColorVars(color).soft}">
          <GroupChip group={preview} large />
          {#if description.trim()}
            <p class="gf-preview-desc">{description.trim()}</p>
          {/if}
          <div class="gf-preview-pills">
            <span class="gf-preview-quota" class:gf-preview-quota-limited={quotaLimited}>
              {previewQuota}
            </span>
            {#if infographicAllowed}
              <span class="gf-preview-right">
                <IconGallery width="12" height="12" aria-hidden="true" />
                {texts.infographicPill}
              </span>
            {/if}
          </div>
        </div>
      </aside>
    </div>

    {#if errorMessage}
      <p class="gf-error" role="alert">{errorMessage}</p>
    {/if}

    <div class="gf-actions">
      <button
        type="button"
        class="gf-secondary"
        on:click={() => dispatch('cancel')}
        disabled={saveState === 'saving'}
      >
        {texts.cancel}
      </button>
      <button type="submit" class="gf-primary" disabled={saveState === 'saving'}>
        {saveState === 'saving' ? texts.saving : texts.save}
      </button>
    </div>
  </form>
</div>

<style>
  .gf-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .gf-back {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--brand-text);
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
    font-weight: 500;
    font-family: inherit;
  }
  .gf-back:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .gf-title {
    margin: 0.25rem 0 0.5rem;
    font-size: 1.05rem;
    color: var(--ink);
  }
  .gf-form {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .gf-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
    gap: 1.25rem;
    align-items: start;
  }
  .gf-fields {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }
  .gf-label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink-soft);
    margin-top: 0.5rem;
  }
  .gf-input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.95rem;
    background: var(--surface);
    color: var(--ink);
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .gf-textarea {
    resize: vertical;
    min-height: 74px;
    line-height: 1.5;
  }
  .gf-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .gf-input:disabled {
    background: var(--surface-tint);
    color: var(--ink-faint);
  }
  .gf-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 0.35rem 0;
  }
  .gf-swatch {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--sw);
    border: 2px solid transparent;
    box-shadow: 0 0 0 1px var(--line-strong);
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s;
  }
  .gf-swatch:hover:not(:disabled) {
    transform: scale(1.1);
  }
  .gf-swatch-on {
    border-color: var(--surface);
    box-shadow: 0 0 0 2px var(--ink);
  }
  .gf-preview {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }
  .gf-preview-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-faint);
  }
  .gf-preview-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: linear-gradient(180deg, var(--pv-soft), transparent 80%), var(--surface-tint);
  }
  .gf-preview-desc {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .gf-preview-quota {
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--ink-faint);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .gf-preview-quota-limited {
    color: var(--brand-text);
    font-weight: 600;
    background: var(--brand-secondary-soft-08);
    border-color: var(--brand-secondary-soft-18);
  }
  .gf-preview-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .gf-preview-right {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--success-text);
    background: var(--success-bg);
    border: 1px solid var(--success-line);
  }

  /* ── Droits ── */
  .gf-rights {
    margin: 0.5rem 0 0;
    padding: 0;
    border: none;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .gf-rights legend {
    padding: 0;
    margin-bottom: 0.2rem;
  }
  .gf-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  /* Activée, la ligne parle le langage du choix retenu du quota. */
  .gf-right-on {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
  }
  .gf-right-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--surface-tint);
    color: var(--ink-muted);
  }
  .gf-right-on .gf-right-icon {
    background: var(--brand-secondary-soft-15);
    color: var(--brand-text-strong);
  }
  .gf-right-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .gf-right-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ink);
  }
  .gf-right-hint {
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--ink-faint);
  }
  .gf-rights .gf-hint-warn {
    color: var(--brand-text);
    font-weight: 500;
  }

  /* ── Quota ── */
  .gf-quota {
    margin: 0.5rem 0 0;
    padding: 0;
    border: none;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .gf-quota legend {
    padding: 0;
    margin-bottom: 0.2rem;
  }
  .gf-radio {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    font-size: 0.9rem;
    color: var(--ink-soft);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .gf-radio-on {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
    color: var(--ink);
  }
  .gf-radio input[type='radio'] {
    accent-color: var(--brand);
    margin: 0;
  }
  .gf-quota-input {
    width: 7rem;
    padding: 0.4rem 0.6rem;
    font-variant-numeric: tabular-nums;
  }
  .gf-quota-unit {
    font-size: 0.82rem;
    color: var(--ink-muted);
  }
  .gf-hint {
    margin: 0.15rem 0 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--ink-faint);
  }
  .gf-error {
    margin: 0.5rem 0 0;
    color: var(--danger-text);
    font-size: 0.88rem;
  }
  .gf-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .gf-primary {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
    transition: background 0.15s;
  }
  .gf-primary:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .gf-primary:disabled {
    opacity: 0.6;
    cursor: default;
    box-shadow: none;
  }
  .gf-secondary {
    padding: 0.6rem 1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .gf-secondary:hover:not(:disabled) {
    background: var(--surface-tint);
  }
  @media (max-width: 640px) {
    .gf-columns {
      grid-template-columns: 1fr;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .gf-swatch {
      transition: none;
    }
  }
</style>
