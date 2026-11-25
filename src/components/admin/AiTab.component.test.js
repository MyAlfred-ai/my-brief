/**
 * Onglet « IA » de l'administration : fournisseurs (clés OpenAI et tierces),
 * modèles de transcription et de rédaction, infographie.
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
import { panelNav, selectPanelSection } from '../../stores/panels.js';
import { fill } from '../../utils/i18nFormat.js';

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
  infographicImageModels: ['gpt-image-2.5-flare'],
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

const TILE_LABELS = {
  summary: a.tileSummary,
  transcription: a.tileTranscription,
  infographic: a.tileInfographic,
};

/**
 * Attend la fin du chargement initial (onMount → fetch), puis déplie la tuile
 * du réglage voulu — l'écran s'ouvre replié. Rend le groupe des modèles quand
 * c'est la transcription. Une tuile déjà ouverte au chargement (modèle en
 * service sans sa clé) n'est pas refermée.
 */
async function renderTab(over = {}, prices = PRICES, section = 'transcription') {
  fetchAiSettings.mockResolvedValue({ ok: true, data: { settings: settings(over), prices } });
  render(AiTab);
  const tile = await screen.findByRole('button', { name: new RegExp(`^${TILE_LABELS[section]}`) });
  if (tile.getAttribute('aria-expanded') !== 'true') await userEvent.click(tile);
  if (section === 'transcription') return screen.findByRole('group', { name: a.modelLabel });
  return null;
}
const renderSection = (section, over = {}, prices = PRICES) => renderTab(over, prices, section);

/**
 * Le bouton radio d'un modèle de transcription, par son identifiant : son nom
 * accessible est le nom lisible (« GPT Transcribe »), l'identifiant sa valeur.
 */
const radio = (id) => {
  const found = screen.getAllByRole('radio').find((input) => input.value === id);
  if (!found) throw new Error(`aucun modèle ${id}`);
  return found;
};
/** La ligne entière d'un modèle : nom, description, prix. */
const row = (id) => radio(id).closest('label');
/** Un bouton d'une ligne de fournisseur : « Remplacer — OpenAI », « Tester la clé — Mistral »… */
const providerButton = (label, provider) =>
  screen.getByRole('button', { name: `${label} — ${provider}` });
/** La pastille d'un fournisseur, dans la carte « Fournisseurs d'IA ». */
const pill = (provider) =>
  within(screen.getByRole('region', { name: a.providersTitle })).getByRole('button', {
    name: new RegExp(`^${provider}\\b`),
  });
/** Déplie la ligne d'un fournisseur (sa pastille), si elle ne l'est pas déjà. */
async function openProvider(provider) {
  const button = pill(provider);
  if (button.getAttribute('aria-expanded') !== 'true') await userEvent.click(button);
}
/** Le filtre « fournisseur » de la liste des modèles de transcription. */
const filter = (provider) =>
  within(screen.getByRole('group', { name: a.filterLabel })).getByRole('button', {
    name: new RegExp(`^${provider}`),
  });
/** Ouvre le champ de la clé OpenAI (fermé tant qu'une clé est en place). */
async function openaiKeyField() {
  await openProvider('OpenAI');
  await userEvent.click(providerButton(a.keyReplace, 'OpenAI'));
  return screen.getByLabelText(a.keyTitle);
}

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

    await userEvent.type(await openaiKeyField(), ' sk-new-key ');
    await userEvent.click(radio('whisper-1'));
    await userEvent.click(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }));

    expect(saveAiSettings).toHaveBeenCalledTimes(1);
    expect(saveAiSettings).toHaveBeenCalledWith({
      apiKey: 'sk-new-key',
      transcriptionModel: 'whisper-1',
    });
    expect(await screen.findByText(a.saved)).toBeTruthy();
    expect(screen.getByText(a.modelSaved)).toBeTruthy();
    // Le champ se referme : la clé n'est jamais réaffichée, seul son indice.
    expect(screen.queryByLabelText(a.keyTitle)).toBeNull();
    expect(screen.getByText('sk-new…1234')).toBeTruthy();
  });

  it('« Annuler » rend au modèle sa valeur enregistrée et vide la clé saisie', async () => {
    await renderTab();
    await userEvent.type(await openaiKeyField(), 'sk-draft');
    await userEvent.click(radio('whisper-1'));
    expect(screen.getByText(a.unsavedHint)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: a.discardChanges }));

    expect(radio('gpt-realtime-whisper').checked).toBe(true);
    // Le brouillon de clé est perdu, le champ refermé.
    expect(screen.queryByLabelText(a.keyTitle)).toBeNull();
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

    // Modèle OpenAI : aucune clé Mistral ne part avec le test.
    expect(testTranscriptionModel).toHaveBeenCalledWith('whisper-1', '');
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

