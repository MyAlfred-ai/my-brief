// @vitest-environment jsdom
/**
 * Réglages d'actions — les écritures PARTIELLES faites hors de l'écran de
 * réglages (fenêtre « Et maintenant ? ») : une liste de destinataires, la
 * préférence d'ouverture.
 *
 * Ce qui compte : n'envoyer que ce qui change (la route remplace
 * `tagRecipients` d'un bloc, donc les autres tags doivent être repris), et
 * aligner un brouillon ouvert de l'écran de réglages — sinon son prochain
 * « Enregistrer » écraserait ce qu'on vient d'écrire.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const actionsApi = { fetchActionSettings: vi.fn(), saveActionSettings: vi.fn() };
vi.mock('../services/actionsApi.js', () => ({
  fetchActionSettings: (...a) => actionsApi.fetchActionSettings(...a),
  saveActionSettings: (...a) => actionsApi.saveActionSettings(...a),
}));

const {
  actionSettings,
  actionDraft,
  actionSettingsDirty,
  applyActionSettings,
  resetActionSettings,
  seedActionDraft,
  saveRecipientList,
  saveAfterSummaryOffer,
} = await import('./actionSettings.js');

const BASE = {
  mail: {
    recipients: ['equipe@moi.fr'],
    tagRecipients: [
      { tagId: 't-acme', recipients: ['dg@acme.com'] },
      { tagId: 't-beta', recipients: ['pdg@beta.fr'] },
    ],
  },
  storage: { folder: 'CR' },
  naming: { filenameTemplate: '' },
  afterSummary: { offer: true },
};

/** Le serveur rend les réglages complets après un enregistrement. */
function serverEcho(patch) {
  const settings = {
    ...BASE,
    mail: { ...BASE.mail, ...(patch.mail || {}) },
    afterSummary: { ...BASE.afterSummary, ...(patch.afterSummary || {}) },
  };
  return { ok: true, status: 200, data: { settings } };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetActionSettings();
  applyActionSettings({ settings: BASE });
  actionsApi.saveActionSettings.mockImplementation(async (patch) => serverEcho(patch));
});

describe('saveRecipientList', () => {
  it('liste d’un tag : les AUTRES tags sont repris tels qu’enregistrés', async () => {
    const res = await saveRecipientList('t-acme', ['dg@acme.com', 'compta@acme.com']);
    expect(res).toEqual({ ok: true });
    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      mail: {
        tagRecipients: [
          { tagId: 't-beta', recipients: ['pdg@beta.fr'] },
          { tagId: 't-acme', recipients: ['dg@acme.com', 'compta@acme.com'] },
        ],
      },
    });
  });

  it('une liste de tag vide retire le tag — il retombe sur la liste par défaut', async () => {
    await saveRecipientList('t-acme', []);
    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      mail: { tagRecipients: [{ tagId: 't-beta', recipients: ['pdg@beta.fr'] }] },
    });
  });

  it('sans tag : la liste par défaut, et elle seule', async () => {
    await saveRecipientList(null, ['equipe@moi.fr', 'x@moi.fr']);
    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      mail: { recipients: ['equipe@moi.fr', 'x@moi.fr'] },
    });
    expect(get(actionSettings).settings.mail.recipients).toEqual(['equipe@moi.fr', 'x@moi.fr']);
  });

  it('rend le refus du serveur, avec ce qu’il nomme', async () => {
    actionsApi.saveActionSettings.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: 'recipient_invalid', rejected: ['x@'] },
    });
    const res = await saveRecipientList(null, ['x@']);
    expect(res).toMatchObject({
      ok: false,
      error: 'recipient_invalid',
      data: { rejected: ['x@'] },
    });
    expect(get(actionSettings).settings.mail.recipients).toEqual(['equipe@moi.fr']);
  });

  it('aligne le brouillon ouvert de l’écran de réglages, sans le marquer modifié', async () => {
    seedActionDraft();
    await saveRecipientList('t-acme', ['dg@acme.com', 'compta@acme.com']);
    expect(get(actionDraft).tagRecipients['t-acme']).toEqual(['dg@acme.com', 'compta@acme.com']);
    expect(get(actionSettingsDirty)).toBe(false);
  });
});

describe('saveAfterSummaryOffer', () => {
  it('enregistre la préférence et aligne le brouillon', async () => {
    seedActionDraft();
    expect(get(actionDraft).offerAfterSummary).toBe(true);
    await saveAfterSummaryOffer(false);
    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({ afterSummary: { offer: false } });
    expect(get(actionSettings).settings.afterSummary.offer).toBe(false);
    expect(get(actionDraft).offerAfterSummary).toBe(false);
    expect(get(actionSettingsDirty)).toBe(false);
  });

  it('un compte sans réglage voit la fenêtre (seul un `false` l’éteint)', () => {
    resetActionSettings();
    applyActionSettings({ settings: { ...BASE, afterSummary: undefined } });
    seedActionDraft();
    expect(get(actionDraft).offerAfterSummary).toBe(true);
  });
});
