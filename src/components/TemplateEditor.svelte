<script>
  /**
   * Éditeur de templates — UNE implémentation pour les deux contextes qui en
   * portaient chacun une copie (~600 lignes de script + markup + CSS
   * dupliquées, seuls endpoints et libellés différaient) :
   *   - « Mes templates » (templates personnels, /api/user-templates, max 5) ;
   *   - Administration → Templates (transverses, /api/templates).
   *
   * Le parent fournit les accès API (contrat apiClient {ok,status,data}), le
   * dictionnaire de textes et les règles propres à son contexte. Au passage,
   * l'unification CORRIGE un bug admin : la réponse 200 + {ok:false, error}
   * (contrat historique de routes/templates.js) n'y était pas vérifiée — un
   * `value_invalid` s'affichait « sauvegardé » alors que rien n'était écrit.
   *
   * Maître-détail : la liste tient la colonne de gauche du volet, la fiche
   * d'édition (ou l'écran de création, ou une note) occupe la droite. Le footer
   * (annuler/supprimer/sauvegarder) fait partie du composant — il ne s'affiche
   * qu'en édition.
   *
   * Pagimètre (`pageMeter`) : proposé ou non à la génération, et sa position
   * de départ — enregistré avec le template, null quand il n'en a pas.
   */
  import { slide } from 'svelte/transition';
  import { uiText, currentLanguageStore } from '../store.js';
  import { normalizePages } from '../lib/pageMeter.js';
  import PageMeterSlider from './PageMeterSlider.svelte';
  import ToggleSwitch from './ui/ToggleSwitch.svelte';
  import {
    templateMap,
    STARTER_TEMPLATES,
    SCAFFOLD_MARKER_RE,
    splitPromptFields,
    combinePromptFields,
  } from '../config/templates.js';
  import TemplateScaffoldEditor from './TemplateScaffoldEditor.svelte';

  import IconMagic from '~icons/solar/magic-stick-3-linear';
  import IconLink from '~icons/solar/link-minimalistic-2-linear';
  import IconTrash from '~icons/solar/trash-bin-trash-linear';
  import IconRestore from '~icons/solar/refresh-linear';
  import IconBack from '~icons/solar/arrow-left-linear';
  import IconAdd from '~icons/solar/add-circle-linear';
  import IconNewDoc from '~icons/solar/document-add-linear';
  import IconSave from '~icons/solar/diskette-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconWarn from '~icons/solar/danger-triangle-linear';
  import IconHelp from '~icons/solar/question-circle-linear';
  import IconLayers from '~icons/solar/layers-minimalistic-linear';
  import IconEmptyDoc from '~icons/solar/document-text-linear';
  import IconRuler from '~icons/solar/ruler-linear';
  import { slugifyTitle } from '../utils/filename.js';

  /** @type {{list: () => Promise, save: (payload) => Promise, remove: (value) => Promise}} */
  export let api;
  /** Dictionnaire de textes (cf. uiText.userTemplatesPanel pour les clés). */
  export let texts;
  /** Langue d'édition principale ('fr' côté admin, langue UI côté user). */
  export let lang = 'fr';
  /** Plafond de templates (null = illimité — admin). */
  export let maxTemplates = null;
  /** Session expirée détectée (auth_redirect) — admin : forceReauth. */
  export let onAuthRedirect = null;
  /** Relire la liste après sauvegarde (admin : Mongo = source de vérité). */
  export let refetchAfterSave = false;
  /** Le parent affiche le compteur dans son header. */
  export let onCountChange = () => {};
  /**
   * Templates PAR DÉFAUT à fusionner dans la liste (admin :
   * DEFAULT_EDITABLE_TEMPLATES). Un défaut sans enregistrement en base est
   * affiché tel quel (badge « défaut ») ; le sauvegarder crée l'enregistrement
   * de même `value`, qui prend le pas sur la version codée ; le « supprimer »
   * ne fait que retirer cet enregistrement — retour au défaut, jamais de perte.
   * Vide côté « Mes templates ».
   */
  export let defaultTemplates = [];

  let templates = [];
  let loading = false;
  let saving = false;
  let error = '';
  let successMsg = '';
  let showStarterPicker = false;
  let helpOpenIndex = null;
  let editingIndex = null;
  let editingSnapshot = null;

  $: t = texts;
  $: pm = $uiText.pageMeter;
  $: otherLang = lang === 'fr' ? 'en' : 'fr';
  $: limitReached = maxTemplates !== null && templates.length >= maxTemplates;
  $: editingTpl = editingIndex !== null && templates[editingIndex] ? templates[editingIndex] : null;
  $: onCountChange(templates.length);
  /**
   * Un écran de droite est ouvert (édition ou création). Sous 900 px, il PREND
   * la place de la liste — deux colonnes n'y tiennent pas — et le retour à la
   * liste redevient nécessaire.
   */
  $: detailOpen = showStarterPicker || editingIndex !== null;

  fetchTemplates();

  function handleAuthRedirect() {
    if (onAuthRedirect) {
      onAuthRedirect();
      return true;
    }
    return false;
  }

  /**
   * Fusion défauts + base : les défauts d'abord, dans leur ordre canonique —
   * remplacés par leur enregistrement en base quand il existe (`_overridden`) —
   * puis les templates purement admin. Les objets par défaut sont CLONÉS
   * (labels compris) : l'édition passe par bind: et une référence partagée
   * muterait les constantes du module templates.js.
   */
  function mergeWithDefaults(dbList) {
    if (!defaultTemplates.length) return dbList;
    const byValue = new Map(dbList.map((tpl) => [tpl.value, tpl]));
    const defaults = defaultTemplates.map((d) => {
      const override = byValue.get(d.value);
      if (override) {
        byValue.delete(d.value);
        return { ...override, _isDefault: true, _overridden: true };
      }
      return {
        value: d.value,
        icon: d.icon ?? '📄',
        labels: { fr: d.labels?.fr ?? d.value, en: d.labels?.en ?? d.value },
        instructions: d.instructions ?? '',
        scaffold: d.scaffold || '{{résumé}}',
        pageMeter: normalizePages(d.pageMeter),
        _isNew: false,
        _isDefault: true,
        _overridden: false,
        _otherLangOpen: !!(d.labels?.fr && d.labels?.en && d.labels.fr !== d.labels.en),
      };
    });
    return [...defaults, ...dbList.filter((tpl) => byValue.has(tpl.value))];
  }

  export async function fetchTemplates() {
    loading = true;
    error = '';
    try {
      const res = await api.list();
      if (res.data.error === 'auth_redirect' && handleAuthRedirect()) return;
      if (res.data.error === 'invalid_response') {
        error = t.sessionExpired;
        templates = [];
        return;
      }
      if (res.ok) {
        const data = res.data;
        const list = Array.isArray(data) ? data : data?.value ? [data] : (data.templates ?? []);
        templates = mergeWithDefaults(
          list
            .filter((x) => x?.value)
            .map((x) => {
              const parts = splitPromptFields(x.prompt ?? '');
              return {
                value: x.value,
                icon: x.icon ?? '📄',
                labels: x.labels ?? { fr: x.value, en: x.value },
                instructions: parts.instructions,
                scaffold: parts.scaffold,
                pageMeter: normalizePages(x.pageMeter),
                _isNew: false,
                _otherLangOpen: !!(x.labels?.fr && x.labels?.en && x.labels.fr !== x.labels.en),
              };
            }),
        );
      } else if (res.status === 404) {
        templates = mergeWithDefaults([]);
      } else if (res.status === 0) {
        // Panne réseau ou redirection non gérée : apiClient ne throw pas.
        error = t.networkError.replace('{message}', res.data.error || 'network');
        templates = [];
      } else {
        error = t.fetchError.replace('{status}', res.status);
        templates = [];
      }
    } finally {
      loading = false;
    }
  }

  // ── Édition ────────────────────────────────────────────────────────────────

  /**
   * Le bloc ✨ Résumé IA (fruit des Directives) fait partie de TOUT compte
   * rendu : déplaçable dans la mise en forme, jamais supprimable. Tout scaffold
   * qui entre dans l'éditeur est normalisé pour le contenir — l'éditeur
   * (ResumeLock) le maintient ensuite.
   */
  function ensureResumeBlock(scaffold) {
    const s = scaffold || '';
    SCAFFOLD_MARKER_RE.lastIndex = 0;
    const has = SCAFFOLD_MARKER_RE.test(s);
    SCAFFOLD_MARKER_RE.lastIndex = 0;
    if (has) return s;
    return s.trim() ? s.replace(/\s*$/, '') + '\n\n{{résumé}}' : '{{résumé}}';
  }

  function startEditing(i) {
    editingIndex = i;
    // Normalisation AVANT le snapshot : Annuler ne doit pas restaurer un
    // scaffold sans bloc résumé.
    templates[i].scaffold = ensureResumeBlock(templates[i].scaffold);
    templates = templates;
    editingSnapshot = JSON.parse(JSON.stringify(templates[i]));
    error = '';
    successMsg = '';
  }

  function cancelEditing() {
    if (editingIndex === null) return;
    const tpl = templates[editingIndex];
    if (tpl._isNew) {
      templates = templates.filter((_, i) => i !== editingIndex);
    } else if (editingSnapshot) {
      templates[editingIndex] = editingSnapshot;
      templates = templates;
    }
    editingIndex = null;
    editingSnapshot = null;
    helpOpenIndex = null;
    error = '';
  }

  // ── Slug ───────────────────────────────────────────────────────────────────

  /** Identifiant d'un template : le slug des noms de fichier, plus court. */
  function slugify(input) {
    return slugifyTitle(input, '').slice(0, 60);
  }

  function dedupeSlug(base, excludeIndex) {
    const taken = new Set(
      templates
        .filter((_, i) => i !== excludeIndex)
        .map((x) => x.value)
        .filter(Boolean),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  function autoSlug(index) {
    const tpl = templates[index];
    if (!tpl || !tpl._isNew) return;
    const primary = tpl.labels[lang] || tpl.labels[otherLang] || '';
    const base = slugify(primary) || `template-${index + 1}`;
    tpl.value = dedupeSlug(base, index);
    templates = templates;
  }

  // ── Starter picker ─────────────────────────────────────────────────────────

  function openStarterPicker() {
    if (limitReached) return;
    showStarterPicker = true;
  }

  function createFromStarter(starterValue) {
    const base = {
      icon: '📄',
      labels: { fr: '', en: '' },
      instructions: '',
      // Même « depuis zéro », le compte rendu contient le bloc ✨ Résumé IA.
      scaffold: '{{résumé}}',
      // Depuis zéro, pas de Pagimètre : il se propose, il ne s'impose pas.
      pageMeter: null,
      _isNew: true,
      _otherLangOpen: false,
      value: '',
    };
    if (starterValue) {
      const src = templateMap[starterValue];
      if (src) {
        const namePart = src.labels[lang] || src.labels.fr;
        base.icon = src.icon;
        base.labels = {
          fr: `${src.labels.fr} ${t.copySuffix}`,
          en: `${src.labels.en} ${t.copySuffixEn || t.copySuffix}`,
        };
        base.instructions = src.instructions || '';
        base.scaffold = ensureResumeBlock(src.scaffold || '');
        base.pageMeter = normalizePages(src.pageMeter);
        base.value = dedupeSlug(slugify(namePart) || 'template', -1);
      }
    } else {
      base.value = dedupeSlug('template', -1);
    }
    templates = [...templates, base];
    showStarterPicker = false;
    editingIndex = templates.length - 1;
    editingSnapshot = null;
  }

  function getStarterEntries() {
    return STARTER_TEMPLATES.map((slug) => templateMap[slug])
      .filter(Boolean)
      .map((s) => ({
        value: s.value,
        icon: s.icon,
        label: s.labels[lang] || s.labels.fr,
      }));
  }

  // ── Divers ─────────────────────────────────────────────────────────────────

  function toggleOtherLang(index) {
    const tpl = templates[index];
    tpl._otherLangOpen = !tpl._otherLangOpen;
    if (!tpl._otherLangOpen) tpl.labels[otherLang] = '';
    templates = templates;
  }

  function toggleHelp(index) {
    helpOpenIndex = helpOpenIndex === index ? null : index;
  }

  function handleHelpKey(e) {
    if (e.key === 'Escape') helpOpenIndex = null;
  }

  // ── Pagimètre ──────────────────────────────────────────────────────────────

  /** Activé, il repart de la dernière position choisie pendant l'édition, sinon d'une page. */
  function togglePageMeter(on) {
    const tpl = templates[editingIndex];
    if (!tpl) return;
    if (!on && tpl.pageMeter) tpl._lastPageMeter = tpl.pageMeter;
    tpl.pageMeter = on ? (tpl._lastPageMeter ?? 1) : null;
    templates = templates;
  }

  function setPageMeter(pages) {
    const tpl = templates[editingIndex];
    if (!tpl) return;
    tpl.pageMeter = normalizePages(pages);
    templates = templates;
  }

  // ── Sauvegarde / suppression ───────────────────────────────────────────────

  async function saveTemplate(index) {
    const tpl = templates[index];
    const primaryName = (tpl.labels[lang] || '').trim();
    if (!primaryName) {
      error = t.errorNameRequired;
      return;
    }

    if (tpl._isNew) {
      const base = slugify(primaryName);
      if (!base) {
        error = t.errorValueInvalid;
        return;
      }
      tpl.value = dedupeSlug(base, index);
    }
    const finalValue = tpl.value;

    const fr = tpl.labels.fr?.trim() || primaryName;
    const en = tpl.labels.en?.trim() || primaryName;
    const labels = { fr, en };

    // Sécurité résumé : le bloc ✨ Résumé IA est obligatoire (normalisé à
    // l'ouverture, verrouillé dans l'éditeur) — ceinture au cas où le scaffold
    // arriverait par un autre chemin.
    const safeScaffold = ensureResumeBlock(tpl.scaffold);
    if (safeScaffold !== tpl.scaffold) {
      tpl.scaffold = safeScaffold; // reflète l'ajout dans l'éditeur
      templates = templates;
    }

    saving = true;
    error = '';
    successMsg = '';
    try {
      const combinedPrompt = combinePromptFields({
        instructions: tpl.instructions || '',
        scaffold: safeScaffold,
      });
      const res = await api.save({
        value: finalValue,
        icon: tpl.icon,
        labels,
        prompt: combinedPrompt,
        pageMeter: normalizePages(tpl.pageMeter),
      });
      if (res.data.error === 'auth_redirect' && handleAuthRedirect()) return;
      if (res.data.error === 'invalid_response') {
        error = t.sessionExpired;
        return;
      }
      if (res.ok) {
        const data = res.data;
        // Contrat historique routes/templates.js : 200 + {ok:false, error}.
        if (data?.ok === false) {
          if (data.error === 'limit_reached') {
            error = t.limitReachedServer;
          } else if (data.error === 'value_invalid') {
            error = t.errorValueInvalid;
          } else if (data.error === 'value_required') {
            error = t.errorValueRequired;
          } else {
            error = t.saveError.replace('{status}', data.error ?? '?');
          }
        } else {
          tpl._isNew = false;
          if (tpl._isDefault) tpl._overridden = true; // désormais en base
          tpl.labels = labels;
          templates = templates;
          successMsg = t.saveSuccess.replace('{name}', primaryName);
          setTimeout(() => {
            successMsg = '';
          }, 3000);
          editingIndex = null;
          editingSnapshot = null;
          helpOpenIndex = null;
          if (refetchAfterSave) await fetchTemplates();
        }
      } else if (res.status === 0) {
        error = t.networkError.replace('{message}', res.data.error || 'network');
      } else {
        error = t.saveError.replace('{status}', res.status);
      }
    } finally {
      saving = false;
    }
  }

  /**
   * Supprime un template — ou, pour un DÉFAUT modifié, retire l'enregistrement
   * qui le recouvre : le template ne disparaît pas, il REVIENT à sa version
   * codée (« Rétablir le défaut »). Un défaut non modifié n'a rien en base :
   * aucun bouton de suppression ne mène ici.
   */
  async function deleteTemplate(index) {
    const tpl = templates[index];
    const name = tpl.labels[lang] || tpl.labels.fr || tpl.value || '';
    const isReset = tpl._isDefault && tpl._overridden;
    const confirmText = isReset ? t.confirmReset : t.confirmDelete;
    if (!confirm(confirmText.replace('{name}', name))) return;
    saving = true;
    error = '';
    try {
      if (!tpl._isNew) {
        const res = await api.remove(tpl.value);
        if (res.data.error === 'auth_redirect' && handleAuthRedirect()) return;
        // Résultat VÉRIFIÉ (l'ancien code user l'ignorait : la ligne
        // disparaissait localement même quand le backend n'avait rien
        // supprimé, et revenait au reload).
        if (res.data.error === 'invalid_response') {
          error = t.sessionExpired;
          return;
        }
        if (!res.ok) {
          error = t.deleteError
            ? t.deleteError.replace('{status}', res.status)
            : t.saveError.replace('{status}', res.status);
          return;
        }
      }
      editingIndex = null;
      editingSnapshot = null;
      helpOpenIndex = null;
      if (isReset) {
        // Le corps par défaut revient par la fusion — relecture obligatoire.
        await fetchTemplates();
      } else {
        templates = templates.filter((_, i) => i !== index);
      }
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window on:keydown={handleHelpKey} />

<!-- Maître-détail : la liste reste à gauche du volet, l'écran de droite montre
     le template choisi, la création, ou une note quand rien n'est sélectionné.
     Avant, liste et éditeur se REMPLAÇAIENT : passer d'un template à l'autre
     demandait un aller-retour par la liste. Sous 900 px la place manque pour
     deux colonnes — on retombe sur l'alternance, avec le retour explicite. -->
<div class="te-root" class:te-detail-open={detailOpen}>
  <!-- Bandeaux HORS des deux colonnes : sous 900 px l'une des deux est
       masquée, et une erreur de chargement ne peut pas se cacher avec elle. -->
  {#if error}
    <div class="te-banner te-error">
      <IconWarn width="16" height="16" aria-hidden="true" /><span>{error}</span>
    </div>
  {/if}
  {#if successMsg}
    <div class="te-banner te-success">
      <IconCheck width="16" height="16" aria-hidden="true" /><span>{successMsg}</span>
    </div>
  {/if}

  <div class="te-split">
    <aside class="te-master">
      <div class="te-master-list">
        {#if loading}
          <div class="te-loading">{t.loading}</div>
        {:else if templates.length === 0}
          <div class="te-master-empty">
            <IconEmptyDoc width="22" height="22" aria-hidden="true" />
            <span>{t.empty}</span>
          </div>
        {:else}
          <ul class="te-list">
            {#each templates as tpl, i (i)}
              <li class="te-list-row" class:te-list-row-active={editingIndex === i}>
                <button type="button" class="te-list-main" on:click={() => startEditing(i)}>
                  <span class="te-list-icon">{tpl.icon}</span>
                  <span class="te-list-text">
                    <span class="te-list-name">
                      <span class="te-list-name-text"
                        >{tpl.labels[lang] || tpl.labels.fr || tpl.value}</span
                      >
                      {#if tpl._isDefault}
                        <span class="te-badge" class:te-badge-mod={tpl._overridden}
                          >{tpl._overridden ? t.modifiedBadge : t.defaultBadge}</span
                        >
                      {/if}
                    </span>
                    <span class="te-list-slug">
                      <IconLink width="11" height="11" aria-hidden="true" />
                      {tpl.value}
                    </span>
                  </span>
                </button>
                <!-- Un défaut non modifié n'a rien en base : rien à supprimer.
                     Modifié, la corbeille devient « Rétablir le défaut ». -->
                {#if !tpl._isDefault || tpl._overridden}
                  <button
                    type="button"
                    class="te-list-delete"
                    on:click|stopPropagation={() => deleteTemplate(i)}
                    aria-label={tpl._isDefault ? t.resetToDefault : t.delete}
                    title={tpl._isDefault ? t.resetToDefault : t.delete}
                  >
                    {#if tpl._isDefault}
                      <IconRestore width="16" height="16" />
                    {:else}
                      <IconTrash width="16" height="16" />
                    {/if}
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if limitReached}
        <div class="te-limit">{t.limitReached}</div>
      {:else}
        <button class="te-btn-add" on:click={openStarterPicker}>
          <IconAdd width="16" height="16" aria-hidden="true" />
          {t.add}
        </button>
      {/if}
    </aside>

    <div class="te-body">
      {#if showStarterPicker}
        <div class="te-starter-picker">
          <div class="te-starter-header">
            <h3>{t.starterPickerTitle}</h3>
            <p>{t.starterPickerSubtitle}</p>
          </div>
          <div class="te-starter-grid">
            <button
              type="button"
              class="te-starter-tile te-starter-tile-scratch"
              on:click={() => createFromStarter(null)}
            >
              <span class="te-starter-icon te-starter-icon-svg" aria-hidden="true"
                ><IconNewDoc width="22" height="22" /></span
              >
              <span class="te-starter-label">{t.starterFromScratch}</span>
            </button>
            {#each getStarterEntries() as s}
              <button
                type="button"
                class="te-starter-tile"
                on:click={() => createFromStarter(s.value)}
              >
                <span class="te-starter-icon">{s.icon}</span>
                <span class="te-starter-label"
                  >{t.starterFromTemplate.replace('{name}', s.label)}</span
                >
              </button>
            {/each}
          </div>
          <button type="button" class="te-link-btn" on:click={() => (showStarterPicker = false)}>
            <IconBack width="13" height="13" aria-hidden="true" />
            {t.starterPickerCancel}
          </button>
        </div>
      {:else if editingTpl}
        <div class="te-edit-breadcrumb">
          <button type="button" class="te-link-btn" on:click={cancelEditing}>
            <IconBack width="13" height="13" aria-hidden="true" />
            {t.backToList}
          </button>
        </div>
        {#if editingTpl._isDefault}
          <!-- Éditer un défaut = le recouvrir pour tous les comptes ; le dire
               avant que l'admin ne tape, avec la porte de sortie. -->
          <div class="te-default-note">{t.defaultEditHint}</div>
        {/if}
        <div class="te-card">
          <!-- Identité -->
          <div class="te-section">
            <div class="te-section-header">{t.sectionIdentity}</div>
            <div class="te-row">
              <label>
                <span>{t.fieldIcon}</span>
                <input
                  type="text"
                  bind:value={editingTpl.icon}
                  maxlength="4"
                  class="te-input-icon"
                />
              </label>
              <label class="te-flex-grow">
                <span>{t.nameLabel}</span>
                <input
                  type="text"
                  bind:value={editingTpl.labels[lang]}
                  on:input={() => autoSlug(editingIndex)}
                  placeholder={t.namePlaceholder}
                />
              </label>
            </div>
            <div class="te-identity-meta">
              {#if editingTpl.value}
                <span class="te-slug-chip" title={t.slugHint.replace('{slug}', editingTpl.value)}>
                  <IconLink width="11" height="11" aria-hidden="true" />
                  {editingTpl.value}
                </span>
              {/if}
              <button
                type="button"
                class="te-link-btn"
                on:click={() => toggleOtherLang(editingIndex)}
              >
                {editingTpl._otherLangOpen ? t.hideEnVersion : t.addEnVersion}
              </button>
            </div>
            {#if editingTpl._otherLangOpen}
              <label class="te-label-full">
                <span>{t.fieldLabelEn}</span>
                <input
                  type="text"
                  bind:value={editingTpl.labels[otherLang]}
                  placeholder={t.fieldLabelEnPlaceholder}
                />
              </label>
            {/if}
          </div>

          <!-- Directives -->
          <div class="te-section">
            <div class="te-section-header">
              <IconMagic width="14" height="14" aria-hidden="true" />
              {t.sectionDirectives}
            </div>
            <div class="te-field-hint">{t.directivesHint}</div>
            <textarea
              bind:value={editingTpl.instructions}
              rows="4"
              placeholder={t.directivesPlaceholder}
            ></textarea>
          </div>

          <!-- Scaffold -->
          <div class="te-section">
            <div class="te-section-header">
              <IconLayers width="14" height="14" aria-hidden="true" />
              {t.sectionScaffold}
              <button
                type="button"
                class="te-help-btn"
                on:click={() => toggleHelp(editingIndex)}
                aria-label={t.helpAria}
                aria-expanded={helpOpenIndex === editingIndex}
                ><IconHelp width="14" height="14" /></button
              >
              {#if helpOpenIndex === editingIndex}
                <div class="te-help-popover" role="tooltip">
                  {t.scaffoldHelp}
                </div>
              {/if}
            </div>
            <div class="te-field-hint">{t.scaffoldHint}</div>

            <TemplateScaffoldEditor
              bind:scaffold={editingTpl.scaffold}
              {lang}
              placeholder={t.scaffoldPlaceholder}
              labels={{
                formatHint: t.formatHint,
                bold: t.formatBold,
                italic: t.formatItalic,
                underline: t.formatUnderline,
                h1: t.formatH1,
                h2: t.formatH2,
                dragBlock: t.formatDragBlock,
                list: lang === 'en' ? 'List' : 'Liste',
                insertHint: t.insertVariableHint,
                aiGroup: t.varGroupAi,
                metaGroup: t.varGroupMeta,
                alreadyInserted: t.varAlreadyInserted,
              }}
            />
            <div class="te-var-hint">{t.insertVariableHint}</div>
          </div>

          <!-- Pagimètre : proposé ou non, et d'où part le curseur. -->
          <div class="te-section">
            <div class="te-section-header">
              <IconRuler width="14" height="14" aria-hidden="true" />
              {pm.name}
            </div>
            <div class="te-meter-toggle">
              <span class="te-meter-toggle-text">
                <strong>{pm.editorToggle}</strong>
                <span>{editingTpl.pageMeter ? pm.editorHint : pm.editorOff}</span>
              </span>
              <ToggleSwitch
                checked={!!editingTpl.pageMeter}
                label={pm.editorToggle}
                on:change={(e) => togglePageMeter(e.currentTarget.checked)}
              />
            </div>
            {#if editingTpl.pageMeter}
              <div class="te-meter" transition:slide={{ duration: 160 }}>
                <PageMeterSlider
                  id="te-page-meter"
                  value={editingTpl.pageMeter}
                  labels={pm}
                  lang={$currentLanguageStore}
                  title={pm.editorDefault}
                  subtitle={pm.editorPriority}
                  showIcon={false}
                  on:change={(e) => setPageMeter(e.detail)}
                />
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <!-- Rien de sélectionné : la note dit quoi faire, elle ne se contente
             pas d'un écran vide. -->
        <div class="te-empty">
          <IconEmptyDoc width="26" height="26" aria-hidden="true" />
          <strong>{t.pickTitle}</strong>
          <span>{templates.length ? t.pickHint : t.pickHintEmpty}</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Footer (édition uniquement) -->
  {#if editingIndex !== null && templates[editingIndex]}
    <div class="te-footer">
      <button class="te-btn-secondary" on:click={cancelEditing} disabled={saving}>
        {t.cancel}
      </button>
      {#if !templates[editingIndex]._isNew && (!templates[editingIndex]._isDefault || templates[editingIndex]._overridden)}
        <button
          class="te-btn-danger"
          on:click={() => deleteTemplate(editingIndex)}
          disabled={saving}
        >
          {#if templates[editingIndex]._isDefault}
            <IconRestore width="15" height="15" aria-hidden="true" />
            {t.resetToDefault}
          {:else}
            <IconTrash width="15" height="15" aria-hidden="true" />
            {t.delete}
          {/if}
        </button>
      {/if}
      <button class="te-btn-primary" on:click={() => saveTemplate(editingIndex)} disabled={saving}>
        {#if saving}…{:else}<IconSave width="15" height="15" aria-hidden="true" /> {t.save}{/if}
      </button>
    </div>
  {/if}
</div>

<style>
  /* Colonne pleine hauteur dans le PanelShell : le body scrolle, le footer
     (mode édition) reste collé en bas — même rendu que les deux anciennes
     implémentations. */
  .te-root {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* Deux colonnes qui défilent séparément : parcourir un long template ne doit
     pas faire disparaître la liste. */
  .te-split {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }
  .te-master {
    flex: 0 0 250px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 14px;
    border-right: 1px solid var(--line);
    background: var(--surface-tint);
    overflow: hidden;
  }
  .te-master-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .te-master-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 12px;
    text-align: center;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-faint);
  }
  .te-master-empty :global(svg) {
    color: var(--line-faint);
  }
  .te-body {
    overflow-y: auto;
    padding: 18px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
  }

  .te-banner {
    margin: 14px 18px 0;
    flex-shrink: 0;
  }
  .te-error {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--danger-text);
    font-size: 13px;
  }
  .te-error :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }
  .te-success {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: var(--success-bg);
    border: 1px solid var(--success-line);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--success-text);
    font-size: 13px;
  }
  .te-success :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }
  .te-loading {
    color: var(--ink-muted);
    padding: 32px;
    text-align: center;
    font-size: 14px;
  }
  .te-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: var(--ink-faint);
    padding: 32px 20px;
    text-align: center;
    font-size: 13px;
    background: var(--surface-tint);
    border: 1px dashed var(--line);
    border-radius: 10px;
    line-height: 1.5;
  }
  .te-empty :global(svg) {
    color: var(--line-faint);
  }
  .te-limit {
    color: var(--danger-text);
    padding: 14px 18px;
    text-align: center;
    font-size: 13px;
    background: oklch(97% 0.04 25);
    border: 1px solid oklch(86% 0.1 25);
    border-radius: 8px;
    font-weight: 500;
  }

  .te-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .te-list-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
    background: var(--surface-tint);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .te-list-row:hover {
    border-color: var(--brand);
    box-shadow: 0 4px 12px -4px rgb(var(--brand-rgb) / 0.2);
  }
  .te-list-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    color: inherit;
    min-width: 0;
  }
  .te-list-icon {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
  }
  .te-list-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .te-list-name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .te-list-name-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Badge « défaut » : neutre tant que la version codée s'applique, teinté
     marque dès qu'un enregistrement admin la recouvre. */
  .te-badge {
    flex-shrink: 0;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink-faint);
    white-space: nowrap;
  }
  .te-badge-mod {
    background: rgb(var(--brand-rgb) / 0.1);
    border-color: rgb(var(--brand-rgb) / 0.35);
    color: var(--brand-text);
  }
  .te-default-note {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-soft);
    background: var(--brand-secondary-soft-08);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 14px;
  }
  .te-list-slug {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--ink-faint);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .te-list-slug :global(svg) {
    flex-shrink: 0;
    opacity: 0.7;
  }
  .te-list-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-left: 1px solid var(--line);
    padding: 0 14px;
    cursor: pointer;
    color: var(--ink-faint);
    transition:
      background 0.15s,
      color 0.15s;
  }
  .te-list-delete:hover {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  /* Le template ouvert se voit dans la liste : sans ça, deux colonnes côte à
     côte sans lien visible entre elles. */
  .te-list-row-active,
  .te-list-row-active:hover {
    border-color: var(--brand);
    background: var(--surface);
    box-shadow: inset 3px 0 0 var(--brand);
  }

  /* Le retour à la liste n'a de sens que quand la liste est masquée — sous
     900 px. Au-dessus, elle est à l'écran en permanence. */
  .te-edit-breadcrumb {
    display: none;
    align-items: center;
    margin-bottom: 4px;
  }

  @media (max-width: 900px) {
    .te-master {
      flex-basis: auto;
      flex: 1;
      border-right: none;
    }
    /* Détail ouvert : il prend toute la place, la liste s'efface. */
    .te-detail-open .te-master {
      display: none;
    }
    .te-root:not(.te-detail-open) .te-body {
      display: none;
    }
    .te-edit-breadcrumb {
      display: flex;
    }
  }

  .te-card {
    background: var(--surface-tint);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .te-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
  }
  .te-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--surface);
    position: relative;
  }
  .te-section-header > :global(svg) {
    color: var(--brand-text);
    flex-shrink: 0;
  }
  .te-field-hint {
    font-size: 12px;
    color: var(--ink-faint);
    line-height: 1.45;
    margin-bottom: 2px;
  }
  .te-var-hint {
    font-size: 11px;
    color: var(--ink-faint);
    padding: 0 4px;
    font-style: italic;
  }

  /* Pagimètre : l'interrupteur et ce qu'il fait, puis le curseur de départ —
     le même que dans la carte de génération. */
  .te-meter-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .te-meter-toggle-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .te-meter-toggle-text strong {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .te-meter-toggle-text span {
    font-size: 12px;
    line-height: 1.45;
    color: var(--ink-faint);
  }
  .te-meter {
    padding: 14px 16px 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
  }

  .te-help-btn {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--brand-text);
    cursor: pointer;
    line-height: 1;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .te-help-btn:hover {
    background: var(--brand-secondary-soft-15);
  }
  .te-help-popover {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px;
    color: var(--ink-soft);
    line-height: 1.5;
    box-shadow: 0 8px 24px -8px
      color-mix(in srgb, color-mix(in srgb, var(--brand-secondary) 12.8%, #000000) 18%, transparent);
    z-index: 10;
    max-width: 360px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .te-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  label span {
    font-size: 10px;
    color: var(--ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .te-flex-grow {
    flex: 1;
    min-width: 120px;
  }
  .te-label-full {
    width: 100%;
  }
  .te-input-icon {
    width: 56px;
    text-align: center;
    font-size: 18px;
  }

  input,
  textarea {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font-size: 13px;
    padding: 9px 12px;
    outline: none;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  input::placeholder,
  textarea::placeholder {
    color: var(--line-strong);
  }
  input:focus,
  textarea:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft-15);
  }
  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  textarea {
    resize: vertical;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.55;
    min-height: 120px;
  }

  .te-identity-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: -2px;
  }
  .te-slug-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink-faint);
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-family: var(--font-mono);
    user-select: all;
  }

  .te-link-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    padding: 0;
    color: var(--brand-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: rgb(var(--brand-rgb) / 0.3);
    text-underline-offset: 3px;
    font-family: inherit;
  }
  .te-link-btn :global(svg) {
    flex-shrink: 0;
  }
  .te-link-btn:hover {
    text-decoration-color: var(--brand-text);
  }

  .te-btn-add {
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    background: var(--surface-tint);
    border: 1.5px dashed var(--brand-strong);
    color: var(--brand-text);
    border-radius: 8px;
    padding: 14px 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
    text-align: center;
  }
  .te-btn-add:hover {
    background: var(--brand-secondary-soft-08);
    border-color: var(--brand);
    color: var(--brand-text-strong);
  }

  .te-starter-picker {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 4px;
  }
  .te-starter-header h3 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .te-starter-header p {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .te-starter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  .te-starter-tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    background: var(--surface-tint);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 16px 14px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.1s,
      box-shadow 0.15s;
  }
  .te-starter-tile:hover {
    background: var(--brand-secondary-soft-08);
    border-color: var(--brand);
    box-shadow: 0 4px 12px -4px rgb(var(--brand-rgb) / 0.3);
  }
  .te-starter-tile:active {
    transform: scale(0.98);
  }
  .te-starter-tile-scratch {
    border-style: dashed;
  }
  .te-starter-icon {
    font-size: 22px;
    line-height: 1;
  }
  .te-starter-icon-svg {
    display: inline-flex;
    color: var(--brand-text);
  }
  .te-starter-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1.3;
  }

  .te-footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    align-items: center;
    padding: 14px 22px;
    border-top: 1px solid var(--line);
    background: var(--surface-tint);
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .te-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 18px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
    letter-spacing: 0.01em;
    transition:
      background 0.15s,
      box-shadow 0.15s,
      transform 0.1s;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
  }
  .te-btn-primary:hover:not(:disabled) {
    background: var(--brand-strong);
    box-shadow: 0 4px 12px -2px rgb(var(--brand-rgb) / 0.55);
  }
  .te-btn-primary:active:not(:disabled) {
    transform: scale(0.97);
  }
  .te-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  .te-btn-secondary {
    background: var(--surface);
    color: var(--ink-soft);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 9px 16px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 500;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }
  .te-btn-secondary:hover:not(:disabled) {
    background: var(--line);
    color: var(--ink);
    border-color: var(--line-strong);
  }
  .te-btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .te-btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--danger-bg);
    color: var(--danger-text);
    border: 1px solid var(--danger-line);
    border-radius: 8px;
    padding: 9px 16px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 500;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }
  .te-btn-danger:hover:not(:disabled) {
    background: var(--danger-bg-hover);
    border-color: var(--danger-strong);
  }
  .te-btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .te-body {
      padding: 14px 16px;
    }
    .te-row {
      flex-direction: column;
    }
    .te-input-icon {
      width: 100%;
    }
    .te-flex-grow {
      min-width: 0;
    }
    .te-footer {
      padding: 12px 14px;
      gap: 8px;
      flex-wrap: wrap;
    }
    .te-footer button {
      flex: 1;
      min-width: 0;
    }
    .te-starter-grid {
      grid-template-columns: 1fr;
    }
    .te-help-popover {
      left: -40px;
      right: -10px;
      max-width: none;
    }
    .te-list-main {
      padding: 12px;
      gap: 10px;
    }
    .te-list-icon {
      font-size: 20px;
    }
    .te-list-name {
      font-size: 13.5px;
    }
  }
</style>
