/**
 * Invite « Créer une infographie » — l'emplacement de la miniature propose la
 * création quand un compte rendu existe sans image.
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - l'invite n'apparaît QUE lorsque la réunion affichée a un compte rendu,
 *     que l'administration propose l'infographie, qu'un groupe du compte en
 *     donne le droit, et qu'aucune image (ni génération) n'existe — un bouton
 *     qui échouerait au clic est pire qu'absent ;
 *   - sans le droit, une image existante se regarde, se télécharge et se
 *     supprime, mais ne se régénère pas ;
 *   - le clic lance la génération et l'invite cède la place à l'animation,
 *     sans rechargement.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../config/uiText.js';

const apiGet = vi.fn(async () => ({ ok: true, status: 200, data: { status: 'none' } }));
const apiPost = vi.fn(async () => ({
  ok: true,
  status: 200,
  data: { status: 'pending', updatedAt: 't1' },
}));
vi.mock('../services/apiClient.js', () => ({
  get: (...args) => apiGet(...args),
  post: (...args) => apiPost(...args),
}));
// Le rendu PNG (html2canvas) n'a pas de sens sous jsdom : on vérifie qu'il est
// DEMANDÉ avec le contenu affiché, et que le fichier part.
const renderPng = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
const saveFile = vi.fn(async () => {});
vi.mock('../lib/infographic/exportPng.js', () => ({
  renderInfographicPng: (...args) => renderPng(...args),
}));
vi.mock('../platform/download.js', () => ({
  saveFile: (...args) => saveFile(...args),
  interceptAnchorDownload: () => {},
}));

const { default: ResumeOverlays } = await import('./ResumeOverlays.svelte');
const { auth } = await import('../stores/auth.js');
const { historyItems } = await import('../stores/history.js');
const { resetInfographic } = await import('../stores/infographic.js');
const { resetCompanyLogo } = await import('../stores/companyLogo.js');

const T = uiTextData.fr.infographic;

/** Réunion AVEC compte rendu (une version) et sans infographie. */
const meetingWithSummary = (over = {}) => ({
  meetingId: 'm-1',
  resume: '<h1>CR</h1>',
  versions: [{ id: 'v1', html: '<h1>CR</h1>' }],
  ...over,
});

/**
 * L'interrupteur de l'onglet IA (capacité) et le droit tenu des groupes
 * (identité) : les deux doivent être là pour créer une image.
 */
function setAccess({ enabled = true, right = true } = {}) {
  auth.update((state) => ({
    ...state,
    user: { email: 'alex@myalfred.ai', rights: { infographic: right } },
    capabilities: { ...state.capabilities, infographic: { enabled } },
  }));
}
const setCapability = (enabled) => setAccess({ enabled });

const READY = {
  ok: true,
  status: 200,
  data: { status: 'ready', dataUrl: 'data:image/png;base64,AAA', updatedAt: 't1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetInfographic();
  setAccess();
  historyItems.set([meetingWithSummary()]);
});

