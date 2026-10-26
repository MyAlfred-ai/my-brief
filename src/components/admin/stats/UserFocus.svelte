<script>
  /**
   * En-tête de la page centrée sur UN compte (filtre « Utilisateur ») : qui,
   * ses groupes, son statut d'adoption, sa dernière connexion — et le retour à
   * toute l'équipe. Tout ce qui suit (indicateurs, courbes, dépenses) se lit
   * alors pour cette personne seule.
   *
   * Des volumes et des dates, jamais un titre ni un contenu de réunion : c'est
   * la règle de tout l'écran.
   */
  import { createEventDispatcher } from 'svelte';
  import IconBack from '~icons/solar/arrow-left-linear';
  import GroupChip from '../../ui/GroupChip.svelte';
  import { fill } from '../../../utils/i18nFormat.js';
  import { formatDate } from './format.js';
  import { ADOPTION_COLORS, accountName } from './statsView.js';

  /** Ligne du compte (`accounts[0]`), ou à défaut l'option du filtre `{email, name}`. */
  export let account;
  export let texts;
  export let lang = 'fr';

  const dispatch = createEventDispatcher();

  $: name = accountName(account);
  $: initials = name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
</script>

<section class="uf">
  <span class="uf-avatar" aria-hidden="true">{initials}</span>
  <div class="uf-who">
    <span class="uf-kicker">{texts.focusKicker}</span>
    <h3 class="uf-name">{name}</h3>
    {#if account.name}<span class="uf-mail">{account.email}</span>{/if}
    <div class="uf-facts">
      {#if account.status}
        <span class="uf-status">
          <span class="uf-dot" style="background: {ADOPTION_COLORS[account.status]}"></span>
          {texts.statusLabels[account.status]}
        </span>
      {/if}
      {#each account.groups || [] as group (group.id)}<GroupChip {group} />{/each}
      {#if account.disabled}<span class="uf-badge">{texts.disabledBadge}</span>{/if}
    </div>
    <p class="uf-dates">
      {#if account.createdAt}<span
          >{fill(texts.focusCreated, { date: formatDate(account.createdAt, lang) })}</span
        >{/if}
      {#if account.lastSeenAt}
        <span>{fill(texts.focusLastSeen, { date: formatDate(account.lastSeenAt, lang) })}</span>
      {:else if account.status}
        <span>{texts.focusNeverSeen}</span>
      {/if}
    </p>
  </div>
  <button type="button" class="uf-back" on:click={() => dispatch('back')}>
    <IconBack width="14" height="14" aria-hidden="true" />
    {texts.focusBack}
  </button>
</section>

<style>
  .uf {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--brand-secondary-soft-18);
    border-radius: 12px;
    background: linear-gradient(150deg, var(--brand-secondary-soft-12), var(--surface) 70%);
  }
  .uf-avatar {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--brand-secondary-soft-18);
    color: var(--brand-text);
    font-size: 1.05rem;
    font-weight: 700;
  }
  .uf-who {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .uf-kicker {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .uf-name {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 650;
    letter-spacing: -0.015em;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .uf-mail {
    font-size: 0.8rem;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .uf-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.35rem;
  }
  .uf-status {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.12rem 0.55rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .uf-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .uf-badge {
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface-tint);
    color: var(--ink-faint);
    font-size: 0.7rem;
    font-weight: 600;
  }
  .uf-dates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.9rem;
    margin: 0.3rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-faint);
  }
  .uf-back {
    flex: 0 0 auto;
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.42rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .uf-back:hover {
    background: var(--surface-tint);
  }

  @media (max-width: 640px) {
    .uf {
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .uf-avatar {
      width: 42px;
      height: 42px;
      font-size: 0.9rem;
    }
    .uf-who {
      flex-basis: calc(100% - 60px);
    }
    .uf-back {
      width: 100%;
      justify-content: center;
    }
  }
</style>
