<script>
  /**
   * Carte « Corrections automatiques de la transcription » de l'onglet
   * Configuration, juste sous le vocabulaire de l'organisation : les mots que
   * la transcription écrit mal à chaque fois (« Klobex »), et ce qu'il faut
   * écrire à la place (« Globex »). Moteur : utils/transcriptCorrections.js.
   *
   * Écrite pour un administrateur qui n'est pas technicien :
   *  - la portée est dite EN TÊTE, dans un encadré — toutes les réunions, tous
   *    les comptes — avec l'invitation à la modération ;
   *  - une ligne = deux champs et une flèche, sans syntaxe : les variantes se
   *    séparent par des virgules, la casse et les accents ne comptent pas ;
   *  - chaque ligne dit ce qui ne va pas sous elle (erreur qui bloque
   *    l'enregistrement, ou avertissement — mot courant, mot très court) ;
   *  - « Essayer » applique les lignes TELLES QUE SAISIES, avec le moteur même
   *    de la transcription : ce qu'on voit est ce qui se passera.
   *
   * Présentationnelle : le parent (BrandingTab) charge la liste, la compare à
   * l'enregistrée et l'envoie avec le bouton unique de la page (`bind:rows`).
   */
  import { tick } from 'svelte';
  import IconPen from '~icons/solar/pen-new-square-linear';
  import IconArrow from '~icons/solar/arrow-right-linear';
  import IconTrash from '~icons/solar/trash-bin-minimalistic-linear';
  import IconAdd from '~icons/solar/add-circle-linear';
  import IconUsers from '~icons/solar/users-group-rounded-linear';
  import IconWarn from '~icons/solar/danger-triangle-linear';
  import IconWand from '~icons/solar/magic-stick-3-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import {
    CORRECTIONS_MAX,
    FROM_FIELD_MAX,
    REPLACEMENT_MAX,
    checkRows,
    compileCorrections,
    newRowId,
    rowsToRules,
  } from '../../utils/transcriptCorrections.js';
  import { uiText } from '../../store.js';

  /** Lignes éditées : `[{ id, from: 'Klobex, Clobex', to: 'Globex' }]`. */
  export let rows = [];
  /** Nombre de corrections ENREGISTRÉES — allume le liseré de la carte. */
  export let savedCount = 0;
  export let updatedBy = null;

  let listEl;
  let trial = '';

  $: T = $uiText.adminTranscriptCorrections;
  // Déclarations réactives, jamais des appels dans le gabarit : Svelte ne suit
  // que les identifiants qu'il voit (piège payé quatre fois dans ce dépôt).
  $: verdicts = checkRows(rows);
  $: rules = rowsToRules(rows);
  $: compiled = compileCorrections(rules);
  $: parts = trial.trim() ? compiled.parts(trial) : [];
  $: changed = parts.some((p) => p.changed);
  $: full = rows.length >= CORRECTIONS_MAX;
  $: badge =
    rules.length === 0
      ? T.badgeEmpty
      : rules.length === 1
        ? T.badgeOne
        : T.badgeMany.replace('{n}', String(rules.length));
  $: counter = T.counter.replace('{n}', String(rows.length)).replace('{max}', CORRECTIONS_MAX);

  function message(verdict) {
    const pool = verdict.level === 'error' ? T.errors : T.warnings;
    return (pool[verdict.code] || '').replace('{term}', verdict.term);
  }

  const rowLabel = (i) => T.rowLabel.replace('{n}', String(i + 1));

  async function add() {
    if (full) return;
    const row = { id: newRowId(), from: '', to: '' };
    rows = [...rows, row];
    await tick();
    listEl?.querySelector(`[data-from="${row.id}"]`)?.focus();
  }

  function remove(id) {
    rows = rows.filter((r) => r.id !== id);
  }
</script>