describe('ResumeOverlays — invite « Créer une infographie »', () => {
  it('visible quand un compte rendu existe sans image', () => {
    render(ResumeOverlays, { meetingId: 'm-1' });
    expect(screen.getByRole('button', { name: T.createInvite })).toBeTruthy();
  });

  it('absente sans compte rendu (réunion en cours jamais résumée)', () => {
    historyItems.set([meetingWithSummary({ resume: '', versions: [] })]);
    render(ResumeOverlays, { meetingId: 'm-1' });
    expect(screen.queryByRole('button', { name: T.createInvite })).toBeNull();
  });

  it("absente quand l'administration a coupé la fonctionnalité", () => {
    setCapability(false);
    render(ResumeOverlays, { meetingId: 'm-1' });
    expect(screen.queryByRole('button', { name: T.createInvite })).toBeNull();
  });

  it('absente quand aucun groupe du compte n en donne le droit', () => {
    setAccess({ right: false });
    render(ResumeOverlays, { meetingId: 'm-1' });
    expect(screen.queryByRole('button', { name: T.createInvite })).toBeNull();
  });

  it('absente pendant la génération du résumé et sans réunion affichée', () => {
    const { unmount } = render(ResumeOverlays, { meetingId: 'm-1', isGenerating: true });
    expect(screen.queryByRole('button', { name: T.createInvite })).toBeNull();
    unmount();
    render(ResumeOverlays, { meetingId: null });
    expect(screen.queryByRole('button', { name: T.createInvite })).toBeNull();
  });

  it("le clic lance la génération : l'invite cède la place à l'animation", async () => {
    render(ResumeOverlays, { meetingId: 'm-1' });
    await userEvent.click(screen.getByRole('button', { name: T.createInvite }));

    expect(apiPost).toHaveBeenCalledWith('/infographic/regenerate', {
      meetingId: 'm-1',
      language: 'fr',
    });
    expect(await screen.findByRole('status', { name: T.pendingLabel })).toBeTruthy();
    expect(screen.queryByRole('button', { name: T.createInvite })).toBeNull();
  });

  it('sans le droit, une image existante se garde : téléchargée, supprimée, jamais régénérée', async () => {
    setAccess({ right: false });
    apiGet.mockResolvedValue(READY);
    historyItems.set([meetingWithSummary({ infographic: { status: 'ready', updatedAt: 't1' } })]);
    render(ResumeOverlays, { meetingId: 'm-1' });
    expect(await screen.findByRole('button', { name: T.openAria })).toBeTruthy();
    expect(screen.getByRole('link', { name: T.download })).toBeTruthy();
    expect(screen.getByRole('button', { name: T.remove })).toBeTruthy();
    expect(screen.queryByRole('button', { name: T.regenerate })).toBeNull();
  });

  it('une image déjà là : miniature, pas d’invite', async () => {
    apiGet.mockResolvedValue(READY);
    historyItems.set([meetingWithSummary({ infographic: { status: 'ready', updatedAt: 't1' } })]);
    render(ResumeOverlays, { meetingId: 'm-1' });
    expect(await screen.findByRole('button', { name: T.openAria })).toBeTruthy();
    expect(screen.queryByRole('button', { name: T.createInvite })).toBeNull();
  });
});

