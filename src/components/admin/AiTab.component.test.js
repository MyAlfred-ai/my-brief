/**
 * Onglet « IA » de l'administration : clé OpenAI + modèle de transcription.
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - enregistrer le MODÈLE n'envoie pas la clé. Un corps qui porterait
 *     toujours `apiKey` l'effacerait (vide = « retire la clé ») et l'IA
 *     tomberait pour toute l'installation ;
 *   - la liste proposée est celle du SERVEUR — un modèle inventé par l'écran
 *     serait refusé par OpenAI au prochain enregistrement, chez l'utilisateur ;
 *   - le bouton « Tester » affiche son verdict. Un test réel dont le résultat
 *     n'apparaît pas ne diagnostique rien ;
 *   - chaque modèle de transcription montre son prix (niveau en « € », coût
 *     d'une heure en euros), et changer de modèle dit l'écart AVANT
 *     d'enregistrer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';
import { formatEuros } from './stats/format.js';
import { panelNav } from '../../stores/panels.js';

const fetchAiSettings = vi.fn();
const saveAiSettings = vi.fn();
const testAiKey = vi.fn();
const testTranscriptionModel = vi.fn();
const testSummaryModel = vi.fn();

vi.mock('../../services/adminUsersApi.js', () => ({
  fetchAiSettings: (...args) => fetchAiSettings(...args),
  saveAiSettings: (...args) => saveAiSettings(...args),
  testAiKey: (...args) => testAiKey(...args),
  testTranscriptionModel: (...args) => testTranscriptionModel(...args),
  testSummaryModel: (...args) => testSummaryModel(...args),
}));

const { default: AiTab } = await import('./AiTab.svelte');

const a = uiTextData.fr.adminAi;

const settings = (over = {}) => ({
  hasKey: true,
  source: 'env',
  hint: 'sk-pro…QLAA',
  transcriptionModel: 'gpt-realtime-whisper',
  transcriptionModelSource: 'default',
  transcriptionModels: ['gpt-realtime-whisper', 'gpt-4o-transcribe', 'whisper-1'],
  summaryModel: 'gpt-5.4',
  summaryModelSource: 'default',
  summaryModels: ['gpt-5.6-sol', 'gpt-5.4', 'gpt-5.4-mini'],
  summaryModelOffList: false,
  infographicEnabled: true,
  infographicImageModel: 'gpt-image-2.5-flare',
  infographicImageModelSource: 'default',
  infographicImageModels: ['gpt-image-2.5-flare', 'gpt-image-2'],
  infographicImageModelOffList: false,
  infographicStyle: '',
  updatedAt: null,
  updatedBy: null,
  ...over,
});

/**
 * Prix servis avec les réglages (GET /settings/ai) : tarifs du catalogue
 * intégré, au taux de repli — 0,017 $ et 0,006 $ la minute.
 */
const PRICES = {
  transcription: [
    { model: 'gpt-realtime-whisper', current: true, unitEur: 0.8971 },
    { model: 'gpt-4o-transcribe', current: false, unitEur: 0.3166 },
    { model: 'whisper-1', current: false, unitEur: 0.3166 },
  ],
  checkedAt: '2026-09-25',
  source: 'builtin',
  refreshedAt: null,
  refreshedBy: null,
  fx: { usdToEur: 0.8795, date: '2026-09-25', source: 'builtin' },
};

/** Attend la fin du chargement initial (onMount → fetch) ; rend le groupe des modèles. */
async function renderTab(over = {}, prices = PRICES) {
  fetchAiSettings.mockResolvedValue({ ok: true, data: { settings: settings(over), prices } });
  render(AiTab);
  return screen.findByRole('group', { name: a.modelLabel });
}

/** Le bouton radio d'un modèle de transcription, par son nom. */
const radio = (id) => screen.getByRole('radio', { name: id });
/** La ligne entière d'un modèle : nom, description, prix. */
const row = (id) => radio(id).closest('label');