<SettingsCard title={T.title} hint={T.intro} icon={IconPen} on={savedCount > 0}>
  <StatusBadge slot="badge" tone={rules.length ? 'ok' : 'neutral'} text={badge} />

  <!-- La portée d'abord : c'est elle qui demande la modération. -->
  <div class="tc-scope" role="note">
    <span class="tc-scope-icon" aria-hidden="true"><IconUsers width="18" height="18" /></span>
    <p><strong>{T.scopeTitle}</strong> {T.scopeText}</p>
  </div>

  {#if rows.length === 0}
    <div class="tc-empty">
      <p class="tc-empty-title">{T.emptyTitle}</p>
      <p class="tc-empty-text">{T.emptyText}</p>
      <p class="tc-example" aria-hidden="true">
        <span class="tc-chip tc-chip-from">{T.emptyFrom}</span>
        <IconArrow width="15" height="15" />
        <span class="tc-chip tc-chip-to">{T.emptyTo}</span>
      </p>
      <button type="button" class="tc-add" on:click={add}>
        <IconAdd width="17" height="17" aria-hidden="true" />
        {T.add}
      </button>
    </div>
  {:else}
    <div class="tc-list" bind:this={listEl}>
      <div class="tc-head" aria-hidden="true">
        <span>{T.fromHeader}</span>
        <span></span>
        <span>{T.toHeader}</span>
      </div>
      {#each rows as row, i (row.id)}
        {@const verdict = verdicts[i]}
        <div
          class="tc-row"
          class:tc-row-error={verdict?.level === 'error'}
          role="group"
          aria-label={rowLabel(i)}
        >
          <div class="tc-cell tc-cell-from">
            <label class="tc-mini" for="tc-from-{row.id}">{T.fromHeader}</label>
            <input
              id="tc-from-{row.id}"
              data-from={row.id}
              class="tc-input"
              type="text"
              maxlength={FROM_FIELD_MAX}
              placeholder={T.fromPlaceholder}
              autocomplete="off"
              spellcheck="false"
              aria-invalid={verdict?.level === 'error' && verdict.code !== 'missingTo'}
              aria-describedby={verdict ? `tc-msg-${row.id}` : undefined}
              bind:value={row.from}
            />
          </div>
          <span class="tc-arrow" aria-hidden="true"><IconArrow width="16" height="16" /></span>
          <div class="tc-cell tc-cell-to">
            <label class="tc-mini" for="tc-to-{row.id}">{T.toHeader}</label>
            <input
              id="tc-to-{row.id}"
              class="tc-input tc-input-to"
              type="text"
              maxlength={REPLACEMENT_MAX}
              placeholder={T.toPlaceholder}
              autocomplete="off"
              spellcheck="false"
              aria-invalid={verdict?.code === 'missingTo'}
              aria-describedby={verdict ? `tc-msg-${row.id}` : undefined}
              bind:value={row.to}
            />
          </div>
          <button
            type="button"
            class="tc-remove"
            title={T.remove}
            aria-label="{T.remove} — {rowLabel(i)}"
            on:click={() => remove(row.id)}
          >
            <IconTrash width="17" height="17" aria-hidden="true" />
          </button>
          {#if verdict}
            <p id="tc-msg-{row.id}" class="tc-msg tc-msg-{verdict.level}">
              <IconWarn width="14" height="14" aria-hidden="true" />
              <span>{message(verdict)}</span>
            </p>
          {/if}
        </div>
      {/each}
    </div>

    <div class="tc-foot">
      <button type="button" class="tc-add" on:click={add} disabled={full}>
        <IconAdd width="17" height="17" aria-hidden="true" />
        {T.add}
      </button>
      <span class="tc-counter" class:tc-counter-max={full}>{counter}</span>
    </div>
    {#if full}
      <p class="tc-hint tc-hint-strong">
        {T.limitReached.replace('{max}', String(CORRECTIONS_MAX))}
      </p>
    {/if}
    <p class="tc-hint">{T.rules}</p>

    {#if compiled.size}
      <div class="tc-try">
        <div class="tc-try-head">
          <IconWand width="16" height="16" aria-hidden="true" />
          <label class="tc-try-title" for="tc-try-input">{T.tryTitle}</label>
          <span class="tc-try-hint">{T.tryHint}</span>
        </div>
        <input
          id="tc-try-input"
          class="tc-input"
          type="text"
          aria-label={T.tryLabel}
          placeholder={T.tryPlaceholder}
          autocomplete="off"
          bind:value={trial}
        />
        {#if trial.trim()}
          <p class="tc-try-out" aria-live="polite">
            {#if changed}
              <span class="tc-try-label">{T.tryResult}</span>
              <span class="tc-try-text"
                >{#each parts as part}{#if part.changed}<mark class="tc-mark">{part.text}</mark
                    >{:else}{part.text}{/if}{/each}</span
              >
            {:else}
              <span class="tc-try-none">{T.tryNoChange}</span>
            {/if}
          </p>
        {/if}
      </div>
    {/if}
    <p class="tc-hint">{T.futureOnly}</p>
  {/if}

  {#if updatedBy}
    <p class="tc-meta">{T.updatedBy} {updatedBy}</p>
  {/if}
</SettingsCard>

<style>
  /* ── Portée : toutes les réunions, tous les comptes ── */
  .tc-scope {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem 0.85rem;
    border-radius: 9px;
    background: var(--warn-bg);
    border: 1px solid var(--warn-line);
    color: var(--warn-text);
  }
  .tc-scope-icon {
    flex: 0 0 auto;
    display: inline-flex;
    margin-top: 0.05rem;
  }
  .tc-scope p {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.5;
  }
  .tc-scope strong {
    font-weight: 650;
  }

  /* ── Liste vide ── */
  .tc-empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.45rem;
    padding: 1rem 1.1rem;
    border: 1px dashed var(--line-strong);
    border-radius: 10px;
    background: var(--surface);
  }
  .tc-empty-title {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ink);
  }
  .tc-empty-text {
    margin: 0;
    font-size: 0.84rem;
    color: var(--ink-muted);
    line-height: 1.45;
  }
  .tc-example {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.15rem 0 0.35rem;
    color: var(--ink-faint);
  }
  .tc-chip {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 500;
  }
  .tc-chip-from {
    background: var(--line);
    color: var(--ink-muted);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
  }
  .tc-chip-to {
    background: rgb(var(--brand-rgb) / 0.14);
    color: var(--brand-text-strong);
    font-weight: 600;
  }

  /* ── Lignes ── */
  /* Largeur du bouton « retirer », partagée par l'en-tête et les lignes : les
     colonnes restent alignées quand le tactile l'agrandit. */
  .tc-list {
    --tc-remove: 38px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tc-head,
  .tc-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr) var(--tc-remove);
    grid-template-areas: 'from arrow to remove';
    column-gap: 0.5rem;
    align-items: center;
  }
  .tc-head {
    padding: 0 0.1rem;
  }
  .tc-head span {
    font-size: 0.74rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tc-row {
    row-gap: 0.3rem;
    grid-template-areas:
      'from arrow to remove'
      'msg msg msg msg';
  }
  .tc-cell-from {
    grid-area: from;
  }
  .tc-cell-to {
    grid-area: to;
  }
  .tc-arrow {
    grid-area: arrow;
    display: inline-flex;
    justify-content: center;
    color: var(--brand-text);
  }
  .tc-remove {
    grid-area: remove;
  }
  .tc-msg {
    grid-area: msg;
  }
  /* Libellé par champ : masqué sur ordinateur (l'en-tête de colonnes le dit),
     visible sur téléphone où les colonnes s'empilent. Reste un vrai <label>. */
  .tc-mini {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .tc-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: #1a1a1a;
    font: inherit;
    font-size: 0.9rem;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .tc-input::placeholder {
    color: var(--ink-faint);
  }
  .tc-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  /* Le mot juste est la valeur qui fait foi : il se lit en premier. */
  .tc-input-to {
    font-weight: 600;
  }
  .tc-input[aria-invalid='true'] {
    border-color: var(--danger-line);
  }

  .tc-remove {
    width: var(--tc-remove);
    height: var(--tc-remove);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--ink-faint);
    cursor: pointer;
    transition:
      color 0.15s,
      background 0.15s,
      border-color 0.15s;
  }
  .tc-remove:hover,
  .tc-remove:focus-visible {
    color: var(--danger-text);
    background: var(--danger-bg);
    border-color: var(--danger-line);
    outline: none;
  }

  .tc-msg {
    display: flex;
    align-items: flex-start;
    gap: 0.35rem;
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .tc-msg :global(svg) {
    flex: 0 0 auto;
    margin-top: 0.12rem;
  }
  .tc-msg-error {
    color: var(--danger-text);
  }
  .tc-msg-warn {
    color: var(--warn-text);
  }

  /* ── Ajouter ── */
  .tc-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .tc-add {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border: 1px dashed rgb(var(--brand-rgb) / 0.55);
    border-radius: 8px;
    background: rgb(var(--brand-rgb) / 0.05);
    color: var(--brand-text);
    font-family: inherit;
    font-size: 0.87rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .tc-add:hover:not(:disabled) {
    background: rgb(var(--brand-rgb) / 0.1);
    border-color: var(--brand);
  }
  .tc-add:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .tc-counter {
    font-size: 0.76rem;
    color: var(--ink-faint);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .tc-counter-max {
    color: var(--danger-text);
    font-weight: 600;
  }

  .tc-hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .tc-hint-strong {
    color: var(--warn-text);
  }
  .tc-meta {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }

  /* ── Essayer ── */
  .tc-try {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.8rem 0.9rem;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .tc-try-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 0.45rem;
    color: var(--brand-text);
  }
  .tc-try-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink);
  }
  .tc-try-hint {
    font-size: 0.8rem;
    color: var(--ink-faint);
  }
  .tc-try-out {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.25rem 0.55rem;
    margin: 0;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    background: var(--surface-tint);
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--ink);
  }
  .tc-try-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-faint);
  }
  .tc-try-text {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  /* Fond débordant par box-shadow plutôt que par padding : le surlignage
     n'écarte pas la ponctuation qui suit (« l'ADV, » et non « l'ADV , »). */
  .tc-mark {
    padding: 0.05rem 0;
    border-radius: 3px;
    box-shadow: 0 0 0 0.14rem rgb(var(--brand-rgb) / 0.16);
    background: rgb(var(--brand-rgb) / 0.16);
    color: var(--brand-text-strong);
    font-weight: 600;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .tc-try-none {
    color: var(--ink-muted);
    font-size: 0.85rem;
  }

  /* ── Téléphone : les deux champs s'empilent, chacun sous son libellé ── */
  @media (max-width: 640px) {
    .tc-head {
      display: none;
    }
    .tc-list {
      gap: 0.6rem;
    }
    .tc-row {
      grid-template-columns: minmax(0, 1fr) var(--tc-remove);
      grid-template-areas:
        'from remove'
        'to to'
        'msg msg';
      row-gap: 0.45rem;
      padding: 0.7rem 0.75rem;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface);
    }
    .tc-row-error {
      border-color: var(--danger-line);
    }
    .tc-arrow {
      display: none;
    }
    .tc-mini {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .tc-remove {
      align-self: end;
    }
    .tc-foot {
      flex-wrap: wrap;
    }
  }

  @media (pointer: coarse) {
    .tc-list {
      --tc-remove: 44px;
    }
    .tc-add {
      min-height: 44px;
    }
  }
</style>