describe('ResumeOverlays — infographie en gabarit', () => {
  const LAYOUT = {
    version: 1,
    gabarit: 'bilan',
    langue: 'fr',
    titre: 'Sprint 14 : objectifs tenus',
    sousTitre: '',
    heros: { valeur: '8/10', libelle: 'objectifs atteints', icone: 'cible' },
    chiffres: [],
    repartition: null,
    sujets: [],
    decisions: [],
    vigilances: [],
    jalons: [],
    options: [],
    idees: [],
    bilan: { reussites: ['Démo réussie'], difficultes: ['Revues lentes'], essais: [] },
    participants: [],
    prochaineEtape: '',
    actions: [{ texte: 'Créer le créneau de revue', responsable: 'Ben Nguyen', echeance: '' }],
    actionsTotal: 1,
    date: null,
    dureeSec: null,
  };
  const READY_LAYOUT = {
    ok: true,
    status: 200,
    data: { status: 'ready', layout: LAYOUT, updatedAt: 't1' },
  };

  const COMPANY = 'data:image/png;base64,Q09NUEFOWQ==';
  /** GET /infographic → le contenu ; GET /branding/company-logo → `company`. */
  const serve = (company = '') =>
    apiGet.mockImplementation(async (path) =>
      path.startsWith('/branding/company-logo')
        ? { ok: true, status: 200, data: { companyLogo: company } }
        : READY_LAYOUT,
    );

  beforeEach(() => {
    resetCompanyLogo();
    serve();
    historyItems.set([meetingWithSummary({ infographic: { status: 'ready', updatedAt: 't1' } })]);
  });

  it("deux logos : celui de l'entreprise en tête, celui de l'application en pied avec « myBrief »", async () => {
    serve(COMPANY);
    render(ResumeOverlays, { meetingId: 'm-1' });
    await userEvent.click(await screen.findByRole('button', { name: T.openAria }));
    const dialog = screen.getByRole('dialog', { name: T.title });
    await waitFor(() =>
      expect(dialog.querySelector('.ig-logo-badge img')?.getAttribute('src')).toBe(COMPANY),
    );
    const made = dialog.querySelector('.ig-made');
    expect(made.textContent).toContain(T.sheet.madeWith);
    expect(made.querySelector('img').getAttribute('src')).not.toBe(COMPANY);
  });

  it("sans logo d'entreprise, celui de l'application prend sa place en tête", async () => {
    render(ResumeOverlays, { meetingId: 'm-1' });
    await userEvent.click(await screen.findByRole('button', { name: T.openAria }));
    const dialog = screen.getByRole('dialog', { name: T.title });
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/branding/company-logo'));
    const head = dialog.querySelector('.ig-logo-badge img').getAttribute('src');
    expect(head).toBeTruthy();
    expect(head).toBe(dialog.querySelector('.ig-made img').getAttribute('src'));
  });

  it('la miniature est la feuille elle-même — muette pour les lecteurs d’écran', async () => {
    const { container } = render(ResumeOverlays, { meetingId: 'm-1' });
    expect(await screen.findByRole('button', { name: T.openAria })).toBeTruthy();
    const mini = container.querySelector('.igc-mini .igx');
    expect(mini).toBeTruthy();
    expect(mini.getAttribute('aria-hidden')).toBe('true');
    expect(mini.textContent).toContain('Sprint 14 : objectifs tenus');
    // Pas d'image d'avant les gabarits.
    expect(container.querySelector('.igc-thumb img[alt="' + T.thumbAlt + '"]')).toBeNull();
  });

  it('en grand : du vrai texte, avec les libellés du gabarit', async () => {
    render(ResumeOverlays, { meetingId: 'm-1' });
    await userEvent.click(await screen.findByRole('button', { name: T.openAria }));
    const dialog = screen.getByRole('dialog', { name: T.title });
    expect(dialog.textContent).toContain('Sprint 14 : objectifs tenus');
    expect(dialog.textContent).toContain(T.sheet.worked);
    expect(dialog.textContent).toContain('Créer le créneau de revue');
  });

  it('télécharger rend l’image au clic, avec le contenu affiché, puis l’enregistre', async () => {
    render(ResumeOverlays, { meetingId: 'm-1' });
    await screen.findByRole('button', { name: T.openAria });
    // Un bouton, pas un lien : l'image n'existe qu'au moment du clic.
    expect(screen.queryByRole('link', { name: T.download })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: T.download }));
    expect(renderPng).toHaveBeenCalledTimes(1);
    expect(renderPng.mock.calls[0][0].layout).toEqual(LAYOUT);
    expect(saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'mybrief-infographie.png', mimeType: 'image/png' }),
    );
  });

  it('image impossible à préparer : un message, pas de fichier', async () => {
    renderPng.mockRejectedValueOnce(new Error('canvas'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(ResumeOverlays, { meetingId: 'm-1' });
    await screen.findByRole('button', { name: T.openAria });
    await userEvent.click(screen.getByRole('button', { name: T.download }));
    expect(saveFile).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('ResumeOverlays — longueur du résumé (Pagimètre) dans le badge du template', () => {
  const PM = uiTextData.fr.pageMeter;

  it('rappelle la longueur MESURÉE, ramenée au pas du curseur, avec la demande en infobulle', () => {
    const { container } = render(ResumeOverlays, {
      showTag: true,
      tagIcon: '📝',
      tagLabel: 'Standard',
      tagLength: { pages: 1, measuredPages: 1.08 },
    });
    const length = container.querySelector('.resume-template-tag-length');
    expect(length.textContent).toBe('· ≈ 1 page');
    expect(length.getAttribute('title')).toBe(
      PM.tagTitle.replace('{requested}', '1 page').replace('{measured}', '1 page'),
    );
  });

  it('mesure absente (mise en forme retouchée par le modèle) : la longueur demandée', () => {
    const { container } = render(ResumeOverlays, {
      showTag: true,
      tagLabel: 'Standard',
      tagLength: { pages: 3, measuredPages: null },
    });
    expect(container.querySelector('.resume-template-tag-length').textContent).toBe('· ≈ 3 pages');
  });

  it('sans Pagimètre : le badge d’avant, sans longueur', () => {
    const { container } = render(ResumeOverlays, { showTag: true, tagLabel: 'Décision' });
    expect(container.querySelector('.resume-template-tag-length')).toBeNull();
  });
});
