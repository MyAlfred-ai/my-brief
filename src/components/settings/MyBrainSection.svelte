<script>
  /**
   * Section « MyBrain » de « Ma configuration » : envoyer ses réunions au
   * cerveau partagé de l'organisation — ou non — et voir ce qui est parti.
   *
   * Le choix n'appartient à l'utilisateur que si l'administration le lui
   * laisse. Imposé, l'interrupteur reste visible, allumé et verrouillé, avec la
   * raison : un envoi que personne ne voit serait une surprise, pas un réglage.
   * La section n'existe pas du tout là où myBrain n'est pas branché
   * (config/configSections.js).
   *
   * L'interrupteur s'enregistre à l'instant, comme ceux de « Mes tags » : un
   * seul réglage, pas de barre d'enregistrement.
   *
   * « Derniers envois » dit si ça part vraiment — c'est la seule trace, côté
   * myBrief, d'un envoi fait en tâche de fond. Une réunion en échec se
   * « Réessaye » ici ; une réunion peut-être arrivée (délai dépassé) le dit
   * avant, pour qu'on vérifie la revue de myBrain plutôt que d'y créer un
   * doublon.
   */
  import { onMount } from 'svelte';
  import IconBrain from '../icons/BrainIcon.svelte';
  import IconHistory from '~icons/solar/history-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import {
    myBrain,
    refreshMyBrain,
    setMyBrainEnabled,
    retryMyBrain,
  } from '../../stores/myBrain.js';
  import { resolveHistoryTitle } from '../../utils/historyTitle.js';
  import { uiText, currentLanguageStore } from '../../store.js';

  let loading = true;
  let errorMessage = '';
  /** Valeur en cours d'enregistrement ; null = l'interrupteur suit le serveur. */
  let pending = null;
  let retrying = '';
  let retried = '';

  $: texts = $uiText.configMyBrain;
  $: forced = $myBrain.policy === 'forced';
  $: saving = pending !== null;
  // Liaison à SENS UNIQUE, surtout pas `bind:checked` : une variable liée ET
  // assignée par une déclaration réactive est ramenée à sa source par Svelte —
  // et un vrai clic laisse passer une microtâche entre les deux écouteurs de
  // la case. Mesuré dans le navigateur : la case se rallumait avant d'être lue,
  // et l'envoi restait activé quoi qu'on fasse. (jsdom ne le montre pas : ses
  // événements synthétiques n'ont pas de microtâche entre écouteurs.)
  $: enabled = pending ?? (forced || $myBrain.enabled);
  $: badge = forced
    ? { tone: 'ok', text: texts.statusForced }
    : $myBrain.active
      ? { tone: 'ok', text: texts.statusOn }
      : { tone: 'neutral', text: texts.statusOff };
  $: locale = $currentLanguageStore === 'en' ? 'en-GB' : 'fr-FR';
  // Tout ce que la ligne affiche est composé ICI, dépendances en vue : une
  // phrase assemblée dans le gabarit perdait ses espaces aux bords d'un {#if}.
  $: rows = $myBrain.recent.map((item) => toRow(item, texts, locale, $currentLanguageStore));

  onMount(async () => {
    const res = await refreshMyBrain();
    loading = false;
    if (!res.ok) errorMessage = messageFor(res.error);
  });

  function messageFor(slug) {
    return texts.errors[slug] || texts.errors.unknown;
  }

  function formatDate(value, loc) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' });
  }

  function toRow(item, t, loc, lang) {
    const when = formatDate(item.sentAt || item.updatedAt, loc);
    let meta = when ? t.triedOn.replace('{date}', when) : '';
    if (item.status === 'sent') {
      meta = t.sentOn.replace('{date}', when);
      if (item.parts > 1) meta += ` — ${t.parts.replace('{n}', String(item.parts))}`;
    }
    const tone = item.status === 'sent' ? 'ok' : item.status === 'error' ? 'warn' : 'neutral';
    const badge =
      item.status === 'sent'
        ? t.statusSent
        : item.status === 'error'
          ? t.statusError
          : t.statusSending;
    // La cause, puis ce qu'il faut en attendre : vérifier avant de réessayer
    // (peut-être arrivée), ou laisser faire la relance automatique.
    // `ambiguous` vient du serveur : la requête est partie et la réponse s'est
    // perdue (cf. services/api/lib/myBrain/client.js).
    const next = item.ambiguous ? t.ambiguous : item.retryable ? t.autoRetry : '';
    const cause = t.errors[item.error] || t.errors.unknown;
    const problem = item.status === 'error' ? [cause, next].filter(Boolean).join(' ') : '';
    return { ...item, label: resolveHistoryTitle(item, lang), meta, tone, badge, problem };
  }

  async function toggle(event) {
    // La case elle-même fait foi.
    const next = !!event.target?.checked;
    pending = next;
    errorMessage = '';
    const res = await setMyBrainEnabled(next);
    // En échec, l'interrupteur retombe sur l'état du serveur : l'envoi n'a
    // pas changé. Passer par `pending` fait bouger la valeur transmise, donc
    // la case — une valeur restée identique ne serait pas repoussée.
    pending = null;
    if (!res.ok) errorMessage = messageFor(res.error);
  }

  async function retry(meetingId) {
    retrying = meetingId;
    retried = '';
    errorMessage = '';
    const res = await retryMyBrain(meetingId);
    retrying = '';
    if (!res.ok) {
      errorMessage = messageFor(res.error);
      return;
    }
    retried = meetingId;
  }