describe('AiTab — fournisseurs tiers et leurs modèles', () => {
  const VOXTRAL = 'voxtral-mini-transcribe-realtime-2602';
  const MELIA = 'speechmatics-melia-1';
  const U36 = 'universal-3-6-pro';
  const KEY = 'AbCdEf0000000000000000000000002345';
  const noKey = { hasKey: false, hint: '' };
  const savedKey = { hasKey: true, hint: 'AbCdEf…2345' };
  const withProviders = (over = {}) => ({
    transcriptionModels: ['gpt-realtime-whisper', 'gpt-transcribe', VOXTRAL, MELIA, U36],
    transcriptionProviders: {
      'gpt-realtime-whisper': 'openai',
      'gpt-transcribe': 'openai',
      [VOXTRAL]: 'mistral',
      [MELIA]: 'speechmatics',
      [U36]: 'assemblyai',
    },
    providerKeys: { mistral: noKey, speechmatics: noKey, assemblyai: noKey },
    ...over,
  });
  const keys = (over) => ({
    providerKeys: { mistral: noKey, speechmatics: noKey, assemblyai: noKey, ...over },
  });
  const label = (provider) => a.providers[provider];
  const keyField = (provider) =>
    screen.queryByLabelText(fill(a.providerKeyLabel, { provider: label(provider) }));
  const saveButton = () => screen.getByRole('button', { name: uiTextData.fr.adminUsers.save });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('une pastille par fournisseur, dans l’ordre du serveur ; la ligne d’un fournisseur s’ouvre au clic', async () => {
    await renderTab(withProviders(), null);
    expect(screen.getByRole('heading', { name: a.providersTitle })).toBeTruthy();
    expect(screen.getByText(fill(a.providersCount, { count: 1, total: 4 }))).toBeTruthy();
    for (const provider of ['OpenAI', 'Mistral', 'Speechmatics', 'AssemblyAI']) {
      expect(pill(provider)).toBeTruthy();
    }
    // L'état de chaque pastille est dit aux lecteurs d'écran.
    expect(screen.getAllByText(a.statusOptional)).toHaveLength(3);
    expect(screen.queryByText(a.providerUsage.speechmatics)).toBeNull();

    await openProvider('Speechmatics');
    expect(screen.getByText(a.providerUsage.speechmatics)).toBeTruthy();
    expect(pill('Speechmatics').getAttribute('aria-expanded')).toBe('true');
    // Une seule ligne ouverte à la fois.
    await openProvider('OpenAI');
    expect(screen.queryByText(a.providerUsage.speechmatics)).toBeNull();
    expect(screen.queryByLabelText(a.keyTitle)).toBeNull();
    expect(screen.getByText('sk-pro…QLAA')).toBeTruthy();
  });

  it('sans leur clé, les modèles tiers se voient, prix compris, mais restent verrouillés', async () => {
    await renderTab(withProviders(), null);
    for (const id of [VOXTRAL, MELIA, U36]) expect(radio(id).disabled).toBe(true);
    expect(radio('gpt-transcribe').disabled).toBe(false);
    // Une ligne : nom lisible et fournisseur ; l'identifiant dans l'infobulle.
    expect(row(MELIA).textContent).toContain(a.modelNames[MELIA]);
    expect(row(MELIA).textContent).toContain('Speechmatics');
    expect(row(MELIA).getAttribute('title')).toContain(MELIA);
    // Filtré sur un fournisseur sans clé : la barre le dit.
    for (const provider of ['Mistral', 'Speechmatics', 'AssemblyAI']) {
      await userEvent.click(filter(provider));
      expect(screen.getByText(fill(a.providerLocked, { provider }))).toBeTruthy();
    }
    await userEvent.click(filter(a.filterAll));
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('filtrer sur un fournisseur ne montre que ses modèles, sans répéter son nom', async () => {
    await renderTab(withProviders(keys({ speechmatics: savedKey })), null);
    await userEvent.click(filter('Speechmatics'));
    expect(screen.getAllByRole('radio').map((r) => r.value)).toEqual([MELIA]);
    // Plus d'étiquette de fournisseur sur la ligne : le filtre le dit déjà.
    expect(row(MELIA).querySelector('.mp-provider')).toBeNull();
    expect(screen.queryByText(fill(a.providerLocked, { provider: 'Speechmatics' }))).toBeNull();
  });

  it('« Ajouter la clé Speechmatics » ouvre le champ de SA ligne, le focus dedans', async () => {
    await renderTab(withProviders(), null);
    await userEvent.click(filter('Speechmatics'));
    await userEvent.click(
      screen.getByRole('button', { name: fill(a.providerUnlock, { provider: 'Speechmatics' }) }),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(keyField('speechmatics')));
    expect(keyField('assemblyai')).toBeNull();
  });

  it('coller une clé ne débloque que les modèles de SON fournisseur ; clé et modèle partent ensemble', async () => {
    await renderTab(withProviders(), null);
    await openProvider('AssemblyAI');
    await userEvent.click(providerButton(a.keyAdd, 'AssemblyAI'));
    await userEvent.type(keyField('assemblyai'), KEY);
    expect(radio(U36).disabled).toBe(false);
    expect(radio(MELIA).disabled).toBe(true);
    await userEvent.click(radio(U36));
    // La tuile dit le choix en attente.
    expect(
      screen.getByRole('button', { name: new RegExp(`^${a.tileTranscription}`) }).textContent,
    ).toContain(a.tileChanged);
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: {
        settings: settings(
          withProviders({
            transcriptionModel: U36,
            transcriptionModelSource: 'settings',
            ...keys({ assemblyai: savedKey }),
          }),
        ),
      },
    });

    await userEvent.click(saveButton());

    expect(saveAiSettings).toHaveBeenCalledWith({ assemblyaiApiKey: KEY, transcriptionModel: U36 });
    expect(
      await screen.findByText(fill(a.providerKeyStored, { provider: 'AssemblyAI' })),
    ).toBeTruthy();
    expect(screen.getByText('AbCdEf…2345')).toBeTruthy();
    expect(keyField('assemblyai')).toBeNull();
  });

  it('« Tester la clé » d’une ligne éprouve la clé collée avec un modèle de ce fournisseur', async () => {
    await renderTab(withProviders(), null);
    testTranscriptionModel.mockResolvedValue({ ok: true, data: { ok: true } });
    await openProvider('Speechmatics');
    await userEvent.click(providerButton(a.keyAdd, 'Speechmatics'));
    await userEvent.type(keyField('speechmatics'), `${KEY} `);
    await userEvent.click(providerButton(a.test, 'Speechmatics'));

    expect(testTranscriptionModel).toHaveBeenCalledWith(MELIA, KEY);
    expect(await screen.findByText(a.testOk)).toBeTruthy();
  });

  it('« Tester ce modèle » éprouve le modèle tiers choisi avec la clé collée de son fournisseur', async () => {
    await renderTab(withProviders(), null);
    testTranscriptionModel.mockResolvedValue({ ok: true, data: { ok: true } });
    await openProvider('Mistral');
    await userEvent.click(providerButton(a.keyAdd, 'Mistral'));
    await userEvent.type(keyField('mistral'), KEY);
    await userEvent.click(radio(VOXTRAL));
    await userEvent.click(screen.getByRole('button', { name: a.modelTest }));

    expect(testTranscriptionModel).toHaveBeenCalledWith(VOXTRAL, KEY);
    expect(await screen.findByText(a.modelTestOk)).toBeTruthy();
  });

  it('le refus d’un fournisseur le nomme, avec son message', async () => {
    await renderTab(withProviders(keys({ speechmatics: savedKey })), null);
    testTranscriptionModel.mockResolvedValue({
      ok: false,
      data: {
        error: 'provider_key_rejected',
        provider: 'speechmatics',
        upstreamMessage: 'Permission Denied',
      },
    });
    await userEvent.click(radio(MELIA));
    await userEvent.click(screen.getByRole('button', { name: a.modelTest }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Speechmatics a refusé cette clé.');
    expect(alert.textContent).toContain('Permission Denied');
  });

  it('une clé gardée sans ses modèles se retire ; en service, elle ne se retire pas', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderTab(withProviders(keys({ mistral: savedKey })), null);
    saveAiSettings.mockResolvedValue({ ok: true, data: { settings: settings(withProviders()) } });

    await openProvider('Mistral');
    await userEvent.click(providerButton(a.clear, 'Mistral'));
    expect(saveAiSettings).toHaveBeenCalledWith({ mistralApiKey: '' });
    await vi.waitFor(() => expect(radio(VOXTRAL).disabled).toBe(true));

    vi.clearAllMocks();
    document.body.innerHTML = '';
    await renderTab(
      withProviders({ transcriptionModel: VOXTRAL, ...keys({ mistral: savedKey }) }),
      null,
    );
    await openProvider('Mistral');
    expect(screen.queryByRole('button', { name: `${a.clear} — Mistral` })).toBeNull();
  });

  it('modèle tiers en service sans sa clé (base éditée) : déplié d’office, signalé, et mène à la clé', async () => {
    await renderTab(withProviders({ transcriptionModel: U36 }), null);
    expect(radio(U36).checked).toBe(true);
    expect(radio(U36).disabled).toBe(false);
    expect(screen.getByText(a.statusRequired)).toBeTruthy();
    expect(screen.getByText(a.tileKeyNeeded)).toBeTruthy();
    expect(screen.getByText(fill(a.providerKeyNeeded, { provider: 'AssemblyAI' }))).toBeTruthy();
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
    // La base de calcul vit dans l'infobulle ⓘ du panneau, la provenance dessous.
    expect(screen.getByRole('button', { name: a.pricesInfoLabel })).toBeTruthy();
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
    await renderSection('infographic', { infographicEnabled: true });
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
    await renderSection('infographic');
    expect(screen.getByLabelText(a.infographicToggleLabel).checked).toBe(true);
    expect(screen.getByRole('button', { name: uiTextData.fr.adminUsers.save }).disabled).toBe(true);
  });

  it('plus de modèle d’image ni de style à régler : l’allure vient de l’Apparence', async () => {
    // Depuis les gabarits, la mise en page est fixe — un réglage qui ne
    // changerait rien n'a plus sa place à l'écran ; on dit où se règle l'allure.
    await renderSection('infographic', { infographicEnabled: true, infographicStyle: 'Violet.' });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(a.infographicLookHelp)).toBeTruthy();
    // Masquée : plus rien à dire de son allure.
    await userEvent.click(screen.getByLabelText(a.infographicToggleLabel));
    expect(screen.queryByText(a.infographicLookHelp)).toBeNull();
  });
});

