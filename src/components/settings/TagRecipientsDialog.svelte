<script>
  /**
   * Fenêtre « Destinataires du tag » — la liste d'adresses PROPRE à un tag.
   *
   * Un seul composant pour les deux écrans qui l'ouvrent :
   *   - « Mes tags », qui ENREGISTRE la liste dès qu'on valide (le panneau n'a
   *     pas de brouillon) ;
   *   - l'onglet « Envoi d'email » de Ma configuration, qui la pose dans son
   *     brouillon et l'enregistre avec le reste.
   * La fenêtre ne sait pas lequel l'a ouverte : elle rend une liste à `onSave`
   * et c'est tout. C'est le même contrat que DriveFolderPicker pour le dossier,
   * et pour la même raison — deux saisies qui divergent, c'est une adresse
   * acceptée ici et refusée là.
   *
   * La liste REMPLACE la liste par défaut du compte, elle ne s'y ajoute pas
   * (cf. lib/actions/recipients.js). La fenêtre le dit en toutes lettres :
   * c'est la règle qui évite d'envoyer le compte rendu d'un client aux
   * interlocuteurs d'un autre, et l'utilisateur doit la connaître AVANT de
   * valider, pas la découvrir dans sa boîte d'envoi.
   *
   * La saisie travaille sur une COPIE : fermer sans valider ne laisse rien.
   */
  import RecipientList from './RecipientList.svelte';
  import TagChip from '../TagChip.svelte';
  import IconMail from '~icons/solar/letter-linear';
  import { tagColorVars, tagColors } from '../../stores/tags.js';

  /** @type {{id: string, label: string, color: string}} */
  export let tag;
  /** Liste enregistrée (ou en brouillon) à l'ouverture. */
  export let recipients = [];
  /** Plafond de l'administration — le même que pour la liste par défaut. */
  export let max = 10;
  /** `uiText.configActions` (saisie) — la fenêtre y lit aussi ses libellés. */
  export let texts;
  export let busy = false;
  /** Message d'erreur déjà traduit (refus du serveur), ou chaîne vide. */
  export let error = '';
  /** @type {(recipients: string[]) => void} */
  export let onSave = () => {};
  export let onClose = () => {};

  let draft = [...recipients];

  // La fenêtre prend la couleur du tag (icône, liseré) : même objet que la
  // carte de « Mes tags » et la ligne de « Envoi d'email ». `$tagColors` en
  // dépendance explicite, tagColorVars lit le store de façon impérative.
  $: vars = ($tagColors, tagColorVars(tag?.color));

  function keydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window on:keydown={keydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="trd-backdrop"
  on:click={(e) => e.target === e.currentTarget && onClose()}
  role="presentation"
>
  <div
    class="trd-box"
    role="dialog"
    aria-modal="true"
    aria-labelledby="trd-title"
    style="--tag-dot: {vars.dot}; --tag-soft: {vars.soft}"
  >
    <header class="trd-head">
      <span class="trd-icon" aria-hidden="true"><IconMail width="18" height="18" /></span>
      <div class="trd-title">
        <h3 id="trd-title">{texts.tagRecipientsDialogTitle}</h3>
        <TagChip {tag} />
      </div>
      <button type="button" class="trd-close" on:click={onClose} aria-label={texts.pickerClose}>
        ✕
      </button>
    </header>

    <p class="trd-hint">{texts.tagRecipientsDialogHint}</p>

    <RecipientList bind:recipients={draft} {max} {texts} disabled={busy} />

    {#if error}
      <p class="trd-error" role="alert">{error}</p>
    {/if}

    <footer class="trd-foot">
      {#if draft.length === 0}
        <span class="trd-note">{texts.tagRecipientsEmptyNote}</span>
      {:else}
        <span class="trd-note">{texts.alwaysCopiedShort}</span>
      {/if}
      <div class="trd-actions">
        <button type="button" class="trd-btn" on:click={onClose} disabled={busy}>
          {texts.tagRecipientsCancel}
        </button>
        <button
          type="button"
          class="trd-btn trd-btn-primary"
          on:click={() => onSave(draft)}
          disabled={busy}
        >
          {busy ? texts.saving : texts.tagRecipientsApply}
        </button>
      </div>
    </footer>
  </div>
</div>

<style>
  .trd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10055;
    background: color-mix(
      in srgb,
      color-mix(in srgb, var(--brand-secondary) 6%, #0c0c0c) 45%,
      transparent
    );
    backdrop-filter: blur(6px);
    display: flex;
    justify-content: center;
    /* margin:auto + overflow (cf. DriveFolderPicker) : boutons atteignables
       clavier ouvert sur mobile, encoche/geste iOS respectés. */
    padding: max(24px, var(--safe-top, 0px)) 24px max(24px, var(--safe-bottom, 0px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .trd-box {
    width: 100%;
    max-width: 460px;
    margin: auto;
    max-height: 82dvh;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--surface, #fff);
    border-radius: 12px;
    padding: 18px 20px;
    box-shadow:
      inset 0 4px 0 var(--tag-dot),
      0 24px 60px
        color-mix(in srgb, color-mix(in srgb, var(--brand-secondary) 6%, #0c0c0c) 22%, transparent);
    color: var(--ink);
  }
  .trd-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .trd-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--tag-soft);
    border: 1px solid color-mix(in oklch, var(--tag-dot) 35%, transparent);
    color: var(--tag-dot);
    flex-shrink: 0;
  }
  .trd-title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .trd-title h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .trd-close {
    border: 1px solid var(--line-strong);
    background: var(--surface);
    border-radius: 999px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    color: var(--ink-muted);
    flex-shrink: 0;
  }
  .trd-hint {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
  .trd-error {
    margin: 0;
    padding: 8px 11px;
    border-radius: 8px;
    font-size: 12px;
    color: var(--danger-text);
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
  }
  .trd-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .trd-note {
    flex: 1 1 180px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink-faint);
  }
  .trd-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .trd-btn {
    padding: 7px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .trd-btn:hover:not(:disabled) {
    background: var(--surface-tint);
  }
  .trd-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .trd-btn-primary {
    background: var(--brand);
    border-color: var(--brand-strong);
    color: #fff;
  }
  .trd-btn-primary:hover:not(:disabled) {
    background: var(--brand-strong);
  }
</style>