describe('AiTab — modèle de transcription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne propose que les modèles servis par le serveur, du moins cher au plus cher', async () => {
    const group = await renderTab();
    const radios = within(group).getAllByRole('radio');
    // À prix égal, l'ordre du serveur : gpt-4o-transcribe avant whisper-1.
    expect(radios.map((r) => r.value)).toEqual([
      'gpt-4o-transcribe',
      'whisper-1',
      'gpt-realtime-whisper',
    ]);
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['gpt-realtime-whisper']);
  });

  it("enregistre le modèle SANS toucher à la clé — sinon l'IA tombe pour tout le monde", async () => {
    await renderTab();
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: {
        settings: settings({
          transcriptionModel: 'gpt-4o-transcribe',
          transcriptionModelSource: 'settings',
        }),
      },
    });

    await userEvent.click(radio('gpt-4o-transcribe'));
    // UN bouton « Enregistrer » pour la page : le corps ne porte que ce qui a
    // changé — la clé n'ayant pas été saisie, elle n'y figure pas.
    await userEvent.click(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }));

    expect(saveAiSettings).toHaveBeenCalledWith({ transcriptionModel: 'gpt-4o-transcribe' });
    expect(saveAiSettings.mock.calls[0][0]).not.toHaveProperty('apiKey');
    expect(await screen.findByText(a.modelSaved)).toBeTruthy();
    expect(screen.queryByText(a.saved)).toBeNull();
  });

  it('clé ET modèle modifiés : une seule requête, les deux champs', async () => {
    await renderTab();
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: {
        settings: settings({
          source: 'settings',
          hint: 'sk-new…1234',
          transcriptionModel: 'whisper-1',
          transcriptionModelSource: 'settings',
        }),
      },
    });

    await userEvent.type(screen.getByLabelText(a.keyLabel), ' sk-new-key ');
    await userEvent.click(radio('whisper-1'));
    await userEvent.click(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }));

    expect(saveAiSettings).toHaveBeenCalledTimes(1);
    expect(saveAiSettings).toHaveBeenCalledWith({
      apiKey: 'sk-new-key',
      transcriptionModel: 'whisper-1',
    });
    expect(await screen.findByText(a.saved)).toBeTruthy();
    expect(screen.getByText(a.modelSaved)).toBeTruthy();
    // Le champ clé se vide : la clé n'est jamais réaffichée.
    expect(screen.getByLabelText(a.keyLabel).value).toBe('');
  });

  it('« Annuler » rend au modèle sa valeur enregistrée et vide la clé saisie', async () => {
    await renderTab();
    await userEvent.type(screen.getByLabelText(a.keyLabel), 'sk-draft');
    await userEvent.click(radio('whisper-1'));
    expect(screen.getByText(a.unsavedHint)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: a.discardChanges }));

    expect(radio('gpt-realtime-whisper').checked).toBe(true);
    expect(screen.getByLabelText(a.keyLabel).value).toBe('');
    expect(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }).disabled).toBe(true);
    expect(saveAiSettings).not.toHaveBeenCalled();
  });

  it('teste le modèle SÉLECTIONNÉ, pas celui déjà enregistré', async () => {
    // On teste avant d'enregistrer : c'est tout l'intérêt, découvrir ici qu'un
    // modèle est hors abonnement plutôt qu'au démarrage d'une réunion.
    await renderTab();
    testTranscriptionModel.mockResolvedValue({ ok: true, data: { ok: true } });

    await userEvent.click(radio('whisper-1'));
    await userEvent.click(screen.getByRole('button', { name: a.modelTest }));

    expect(testTranscriptionModel).toHaveBeenCalledWith('whisper-1');
    expect(await screen.findByText(a.modelTestOk)).toBeTruthy();
  });

  it("affiche le refus d'OpenAI mot pour mot", async () => {
    await renderTab();
    testTranscriptionModel.mockResolvedValue({
      ok: false,
      data: {
        error: 'transcription_model_rejected',
        upstreamMessage: 'Your organization does not have access to this transcription model.',
      },
    });

    await userEvent.click(screen.getByRole('button', { name: a.modelTest }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(a.errors.transcription_model_rejected);
    expect(alert.textContent).toContain('does not have access');
  });

  it('un modèle retiré par OpenAI : l’avis nomme son remplaçant, « Garder » l’enregistre', async () => {
    const current = ['gpt-realtime-whisper', 'gpt-live-transcribe', 'gpt-transcribe'];
    const retired = {
      transcriptionModel: 'gpt-transcribe',
      transcriptionModelSource: 'settings',
      transcriptionModels: current,
    };
    await renderTab(
      { ...retired, transcriptionModelRetired: { from: 'gpt-4o-transcribe', date: '2027-02-26' } },
      null,
    );
    const notice = a.modelRetired
      .replace('{from}', 'gpt-4o-transcribe')
      .replace('{date}', '26/02/2027')
      .replace('{model}', 'gpt-transcribe');
    expect(
      screen.getByText((_, el) => el.tagName === 'P' && el.textContent.includes(notice)),
    ).toBeTruthy();
    // Le remplaçant est déjà « en service » : le choisir dans la liste ne
    // changerait rien, d'où le bouton.
    expect(radio('gpt-transcribe').checked).toBe(true);
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ ...retired, transcriptionModelRetired: null }) },
    });

    const keep = a.modelRetiredKeep.replace('{model}', 'gpt-transcribe');
    await userEvent.click(screen.getByRole('button', { name: keep }));

    expect(saveAiSettings).toHaveBeenCalledWith({ transcriptionModel: 'gpt-transcribe' });
    expect(await screen.findByText(a.modelSaved)).toBeTruthy();
    expect(screen.queryByRole('button', { name: keep })).toBeNull();
  });

  it('sans clé configurée, le test est hors de portée', async () => {
    await renderTab({ hasKey: false, source: 'none' });
    expect(screen.getByRole('button', { name: a.modelTest }).disabled).toBe(true);
  });
});