describe('AiTab — modèle de rédaction du compte rendu', () => {
  const MISTRAL = 'mistral-large-2512';
  const KEY = 'AbCdEf0000000000000000000000002345';
  const noKey = { hasKey: false, hint: '' };
  const savedKey = { hasKey: true, hint: 'AbCdEf…2345' };
  /** Réglages tels que les sert l'API depuis Mistral : modèles, fournisseurs, clés. */
  const withSummary = (over = {}) => ({
    summaryModels: ['gpt-6-astra', 'gpt-5.4', 'gpt-6-luna', MISTRAL],
    summaryProviders: {
      'gpt-6-astra': 'openai',
      'gpt-5.4': 'openai',
      'gpt-6-luna': 'openai',
      [MISTRAL]: 'mistral',
    },
    providerKeys: { mistral: noKey, speechmatics: noKey, assemblyai: noKey },
    ...over,
  });
  /** Coût d'un compte rendu, réunion d'une heure (GET /settings/ai). */
  const SUMMARY_PRICES = {
    ...PRICES,
    summary: [
      { model: 'gpt-6-astra', current: false, unitEur: 0.2977 },
      { model: 'gpt-5.4', current: true, unitEur: 0.0832 },
      { model: 'gpt-6-luna', current: false, unitEur: 0.003 },
      { model: MISTRAL, current: false, unitEur: 0.0114 },
    ],
  };
  const renderSummary = async (over = {}, prices = SUMMARY_PRICES) => {
    await renderSection('summary', withSummary(over), prices);
    return screen.getByRole('group', { name: a.summaryLabel });
  };
  const saveButton = () => screen.getByRole('button', { name: uiTextData.fr.adminUsers.save });
  const tile = () => screen.getByRole('button', { name: new RegExp(`^${a.tileSummary}`) });
  const mistralKeyField = () =>
    screen.queryByLabelText(fill(a.providerKeyLabel, { provider: 'Mistral' }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('une ligne par modèle, du moins cher au plus cher, le modèle en service coché', async () => {
    const group = await renderSummary();
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.value)).toEqual(['gpt-6-luna', MISTRAL, 'gpt-5.4', 'gpt-6-astra']);
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['gpt-5.4']);
    // Nom lisible et fournisseur ; l'identifiant dans l'infobulle.
    expect(row('gpt-6-astra').textContent).toContain(a.modelNames['gpt-6-astra']);
    expect(row(MISTRAL).textContent).toContain('Mistral');
    expect(row(MISTRAL).getAttribute('title')).toContain(MISTRAL);
    expect(row('gpt-5.4').textContent).toContain(a.modelInService);
  });

  it('chaque modèle montre le coût estimé d’un résumé, et dit sur quelle base', async () => {
    await renderSummary();
    const astra = row('gpt-6-astra');
    expect(astra.textContent).toContain(formatEuros(0.2977, 'fr'));
    expect(astra.textContent).toContain(a.pricePerSummary);
    // Pas de quatre : ~100 fois Luna, le haut de l'échelle ; Luna, le bas.
    expect(astra.querySelectorAll('.mp-on')).toHaveLength(4);
    expect(row('gpt-6-luna').querySelectorAll('.mp-on')).toHaveLength(1);
    expect(row('gpt-6-luna').textContent).toContain(formatEuros(0.003, 'fr'));
    // L'estimation se dit sans ouvrir l'infobulle, et l'infobulle dit la base.
    expect(screen.getByText(a.summaryPriceCaption)).toBeTruthy();
    expect(screen.getByRole('button', { name: a.pricesInfoLabel })).toBeTruthy();
    // La tuile dit le modèle, son fournisseur et ce qu'il coûte.
    expect(tile().textContent).toContain('GPT-5.4');
    expect(tile().textContent.replace(/\s+/g, ' ')).toContain(
      `OpenAI · ${formatEuros(0.0832, 'fr')}${a.pricePerSummary}`.replace(/\s+/g, ' '),
    );
  });

  it('choisir un autre modèle dit l’écart par compte rendu, avant d’enregistrer', async () => {
    await renderSummary();
    await userEvent.click(radio('gpt-6-luna'));
    const saving = a.summaryDeltaLess.replace('{amount}', formatEuros(0.0832 - 0.003, 'fr'));
    expect(screen.getByRole('status').textContent.replace(/\s+/g, ' ').trim()).toBe(
      saving.replace(/\s+/g, ' '),
    );
    expect(tile().textContent).toContain(a.tileChanged);
    expect(saveAiSettings).not.toHaveBeenCalled();
  });

  it("n'envoie QUE le modèle de rédaction — ni clé, ni modèle de transcription", async () => {
    await renderSummary();
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: {
        settings: settings(
          withSummary({ summaryModel: 'gpt-6-astra', summaryModelSource: 'settings' }),
        ),
      },
    });

    await userEvent.click(radio('gpt-6-astra'));
    await userEvent.click(saveButton());

    expect(saveAiSettings).toHaveBeenCalledWith({ summaryModel: 'gpt-6-astra' });
    expect(await screen.findByText(a.summarySaved)).toBeTruthy();
  });

  it('teste le modèle SÉLECTIONNÉ, avant enregistrement', async () => {
    await renderSummary();
    testSummaryModel.mockResolvedValue({ ok: true, data: { ok: true } });

    await userEvent.click(radio('gpt-6-luna'));
    await userEvent.click(screen.getByRole('button', { name: a.summaryTest }));

    expect(testSummaryModel).toHaveBeenCalledWith('gpt-6-luna', '');
    expect(await screen.findByText(a.summaryTestOk)).toBeTruthy();
  });

  it("affiche le refus d'OpenAI mot pour mot", async () => {
    await renderSummary();
    testSummaryModel.mockResolvedValue({
      ok: false,
      data: {
        error: 'summary_model_rejected',
        upstreamMessage: 'Your organization must be verified to use the model `gpt-6-astra`.',
      },
    });

    await userEvent.click(screen.getByRole('button', { name: a.summaryTest }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(a.errors.summary_model_rejected);
    expect(alert.textContent).toContain('must be verified');
  });

  it('sans clé Mistral, ses modèles se voient, prix compris, mais restent verrouillés', async () => {
    await renderSummary();
    expect(radio(MISTRAL).disabled).toBe(true);
    expect(radio('gpt-6-luna').disabled).toBe(false);
    await userEvent.click(filter('Mistral'));
    expect(screen.getAllByRole('radio').map((r) => r.value)).toEqual([MISTRAL]);
    expect(screen.getByText(fill(a.providerLocked, { provider: 'Mistral' }))).toBeTruthy();
    // La barre mène à SA clé, le focus dedans.
    await userEvent.click(
      screen.getByRole('button', { name: fill(a.providerUnlock, { provider: 'Mistral' }) }),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(mistralKeyField()));
  });

  it('coller la clé Mistral débloque ses modèles ; clé et modèle partent ensemble', async () => {
    await renderSummary();
    await openProvider('Mistral');
    await userEvent.click(providerButton(a.keyAdd, 'Mistral'));
    await userEvent.type(mistralKeyField(), KEY);
    expect(radio(MISTRAL).disabled).toBe(false);
    await userEvent.click(radio(MISTRAL));
    // La tuile passe à Mistral, et la clé n'est plus « facultative ».
    expect(tile().textContent).toContain(a.modelNames[MISTRAL]);
    expect(tile().textContent).toContain('Mistral');
    saveAiSettings.mockResolvedValue({
      ok: true,
      data: {
        settings: settings(
          withSummary({
            summaryModel: MISTRAL,
            summaryModelSource: 'settings',
            providerKeys: { mistral: savedKey, speechmatics: noKey, assemblyai: noKey },
          }),
        ),
      },
    });

    await userEvent.click(saveButton());

    expect(saveAiSettings).toHaveBeenCalledWith({ mistralApiKey: KEY, summaryModel: MISTRAL });
    expect(await screen.findByText(a.summarySaved)).toBeTruthy();
  });

  it('« Tester l’accès » éprouve un modèle Mistral avec la clé collée', async () => {
    await renderSummary();
    testSummaryModel.mockResolvedValue({ ok: true, data: { ok: true } });
    await openProvider('Mistral');
    await userEvent.click(providerButton(a.keyAdd, 'Mistral'));
    await userEvent.type(mistralKeyField(), KEY);
    await userEvent.click(radio(MISTRAL));
    await userEvent.click(screen.getByRole('button', { name: a.summaryTest }));

    expect(testSummaryModel).toHaveBeenCalledWith(MISTRAL, KEY);
  });

  it('Mistral rédige sans sa clé (base éditée) : déplié d’office, signalé, rien à enregistrer', async () => {
    fetchAiSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings(withSummary({ summaryModel: MISTRAL })), prices: SUMMARY_PRICES },
    });
    render(AiTab);
    await screen.findByRole('group', { name: a.summaryLabel });
    expect(radio(MISTRAL).checked).toBe(true);
    expect(screen.getByText(a.tileKeyNeeded)).toBeTruthy();
    expect(screen.getByText(fill(a.providerKeyNeeded, { provider: 'Mistral' }))).toBeTruthy();
    expect(screen.getByRole('button', { name: a.summaryTest }).disabled).toBe(true);
  });

  it('la clé Mistral ne se retire pas tant que Mistral rédige', async () => {
    await renderSummary({
      summaryModel: MISTRAL,
      providerKeys: { mistral: savedKey, speechmatics: noKey, assemblyai: noKey },
    });
    await openProvider('Mistral');
    expect(screen.queryByRole('button', { name: `${a.clear} — Mistral` })).toBeNull();
  });

  it('un modèle imposé par le serveur et HORS liste reste affiché, coché et signalé', async () => {
    // Sans l'ajouter à la liste, aucune ligne ne serait cochée — et l'écran
    // mentirait sur le modèle en service. OPENAI_MODEL_SUMMARY est la porte de
    // sortie de l'administrateur système : elle doit rester lisible ici.
    // Cas réel : `gpt-5.6-terra` n'est pas proposé, mais un déploiement peut
    // légitimement le viser.
    await renderSummary({
      summaryModel: 'gpt-5.6-terra',
      summaryModelSource: 'env',
      summaryModelOffList: true,
    });
    expect(radio('gpt-5.6-terra').checked).toBe(true);
    expect(row('gpt-5.6-terra').textContent).toContain('OpenAI');
    expect(screen.getByText(a.summaryOffList)).toBeTruthy();
    expect(screen.getByText(a.summarySourceEnv)).toBeTruthy();
  });

  it('sans clé OpenAI configurée, le test d’un modèle OpenAI est hors de portée', async () => {
    await renderSummary({ hasKey: false, source: 'none' });
    expect(screen.getByRole('button', { name: a.summaryTest }).disabled).toBe(true);
  });

  it('une projection d’avant Mistral (sans fournisseurs) : tout est OpenAI, rien ne casse', async () => {
    await renderSection('summary', { summaryProviders: undefined }, null);
    const group = screen.getByRole('group', { name: a.summaryLabel });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.value),
    ).toEqual(['gpt-5.6-sol', 'gpt-5.4', 'gpt-5.4-mini']);
    expect(screen.queryByText(a.summaryPriceCaption)).toBeNull();
  });
});

