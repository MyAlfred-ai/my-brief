<script>
  /**
   * Création et édition d'un utilisateur. Machine à états `saveState` reprise
   * du modèle de SettingsPanel.svelte.
   *
   * L'email n'est modifiable qu'à la création : c'est la clé de rattachement de
   * toutes les données métier (réunions, templates personnels, configuration),
   * le changer orphelinerait l'historique du compte.
   *
   * En édition, c'est la fiche du compte : ce que la liste ne montre plus
   * (date exacte de connexion, « SSO uniquement ») et les gestes rares —
   * réinitialiser, supprimer. Ils sont émis vers UsersTab, qui porte déjà
   * leurs confirmations.
   */
  import { createEventDispatcher } from 'svelte';
  import IconBack from '~icons/solar/arrow-left-linear';
  import IconKey from '~icons/solar/key-minimalistic-linear';
  import IconTrash from '~icons/solar/trash-bin-trash-linear';
  import { createUser, updateUser } from '../../services/adminUsersApi.js';
  import { checkPassword, DEFAULT_MIN_LENGTH } from '../../utils/passwordPolicy.js';
  import { groupColorVars } from '../../utils/groupColors.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { formatDateTime } from '../../utils/relativeTime.js';

  export let texts; // $uiText.adminUsers
  export let policyTexts; // $uiText.passwordPolicy
  export let minLength = DEFAULT_MIN_LENGTH;
  export let lang = 'fr';
  /** null = création */
  export let user = null;
  /** Catalogue des groupes (onglet Groupes) : une case par groupe. */
  export let groups = [];
  export let defaultId = 'default';
  /** Le compte de l'administrateur lui-même : pas de suppression proposée. */
  export let isSelf = false;

  const dispatch = createEventDispatcher();

  let email = user?.email || '';
  let name = user?.name || '';
  let role = user?.role || 'user';
  let disabled = !!user?.disabled;
  let password = '';
  let mustChangePassword = true;
  // Un compte naît dans le groupe par défaut ; la fiche reprend ce qu'il a.
  let groupIds = user?.groupIds?.length ? [...user.groupIds] : [defaultId];
  let saveState = 'idle'; // 'idle' | 'saving' | 'error'
  let errorMessage = '';

  $: isEdit = !!user;
  $: lastSeen = formatDateTime(user?.lastConnecion, lang) || texts.never;

  /** Réaffectation (jamais de mutation en place) : les cases suivent le tableau. */
  function toggleGroup(id) {
    groupIds = groupIds.includes(id) ? groupIds.filter((g) => g !== id) : [...groupIds, id];
  }

  async function submit() {
    errorMessage = '';
    if (!isEdit && password) {
      const policy = checkPassword(password, { email, minLength });
      if (!policy.ok) {
        errorMessage = fill(policyTexts[policy.reason] || policyTexts.required, { min: minLength });
        return;
      }
    }

    saveState = 'saving';
    const res = isEdit
      ? await updateUser({ email: user.email, name: name.trim(), role, disabled, groupIds })
      : await createUser({
          email: email.trim(),
          name: name.trim() || undefined,
          role,
          mustChangePassword,
          groupIds,
          ...(password ? { password } : {}),
        });

    if (res.ok) {
      saveState = 'idle';
      dispatch('saved', { user: res.data.user, generatedPassword: res.data.generatedPassword });
      return;
    }
    saveState = 'error';
    errorMessage = res.data.reason
      ? fill(policyTexts[res.data.reason] || texts.errors.unknown, { min: minLength })
      : texts.errors[res.data.error] || texts.errors.unknown;
  }
</script>

