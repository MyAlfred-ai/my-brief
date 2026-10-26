/**
 * Réglages d'actions de l'utilisateur — destinataires, dossier, gabarits.
 *
 * Deux consommateurs, et c'est la raison d'être du store :
 *   - l'écran de réglages (components/settings/ActionsSettingsTab.svelte), qui
 *     les édite ;
 *   - `utils/documentExport.js`, qui a besoin du gabarit de nom au moment de
 *     fabriquer une pièce jointe.
 *
 * S'y ajoute la fenêtre « Et maintenant ? » qui suit le premier résumé
 * (components/AfterSummaryDialog.svelte) : elle lit les destinataires et le
 * dossier qu'elle annonce, et ÉCRIT ici les adresses qu'on y ajoute — une
 * adresse ne part que d'un réglage enregistré (cf. l'en-tête de
 * services/api/routes/actions/execute.js).
 *
 * Le second est atteint par HYDRATATION PARESSEUSE (`ensureActionSettings`)
 * plutôt qu'en faisant traverser le réglage depuis App.svelte : ce fichier est à
 * son plafond `max-lines` (cf. eslint.config.js) et ne peut plus grossir d'une
 * ligne. Le store est aussi le bon endroit de toute façon — un seul point
 * d'accès, réactualisé à chaque enregistrement.
 *
 * En échec, on garde des valeurs vides : un gabarit absent fait retomber sur le
 * nom intégré, ce qui est exactement le bon repli.
 *
 * ── Le brouillon (`actionDraft`) ────────────────────────────────────────────
 * La saisie en cours vit ici et non dans le composant, pour une seule raison :
 * changer d'onglet démonte le composant. Tant que l'écran n'enregistre pas
 * automatiquement, une saisie perdue au clic sur un autre onglet est une saisie
 * perdue sans avertissement. Le store, lui, survit au démontage.
 */
import { writable, derived, get } from 'svelte/store';
import { fetchActionSettings, saveActionSettings } from '../services/actionsApi.js';

const EMPTY = {
  mail: { recipients: [], subjectTemplate: '', tagRecipients: [] },
  storage: { folder: '' },
  naming: { filenameTemplate: '' },
  afterSummary: { offer: true },
};

const INITIAL = {
  loaded: false,
  settings: EMPTY,
  ceiling: { email: false, storage: false },
  limits: { maxRecipients: 0, templateMax: 200, folderMax: 500 },
  variables: [],
  defaults: { subjectTemplate: '', filenameTemplate: '' },
  /**
   * Incrémenté à chaque valeur enregistrée reçue du serveur. Sert à PÉRIMER un
   * résultat de test : un « ✓ envoyé » affiché sous des réglages qui ont changé
   * depuis affirme quelque chose qui n'a pas été vérifié.
   */
  revision: 0,
};

export const actionSettings = writable({ ...INITIAL });

/**
 * Saisie en cours, ou `null` si l'écran n'a pas encore été ouvert. Forme plate :
 * ce sont les quatre champs éditables, pas la projection du serveur.
 */
export const actionDraft = writable(null);

/** Vrai dès qu'un champ diverge de ce qui est enregistré. */
export const actionSettingsDirty = derived(
  [actionSettings, actionDraft],
  ([state, draft]) => !!draft && !sameAsSaved(state.settings, draft),
);

/** Projection enregistrée → forme plate du brouillon. */
function toDraft(settings) {
  return {
    recipients: [...(settings.mail?.recipients || [])],
    subjectTemplate: settings.mail?.subjectTemplate || '',
    filenameTemplate: settings.naming?.filenameTemplate || '',
    folder: settings.storage?.folder || '',
    driveId: settings.storage?.driveId || '',
    driveName: settings.storage?.driveName || '',
    requireApproval: !!settings.storage?.requireApproval,
    tagSubfolders: !!settings.storage?.tagSubfolders,
    /** Destinations par tag, indexées par `tagId` — l'affichage suit les tags. */
    tagFolders: Object.fromEntries(
      (settings.storage?.tagFolders || []).map((entry) => [entry.tagId, entry]),
    ),
    /** Destinataires par tag, indexés par `tagId` — `string[]` par entrée. */
    tagRecipients: Object.fromEntries(
      (settings.mail?.tagRecipients || []).map((entry) => [entry.tagId, [...entry.recipients]]),
    ),
    /** Fenêtre « Et maintenant ? » : seul un `false` explicite l'éteint. */
    offerAfterSummary: settings.afterSummary?.offer !== false,
  };
}

