/**
 * Onglet « Configuration » de l'administration : vocabulaire de l'organisation
 * + apparence (logo, phrase, couleur), UN bouton Enregistrer pour deux
 * documents serveur.
 *
 * Ce qui casserait sans ces tests : un bouton qui enverrait le vocabulaire à
 * chaque enregistrement de couleur (ou l'inverse) — un « vide = retour à la
 * valeur intégrée » involontaire ; un texte enregistré qui ne rejoindrait pas
 * le store d'assemblage du prompt (l'administrateur est un utilisateur comme
 * un autre, son compte rendu suivant doit porter ce qu'il vient d'écrire, sans
 * rechargement) ; et un échec d'un côté qui s'afficherait « Enregistré » parce
 * que l'autre côté a réussi.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR } from '../../stores/branding.js';
import { orgContext, setOrgContext } from '../../stores/orgContext.js';
import {
  correctTranscript,
  setTranscriptCorrections,
  transcriptCorrections,
} from '../../stores/transcriptCorrections.js';

const fetchBrandingSettings = vi.fn();
const saveBrandingSettings = vi.fn();
const fetchOrgContextSettings = vi.fn();
const saveOrgContextSettings = vi.fn();
const fetchTranscriptCorrections = vi.fn();
const saveTranscriptCorrections = vi.fn();
const refreshCapabilities = vi.fn();

vi.mock('../../services/adminUsersApi.js', () => ({
  fetchBrandingSettings: (...a) => fetchBrandingSettings(...a),
  saveBrandingSettings: (...a) => saveBrandingSettings(...a),
  fetchOrgContextSettings: (...a) => fetchOrgContextSettings(...a),
  saveOrgContextSettings: (...a) => saveOrgContextSettings(...a),
  fetchTranscriptCorrections: (...a) => fetchTranscriptCorrections(...a),
  saveTranscriptCorrections: (...a) => saveTranscriptCorrections(...a),
}));
// stores/branding.js dérive du store `auth` : on garde le module réel et on
// ne remplace que la relecture de la sonde publique.
vi.mock('../../stores/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  refreshCapabilities: (...a) => refreshCapabilities(...a),
}));

const { default: BrandingTab } = await import('./BrandingTab.svelte');

const t = uiTextData.fr.adminBranding;
const c = uiTextData.fr.adminOrgContext;
const u = uiTextData.fr.adminUsers;
const TEXT = '« ADV » = administration des ventes. INITECH et Globex sont des clients.';

const branding = (over = {}) => ({
  logo: '',
  tagline: '',
  primaryColor: '',
  secondaryColor: '',
  updatedAt: null,
  updatedBy: null,
  ...over,
});
const org = (over = {}) => ({ context: '', updatedAt: null, updatedBy: null, ...over });
const corrections = (over = {}) => ({ rules: [], updatedAt: null, updatedBy: null, ...over });
const tc = uiTextData.fr.adminTranscriptCorrections;
const RULES = [
  { from: ['Klobex', 'Clobex'], to: 'Globex' },
  { from: ['la dévé'], to: "l'ADV" },
];

beforeEach(() => {
  vi.clearAllMocks();
  setOrgContext('');
  setTranscriptCorrections([]);
  fetchTranscriptCorrections.mockResolvedValue({ ok: true, data: { settings: corrections() } });
  saveTranscriptCorrections.mockResolvedValue({ ok: true, data: { settings: corrections() } });
  fetchBrandingSettings.mockResolvedValue({ ok: true, data: { settings: branding() } });
  fetchOrgContextSettings.mockResolvedValue({ ok: true, data: { settings: org() } });
  saveBrandingSettings.mockResolvedValue({ ok: true, data: { settings: branding() } });
  saveOrgContextSettings.mockResolvedValue({ ok: true, data: { settings: org() } });
});

/** Rendu + attente du chargement initial (onMount asynchrone). */
async function renderTab() {
  render(BrandingTab);
  await screen.findByLabelText(c.label);
}

const saveButton = () => screen.getByRole('button', { name: u.save });