describe('AiTab — deux pages, un composant', () => {
  const MELIA = 'speechmatics-melia-1';
  const noKey = { hasKey: false, hint: '' };
  const withSpeechmatics = (over = {}) => ({
    transcriptionModels: ['gpt-realtime-whisper', 'gpt-transcribe', MELIA],
    transcriptionProviders: {
      'gpt-realtime-whisper': 'openai',
      'gpt-transcribe': 'openai',
      [MELIA]: 'speechmatics',
    },
    providerKeys: { speechmatics: noKey },
    ...over,
  });
  const speechmaticsKey = () =>
    screen.queryByLabelText(fill(a.providerKeyLabel, { provider: a.providers.speechmatics }));
  const tileButton = (section) =>
    screen.queryByRole('button', { name: new RegExp(`^${TILE_LABELS[section]}`) });
  const saveButton = () => screen.getByRole('button', { name: uiTextData.fr.adminUsers.save });

  async function renderView(view, over = {}) {
    fetchAiSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings(over), prices: null },
    });
    const result = render(AiTab, { props: { view } });
    await vi.waitFor(() => expect(document.querySelector('.ai-skeleton')).toBeNull());
    return result;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    selectPanelSection('ai');
  });

  it('« Clés API » montre les fournisseurs, pas ce qui tourne', async () => {
    await renderView('keys');
    expect(screen.getByRole('region', { name: a.providersTitle })).toBeTruthy();
    for (const section of Object.keys(TILE_LABELS)) expect(tileButton(section)).toBeNull();
  });

  it('« Modèles » montre ce qui tourne, pas les fournisseurs', async () => {
    await renderView('models');
    for (const section of Object.keys(TILE_LABELS)) expect(tileButton(section)).toBeTruthy();
    expect(screen.queryByRole('region', { name: a.providersTitle })).toBeNull();
  });

  it('depuis « Modèles », « Ajouter la clé » mène à « Clés API », ouverte sur ce fournisseur', async () => {
    const { unmount } = await renderView('models', withSpeechmatics());
    await userEvent.click(tileButton('transcription'));
    await userEvent.click(filter('Speechmatics'));
    await userEvent.click(
      screen.getByRole('button', { name: fill(a.providerUnlock, { provider: 'Speechmatics' }) }),
    );
    // La clé ne se saisit pas ici : la colonne passe sur « Clés API », en
    // nommant le fournisseur.
    expect(get(panelNav)).toMatchObject({ active: 'ai', sub: 'speechmatics' });
    expect(speechmaticsKey()).toBeNull();
    unmount();

    await renderView('keys', withSpeechmatics());
    await vi.waitFor(() => expect(document.activeElement).toBe(speechmaticsKey()));
  });

  it('sur « Clés API », une clé s’enregistre même si un modèle en service attend la sienne', async () => {
    // Base éditée : le modèle en service est tiers, sa clé manque. Sur la page
    // unique d'avant, on changeait de modèle au même endroit ; ici, non.
    await renderView('keys', withSpeechmatics({ transcriptionModel: MELIA }));
    const field = await openaiKeyField();
    await userEvent.type(field, 'sk-proj-nouvelle-cle-000000000000');
    expect(saveButton().disabled).toBe(false);
  });
});
