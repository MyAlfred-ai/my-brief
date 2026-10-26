<script>
  /**
   * Approbation avant qu'un compte rendu ne parte sur un espace partagé.
   *
   * Montée à la racine et pilotée par `stores/storeApproval.js` : elle n'a ni
   * prop ni appelant direct. Ce qu'elle affiche est le plan RÉSOLU PAR LE
   * SERVEUR — dossier, bibliothèque, tag, nom de fichier — et non ce que le
   * client suppose.
   *
   * Le verrou est côté serveur (`approval_required`, 409) : cette boîte est
   * l'endroit où l'on décide, pas ce qui empêche.
   */
  import IconFolder from '~icons/solar/folder-path-connect-linear';
  import StorageLogo from '../icons/StorageLogo.svelte';
  import { pendingApproval, answerStoreApproval } from '../../stores/storeApproval.js';
  import { uiText } from '../../store.js';
  import { libraryKind } from '../../utils/storageVocabulary.js';

  $: t = $uiText.configActions;
  $: plan = $pendingApproval?.plan || null;
  /**
   * Le plan porte le fournisseur ET la bibliothèque résolus par le serveur :
   * de quoi montrer le logo de l'espace où le document va partir — c'est
   * précisément ce que l'utilisateur est invité à relire.
   */
  $: planKind = plan ? libraryKind(plan.provider, plan.driveName) : '';

  function keydown(event) {
    if (!plan) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      answerStoreApproval(false);
    }
  }
</script>

<svelte:window on:keydown={keydown} />

{#if plan}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="ap-backdrop"
    on:click={(e) => e.target === e.currentTarget && answerStoreApproval(false)}
    role="presentation"
  >
    <div class="ap-box" role="dialog" aria-modal="true" aria-labelledby="ap-title">
      <header class="ap-head">
        <span class="ap-icon" aria-hidden="true">
          {#if planKind}
            <StorageLogo kind={planKind} size={22} />
          {:else}
            <IconFolder width="20" height="20" />
          {/if}
        </span>
        <h3 id="ap-title">{t.approvalTitle}</h3>
      </header>

      <dl class="ap-list">
        <dt>{t.approvalFolder}</dt>
        <dd>
          {plan.folder || t.approvalDefaultFolder}
          {#if plan.driveName}<span class="ap-drive">{plan.driveName}</span>{/if}
        </dd>

        {#if plan.tag}
          <dt>{t.approvalTag}</dt>
          <dd>{plan.tag}</dd>
        {/if}

        <dt>{t.approvalAccount}</dt>
        <dd>{plan.account || '—'}</dd>

        <dt>{t.approvalFile}</dt>
        <dd>{plan.filename}</dd>
      </dl>

      <div class="ap-actions">
        <button type="button" class="ap-cancel" on:click={() => answerStoreApproval(false)}>
          {t.approvalCancel}
        </button>
        <button type="button" class="ap-confirm" on:click={() => answerStoreApproval(true)}>
          {t.approvalConfirm}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ap-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10060;
    background: color-mix(
      in srgb,
      color-mix(in srgb, var(--brand-secondary) 6%, #0c0c0c) 45%,
      transparent
    );
    backdrop-filter: blur(6px);
    display: flex;
    justify-content: center;
    /* margin:auto + overflow (cf. ChangePasswordModal) : boutons atteignables
       clavier ouvert sur mobile, encoche/geste iOS respectés. */
    padding: max(24px, var(--safe-top, 0px)) 24px max(24px, var(--safe-bottom, 0px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .ap-box {
    width: 100%;
    max-width: 420px;
    margin: auto;
    background: #fff;
    border-radius: 10px;
    padding: 20px 22px;
    box-shadow: 0 24px 60px
      color-mix(in srgb, color-mix(in srgb, var(--brand-secondary) 6%, #0c0c0c) 22%, transparent);
    font-family: inherit;
    color: var(--ink);
  }
  .ap-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .ap-head h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  .ap-icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--line, var(--line));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--brand, var(--brand-text));
  }
  .ap-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 14px;
    margin: 0;
  }
  .ap-list dt {
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  .ap-list dd {
    margin: 0;
    font-size: 0.88rem;
    word-break: break-word;
  }
  .ap-drive {
    display: block;
    font-size: 0.75rem;
    color: var(--ink-faint);
  }
  .ap-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  .ap-cancel,
  .ap-confirm {
    padding: 0.55rem 1.1rem;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.88rem;
    cursor: pointer;
  }
  .ap-cancel {
    border: 1px solid var(--line, var(--line));
    background: #fff;
    color: color-mix(in srgb, var(--brand-secondary) 17.5%, #121212);
  }
  .ap-confirm {
    border: none;
    background: var(--brand, var(--brand));
    color: #fff;
    font-weight: 600;
  }
</style>
