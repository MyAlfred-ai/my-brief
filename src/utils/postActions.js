/**
 * Actions post-réunion : envoi par mail et dépôt sur le Drive du compte relié.
 *
 * Ce module ne contient que la traduction d'un résultat d'API en message pour
 * l'utilisateur. L'enjeu est qu'un échec dise ce qu'il faut FAIRE : « reconnectez
 * votre compte » et « contactez votre administrateur » appellent des gestes
 * différents, et un message unique obligerait à ouvrir les logs du serveur pour
 * savoir lequel s'applique.
 */
import { sendDocumentByEmail, storeDocument, runActionTest } from '../services/actionsApi.js';
import { requestStoreApproval } from '../stores/storeApproval.js';

/**
 * Document envoyé aux routes /actions — le corps commun au mail et au dépôt.
 *
 * `meetingId` est la seule chose que le client ait le droit de dire sur la
 * DESTINATION, et encore : ce n'en est pas une. C'est une RÉFÉRENCE que le
 * serveur relit en base sous le scope du demandeur pour retrouver le tag de la
 * conversation — lequel décide des destinataires du mail et du dossier de dépôt
 * (cf. services/api/lib/actions/resolve.js).
 *
 * ⚠️ Il vient de la réunion COURANTE (`currentMeetingId`), jamais de la
 * sélection d'historique. Démarrer un enregistrement remet `selectedMeetingId`
 * à null, et il le reste tant que la réunion n'est pas rouverte depuis la
 * liste : une réunion tout juste enregistrée partait donc sans identifiant. Le
 * serveur ne pouvait plus relire son tag et retombait en silence sur la liste
 * du compte — le compte rendu n'atteignait que son auteur.
 *
 * @param {{kind: 'transcription'|'summary', content: string, title?: string,
 *   lang?: string, meetingId?: string|null}} params
 * @returns {{kind: string, title: string, content: string, lang: string,
 *   meetingId: string}|null} null s'il n'y a rien à envoyer
 */
export function buildActionDocument({ kind, content, title, lang, meetingId }) {
  if (!content || !content.trim()) return null;
  return {
    kind,
    title: String(title || '').trim(),
    content,
    lang,
    meetingId: meetingId || '',
  };
}

/**
 * À qui le document est parti, pour la notification : deux adresses, puis
 * « +N ». C'est la liste que le serveur a RÉELLEMENT appliquée (`to`) — celle
 * du tag, par exemple. Annoncer l'adresse du compte, qui n'est qu'en copie,
 * cachait justement l'information qu'on attend d'un envoi à des tiers.
 *
 * @param {string[]|undefined} to - destinataires rendus par /actions/email
 * @param {string} fallback - le compte, pour un serveur qui ne les rend pas
 */
export function sentTo(to, fallback) {
  const list = Array.isArray(to) ? to.filter(Boolean) : [];
  if (!list.length) return fallback;
  const shown = list.slice(0, 2).join(', ');
  return list.length > 2 ? `${shown} +${list.length - 2}` : shown;
}

/**
 * @param {object} params
 * @param {object} params.payload - { kind, title, content, lang }
 * @param {{blob: Blob, filename: string}|null} params.attachment
 * @param {Function} params.showToast - (slug, type, durée, variables)
 * @param {string} params.email - le compte : repli si le serveur ne nomme pas
 *   les destinataires
 */
export async function runEmailAction({ payload, attachment, showToast, email }) {
  const res = await sendDocumentByEmail(payload, attachment);
  const recipients = sentTo(res.data?.to, email);
  if (res.ok && res.data?.degraded === 'smtp_recipients_dropped') {
    // Le document EST parti — mais pas à qui l'utilisateur croit. Le taire
    // laisserait croire que son client l'a reçu.
    showToast('messages.actionEmailDropped', 'warning', 9000);
  } else if (res.ok && attachment) {
    showToast('messages.actionEmailSent', 'success', 5000, { email: recipients });
  } else if (res.ok) {
    // Parti quand même : le corps du mail contient déjà tout le document.
    showToast('messages.actionEmailSentNoFile', 'warning', 7000, { email: recipients });
  } else if (res.data?.error === 'attachment_too_large') {
    showToast('messages.actionEmailTooLarge', 'error', 7000);
  } else {
    showToast('messages.actionEmailError', 'error', 6000);
  }
}

