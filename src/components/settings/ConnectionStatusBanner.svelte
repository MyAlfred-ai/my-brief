<script>
  /**
   * État du compte relié, en tête de l'onglet Actions.
   *
   * Il répond à la question que l'écran ne posait nulle part : « d'où partent
   * mes mails, et où se déposent mes fichiers ? ». Avant, le seul signal d'un
   * compte non relié était l'échec du bouton Tester — c'est-à-dire après avoir
   * configuré des destinataires qui ne pouvaient pas servir.
   *
   * Trois états à ne pas confondre, et c'est tout l'intérêt de `driveReady` :
   *   - non relié           → « reliez »
   *   - relié sans le Drive → « RECONNECTEZ » (connexion faite avant que
   *                            l'accès au Drive existe : re-cliquer sur
   *                            « relier » ne dirait pas que c'est le même
   *                            geste avec un consentement de plus)
   *   - relié avec le Drive → rien à faire
   *
   * Fonction pure de ses props : le statut et le geste de connexion sont
   * possédés par le panneau parent, qui les tient déjà pour l'onglet « Envoi par
   * mail » — un second appel à /connect/status ferait deux sources de vérité.
   */
  import GoogleLogo from '../icons/GoogleLogo.svelte';
  import MicrosoftLogo from '../icons/MicrosoftLogo.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import { isNative } from '../../platform/index.js';
  import { formatText } from '../../utils/i18nFormat.js';
  import { storageLabel } from '../../utils/storageVocabulary.js';

  /** Payload de GET /api/connect/status, ou null tant qu'il n'a pas répondu. */
  export let status = null;
  export let loading = false;
  export let ceiling = { email: false, storage: false };
  /** Dictionnaire `configActions`. */
  export let texts = {};
  /** Racine de `uiText`, pour l'interpolation des libellés. */
  export let dict = {};
  export let onConnect = () => {};

  $: provider = status?.provider || null;
  $: logo = provider?.id === 'microsoft' ? MicrosoftLogo : GoogleLogo;
  $: connected = !!provider?.connected;
  /** Le dépôt manque à une connexion héritée « mail seulement ». */
  $: driveMissing = connected && !provider?.driveReady && !!ceiling.storage;
  $: badge = !connected
    ? { tone: 'neutral', text: texts.notConnectedBadge }
    : driveMissing
      ? { tone: 'warn', text: texts.driveMissingBadge }
      : { tone: 'ok', text: texts.connectedBadge };

  function label(key, vars) {
    return formatText(dict, `configActions.${key}`, vars);
  }
</script>

{#if loading}
  <div class="csb-skeleton" aria-hidden="true"></div>
{:else if provider}
  <section class="csb" class:csb-on={connected && !driveMissing}>
    <header class="csb-head">
      <span class="csb-logo" aria-hidden="true"><svelte:component this={logo} size={20} /></span>
      <div class="csb-title">
        <h4>{label('connectTitle', { provider: provider.label })}</h4>
        <!-- « votre OneDrive » à un compte Microsoft, « votre Google Drive » à
             un compte Google : le bandeau nomme l'espace du fournisseur retenu. -->
        <p class="csb-hint">
          {connected
            ? label('connectedHint', { account: provider.account })
            : label('notConnectedHint', { drive: storageLabel(provider.id) })}
        </p>
      </div>
      <StatusBadge tone={badge.tone} text={badge.text} />
    </header>

    {#if !provider.available}
      <p class="csb-note csb-warn">{label('connectUnavailable', { provider: provider.label })}</p>
    {:else if driveMissing}
      <p class="csb-note csb-warn">{texts.reconnectWhy}</p>
      {#if isNative}
        <p class="csb-note">{texts.connectDesktopOnly}</p>
      {:else}
        <button type="button" class="csb-cta" on:click={onConnect}>
          <svelte:component this={logo} size={16} />
          {texts.reconnectCta}
        </button>
      {/if}
    {:else if !connected}
      {#if isNative}
        <!-- Le flux OAuth est une navigation top-level vers l'API : en WebView
             elle ne porte ni cookie de session ni jeton Bearer. Afficher le
             bouton promettrait une connexion impossible. -->
        <p class="csb-note csb-warn">{texts.connectDesktopOnly}</p>
      {:else}
        <button type="button" class="csb-cta" on:click={onConnect}>
          <svelte:component this={logo} size={16} />
          {label('connectCta', { provider: provider.label })}
        </button>
      {/if}
      {#if ceiling.email && status.smtpAvailable}
        <p class="csb-note">{texts.connectSmtpFallback}</p>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .csb {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }
  .csb-on {
    border-color: var(--success-line);
  }
  .csb-head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .csb-logo {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: var(--surface-tint);
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .csb-title {
    flex: 1 1 200px;
    min-width: 0;
  }
  .csb-title h4 {
    margin: 0 0 0.15rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
  }
  .csb-hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .csb-note {
    margin: 0;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    background: var(--surface-tint);
    border: 1px dashed var(--line);
    font-size: 0.8rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .csb-warn {
    background: var(--warn-bg);
    border-style: solid;
    border-color: var(--warn-line);
    color: var(--warn-text);
  }
  .csb-cta {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .csb-cta:hover {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft-12);
  }
  .csb-skeleton {
    height: 84px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: csb-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes csb-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .csb-skeleton {
      animation: none;
    }
  }
</style>