describe('AiTab — prix des modèles de transcription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chaque modèle montre son niveau en « € » et le coût d’une heure en euros', async () => {
    await renderTab();
    const expensive = row('gpt-realtime-whisper');
    expect(expensive.textContent).toContain(formatEuros(0.8971, 'fr'));
    expect(expensive.textContent).toContain(a.pricePerHour);
    // 2,8 fois le moins cher : deux doublements, trois « € » sur quatre.
    expect(expensive.querySelectorAll('.mp-on')).toHaveLength(3);
    expect(expensive.textContent).toContain(
      a.priceLevel.replace('{tier}', 3).replace('{levels}', 4),
    );
    expect(row('gpt-4o-transcribe').querySelectorAll('.mp-on')).toHaveLength(1);
    expect(row('gpt-4o-transcribe').textContent).toContain(formatEuros(0.3166, 'fr'));
  });

  it('« En service » marque le modèle enregistré, et lui seul', async () => {
    await renderTab();
    expect(row('gpt-realtime-whisper').textContent).toContain(a.modelInService);
    expect(row('whisper-1').textContent).not.toContain(a.modelInService);
  });

  it('choisir un autre modèle dit l’écart par heure, avant d’enregistrer', async () => {
    await renderTab();
    expect(screen.queryByText(/par heure que le modèle en service/)).toBeNull();

    await userEvent.click(radio('gpt-4o-transcribe'));
    // Annoncé au lecteur d'écran : la zone d'annonce existait avant le texte.
    expect(screen.getByRole('status').textContent).toMatch(/de moins par heure/);
    const saving = a.priceDeltaLess.replace('{amount}', formatEuros(0.8971 - 0.3166, 'fr'));
    // getByText compare au texte de la page, espaces normalisés : l'espace
    // insécable fine qu'Intl pose avant « € » doit l'être aussi.
    expect(screen.getByText(saving.replace(/\s+/g, ' '))).toBeTruthy();
    expect(saveAiSettings).not.toHaveBeenCalled();
  });

  it('même prix que le modèle en service : il le dit', async () => {
    await renderTab({ transcriptionModel: 'gpt-4o-transcribe' });
    await userEvent.click(radio('whisper-1'));
    expect(screen.getByText(a.priceDeltaSame)).toBeTruthy();
  });

  it('dit d’où viennent les tarifs, et mène à Statistiques pour les actualiser', async () => {
    await renderTab();
    const costs = uiTextData.fr.adminStats.costs;
    expect(screen.getByText(a.pricesBasis)).toBeTruthy();
    expect(
      screen.getByText(new RegExp(costs.pricesAsOf.replace(' du {date} ({source})', ''))),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: a.pricesRefreshLink }));
    expect(get(panelNav).active).toBe('stats');
  });

  it('sans tarifs, les modèles restent au choix, sans prix ni note de tarifs', async () => {
    await renderTab({}, null);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(row('gpt-realtime-whisper').querySelector('.mp-tier')).toBeNull();
    expect(screen.queryByText(a.priceUnknown)).toBeNull();
    expect(screen.queryByText(a.pricesBasis)).toBeNull();
  });

  it('un modèle sans tarif connu le dit, au lieu d’un prix', async () => {
    await renderTab(
      {},
      {
        ...PRICES,
        transcription: PRICES.transcription.map((entry) =>
          entry.model === 'whisper-1' ? { ...entry, unitEur: null } : entry,
        ),
      },
    );
    expect(row('whisper-1').textContent).toContain(a.priceUnknown);
    // Sans prix, il ferme la marche.
    expect(screen.getAllByRole('radio').at(-1).value).toBe('whisper-1');
  });
});