/**
 * @param {object} params
 * @param {object} params.payload
 * @param {{blob: Blob, filename: string}|null} params.attachment - le fichier
 *   EST l'objet du dépôt : sans lui, il n'y a rien à envoyer
 * @param {Function} params.showToast
 * @param {string} params.providerLabel - « Google Drive » / « OneDrive »
 * @param {boolean} [params.approved] - accord donné devant l'écran d'approbation
 * @param {Function} [params.onApprovalRequired] - reçoit le plan résolu par le
 *   serveur ; tant qu'il n'a pas rendu `true`, RIEN n'est déposé
 * @returns {Promise<{stored: boolean}>}
 */
export async function runStoreAction({
  payload,
  attachment,
  showToast,
  providerLabel,
  approved = false,
  onApprovalRequired = requestStoreApproval,
}) {
  if (!attachment) {
    showToast('messages.actionStorageError', 'error', 6000);
    return { stored: false };
  }
  const res = await storeDocument(payload, attachment, { approved });
  const slug = res.data?.error;

  // Ni un succès ni un échec : le serveur rend la destination qu'il a résolue
  // pour que l'utilisateur la relise. C'est LUI qui décide, et l'appel repart
  // avec son accord — l'approbation ne peut donc pas être contournée par un
  // client qui l'ignorerait.
  if (slug === 'approval_required') {
    if (!onApprovalRequired) return { stored: false };
    const confirmed = await onApprovalRequired(res.data.plan || {});
    if (!confirmed) return { stored: false };
    // `onApprovalRequired: null` : un accord ne se redemande pas. Sans ce
    // passage, un serveur qui répondrait encore `approval_required` — parce
    // qu'il ignore le champ, ou qu'un proxy l'a mangé — relancerait la demande
    // à chaque tour, indéfiniment.
    return runStoreAction({
      payload,
      attachment,
      showToast,
      providerLabel,
      approved: true,
      onApprovalRequired: null,
    });
  }

  if (res.ok) {
    // La BIBLIOTHÈQUE est nommée dès qu'il y en a une. Sans elle, un dépôt dans
    // « CR/Client » de Mon Drive et le même dans un Drive partagé produisaient
    // un message identique : impossible de voir qu'un document était parti au
    // mauvais endroit, et c'est ce qui a masqué le bug des destinations
    // « bibliothèque sans chemin ».
    const library = res.data?.driveName || '';
    showToast(library ? 'messages.actionStoredIn' : 'messages.actionStored', 'success', 5000, {
      folder: res.data?.folder || '',
      library,
    });
    return { stored: true };
  }
  if (slug === 'storage_not_connected' || slug === 'storage_not_configured') {
    showToast('messages.actionStorageNotConnected', 'warning', 7000, { provider: providerLabel });
  } else if (slug === 'storage_scope_missing' || slug === 'storage_auth_revoked') {
    // La connexion existe mais ne couvre pas (ou plus) le dépôt : la reconnecter
    // est la seule issue, et c'est ce que dit le message.
    showToast('messages.actionStorageReconnect', 'warning', 8000);
  } else {
    showToast('messages.actionStorageError', 'error', 6000);
  }
  return { stored: false };
}

/**
 * D'où vient une valeur résolue, en clé de libellé. Le serveur étiquette chaque
 * champ (`resolveActionContext` porte une `source` par réglage) et c'est ce qui
 * transforme un test en diagnostic : « ce dossier vient de VOS réglages » et
 * « ce dossier vient de l'organisation » se corrigent à deux endroits
 * différents.
 */
const SOURCE_KEY = {
  user: 'configActions.sourceUser',
  admin: 'configActions.sourceAdmin',
  builtin: 'configActions.sourceBuiltin',
  account: 'configActions.sourceAccount',
  default: 'configActions.sourceDefault',
  tag: 'configActions.sourceTag',
};

/** Une ligne du diagnostic. `source` est optionnelle — toutes n'en ont pas. */
function detail(labelKey, value, source) {
  return { labelKey, value: String(value), sourceKey: SOURCE_KEY[source] || '' };
}