/** Deux listes d'adresses, comparées dans l'ORDRE — comme la liste par défaut. */
function sameList(a, b) {
  return a.length === b.length && a.every((address, i) => address === b[i]);
}

/** Une liste par tag = `string[]`. */
function sameTagRecipients(saved, draft) {
  const savedIds = Object.keys(saved);
  const draftIds = Object.keys(draft);
  return (
    savedIds.length === draftIds.length &&
    savedIds.every((id) => !!draft[id] && sameList(saved[id], draft[id]))
  );
}

/** Une destination par tag = { tagId, folder, driveId, driveName }. */
function sameTagFolders(saved, draft) {
  const savedIds = Object.keys(saved);
  const draftIds = Object.keys(draft);
  return (
    savedIds.length === draftIds.length &&
    savedIds.every((id) => {
      const before = saved[id];
      const after = draft[id];
      return (
        !!after &&
        before.folder === after.folder &&
        (before.driveId || '') === (after.driveId || '') &&
        (before.driveName || '') === (after.driveName || '')
      );
    })
  );
}

/**
 * Comparaison champ à champ. Les adresses sont comparées dans l'ORDRE : c'est ce
 * qui sera enregistré, et une liste réordonnée est une modification.
 */
function sameAsSaved(settings, draft) {
  const saved = toDraft(settings);
  return (
    saved.subjectTemplate === draft.subjectTemplate &&
    saved.filenameTemplate === draft.filenameTemplate &&
    saved.folder === draft.folder &&
    saved.driveId === draft.driveId &&
    saved.driveName === draft.driveName &&
    saved.requireApproval === draft.requireApproval &&
    saved.tagSubfolders === draft.tagSubfolders &&
    saved.offerAfterSummary === draft.offerAfterSummary &&
    sameTagFolders(saved.tagFolders, draft.tagFolders) &&
    sameTagRecipients(saved.tagRecipients, draft.tagRecipients) &&
    sameList(saved.recipients, draft.recipients)
  );
}

/** Recharge depuis l'API. Appelé au montage de l'écran et après chaque save. */
export async function refreshActionSettings() {
  const res = await fetchActionSettings();
  if (!res.ok) {
    // On marque quand même `loaded` : sans ça, `ensureActionSettings` rejouerait
    // la requête à chaque pièce jointe, sur un serveur qui vient de la refuser.
    actionSettings.update((state) => ({ ...state, loaded: true }));
    return { ok: false, error: res.data?.error || 'network' };
  }
  applyActionSettings(res.data);
  return { ok: true };
}

/** Charge une seule fois, à la demande. Utilisé hors de l'écran de réglages. */
export async function ensureActionSettings() {
  const state = get(actionSettings);
  if (state.loaded) return state;
  await refreshActionSettings();
  return get(actionSettings);
}

/** Applique la réponse d'un enregistrement sans refaire un aller-retour. */
export function applyActionSettings(data) {
  actionSettings.update((state) => ({
    ...INITIAL,
    ...data,
    loaded: true,
    revision: state.revision + 1,
  }));
}

/**
 * Prépare le brouillon à l'ouverture de l'écran. Ne fait rien s'il en existe
 * déjà un : ce serait effacer la saisie que l'utilisateur vient retrouver.
 */
export function seedActionDraft() {
  if (get(actionDraft)) return;
  actionDraft.set(toDraft(get(actionSettings).settings));
}

