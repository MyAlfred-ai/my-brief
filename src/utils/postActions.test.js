/**
 * Traduction d'un résultat d'action en message (utils/postActions.js).
 *
 * Le serveur n'envoie qu'un SLUG (cf. services/api/lib/errors.js) : aucune
 * chaîne affichable n'en vient. Tout l'enjeu de ce module est donc qu'un slug
 * conduise au geste utile — « reconnectez votre compte » et « contactez votre
 * administrateur » appellent des actions différentes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const runActionTest = vi.fn();
const storeDocument = vi.fn();
const sendDocumentByEmail = vi.fn();
vi.mock('../services/actionsApi.js', () => ({
  sendDocumentByEmail: (...args) => sendDocumentByEmail(...args),
  storeDocument: (...args) => storeDocument(...args),
  runActionTest: (...args) => runActionTest(...args),
}));

const { runActionTestAction, runStoreAction, runEmailAction, buildActionDocument, sentTo } =
  await import('./postActions.js');

const TEXTS = { errors: { storage_not_connected: 'Compte non relié.' } };

describe('runActionTestAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rend le transport et les destinataires en cas de succès', async () => {
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { via: 'gmail', recipients: { to: ['a@x.fr'], cc: ['moi@x.fr'] } },
    });
    const result = await runActionTestAction({ target: 'email' }, TEXTS);

    expect(result.ok).toBe(true);
    expect(result.key).toBe('messages.actionTestEmailOk');
    expect(result.vars).toEqual({ recipients: 'a@x.fr, moi@x.fr', via: 'gmail' });
  });

  it("détaille la PROVENANCE de chaque valeur, pas seulement qu'elle a marché", async () => {
    // Un test vert qui ne dit pas d'où vient le dossier ni l'objet ne dit pas
    // ce qui a été testé : les réglages personnels et ceux de l'organisation ne
    // se corrigent pas au même endroit.
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        via: 'gmail',
        from: 'moi@x.fr',
        recipients: { to: ['a@x.fr'], cc: [] },
        recipientsSource: 'user',
        subject: 'CR Point client',
        subjectSource: 'admin',
      },
    });
    const result = await runActionTestAction({ target: 'email' }, TEXTS);

    expect(result.details).toEqual([
      { labelKey: 'configActions.testVia', value: 'gmail', sourceKey: '' },
      { labelKey: 'configActions.testFrom', value: 'moi@x.fr', sourceKey: '' },
      {
        labelKey: 'configActions.testTo',
        value: 'a@x.fr',
        sourceKey: 'configActions.sourceUser',
      },
      {
        labelKey: 'configActions.testSubject',
        value: 'CR Point client',
        sourceKey: 'configActions.sourceAdmin',
      },
    ]);
  });

  it('détaille un dépôt, cache de dossier compris', async () => {
    // `cacheUsed` dit qu'aucune recherche n'a eu lieu chez le fournisseur : sans
    // ça, on conclurait qu'un chemin fraîchement modifié a bien été pris.
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        provider: 'google',
        folderPath: 'Clients/Acme',
        folderSource: 'admin',
        filename: 'test.txt',
        cacheUsed: true,
      },
    });
    const result = await runActionTestAction({ target: 'storage' }, TEXTS);

    expect(result.details).toEqual([
      { labelKey: 'configActions.testProvider', value: 'google', sourceKey: '' },
      {
        labelKey: 'configActions.testFolder',
        value: 'Clients/Acme',
        sourceKey: 'configActions.sourceAdmin',
      },
      { labelKey: 'configActions.testFilename', value: 'test.txt', sourceKey: '' },
      { labelKey: 'configActions.testCacheUsed', value: '', sourceKey: '' },
    ]);
  });

  it('signale une dégradation comme un ÉCHEC, pas comme un succès', async () => {
    // Le mail est bien parti — mais pas au client. Le compter comme un succès
    // laisserait croire à l'utilisateur que sa configuration est bonne.
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { via: 'smtp', degraded: 'smtp_recipients_dropped' },
    });
    const result = await runActionTestAction({ target: 'email' }, TEXTS);

    expect(result.ok).toBe(false);
    expect(result.key).toBe('messages.actionEmailDropped');
  });

  it('rend le nom du fichier et le dossier pour un dépôt', async () => {
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { filename: 'test.txt', folderPath: 'Clients/Acme' },
    });
    const result = await runActionTestAction({ target: 'storage' }, TEXTS);

    expect(result.key).toBe('messages.actionTestStorageOk');
    expect(result.vars).toEqual({ filename: 'test.txt', folder: 'Clients/Acme' });
  });

  it('traduit un slug connu du serveur', async () => {
    runActionTest.mockResolvedValue({
      ok: false,
      status: 501,
      data: { error: 'storage_not_connected' },
    });
    const result = await runActionTestAction({ target: 'storage' }, TEXTS);

    expect(result.ok).toBe(false);
    expect(result.vars.reason).toBe('Compte non relié.');
  });

  it('montre un slug inconnu plutôt que de le taire', async () => {
    // Un message vide obligerait à ouvrir les journaux du serveur ; le slug
    // brut, lui, se cherche dans le code.
    runActionTest.mockResolvedValue({ ok: false, status: 502, data: { error: 'nouveau_slug' } });
    const result = await runActionTestAction({ target: 'email' }, TEXTS);

    expect(result.vars.reason).toBe('nouveau_slug');
  });

  it('distingue le plafond de tests des autres pannes', async () => {
    runActionTest.mockResolvedValue({
      ok: false,
      status: 429,
      data: { error: 'too_many_requests' },
    });
    const result = await runActionTestAction({ target: 'email' }, TEXTS);

    expect(result.key).toBe('messages.actionTestTooMany');
  });

  it('dit COMBIEN de temps attendre quand le serveur le précise', async () => {
    // « Réessayez dans quelques minutes » fait relancer en boucle ; le serveur
    // renvoie le délai exact, le taire était une perte d'information gratuite.
    runActionTest.mockResolvedValue({
      ok: false,
      status: 429,
      data: { error: 'too_many_requests', retryAfter: 180 },
    });
    const result = await runActionTestAction({ target: 'email' }, TEXTS);

    expect(result.key).toBe('messages.actionTestTooManyMinutes');
    expect(result.vars).toEqual({ minutes: 3 });
  });

  it('reste en secondes sous la minute, arrondies au-dessus', async () => {
    runActionTest.mockResolvedValue({
      ok: false,
      status: 429,
      data: { error: 'too_many_requests', retryAfter: 12.4 },
    });
    const result = await runActionTestAction({ target: 'email' }, TEXTS);

    expect(result.key).toBe('messages.actionTestTooManySeconds');
    expect(result.vars).toEqual({ seconds: 13 });
  });
});

describe('runStoreAction — approbation', () => {
  const ATTACHMENT = { blob: new Blob(['x']), filename: 'cr.pdf' };
  const PLAN = { folder: 'Clients/Acme', filename: 'cr.pdf', account: 'moi@x.fr' };

  beforeEach(() => vi.clearAllMocks());

  it('n’envoie rien de plus quand l’utilisateur refuse', async () => {
    storeDocument.mockResolvedValue({
      ok: false,
      status: 409,
      data: { error: 'approval_required', plan: PLAN },
    });
    const showToast = vi.fn();

    const res = await runStoreAction({
      payload: {},
      attachment: ATTACHMENT,
      showToast,
      onApprovalRequired: async () => false,
    });

    expect(res).toEqual({ stored: false });
    expect(storeDocument).toHaveBeenCalledTimes(1);
    // Ni succès ni erreur : refuser n'est pas une panne, aucun toast.
    expect(showToast).not.toHaveBeenCalled();
  });

  it('rejoue l’appel AVEC l’accord une fois donné', async () => {
    storeDocument
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        data: { error: 'approval_required', plan: PLAN },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { folder: 'Clients/Acme' } });
    const showToast = vi.fn();
    const seen = [];

    const res = await runStoreAction({
      payload: {},
      attachment: ATTACHMENT,
      showToast,
      onApprovalRequired: async (plan) => {
        seen.push(plan);
        return true;
      },
    });

    expect(res).toEqual({ stored: true });
    expect(seen).toEqual([PLAN]);
    expect(storeDocument).toHaveBeenCalledTimes(2);
    expect(storeDocument.mock.calls[0][2]).toEqual({ approved: false });
    expect(storeDocument.mock.calls[1][2]).toEqual({ approved: true });
    expect(showToast).toHaveBeenCalledWith('messages.actionStored', 'success', 5000, {
      folder: 'Clients/Acme',
      library: '',
    });
  });

  it('NOMME la bibliothèque quand il y en a une', async () => {
    // Sans elle, un dépôt dans « CR/Client » de Mon Drive et le même dans un
    // Drive partagé produisent un message identique : c'est ce qui a rendu
    // invisible un document parti au mauvais endroit.
    storeDocument.mockResolvedValue({
      ok: true,
      status: 200,
      data: { folder: 'CR/Acme', driveName: 'Drive Équipe' },
    });
    const showToast = vi.fn();

    await runStoreAction({ payload: {}, attachment: ATTACHMENT, showToast });

    expect(showToast).toHaveBeenCalledWith('messages.actionStoredIn', 'success', 5000, {
      folder: 'CR/Acme',
      library: 'Drive Équipe',
    });
  });

  it('ne boucle pas quand le serveur redemande l’approbation malgré l’accord', async () => {
    // Un serveur qui répondrait toujours 409 ferait tourner la récursion à
    // l'infini si l'accord n'était pas consommé.
    storeDocument.mockResolvedValue({
      ok: false,
      status: 409,
      data: { error: 'approval_required', plan: PLAN },
    });
    const onApprovalRequired = vi.fn(async () => true);

    await runStoreAction({
      payload: {},
      attachment: ATTACHMENT,
      showToast: vi.fn(),
      onApprovalRequired,
    });

    expect(storeDocument).toHaveBeenCalledTimes(2);
    expect(onApprovalRequired).toHaveBeenCalledTimes(1);
  });
});

describe('buildActionDocument', () => {
  const base = { kind: 'summary', content: '<p>Compte rendu</p>', lang: 'fr' };

  it("porte le meetingId de la réunion COURANTE — c'est lui qui ouvre le tag", () => {
    // Le serveur relit le tag de cette réunion pour en tirer les destinataires
    // (services/api/lib/actions/resolve.js). Sans identifiant, il retombe sur
    // la liste du compte et le compte rendu n'atteint que son auteur.
    const doc = buildActionDocument({ ...base, title: ' Point client ', meetingId: 'm-42' });

    expect(doc).toEqual({
      kind: 'summary',
      title: 'Point client',
      content: '<p>Compte rendu</p>',
      lang: 'fr',
      meetingId: 'm-42',
    });
  });

  it('accepte une réunion sans identifiant, sans jamais rendre undefined', () => {
    // Réunion pas encore créée en base : le document part quand même, la
    // chaîne serveur retombe sur la liste du compte.
    expect(buildActionDocument({ ...base, meetingId: null }).meetingId).toBe('');
    expect(buildActionDocument({ ...base }).meetingId).toBe('');
  });

  it('rend null quand il n’y a rien à envoyer', () => {
    expect(buildActionDocument({ ...base, content: '' })).toBeNull();
    expect(buildActionDocument({ ...base, content: '   ' })).toBeNull();
  });

  it('prend la transcription pour une transcription, le résumé pour un résumé', () => {
    // Le contenu est choisi par l'appelant : ce module ne connaît pas les
    // variables de l'écran, il ne fait que borner ce qui part.
    const doc = buildActionDocument({ ...base, kind: 'transcription', content: 'Bonjour.' });
    expect(doc.kind).toBe('transcription');
    expect(doc.content).toBe('Bonjour.');
  });
});

describe('runEmailAction — à qui c’est parti', () => {
  beforeEach(() => vi.clearAllMocks());
  const FILE = { blob: new Blob(['x']), filename: 'cr.pdf' };

  it('nomme les destinataires RÉELS, pas le compte qui n’est qu’en copie', async () => {
    sendDocumentByEmail.mockResolvedValue({
      ok: true,
      status: 200,
      data: { via: 'gmail', to: ['dg@acme.com', 'compta@acme.com', 'chef@acme.com'] },
    });
    const showToast = vi.fn();
    await runEmailAction({ payload: {}, attachment: FILE, showToast, email: 'moi@x.fr' });
    expect(showToast).toHaveBeenCalledWith('messages.actionEmailSent', 'success', 5000, {
      email: 'dg@acme.com, compta@acme.com +1',
    });
  });

  it('retombe sur le compte quand le serveur ne les rend pas', async () => {
    sendDocumentByEmail.mockResolvedValue({ ok: true, status: 200, data: { via: 'smtp' } });
    const showToast = vi.fn();
    await runEmailAction({ payload: {}, attachment: null, showToast, email: 'moi@x.fr' });
    expect(showToast).toHaveBeenCalledWith('messages.actionEmailSentNoFile', 'warning', 7000, {
      email: 'moi@x.fr',
    });
  });

  it('sentTo : deux adresses, puis le compte du reste', () => {
    expect(sentTo(['a@x.fr'], 'moi')).toBe('a@x.fr');
    expect(sentTo(['a@x.fr', 'b@x.fr'], 'moi')).toBe('a@x.fr, b@x.fr');
    expect(sentTo([], 'moi')).toBe('moi');
    expect(sentTo(undefined, 'moi')).toBe('moi');
  });
});