/** Lignes de diagnostic d'un test d'envoi réussi. */
function emailDetails(data) {
  const recipients = [...(data.recipients?.to || []), ...(data.recipients?.cc || [])];
  const lines = [detail('configActions.testVia', data.via || '')];
  if (data.from) lines.push(detail('configActions.testFrom', data.from));
  if (recipients.length) {
    lines.push(detail('configActions.testTo', recipients.join(', '), data.recipientsSource));
  }
  if (data.subject) {
    lines.push(detail('configActions.testSubject', data.subject, data.subjectSource));
  }
  return lines;
}

/** Lignes de diagnostic d'un dépôt réussi. */
function storageDetails(data) {
  const lines = [];
  if (data.provider) lines.push(detail('configActions.testProvider', data.provider));
  lines.push(detail('configActions.testFolder', data.folderPath || 'myBrief', data.folderSource));
  if (data.filename) lines.push(detail('configActions.testFilename', data.filename));
  // Un dossier réutilisé depuis le cache n'a pas été re-résolu chez le
  // fournisseur : le dire évite de conclure qu'un chemin fraîchement modifié a
  // été pris en compte alors que c'est l'ancien identifiant qui a servi.
  if (data.cacheUsed) lines.push(detail('configActions.testCacheUsed', ''));
  return lines;
}

/**
 * Plafond de tests atteint (429). Le serveur renvoie `retryAfter` en secondes —
 * l'ignorer laissait l'utilisateur relancer en boucle sans savoir combien de
 * temps attendre.
 */
function tooManyResult(data) {
  const seconds = Number(data?.retryAfter);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { ok: false, key: 'messages.actionTestTooMany', vars: {}, details: [] };
  }
  if (seconds >= 60) {
    return {
      ok: false,
      key: 'messages.actionTestTooManyMinutes',
      vars: { minutes: Math.ceil(seconds / 60) },
      details: [],
    };
  }
  return {
    ok: false,
    key: 'messages.actionTestTooManySeconds',
    vars: { seconds: Math.ceil(seconds) },
    details: [],
  };
}

/**
 * Bouton « Tester » — exécute réellement l'action et rend un diagnostic prêt à
 * afficher.
 *
 * Les slugs d'erreur sont ceux des actions réelles : la table ci-dessus est
 * réemployée telle quelle, pas dupliquée. C'est aussi ce qui garantit qu'un
 * message ajouté pour une panne d'envoi apparaît automatiquement dans le test.
 *
 * `details` est le détail de CE qui s'est passé (transport, destinataires
 * réels, provenance de chaque valeur). Un vert/rouge seul dirait que ça marche
 * sans dire avec quels réglages — et c'est justement ce qu'on teste.
 *
 * @param {{target: 'email'|'storage', kind?: string, lang?: string,
 *   scope?: 'user'|'admin'}} payload
 * @param {{errors: Record<string, string>}} texts - libellés d'erreur par slug
 * @returns {Promise<{ok: boolean, key: string, vars: object,
 *   details: Array<{labelKey: string, value: string, sourceKey: string}>}>}
 */
export async function runActionTestAction(payload, texts) {
  const res = await runActionTest(payload);
  const data = res.data || {};

  if (!res.ok) {
    if (res.status === 429) return tooManyResult(data);
    return {
      ok: false,
      key: 'messages.actionTestError',
      // Le serveur n'envoie qu'un slug : c'est le client qui décide du texte
      // (cf. lib/errors.js). Slug inconnu ⇒ on le montre plutôt que de le taire.
      vars: { reason: texts?.errors?.[data.error] || data.error || 'unknown' },
      details: [],
    };
  }

  if (payload.target === 'storage') {
    return {
      ok: true,
      key: 'messages.actionTestStorageOk',
      vars: { filename: data.filename || '', folder: data.folderPath || 'myBrief' },
      details: storageDetails(data),
    };
  }
  if (data.degraded === 'smtp_recipients_dropped') {
    // Parti, mais pas à qui l'utilisateur croit : le détail montre à QUI, ce qui
    // est toute l'information manquante d'un simple « dégradé ».
    return {
      ok: false,
      key: 'messages.actionEmailDropped',
      vars: {},
      details: emailDetails(data),
    };
  }
  return {
    ok: true,
    key: 'messages.actionTestEmailOk',
    vars: {
      recipients: [...(data.recipients?.to || []), ...(data.recipients?.cc || [])].join(', '),
      via: data.via || '',
    },
    details: emailDetails(data),
  };
}