describe('AiTab — infographie de compte rendu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("désactiver l'infographie n'envoie QUE ce réglage — ni clé, ni modèle", async () => {
    await renderTab({ infographicEnabled: true });
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ infographicEnabled: false }) },
    });

    await userEvent.click(screen.getByLabelText(a.infographicToggleLabel));
    await userEvent.click(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }));

    expect(saveAiSettings).toHaveBeenCalledWith({ infographicEnabled: false });
    expect(await screen.findByText(a.infographicSaved)).toBeTruthy();
  });

  it("une projection d'avant ce réglage vaut « activée », pas « modifiée »", async () => {
    // Le mock par défaut ne porte pas le champ : rien à enregistrer pour autant.
    await renderTab();
    expect(screen.getByLabelText(a.infographicToggleLabel).checked).toBe(true);
    expect(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }).disabled).toBe(true);
  });

  it('le style graphique part SEUL, trimé — ni clé, ni modèle, ni interrupteur', async () => {
    await renderTab();
    const STYLE = 'Violet, orange et rose. Nom de la société en haut à gauche.';
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ infographicStyle: STYLE }) },
    });

    await userEvent.type(screen.getByLabelText(a.infographicStyleLabel), ` ${STYLE} `);
    await userEvent.click(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }));

    expect(saveAiSettings).toHaveBeenCalledWith({ infographicStyle: STYLE });
    expect(await screen.findByText(a.infographicStyleSaved)).toBeTruthy();
    // Enregistré = plus rien à enregistrer : la valeur servie est trimée, la
    // comparaison doit l'être des deux côtés.
    expect(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }).disabled).toBe(true);
  });

  it('la charte se vide — champ présent et vide = « plus de style imposé »', async () => {
    const STYLE = 'Violet et orange.';
    await renderTab({ infographicStyle: STYLE });
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ infographicStyle: '' }) },
    });

    await userEvent.clear(screen.getByLabelText(a.infographicStyleLabel));
    await userEvent.click(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }));

    expect(saveAiSettings).toHaveBeenCalledWith({ infographicStyle: '' });
  });

  it('infographie masquée : plus de champ de charte — rien à charter', async () => {
    await renderTab({ infographicEnabled: true, infographicStyle: 'Violet.' });
    expect(screen.getByLabelText(a.infographicStyleLabel)).toBeTruthy();
    await userEvent.click(screen.getByLabelText(a.infographicToggleLabel));
    expect(screen.queryByLabelText(a.infographicStyleLabel)).toBeNull();
  });
});