<div class="uf-wrap">
  <button type="button" class="uf-back" on:click={() => dispatch('cancel')}>
    <IconBack width="13" height="13" aria-hidden="true" />
    {texts.back}
  </button>
  <h3 class="uf-title">{isEdit ? texts.editTitle : texts.createTitle}</h3>
  {#if isEdit}
    <p class="uf-meta">
      {texts.lastConnection}
      {lastSeen}
      {#if !user.hasPassword}<span class="uf-meta-tag">{texts.noPasswordBadge}</span>{/if}
    </p>
  {/if}

  <form class="uf-form" on:submit|preventDefault={submit}>
    <label class="uf-label" for="uf-email">{texts.emailLabel}</label>
    <input
      id="uf-email"
      class="uf-input"
      type="email"
      required
      autocomplete="off"
      disabled={isEdit || saveState === 'saving'}
      bind:value={email}
    />

    <label class="uf-label" for="uf-name">{texts.nameLabel}</label>
    <input
      id="uf-name"
      class="uf-input"
      type="text"
      autocomplete="off"
      disabled={saveState === 'saving'}
      bind:value={name}
    />

    <label class="uf-label" for="uf-role">{texts.roleLabel}</label>
    <select id="uf-role" class="uf-input" disabled={saveState === 'saving'} bind:value={role}>
      <option value="user">{texts.roleUser}</option>
      <option value="admin">{texts.roleAdmin}</option>
    </select>

    {#if groups.length}
      <!-- Groupes : des cases à cocher en forme de puces, la couleur du groupe
           en pastille. Tout décoché = groupe par défaut, le serveur l'applique
           et l'indication le dit. -->
      <fieldset class="uf-groups">
        <legend class="uf-label">{texts.groupsLabel}</legend>
        <div class="uf-group-list">
          {#each groups as group (group.id)}
            <label
              class="uf-group"
              class:uf-group-on={groupIds.includes(group.id)}
              style="--g-dot: {groupColorVars(group.color).dot}; --g-soft: {groupColorVars(
                group.color,
              ).soft}"
            >
              <input
                type="checkbox"
                checked={groupIds.includes(group.id)}
                disabled={saveState === 'saving'}
                on:change={() => toggleGroup(group.id)}
              />
              <span class="uf-group-dot" aria-hidden="true"></span>
              <span class="uf-group-name">{group.name}</span>
            </label>
          {/each}
        </div>
        <p class="uf-hint">{texts.groupsHint}</p>
      </fieldset>
    {/if}

    {#if isEdit}
      <label class="uf-check">
        <input type="checkbox" disabled={saveState === 'saving'} bind:checked={disabled} />
        {texts.disabledLabel}
      </label>
    {:else}
      <label class="uf-label" for="uf-password">{texts.passwordLabel}</label>
      <input
        id="uf-password"
        class="uf-input"
        type="text"
        autocomplete="off"
        disabled={saveState === 'saving'}
        bind:value={password}
      />
      <p class="uf-hint">{texts.passwordAuto}</p>

      <label class="uf-check">
        <input
          type="checkbox"
          disabled={saveState === 'saving'}
          bind:checked={mustChangePassword}
        />
        {texts.mustChangeLabel}
      </label>
    {/if}

    {#if errorMessage}
      <p class="uf-error" role="alert">{errorMessage}</p>
    {/if}

    <div class="uf-actions">
      <button
        type="button"
        class="uf-secondary"
        on:click={() => dispatch('cancel')}
        disabled={saveState === 'saving'}
      >
        {texts.cancel}
      </button>
      <button type="submit" class="uf-primary" disabled={saveState === 'saving'}>
        {saveState === 'saving' ? texts.saving : texts.save}
      </button>
    </div>
  </form>

  {#if isEdit}
    <!-- Hors du formulaire : ces gestes n'enregistrent rien de ce qui est
         saisi au-dessus, chacun a sa propre confirmation. -->
    <div class="uf-more">
      <button
        type="button"
        class="uf-secondary uf-more-btn"
        disabled={saveState === 'saving'}
        on:click={() => dispatch('reset', user)}
      >
        <IconKey width="15" height="15" aria-hidden="true" />
        {texts.resetPassword}
      </button>
      {#if !isSelf}
        <button
          type="button"
          class="uf-secondary uf-more-btn uf-danger"
          disabled={saveState === 'saving'}
          on:click={() => dispatch('delete', user)}
        >
          <IconTrash width="15" height="15" aria-hidden="true" />
          {texts.deleteAccount}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Une fiche se lit en colonne : étirés sur toute la largeur du panneau, les
     champs d'une ligne faisaient 1 500 px sur un grand écran. */
  .uf-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 40rem;
  }
  .uf-back {
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
  .uf-back:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .uf-title {
    margin: 0.25rem 0 0.5rem;
    font-size: 1.05rem;
    color: color-mix(in srgb, var(--brand-secondary) 6.3%, #181818);
  }
  .uf-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.5rem;
    margin: -0.35rem 0 0.25rem;
    font-size: 0.82rem;
    color: var(--ink-muted);
  }
  .uf-meta-tag {
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    background: var(--line);
    color: var(--ink-muted);
    font-size: 0.72rem;
    font-weight: 600;
  }
  .uf-form {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .uf-label {
    font-size: 0.82rem;
    font-weight: 600;
    color: #555;
    margin-top: 0.5rem;
  }
  .uf-input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.95rem;
    background: #fff;
    color: #1a1a1a;
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .uf-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .uf-input:disabled {
    background: color-mix(in srgb, var(--brand-secondary) 2.1%, #f6f6f6);
    color: #999;
  }
  .uf-hint {
    margin: 0.15rem 0 0;
    font-size: 0.78rem;
    color: #999;
  }
  .uf-check {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-top: 0.75rem;
    font-size: 0.88rem;
    color: #555;
  }
  .uf-groups {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
  }
  .uf-groups legend {
    padding: 0;
    margin-bottom: 0.35rem;
  }
  .uf-group-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .uf-group {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem 0.35rem 0.6rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-soft);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }
  .uf-group:hover {
    border-color: var(--g-dot);
  }
  .uf-group-on {
    background: var(--g-soft);
    border-color: var(--g-dot);
    color: var(--ink);
    font-weight: 600;
  }
  .uf-group input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .uf-group:has(input:focus-visible) {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .uf-group-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--g-dot);
    flex-shrink: 0;
  }
  .uf-group-name {
    overflow-wrap: anywhere;
  }
  .uf-error {
    margin: 0.5rem 0 0;
    color: #c0392b;
    font-size: 0.88rem;
  }
  .uf-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .uf-primary {
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
  .uf-primary:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .uf-primary:disabled {
    opacity: 0.6;
    cursor: default;
    box-shadow: none;
  }
  .uf-secondary {
    padding: 0.6rem 1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .uf-secondary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .uf-more {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }
  .uf-more-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
  }
  .uf-danger {
    color: var(--danger-text);
  }
  .uf-danger:hover:not(:disabled) {
    background: var(--danger-bg);
    border-color: var(--danger-line);
  }
</style>