describe('BrandingTab — vocabulaire de l’organisation', () => {
  it('montre le texte enregistré et son état dès le chargement', async () => {
    fetchOrgContextSettings.mockResolvedValue({
      ok: true,
      data: { settings: org({ context: TEXT, updatedBy: 'patron@client.fr' }) },
    });
    await renderTab();

    expect(screen.getByLabelText(c.label).value).toBe(TEXT);
    expect(screen.getByText(c.badgeSet)).toBeTruthy();
    expect(screen.getByText(`${c.updatedBy} patron@client.fr`)).toBeTruthy();
    expect(get(orgContext)).toBe(TEXT);
  });

  it('annonce « Non renseigné » et un bouton inactif tant que rien n’a changé', async () => {
    await renderTab();

    expect(screen.getByText(c.badgeEmpty)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('enregistre le texte saisi, débarrassé de ses espaces, SANS toucher à l’apparence', async () => {
    saveOrgContextSettings.mockResolvedValue({
      ok: true,
      data: { settings: org({ context: TEXT }) },
    });
    await renderTab();
    await userEvent.type(screen.getByLabelText(c.label), `  ${TEXT}  `);
    await userEvent.click(saveButton());

    expect(saveOrgContextSettings).toHaveBeenCalledWith({ context: TEXT });
    // Un appel branding ici enverrait un patch vide… ou pire, des champs
    // « vides = retour au défaut » que personne n'a demandés.
    expect(saveBrandingSettings).not.toHaveBeenCalled();
    expect(refreshCapabilities).not.toHaveBeenCalled();
  });

  it('pousse le texte enregistré dans le store d’assemblage du prompt', async () => {
    saveOrgContextSettings.mockResolvedValue({
      ok: true,
      data: { settings: org({ context: TEXT }) },
    });
    await renderTab();
    await userEvent.type(screen.getByLabelText(c.label), TEXT);
    await userEvent.click(saveButton());

    expect(get(orgContext)).toBe(TEXT);
    expect(await screen.findByText(t.saved)).toBeTruthy();
  });

  it('affiche l’erreur du serveur plutôt qu’un « Enregistré » mensonger', async () => {
    saveOrgContextSettings.mockResolvedValue({ ok: false, data: { error: 'forbidden' } });
    await renderTab();
    await userEvent.type(screen.getByLabelText(c.label), TEXT);
    await userEvent.click(saveButton());

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(t.saved)).toBeNull();
    expect(get(orgContext)).toBe('');
    // Le texte reste saisi et « non enregistré » : rien n'est perdu.
    expect(screen.getByLabelText(c.label).value).toBe(TEXT);
    expect(screen.getByText(t.unsavedHint)).toBeTruthy();
  });
});

describe('BrandingTab — apparence', () => {
  it('n’envoie que les champs modifiés, puis relit la sonde publique', async () => {
    saveBrandingSettings.mockResolvedValue({
      ok: true,
      data: { settings: branding({ tagline: 'Réunions sans prise de notes' }) },
    });
    await renderTab();
    await userEvent.type(screen.getByLabelText(t.taglineLabel), 'Réunions sans prise de notes');
    await userEvent.click(saveButton());

    expect(saveBrandingSettings).toHaveBeenCalledWith({
      tagline: 'Réunions sans prise de notes',
    });
    expect(saveOrgContextSettings).not.toHaveBeenCalled();
    expect(refreshCapabilities).toHaveBeenCalledTimes(1);
  });

  it('la phrase anglaise part seule, sans toucher à la française', async () => {
    fetchBrandingSettings.mockResolvedValue({
      ok: true,
      data: { settings: branding({ tagline: 'Assistant de réunion' }) },
    });
    saveBrandingSettings.mockResolvedValue({
      ok: true,
      data: {
        settings: branding({ tagline: 'Assistant de réunion', taglineEn: 'Meeting assistant' }),
      },
    });
    await renderTab();
    expect(screen.getByLabelText(t.taglineLabel).value).toBe('Assistant de réunion');
    await userEvent.type(screen.getByLabelText(t.taglineEnLabel), '  Meeting assistant ');
    await userEvent.click(saveButton());

    expect(saveBrandingSettings).toHaveBeenCalledWith({ taglineEn: 'Meeting assistant' });
    expect(screen.getByLabelText(t.taglineEnLabel).value).toBe('Meeting assistant');
  });

  it('enregistre les deux documents d’un seul geste quand les deux ont changé', async () => {
    saveBrandingSettings.mockResolvedValue({
      ok: true,
      data: { settings: branding({ tagline: 'Nouvelle phrase' }) },
    });
    saveOrgContextSettings.mockResolvedValue({
      ok: true,
      data: { settings: org({ context: TEXT }) },
    });
    await renderTab();
    await userEvent.type(screen.getByLabelText(t.taglineLabel), 'Nouvelle phrase');
    await userEvent.type(screen.getByLabelText(c.label), TEXT);
    await userEvent.click(saveButton());

    expect(saveBrandingSettings).toHaveBeenCalledWith({ tagline: 'Nouvelle phrase' });
    expect(saveOrgContextSettings).toHaveBeenCalledWith({ context: TEXT });
    expect(await screen.findByText(t.saved)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('un échec d’un côté laisse l’autre enregistré et signale l’erreur', async () => {
    saveBrandingSettings.mockResolvedValue({ ok: false, data: { error: 'forbidden' } });
    saveOrgContextSettings.mockResolvedValue({
      ok: true,
      data: { settings: org({ context: TEXT }) },
    });
    await renderTab();
    await userEvent.type(screen.getByLabelText(t.taglineLabel), 'Nouvelle phrase');
    await userEvent.type(screen.getByLabelText(c.label), TEXT);
    await userEvent.click(saveButton());

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(t.saved)).toBeNull();
    // Le vocabulaire, lui, est passé : store à jour, et seule la phrase reste
    // à enregistrer.
    expect(get(orgContext)).toBe(TEXT);
    expect(screen.getByText(t.unsavedHint)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it('« Annuler » rend aux deux documents leur valeur enregistrée', async () => {
    fetchOrgContextSettings.mockResolvedValue({
      ok: true,
      data: { settings: org({ context: TEXT }) },
    });
    await renderTab();
    await userEvent.type(screen.getByLabelText(t.taglineLabel), 'Brouillon');
    await userEvent.clear(screen.getByLabelText(c.label));
    await userEvent.click(screen.getByRole('button', { name: t.discardChanges }));

    expect(screen.getByLabelText(t.taglineLabel).value).toBe('');
    expect(screen.getByLabelText(c.label).value).toBe(TEXT);
    expect(saveButton().disabled).toBe(true);
  });

  it('signale l’échec du chargement sans cacher le formulaire', async () => {
    fetchBrandingSettings.mockResolvedValue({ ok: false, data: { error: 'forbidden' } });
    await renderTab();

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText(t.taglineLabel)).toBeTruthy();
  });
});

describe('BrandingTab — couleurs primaire et secondaire', () => {
  /** Chaque couleur est un groupe nommé : deux champs « Code hexadécimal ». */
  const hex = (groupLabel) =>
    within(screen.getByRole('group', { name: groupLabel })).getByLabelText(t.colorHexLabel);

  it('montre les deux couleurs enregistrées, ou les teintes intégrées', async () => {
    fetchBrandingSettings.mockResolvedValue({
      ok: true,
      data: { settings: branding({ primaryColor: '#123abc', secondaryColor: '#abc123' }) },
    });
    await renderTab();

    expect(hex(t.colorLabel).value).toBe('#123abc');
    expect(hex(t.colorSecondaryLabel).value).toBe('#abc123');
  });

  it('rien de personnalisé : les deux champs montrent les teintes intégrées', async () => {
    await renderTab();
    expect(hex(t.colorLabel).value).toBe(DEFAULT_PRIMARY_COLOR);
    expect(hex(t.colorSecondaryLabel).value).toBe(DEFAULT_SECONDARY_COLOR);
    expect(saveButton().disabled).toBe(true);
  });

  it('changer la SECONDAIRE n’envoie que la secondaire', async () => {
    saveBrandingSettings.mockResolvedValue({
      ok: true,
      data: { settings: branding({ secondaryColor: '#00aa55' }) },
    });
    await renderTab();
    const field = hex(t.colorSecondaryLabel);
    await userEvent.clear(field);
    await userEvent.type(field, '#00AA55');
    await userEvent.click(saveButton());

    // Normalisée en minuscules, et surtout SEULE : un primaryColor ici
    // écraserait une couleur primaire que personne n'a touchée.
    expect(saveBrandingSettings).toHaveBeenCalledWith({ secondaryColor: '#00aa55' });
    expect(refreshCapabilities).toHaveBeenCalledTimes(1);
  });

  it('les deux couleurs d’un seul geste', async () => {
    saveBrandingSettings.mockResolvedValue({
      ok: true,
      data: { settings: branding({ primaryColor: '#3366cc', secondaryColor: '#00aa55' }) },
    });
    await renderTab();
    await userEvent.clear(hex(t.colorLabel));
    await userEvent.type(hex(t.colorLabel), '#3366cc');
    await userEvent.clear(hex(t.colorSecondaryLabel));
    await userEvent.type(hex(t.colorSecondaryLabel), '#00aa55');
    await userEvent.click(saveButton());

    expect(saveBrandingSettings).toHaveBeenCalledWith({
      primaryColor: '#3366cc',
      secondaryColor: '#00aa55',
    });
  });

  it('revenue à la teinte intégrée, la secondaire s’enregistre vide (« pas de personnalisation »)', async () => {
    fetchBrandingSettings.mockResolvedValue({
      ok: true,
      data: { settings: branding({ secondaryColor: '#00aa55' }) },
    });
    saveBrandingSettings.mockResolvedValue({ ok: true, data: { settings: branding() } });
    await renderTab();
    await userEvent.click(
      within(screen.getByRole('group', { name: t.colorSecondaryLabel })).getByRole('button', {
        name: t.colorSecondaryReset,
      }),
    );
    await userEvent.click(saveButton());

    expect(saveBrandingSettings).toHaveBeenCalledWith({ secondaryColor: '' });
  });

  it('un hexadécimal invalide bloque l’enregistrement des DEUX couleurs', async () => {
    await renderTab();
    const field = hex(t.colorSecondaryLabel);
    await userEvent.clear(field);
    await userEvent.type(field, 'orange');

    expect(screen.getByText(t.colorInvalid)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(saveBrandingSettings).not.toHaveBeenCalled();
  });
});

describe('BrandingTab — corrections automatiques de la transcription', () => {
  const fromInputs = () => screen.getAllByLabelText(tc.fromHeader);
  const toInputs = () => screen.getAllByLabelText(tc.toHeader);

  it('dit la portée — toutes les réunions, tous les comptes — et invite à la modération', async () => {
    await renderTab();
    const note = screen.getByRole('note');
    expect(note.textContent).toContain(tc.scopeTitle);
    expect(note.textContent).toContain(tc.scopeText);
  });

  it('liste vide : un exemple et un seul geste pour commencer', async () => {
    await renderTab();
    expect(screen.getByText(tc.emptyTitle)).toBeTruthy();
    expect(screen.getByText(tc.badgeEmpty)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: tc.add }));
    expect(fromInputs()).toHaveLength(1);
    expect(document.activeElement).toBe(fromInputs()[0]);
  });

  it('montre les corrections enregistrées, leur nombre, et les rend actives pour la transcription', async () => {
    fetchTranscriptCorrections.mockResolvedValue({
      ok: true,
      data: { settings: corrections({ rules: RULES, updatedBy: 'patron@client.fr' }) },
    });
    await renderTab();
    await screen.findByDisplayValue('Klobex, Clobex');
    expect(toInputs().map((i) => i.value)).toEqual(['Globex', "l'ADV"]);
    expect(screen.getByText(tc.badgeMany.replace('{n}', '2'))).toBeTruthy();
    expect(get(transcriptCorrections)).toEqual(RULES);
    expect(correctTranscript('La dévé appelle Klobex.')).toBe("L'ADV appelle Globex.");
    expect(saveButton().disabled).toBe(true);
  });

  it('enregistre la liste saisie, variantes séparées par des virgules, sans toucher au reste', async () => {
    saveTranscriptCorrections.mockResolvedValue({
      ok: true,
      data: { settings: corrections({ rules: [RULES[0]] }) },
    });
    await renderTab();
    await userEvent.click(screen.getByRole('button', { name: tc.add }));
    await userEvent.type(fromInputs()[0], ' Klobex ,Clobex');
    await userEvent.type(toInputs()[0], 'Globex');
    await userEvent.click(saveButton());

    expect(saveTranscriptCorrections).toHaveBeenCalledWith({ rules: [RULES[0]] });
    expect(saveOrgContextSettings).not.toHaveBeenCalled();
    expect(saveBrandingSettings).not.toHaveBeenCalled();
    // L'administrateur est aussi un utilisateur : sa phrase suivante est corrigée.
    expect(correctTranscript('Chez Clobex.')).toBe('Chez Globex.');
    expect(await screen.findByText(t.saved)).toBeTruthy();
  });

  it('une ligne incomplète est signalée, compte comme modifiée, et bloque l’enregistrement', async () => {
    await renderTab();
    await userEvent.click(screen.getByRole('button', { name: tc.add }));
    await userEvent.type(fromInputs()[0], 'Klobex');

    expect(screen.getByText(tc.errors.missingTo)).toBeTruthy();
    expect(toInputs()[0].getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(t.unsavedHint)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('un mot courant est signalé sans bloquer : c’est un choix, mais éclairé', async () => {
    await renderTab();
    await userEvent.click(screen.getByRole('button', { name: tc.add }));
    await userEvent.type(fromInputs()[0], 'ca');
    await userEvent.type(toInputs()[0], 'CA');

    expect(screen.getByText(tc.warnings.common.replace('{term}', 'ca'))).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it('un terme déjà présent plus haut est refusé', async () => {
    fetchTranscriptCorrections.mockResolvedValue({
      ok: true,
      data: { settings: corrections({ rules: RULES }) },
    });
    await renderTab();
    await screen.findByDisplayValue('Klobex, Clobex');
    await userEvent.click(screen.getByRole('button', { name: tc.add }));
    await userEvent.type(fromInputs()[2], 'KLOBEX');
    await userEvent.type(toInputs()[2], 'Autre');

    expect(screen.getByText(tc.errors.duplicate.replace('{term}', 'KLOBEX'))).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('« Essayer » applique les lignes telles que saisies, avant tout enregistrement', async () => {
    await renderTab();
    await userEvent.click(screen.getByRole('button', { name: tc.add }));
    await userEvent.type(fromInputs()[0], 'Klobex');
    await userEvent.type(toInputs()[0], 'Globex');
    await userEvent.type(screen.getByLabelText(tc.tryLabel), 'On a revu Klobex hier.');

    const marks = document.querySelectorAll('mark.tc-mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['Globex']);
    expect(marks[0].closest('.tc-try-out').textContent).toContain('On a revu Globex hier.');

    await userEvent.clear(screen.getByLabelText(tc.tryLabel));
    await userEvent.type(screen.getByLabelText(tc.tryLabel), 'Rien à voir.');
    expect(screen.getByText(tc.tryNoChange)).toBeTruthy();
    expect(saveTranscriptCorrections).not.toHaveBeenCalled();
  });

  it('retirer la dernière correction enregistre une liste vide', async () => {
    fetchTranscriptCorrections.mockResolvedValue({
      ok: true,
      data: { settings: corrections({ rules: [RULES[0]] }) },
    });
    await renderTab();
    await screen.findByDisplayValue('Klobex, Clobex');
    await userEvent.click(screen.getByRole('button', { name: new RegExp(tc.remove) }));
    await userEvent.click(saveButton());

    expect(saveTranscriptCorrections).toHaveBeenCalledWith({ rules: [] });
  });

  it('« Annuler » rend la liste enregistrée', async () => {
    fetchTranscriptCorrections.mockResolvedValue({
      ok: true,
      data: { settings: corrections({ rules: [RULES[0]] }) },
    });
    await renderTab();
    await screen.findByDisplayValue('Klobex, Clobex');
    await userEvent.clear(toInputs()[0]);
    await userEvent.type(toInputs()[0], 'Faux');
    await userEvent.click(screen.getByRole('button', { name: t.discardChanges }));

    expect(toInputs()[0].value).toBe('Globex');
    expect(saveButton().disabled).toBe(true);
  });
});