describe('AiTab — modèle de rédaction du compte rendu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propose les modèles servis par le serveur, sur la valeur en vigueur', async () => {
    await renderTab();
    const select = screen.getByLabelText(a.summaryLabel);
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual([
      'gpt-5.6-sol',
      'gpt-5.4',
      'gpt-5.4-mini',
    ]);
    expect(select.value).toBe('gpt-5.4');
  });

  it("n'envoie QUE le modèle de rédaction — ni clé, ni modèle de transcription", async () => {
    await renderTab();
    const select = screen.getByLabelText(a.summaryLabel);
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: {
        settings: settings({ summaryModel: 'gpt-5.6-sol', summaryModelSource: 'settings' }),
      },
    });

    await userEvent.selectOptions(select, 'gpt-5.6-sol');
    await userEvent.click(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }));

    expect(saveAiSettings).toHaveBeenCalledWith({ summaryModel: 'gpt-5.6-sol' });
    expect(saveAiSettings.mock.calls[0][0]).not.toHaveProperty('apiKey');
    expect(saveAiSettings.mock.calls[0][0]).not.toHaveProperty('transcriptionModel');
    expect(await screen.findByText(a.summarySaved)).toBeTruthy();
  });

  it('teste le modèle SÉLECTIONNÉ, avant enregistrement', async () => {
    await renderTab();
    testSummaryModel.mockResolvedValue({ ok: true, data: { ok: true } });

    await userEvent.selectOptions(screen.getByLabelText(a.summaryLabel), 'gpt-5.4-mini');
    await userEvent.click(screen.getByRole('button', { name: a.summaryTest }));

    expect(testSummaryModel).toHaveBeenCalledWith('gpt-5.4-mini');
    expect(await screen.findByText(a.summaryTestOk)).toBeTruthy();
  });

  it("affiche le refus d'OpenAI mot pour mot", async () => {
    await renderTab();
    testSummaryModel.mockResolvedValue({
      ok: false,
      data: {
        error: 'summary_model_rejected',
        upstreamMessage: 'Your organization must be verified to use the model `gpt-5.6-sol`.',
      },
    });

    await userEvent.click(screen.getByRole('button', { name: a.summaryTest }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(a.errors.summary_model_rejected);
    expect(alert.textContent).toContain('must be verified');
  });

  it('un modèle imposé par le serveur et HORS liste reste affiché et signalé', async () => {
    // Sans l'ajouter au menu, le <select> n'aurait aucune option correspondante,
    // afficherait le premier élément — et l'écran mentirait sur le modèle en
    // service. OPENAI_MODEL_SUMMARY est la porte de sortie de l'administrateur
    // système : elle doit rester lisible ici.
    // Cas réel : les paliers `terra` et `luna` de GPT-5.6 ne sont pas dans la
    // liste proposée, mais un déploiement peut légitimement les viser.
    await renderTab({
      summaryModel: 'gpt-5.6-terra',
      summaryModelSource: 'env',
      summaryModelOffList: true,
    });
    const select = screen.getByLabelText(a.summaryLabel);
    expect(select.value).toBe('gpt-5.6-terra');
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toContain('gpt-5.6-terra');
    expect(screen.getByText(a.summaryOffList)).toBeTruthy();
    expect(screen.getByText(a.summarySourceEnv)).toBeTruthy();
  });

  it('sans clé configurée, le test est hors de portée', async () => {
    await renderTab({ hasKey: false, source: 'none' });
    expect(screen.getByRole('button', { name: a.summaryTest }).disabled).toBe(true);
  });
});

describe("AiTab — modèle qui dessine l'infographie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propose les modèles servis par le serveur, sur la valeur en vigueur', async () => {
    await renderTab();
    const select = screen.getByLabelText(a.infographicModelLabel);
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual([
      'gpt-image-2.5-flare',
      'gpt-image-2',
    ]);
    // Le défaut de l'application, servi par la projection : l'écran ne le
    // recopie pas, il l'affiche.
    expect(select.value).toBe('gpt-image-2.5-flare');
  });

  it("n'envoie QUE le modèle d'infographie — ni clé, ni modèle de rédaction", async () => {
    await renderTab();
    const select = screen.getByLabelText(a.infographicModelLabel);
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: {
        settings: settings({
          infographicImageModel: 'gpt-image-2',
          infographicImageModelSource: 'settings',
        }),
      },
    });

    await userEvent.selectOptions(select, 'gpt-image-2');
    await userEvent.click(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }));

    expect(saveAiSettings).toHaveBeenCalledWith({ infographicImageModel: 'gpt-image-2' });
    expect(saveAiSettings.mock.calls[0][0]).not.toHaveProperty('apiKey');
    expect(saveAiSettings.mock.calls[0][0]).not.toHaveProperty('summaryModel');
    expect(await screen.findByText(a.infographicModelSaved)).toBeTruthy();
  });

  it('un palier imposé par le serveur et HORS liste reste affiché et signalé', async () => {
    // Cas réel : `gpt-image-2.5-sunburst` n'est pas proposé ici faute de mesure,
    // mais un déploiement peut légitimement le viser par
    // OPENAI_MODEL_INFOGRAPHIC_IMAGE.
    await renderTab({
      infographicImageModel: 'gpt-image-2.5-sunburst',
      infographicImageModelSource: 'env',
      infographicImageModelOffList: true,
    });
    const select = screen.getByLabelText(a.infographicModelLabel);
    expect(select.value).toBe('gpt-image-2.5-sunburst');
    expect(screen.getByText(a.infographicModelOffList)).toBeTruthy();
    expect(screen.getByText(a.infographicModelSourceEnv)).toBeTruthy();
  });

  it('infographie masquée : plus de générateur à choisir', async () => {
    // Un menu de générateur sans image à produire n'a rien à régler — même
    // parti pris que la charte graphique, masquée dans le même cas.
    await renderTab({ infographicEnabled: false });
    expect(screen.queryByLabelText(a.infographicModelLabel)).toBeNull();
  });
});