</script>

<div class="mb-wrap">
  {#if loading && !$myBrain.loaded}
    <div class="mb-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorMessage}
      <div class="mb-error" role="alert">{errorMessage}</div>
    {/if}

    <p class="mb-intro">{texts.intro}</p>

    <SettingsCard
      title={texts.toggleTitle}
      hint={texts.toggleHint}
      icon={IconBrain}
      on={$myBrain.active}
    >
      <StatusBadge slot="badge" tone={badge.tone} text={badge.text} />

      <div class="mb-row">
        <label class="mb-row-label" for="mb-enabled">{texts.toggleLabel}</label>
        <ToggleSwitch
          id="mb-enabled"
          checked={enabled}
          label={texts.toggleLabel}
          disabled={forced || saving || !$myBrain.available}
          on:change={toggle}
        />
      </div>
      {#if forced}
        <p class="mb-note">{texts.forcedNote}</p>
      {/if}

      <div class="mb-field">
        <span class="mb-label">{texts.contentTitle}</span>
        <ul class="mb-list">
          {#each texts.contentItems as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      </div>
      <p class="mb-hint">{texts.reviewNote} {texts.notRetroactive}</p>
      {#if $myBrain.reviewUrl}
        <a class="mb-link" href={$myBrain.reviewUrl} target="_blank" rel="noopener noreferrer">
          {texts.openReview}
        </a>
      {/if}
    </SettingsCard>

    <SettingsCard title={texts.recentTitle} hint={texts.recentHint} icon={IconHistory}>
      {#if rows.length === 0}
        <p class="mb-hint">{texts.recentEmpty}</p>
      {:else}
        <ul class="mb-sends">
          {#each rows as row (row.meetingId)}
            <li class="mb-send">
              <div class="mb-send-head">
                <span class="mb-send-title">{row.label}</span>
                <StatusBadge tone={row.tone} text={row.badge} />
              </div>
              {#if row.meta}
                <p class="mb-send-meta">{row.meta}</p>
              {/if}
              {#if row.status === 'sent' && row.recipientUnknown}
                <p class="mb-send-note">{texts.recipientUnknown}</p>
              {/if}
              {#if row.status === 'error'}
                <p class="mb-send-note mb-send-warn">{row.problem}</p>
                <div class="mb-send-actions">
                  <button
                    type="button"
                    class="mb-ghost"
                    on:click={() => retry(row.meetingId)}
                    disabled={!!retrying || !$myBrain.active}
                  >
                    {retrying === row.meetingId ? texts.retrying : texts.retry}
                  </button>
                </div>
              {:else if retried === row.meetingId && row.status === 'sent'}
                <p class="mb-ok">
                  <IconCheck width="15" height="15" aria-hidden="true" />
                  {texts.retried}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </SettingsCard>
  {/if}
</div>

<style>
  .mb-wrap {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .mb-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .mb-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .mb-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .mb-row-label {
    font-size: 0.9rem;
    color: var(--ink);
  }
  .mb-note {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px dashed var(--line-strong);
    font-size: 0.82rem;
    color: var(--ink-soft);
    line-height: 1.55;
  }
  .mb-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .mb-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .mb-list {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.86rem;
    color: var(--ink-soft);
    line-height: 1.6;
  }
  .mb-hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .mb-link {
    align-self: flex-start;
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--brand-text);
    text-decoration: none;
  }
  .mb-link:hover {
    text-decoration: underline;
  }

  .mb-sends {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .mb-send {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .mb-send-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .mb-send-title {
    min-width: 0;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mb-send-meta,
  .mb-send-note {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .mb-send-warn {
    color: var(--warn-text);
  }
  .mb-send-actions {
    display: flex;
    justify-content: flex-end;
  }
  .mb-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0;
    color: oklch(48% 0.12 150);
    font-size: 0.82rem;
    font-weight: 500;
  }
  .mb-ghost {
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.84rem;
    transition: background 0.15s;
  }
  .mb-ghost:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .mb-ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .mb-skeleton {
    height: 160px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: mb-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes mb-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mb-skeleton {
      animation: none;
    }
  }
</style>