/** Rappelle le brouillon sur les valeurs enregistrées — bouton « Annuler ». */
export function resetActionDraft() {
  actionDraft.set(toDraft(get(actionSettings).settings));
}

/**
 * Aligne le brouillon (s'il existe) sur les règles PAR TAG qui viennent d'être
 * ENREGISTRÉES ailleurs — le panneau « Mes tags » écrit les destinations et
 * les destinataires d'un tag sans passer par l'écran Actions. Sans cet
 * alignement, un brouillon ouvert garderait l'ancienne valeur et l'écraserait
 * au prochain « Enregistrer ». Les autres champs du brouillon ne bougent pas :
 * c'est une saisie en cours, pas la nôtre.
 */
export function syncDraftTagRules() {
  syncDraftFields(['tagFolders', 'tagSubfolders', 'tagRecipients']);
}

/**
 * Aligne les champs nommés du brouillon (s'il existe) sur ce qui vient d'être
 * enregistré ailleurs — même raison que `syncDraftTagRules`, pour les autres
 * écrans qui écrivent sans passer par le brouillon.
 *
 * @param {string[]} fields - clés de la forme plate (cf. `toDraft`)
 */
function syncDraftFields(fields) {
  const draft = get(actionDraft);
  if (!draft) return;
  const saved = toDraft(get(actionSettings).settings);
  actionDraft.set({ ...draft, ...Object.fromEntries(fields.map((f) => [f, saved[f]])) });
}

/** Réponse d'un enregistrement partiel → `{ok, error, data}` (le slug du serveur). */
async function savePartial(patch, syncFields) {
  const res = await saveActionSettings(patch);
  if (!res.ok) return { ok: false, error: res.data?.error || 'network', data: res.data || {} };
  applyActionSettings(res.data);
  syncDraftFields(syncFields);
  return { ok: true };
}

/**
 * Enregistre une liste de destinataires ENTIÈRE : celle d'un tag (`tagId`), ou
 * la liste par défaut (`tagId` nul). Patch PARTIEL — la route ne touche que ce
 * qu'on envoie. Les listes des autres tags sont reprises des valeurs
 * ENREGISTRÉES : la route remplace `tagRecipients` d'un bloc.
 *
 * Une liste de tag vide retire le tag : il retombe sur la liste par défaut
 * (cf. `cleanTagRecipients` côté serveur, qui ne garde pas de ligne vide).
 *
 * @param {string|null} tagId
 * @param {string[]} recipients
 * @returns {Promise<{ok: boolean, error?: string, data?: object}>} en refus,
 *   `data` porte ce que le serveur nomme (`rejected`, `max`)
 */
export function saveRecipientList(tagId, recipients) {
  if (!tagId) return savePartial({ mail: { recipients } }, ['recipients']);
  const others = (get(actionSettings).settings.mail?.tagRecipients || []).filter(
    (entry) => entry.tagId !== tagId,
  );
  const tagRecipients = recipients.length ? [...others, { tagId, recipients }] : others;
  return savePartial({ mail: { tagRecipients } }, ['tagRecipients']);
}

/**
 * « Ne plus me proposer » (fenêtre « Et maintenant ? ») et son interrupteur de
 * réactivation. Enregistré sur le COMPTE : le choix suit l'utilisateur d'un
 * poste à l'autre.
 *
 * @param {boolean} offer
 */
export function saveAfterSummaryOffer(offer) {
  return savePartial({ afterSummary: { offer: !!offer } }, ['offerAfterSummary']);
}

/**
 * Remet tout à zéro. Appelé à la déconnexion : les destinataires et le gabarit
 * du compte précédent ne doivent pas se retrouver dans l'écran — ni dans le nom
 * du prochain fichier exporté — du compte suivant.
 */
export function resetActionSettings() {
  actionSettings.set({ ...INITIAL });
  actionDraft.set(null);
}
