/**
 * « Mes tags » — la liste, la fiche du tag, le formulaire, et les RÈGLES PAR
 * TAG (rangement, envoi).
 *
 * Ce qui compte ici : les messages du serveur atteignent l'utilisateur (un
 * doublon refusé sans explication est un formulaire qui ne répond pas), et la
 * suppression dit ce qu'elle NE supprime PAS — les conversations restent.
 *
 * Pour les règles : l'écriture est un patch PARTIEL (`{storage:{…}}`,
 * `{mail:{…}}`) reconstruit depuis les valeurs ENREGISTRÉES — pas de
 * brouillon dans ce panneau — et les règles des AUTRES tags doivent survivre
 * à chaque écriture. Et la fiche ne coche jamais un choix avant qu'il soit
 * enregistré : fermer la fenêtre de dossier sans choisir ne change rien.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

const api = {
  fetchTags: vi.fn(),
  saveTag: vi.fn(),
  saveTagContextRequest: vi.fn(),
  fetchTagLogo: vi.fn(),
  saveTagLogoRequest: vi.fn(),
  deleteTagLogoRequest: vi.fn(),
  deleteTag: vi.fn(),
  setMeetingTag: vi.fn(),
};
vi.mock('../services/tagsApi.js', () => ({
  fetchTags: (...a) => api.fetchTags(...a),
  saveTag: (...a) => api.saveTag(...a),
  saveTagContextRequest: (...a) => api.saveTagContextRequest(...a),
  fetchTagLogo: (...a) => api.fetchTagLogo(...a),
  saveTagLogoRequest: (...a) => api.saveTagLogoRequest(...a),
  deleteTagLogoRequest: (...a) => api.deleteTagLogoRequest(...a),
  deleteTag: (...a) => api.deleteTag(...a),
  setMeetingTag: (...a) => api.setMeetingTag(...a),
}));

const actionsApi = {
  fetchActionSettings: vi.fn(),
  saveActionSettings: vi.fn(),
  fetchStorageDrives: vi.fn(),
  fetchStorageFolders: vi.fn(),
  fetchStoragePath: vi.fn(),
  createStorageFolder: vi.fn(),
};
vi.mock('../services/actionsApi.js', () => ({
  fetchActionSettings: (...a) => actionsApi.fetchActionSettings(...a),
  saveActionSettings: (...a) => actionsApi.saveActionSettings(...a),
  fetchStorageDrives: (...a) => actionsApi.fetchStorageDrives(...a),
  fetchStorageFolders: (...a) => actionsApi.fetchStorageFolders(...a),
  fetchStoragePath: (...a) => actionsApi.fetchStoragePath(...a),
  createStorageFolder: (...a) => actionsApi.createStorageFolder(...a),
}));

// La réduction de l'image passe par un canvas, absent de jsdom.
const logoUtil = { prepare: vi.fn() };
vi.mock('../utils/tagLogo.js', async (importOriginal) => ({
  ...(await importOriginal()),
  prepareTagLogo: (...a) => logoUtil.prepare(...a),
}));

const connectApi = { fetchConnectStatus: vi.fn() };
vi.mock('../services/connectApi.js', () => ({
  fetchConnectStatus: (...a) => connectApi.fetchConnectStatus(...a),
}));

const TagsPanel = (await import('./TagsPanel.svelte')).default;
const {
  tags,
  tagsMax,
  tagColors,
  tagShapes,
  tagHueLightness,
  tagContextMax,
  tagLogos,
  TAG_HUE_LIGHTNESS,
  TAG_CONTEXT_MAX,
} = await import('../stores/tags.js');
const { currentLanguageStore } = await import('../store.js');
const { historyItems } = await import('../stores/history.js');
const { resetActionSettings, applyActionSettings } = await import('../stores/actionSettings.js');
const { panelNav } = await import('../stores/panels.js');

const ok = (data) => ({ ok: true, status: 200, data });
const ko = (status, error, extra = {}) => ({ ok: false, status, data: { error, ...extra } });

const TAG = { id: 't-1', label: 'Client Dupont', color: 'red' };
const TAG2 = { id: 't-2', label: 'Interne', color: 'blue' };
const COLORS = ['slate', 'red', 'blue'];
const SHAPES = ['circle', 'diamond', 'star', 'heart'];

/** Réponse GET/POST /actions/settings — la forme complète que le store attend. */
function settingsPayload({ storage = {}, mail = {}, ceiling = {} } = {}) {
  return {
    settings: {
      mail: { recipients: [], subjectTemplate: '', tagRecipients: [], ...mail },
      storage: {
        folder: '',
        driveId: '',
        driveName: '',
        requireApproval: false,
        tagSubfolders: false,
        tagFolders: [],
        ...storage,
      },
      naming: { filenameTemplate: '' },
    },
    ceiling: { email: true, storage: true, ...ceiling },
    limits: { maxRecipients: 5, templateMax: 200, folderMax: 500 },
    variables: ['titre', 'date'],
    defaults: { subjectTemplate: '', filenameTemplate: '' },
  };
}

const CONNECTED = {
  provider: { id: 'google', label: 'Google', connected: true, driveReady: true, available: true },
};
const MICROSOFT = {
  provider: {
    id: 'microsoft',
    label: 'Microsoft',
    connected: true,
    driveReady: true,
    available: true,
  },
};

beforeEach(() => {
  localStorage.clear();
  for (const fn of [...Object.values(api), ...Object.values(actionsApi)]) fn.mockReset();
  connectApi.fetchConnectStatus.mockReset();
  api.fetchTags.mockResolvedValue(ok({ tags: [], colors: COLORS, shapes: SHAPES, max: 20 }));
  actionsApi.fetchActionSettings.mockResolvedValue(ok(settingsPayload()));
  connectApi.fetchConnectStatus.mockResolvedValue(ok(CONNECTED));
  tags.set([]);
  tagColors.set(COLORS);
  tagShapes.set(SHAPES);
  tagHueLightness.set(TAG_HUE_LIGHTNESS);
  tagContextMax.set(TAG_CONTEXT_MAX);
  tagLogos.set(new Map());
  tagsMax.set(20);
  historyItems.set([]);
  resetActionSettings();
});

/** Rend le panneau et attend le chargement initial (onMount → loadTags). */
async function setup() {
  render(TagsPanel);
  await screen.findByText(/Un tag range vos conversations/);
}

/** Attend que la fiche du tag `label` soit celle affichée. */
/**
 * Attend la fiche du tag `label`, et DÉPLIE ses règles (rangement, envoi),
 * repliées par défaut : les tests de ces règles en manipulent les choix. Sans
 * effet sur une règle déjà dépliée.
 */
async function fiche(label) {
  const heading = await screen.findByRole('heading', { name: label });
  for (const toggle of screen.queryAllByRole('button', { name: /^Modifier : / })) {
    if (toggle.getAttribute('aria-expanded') === 'false') await fireEvent.click(toggle);
  }
  return heading;
}

/** Ouvre le formulaire complet d'un tag : la pastille, puis « Motifs et couleur libre… ». */
async function openForm() {
  await userEvent.click(await screen.findByRole('button', { name: 'Couleur et forme' }));
  await userEvent.click(screen.getByRole('button', { name: 'Motifs et couleur libre…' }));
}

/** Le choix radio de la fiche dont le libellé COMMENCE par `title`. */
const choice = (title) =>
  screen.getByRole('radio', {
    name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });

/** Ouvre le repli « motifs et couleur libre » du formulaire. */
const openMore = () =>
  userEvent.click(screen.getByRole('button', { name: 'Plus de choix : motifs et couleur libre' }));

describe('TagsPanel — création', () => {
  it('crée un tag avec le nom et la couleur saisis, puis montre SA fiche', async () => {
    api.saveTag.mockResolvedValue(ok({ tag: TAG }));
    await setup();

    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    await userEvent.type(screen.getByRole('textbox'), 'Client Dupont');
    await userEvent.click(screen.getByRole('radio', { name: 'Rouge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer le tag' }));

    // Rond par défaut : un tag créé sans y toucher ressemble à ceux d'avant.
    expect(api.saveTag).toHaveBeenCalledWith({
      label: 'Client Dupont',
      color: 'red',
      shape: 'circle',
    });
    // La fiche du tag créé : c'est là que se règlent son rangement et son envoi.
    expect(await fiche('Client Dupont')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Où ranger ses comptes rendus ?' })).toBeTruthy();
  });

  it('crée un tag avec une forme et une couleur libre réglée aux curseurs', async () => {
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG, color: 'hue-210-45', shape: 'star' } }));
    await setup();

    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    await userEvent.type(screen.getByRole('textbox'), 'Client Dupont');
    await userEvent.click(screen.getByRole('radio', { name: 'Étoile' }));
    await openMore();
    // Bouger un curseur suffit : la pastille « Couleur libre » se coche seule.
    const slider = screen.getByRole('slider', { name: 'Angle de la teinte' });
    expect(screen.getByRole('radio', { name: 'Couleur libre' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    await fireEvent.input(slider, { target: { value: '210' } });
    expect(screen.getByRole('radio', { name: 'Couleur libre' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(slider.getAttribute('aria-valuetext')).toBe('210°');
    // Clarté : bornes servies par l'API sur le curseur, valeur réglée dans le slug.
    const light = screen.getByRole('slider', { name: 'Clarté' });
    expect(light.getAttribute('min')).toBe(String(TAG_HUE_LIGHTNESS.min));
    expect(light.getAttribute('max')).toBe(String(TAG_HUE_LIGHTNESS.max));
    expect(light.value).toBe(String(TAG_HUE_LIGHTNESS.default));
    await fireEvent.input(light, { target: { value: '45' } });
    expect(light.getAttribute('aria-valuetext')).toBe('45 %');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le tag' }));

    expect(api.saveTag).toHaveBeenCalledWith({
      label: 'Client Dupont',
      color: 'hue-210-45',
      shape: 'star',
    });
  });

  it('la clarté seule suffit à choisir la couleur libre, à l’angle de départ', async () => {
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG, color: 'hue-195-40' } }));
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    await userEvent.type(screen.getByRole('textbox'), 'Sombre');
    await openMore();
    await fireEvent.input(screen.getByRole('slider', { name: 'Clarté' }), {
      target: { value: '40' },
    });
    expect(screen.getByRole('radio', { name: 'Couleur libre' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Créer le tag' }));
    expect(api.saveTag).toHaveBeenCalledWith({
      label: 'Sombre',
      color: 'hue-195-40',
      shape: 'circle',
    });
  });

  it('repasser sur la palette décoche la couleur libre, et la pastille arc-en-ciel la rappelle', async () => {
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    await openMore();
    const slider = screen.getByRole('slider', { name: 'Angle de la teinte' });
    await fireEvent.input(slider, { target: { value: '33' } });
    await fireEvent.input(screen.getByRole('slider', { name: 'Clarté' }), {
      target: { value: '50' },
    });
    await userEvent.click(screen.getByRole('radio', { name: 'Rouge' }));
    expect(screen.getByRole('radio', { name: 'Couleur libre' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Rouge' }).getAttribute('aria-checked')).toBe('true');
    // Les réglages ne sont pas perdus : la pastille arc-en-ciel les reprend.
    await userEvent.click(screen.getByRole('radio', { name: 'Couleur libre' }));
    expect(slider.value).toBe('33');
    expect(screen.getByRole('slider', { name: 'Clarté' }).value).toBe('50');
    await userEvent.type(screen.getByRole('textbox'), 'X');
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG, label: 'X', color: 'hue-33-50' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer le tag' }));
    expect(api.saveTag).toHaveBeenCalledWith({ label: 'X', color: 'hue-33-50', shape: 'circle' });
  });

  it('les teintes unies d’abord ; motifs et couleur libre repliés, ouverts d’office pour un tag qui en porte', async () => {
    tagColors.set([...COLORS, 'blue-stripes']);
    api.fetchTags.mockResolvedValue(
      ok({
        tags: [{ ...TAG, color: 'blue-stripes' }],
        colors: [...COLORS, 'blue-stripes'],
        shapes: SHAPES,
        max: 20,
      }),
    );
    await setup();
    await fiche('Client Dupont');

    // Création : le repli est fermé, seules les teintes unies se montrent.
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    const more = screen.getByRole('button', { name: 'Plus de choix : motifs et couleur libre' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('radio', { name: 'Bleu rayé' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Angle de la teinte' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Rouge' })).toBeTruthy();
    await userEvent.click(more);
    expect(screen.getByRole('radio', { name: 'Bleu rayé' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    // Modification d'un tag à motif : on ne cache pas ce qui est choisi.
    await openForm();
    expect(screen.getByRole('radio', { name: 'Bleu rayé' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('chaque pastille et chaque forme s’annoncent par leur nom, dans la langue de l’interface', async () => {
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    await openMore();
    expect(screen.getByRole('radio', { name: 'Gris ardoise' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'slate' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Losange' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'diamond' })).toBeNull();
    // Les formes servies, et seulement elles.
    expect(screen.getAllByRole('radio', { name: /^(Rond|Losange|Étoile|Cœur)$/ })).toHaveLength(4);
    expect(screen.queryByRole('radio', { name: 'Carré' })).toBeNull();

    currentLanguageStore.set('en');
    try {
      expect(await screen.findByRole('radio', { name: 'Slate grey' })).toBeTruthy();
      expect(screen.getByRole('radio', { name: 'Diamond' })).toBeTruthy();
      expect(screen.getByRole('radio', { name: 'Custom colour' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Create the tag' })).toBeTruthy();
    } finally {
      currentLanguageStore.set('fr');
    }
  });

  it('l’aperçu montre la puce telle qu’elle paraîtra — nom saisi, sinon l’exemple du champ', async () => {
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    const form = screen.getByRole('form', { name: 'Nouveau tag' });
    const chip = () => form.querySelector('.tgf-preview-chip .tag-chip');
    expect(chip().textContent.trim()).toBe('Client Dupont');
    await userEvent.type(screen.getByRole('textbox'), 'Comité produit');
    expect(chip().textContent.trim()).toBe('Comité produit');
    expect(form.querySelector('.tgf-preview-name').textContent).toBe('Comité produit');
    await userEvent.click(screen.getByRole('radio', { name: 'Cœur' }));
    expect(chip().getAttribute('style')).toContain('--chip-shape: var(--tag-shape-heart)');
  });

  it('« Créer le tag » reste inactif tant que le nom est vide', async () => {
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    expect(screen.getByRole('button', { name: 'Créer le tag' }).disabled).toBe(true);

    await userEvent.type(screen.getByRole('textbox'), '  ');
    expect(screen.getByRole('button', { name: 'Créer le tag' }).disabled).toBe(true);
  });

  it('affiche le refus du serveur DANS le formulaire, saisie conservée', async () => {
    api.saveTag.mockResolvedValue(ko(409, 'duplicate_label'));
    await setup();

    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    await userEvent.type(screen.getByRole('textbox'), 'Client Dupont');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le tag' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Vous avez déjà un tag portant ce nom.');
    expect(alert.closest('form')).not.toBeNull();
    // Le formulaire reste ouvert : la saisie n'est pas perdue.
    expect(screen.getByRole('textbox').value).toBe('Client Dupont');
  });

  it('injecte le plafond dans le message de limite', async () => {
    api.saveTag.mockResolvedValue(ko(409, 'limit_reached'));
    await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau tag' }));
    await userEvent.type(screen.getByRole('textbox'), 'Un de trop');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le tag' }));

    expect((await screen.findByRole('alert')).textContent).toContain('20 tags au maximum');
  });

  it('le bouton d’ajout est désactivé une fois le plafond atteint, et le compteur le dit', async () => {
    tagsMax.set(2);
    tags.set([TAG, TAG2]);
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG, TAG2], colors: COLORS, max: 2 }));
    await setup();
    expect(screen.getByRole('button', { name: 'Nouveau tag' }).disabled).toBe(true);
    expect(screen.getByText('2 tags sur 2')).toBeTruthy();
  });
});

describe('TagsPanel — la liste et la fiche', () => {
  beforeEach(() => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG, TAG2], colors: COLORS, max: 20 }));
  });

  it('montre d’emblée la fiche du premier tag, puis celle du tag cliqué', async () => {
    await setup();
    expect(await fiche('Client Dupont')).toBeTruthy();

    const rows = screen.getByRole('navigation', { name: 'Mes tags' });
    await userEvent.click(within(rows).getByRole('button', { name: /^Interne/ }));
    expect(await fiche('Interne')).toBeTruthy();
    expect(
      within(rows)
        .getByRole('button', { name: /^Interne/ })
        .getAttribute('aria-current'),
    ).toBe('true');
    expect(
      within(rows)
        .getByRole('button', { name: /^Client Dupont/ })
        .getAttribute('aria-current'),
    ).toBeNull();
  });

  it('« Nouveau tag » pose une ligne « En cours de création » en tête, et se désactive le temps de la saisie', async () => {
    await setup();
    await fiche('Client Dupont');

    const addBtn = screen.getByRole('button', { name: 'Nouveau tag' });
    await userEvent.click(addBtn);
    const first = document.querySelector('.tgp-rows > li');
    expect(first.textContent).toContain('En cours de création');
    expect(screen.getByRole('textbox')).toBe(document.activeElement);
    // Un second clic pendant la saisie ne doit pas effacer ce qu'on tape.
    expect(addBtn.disabled).toBe(true);
    await userEvent.type(screen.getByRole('textbox'), 'Comité');
    expect(first.textContent).toContain('Comité');

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(addBtn.disabled).toBe(false);
    expect(document.querySelector('.tgp-rows').textContent).not.toContain('En cours de création');
    expect(await fiche('Client Dupont')).toBeTruthy();
  });

  it('chaque ligne porte la couleur de son tag et son nombre de conversations', async () => {
    historyItems.set([{ meetingId: 'm-1', tagId: 't-1' }]);
    await setup();
    await fiche('Client Dupont');

    const rows = document.querySelectorAll('.tgp-rows .tgp-row');
    expect(rows[0].getAttribute('style')).toContain('--row-dot: var(--tag-red)');
    expect(rows[1].getAttribute('style')).toContain('--row-dot: var(--tag-blue)');
    expect(rows[0].textContent).toContain('1 conversation');
    expect(rows[1].textContent).toContain('Aucune conversation');
    // La fiche le dit en toutes lettres.
    expect(screen.getByText('1 conversation porte ce tag')).toBeTruthy();
  });

  it('le compteur de conversations suit l’historique arrivé APRÈS le montage', async () => {
    // Deep-link #my-tags au démarrage : le panneau se monte avant /history.
    // Un compteur figé derrière un appel de fonction resterait vide — le piège
    // de réactivité Svelte déjà rencontré sur l'écran Actions.
    await setup();
    await fiche('Client Dupont');
    expect(screen.getByText('Aucune conversation ne porte encore ce tag')).toBeTruthy();

    historyItems.set([
      { meetingId: 'm-1', tagId: 't-1' },
      { meetingId: 'm-2', tagId: 't-1' },
    ]);
    expect(await screen.findByText('2 conversations portent ce tag')).toBeTruthy();
    expect(document.querySelector('.tgp-rows .tgp-row').textContent).toContain('2 conversations');
  });

  it('la liste dit quels tags ont LEUR règle — et avec quel logo de bibliothèque', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            tagFolders: [
              { tagId: 't-1', folder: 'Clients/Dupont', driveId: 'd1', driveName: 'Mon Drive' },
            ],
          },
          mail: { tagRecipients: [{ tagId: 't-2', recipients: ['equipe@client.fr'] }] },
        }),
      ),
    );
    await setup();
    await fiche('Client Dupont');

    const nav = screen.getByRole('navigation', { name: 'Mes tags' });
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: /^Client Dupont/ }).textContent).toContain(
        'a son propre dossier',
      ),
    );
    const dupont = within(nav).getByRole('button', { name: /^Client Dupont/ });
    const interne = within(nav).getByRole('button', { name: /^Interne/ });
    expect(dupont.querySelector('[data-kind="google-drive"]')).not.toBeNull();
    expect(dupont.textContent).not.toContain('a ses propres destinataires');
    expect(interne.textContent).toContain('a ses propres destinataires');
    expect(interne.querySelector('[data-kind]')).toBeNull();
  });

  it('la recherche n’apparaît qu’à partir de sept tags, et filtre la liste', async () => {
    const many = [
      'Achats',
      'Budget',
      'Client Dupont',
      'Direction',
      'Équipe',
      'Formation',
      'Interne',
    ];
    api.fetchTags.mockResolvedValue(
      ok({
        tags: many.map((label, i) => ({ id: `t-${i}`, label, color: 'red' })),
        colors: COLORS,
        max: 20,
      }),
    );
    await setup();
    await fiche('Achats');

    const search = screen.getByRole('searchbox', { name: 'Rechercher un tag' });
    await userEvent.type(search, 'dup');
    const nav = screen.getByRole('navigation', { name: 'Mes tags' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      expect.stringContaining('Client Dupont'),
      expect.stringContaining('Réglages communs'),
    ]);
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(screen.getByText('Aucun tag ne correspond.')).toBeTruthy();
  });

  it('sous six tags, pas de recherche', async () => {
    await setup();
    await fiche('Client Dupont');
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('dès qu’un tag a un contexte, la recherche apparaît et trouve par lui', async () => {
    api.fetchTags.mockResolvedValue(
      ok({
        tags: [{ ...TAG, context: 'Interlocutrice : Claire Martin, achats.' }, TAG2],
        colors: COLORS,
        max: 20,
      }),
    );
    await setup();
    await fiche('Client Dupont');
    const search = screen.getByRole('searchbox', { name: 'Rechercher un tag' });
    expect(search.getAttribute('placeholder')).toBe('Nom, personne, sigle…');
    await userEvent.type(search, 'claire');
    const nav = screen.getByRole('navigation', { name: 'Mes tags' });
    const dupont = within(nav).getByRole('button', { name: /^Client Dupont/ });
    // L'extrait remplace le compteur, le mot trouvé surligné.
    expect(dupont.querySelector('mark').textContent).toBe('Claire');
    expect(dupont.textContent).not.toContain('Aucune conversation');
    expect(within(nav).queryByRole('button', { name: /^Interne/ })).toBeNull();
  });

  it('sur téléphone, la fiche remplace la liste : un tag l’ouvre, « Mes tags » y ramène', async () => {
    await setup();
    await fiche('Client Dupont');
    const layout = document.querySelector('.tgp-layout');
    expect(layout.classList.contains('tgp-detail-open')).toBe(false);

    const nav = screen.getByRole('navigation', { name: 'Mes tags' });
    await userEvent.click(within(nav).getByRole('button', { name: /^Interne/ }));
    expect(layout.classList.contains('tgp-detail-open')).toBe(true);

    // Le bouton de retour vit dans la fiche (affiché par CSS sous 760 px).
    await userEvent.click(screen.getByRole('button', { name: 'Mes tags' }));
    expect(layout.classList.contains('tgp-detail-open')).toBe(false);
  });
});

describe('TagsPanel — ce que l’IA doit savoir', () => {
  const ATLAS = 'Rénovation du siège. Cliente : Claire Martin.';
  const contextField = () => screen.getByRole('textbox', { name: 'Que doit savoir l’IA ?' });

  beforeEach(() => {
    api.fetchTags.mockResolvedValue(
      ok({ tags: [{ ...TAG, context: ATLAS }, TAG2], colors: COLORS, max: 20, contextMax: 200 }),
    );
  });

  it('montre le texte du tag, l’enregistre en quittant le champ, et le dit', async () => {
    api.saveTagContextRequest.mockResolvedValue(
      ok({ tag: { id: 't-1', context: `${ATLAS} PAC = pompe à chaleur.` } }),
    );
    await setup();
    await fiche('Client Dupont');
    const field = contextField();
    expect(field.value).toBe(ATLAS);
    // La borne servie par l'API, et le compteur qui la rappelle.
    expect(field.getAttribute('maxlength')).toBe('200');
    expect(screen.getByText(`${ATLAS.length} / 200`)).toBeTruthy();

    await userEvent.type(field, ' PAC = pompe à chaleur.');
    await fireEvent.blur(field);
    expect(api.saveTagContextRequest).toHaveBeenCalledWith(
      't-1',
      `${ATLAS} PAC = pompe à chaleur.`,
    );
    expect(await screen.findByText('Enregistré')).toBeTruthy();
  });

  it('quitter le champ sans rien changer n’écrit rien — espaces de bord compris', async () => {
    await setup();
    await fiche('Client Dupont');
    await userEvent.type(contextField(), '   ');
    await fireEvent.blur(contextField());
    expect(api.saveTagContextRequest).not.toHaveBeenCalled();
  });

  it('un refus du serveur s’affiche dans la fiche, texte conservé', async () => {
    api.saveTagContextRequest.mockResolvedValue(ko(400, 'context_too_long', { max: 200 }));
    await setup();
    await fiche('Client Dupont');
    await userEvent.type(contextField(), ' Encore.');
    await fireEvent.blur(contextField());
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Texte trop long (200 caractères maximum).',
    );
    expect(contextField().value).toBe(`${ATLAS} Encore.`);
  });

  it('chaque tag a son texte : changer de fiche ne mélange pas les brouillons', async () => {
    await setup();
    await fiche('Client Dupont');
    const rows = screen.getByRole('navigation', { name: 'Mes tags' });
    await userEvent.click(within(rows).getByRole('button', { name: /^Interne/ }));
    await fiche('Interne');
    expect(contextField().value).toBe('');
    await userEvent.click(within(rows).getByRole('button', { name: /^Client Dupont/ }));
    await fiche('Client Dupont');
    expect(contextField().value).toBe(ATLAS);
  });

  it('« Lu par » ne nomme que ce que le compte utilise', async () => {
    await setup();
    await fiche('Client Dupont');
    expect(screen.getByText('Compte rendu')).toBeTruthy();
    expect(screen.getByText('Transcription')).toBeTruthy();
    expect(screen.queryByText('Infographie')).toBeNull();
    expect(screen.queryByText('Aide IA')).toBeNull();
  });
});

describe('TagsPanel — fiche : tout s’enregistre aussitôt', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAA';

  beforeEach(() => {
    logoUtil.prepare.mockReset();
    api.fetchTags.mockResolvedValue(
      ok({ tags: [TAG, TAG2], colors: COLORS, shapes: SHAPES, max: 20 }),
    );
  });

  it('rangement et envoi sont repliés : la réponse se lit, « Modifier » déplie', async () => {
    await setup();
    await screen.findByRole('heading', { name: 'Client Dupont' });
    expect(screen.queryByRole('radio', { name: /^Avec les autres comptes rendus/ })).toBeNull();
    expect(screen.getByText('Avec les autres comptes rendus')).toBeTruthy();
    const toggle = screen.getByRole('button', {
      name: 'Modifier : Où ranger ses comptes rendus ?',
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(screen.getByRole('radio', { name: /^Avec les autres comptes rendus/ })).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Fermer : Où ranger ses comptes rendus ?' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('le nom se modifie sur place : Entrée enregistre le corps COMPLET', async () => {
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG, label: 'Client Dupont SA' } }));
    await setup();
    await screen.findByRole('heading', { name: 'Client Dupont' });
    await userEvent.click(screen.getByRole('button', { name: 'Renommer' }));
    const input = screen.getByRole('textbox', { name: 'Nom' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Client Dupont SA{Enter}');
    expect(api.saveTag).toHaveBeenCalledWith({
      id: 't-1',
      label: 'Client Dupont SA',
      color: 'red',
      shape: 'circle',
    });
    expect(await screen.findByRole('heading', { name: 'Client Dupont SA' })).toBeTruthy();
  });

  it('Échap annule le nouveau nom ; un refus s’affiche sous le titre', async () => {
    api.saveTag.mockResolvedValue(ko(409, 'duplicate_label'));
    await setup();
    await screen.findByRole('heading', { name: 'Client Dupont' });
    await userEvent.click(screen.getByRole('button', { name: 'Renommer' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nom' }), ' bis{Escape}');
    expect(api.saveTag).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Renommer' }));
    const input = screen.getByRole('textbox', { name: 'Nom' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Interne{Enter}');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Vous avez déjà un tag portant ce nom.',
    );
    expect(screen.getByRole('heading', { name: 'Client Dupont' })).toBeTruthy();
  });

  it('couleur et forme en un clic, enregistrées aussitôt', async () => {
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG, color: 'blue' } }));
    await setup();
    await screen.findByRole('heading', { name: 'Client Dupont' });
    await userEvent.click(screen.getByRole('button', { name: 'Couleur et forme' }));
    const dialog = screen.getByRole('dialog', { name: 'Couleur et forme' });
    expect(within(dialog).getByRole('radio', { name: 'Rouge' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Bleu' }));
    expect(api.saveTag).toHaveBeenCalledWith({
      id: 't-1',
      label: 'Client Dupont',
      color: 'blue',
      shape: 'circle',
    });
    // La fenêtre se referme sur le choix.
    expect(screen.queryByRole('dialog', { name: 'Couleur et forme' })).toBeNull();
  });

  it('un logo déposé est préparé, envoyé, et montré', async () => {
    logoUtil.prepare.mockResolvedValue(PNG);
    api.saveTagLogoRequest.mockResolvedValue(
      ok({ tag: { id: 't-1', logoAt: '2026-11-18T10:00:00Z' } }),
    );
    await setup();
    await screen.findByRole('heading', { name: 'Client Dupont' });
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Déposer un logo'), file);
    expect(logoUtil.prepare).toHaveBeenCalledWith(file);
    expect(api.saveTagLogoRequest).toHaveBeenCalledWith('t-1', PNG);
    const img = await screen.findByAltText('Logo du tag « Client Dupont »');
    expect(img.getAttribute('src')).toBe(PNG);
    expect(screen.getByRole('button', { name: 'Remplacer…' })).toBeTruthy();
  });

  it('une image refusée dit pourquoi, rien n’est envoyé', async () => {
    logoUtil.prepare.mockRejectedValue(Object.assign(new Error('x'), { code: 'logo_invalid' }));
    await setup();
    await screen.findByRole('heading', { name: 'Client Dupont' });
    await userEvent.upload(
      screen.getByLabelText('Déposer un logo'),
      new File(['x'], 'logo.png', { type: 'image/png' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Ce fichier n’est pas une image',
    );
    expect(api.saveTagLogoRequest).not.toHaveBeenCalled();
  });

  it('un tag à logo le montre dans la liste et la fiche ; « Retirer » le retire', async () => {
    api.fetchTags.mockResolvedValue(
      ok({
        tags: [{ ...TAG, logoAt: '2026-11-18T10:00:00Z' }, TAG2],
        colors: COLORS,
        shapes: SHAPES,
        max: 20,
      }),
    );
    api.fetchTagLogo.mockResolvedValue(ok({ id: 't-1', dataUrl: PNG }));
    api.deleteTagLogoRequest.mockResolvedValue(ok({ tag: { id: 't-1', logoAt: null } }));
    await setup();
    await screen.findByRole('heading', { name: 'Client Dupont' });
    const nav = screen.getByRole('navigation', { name: 'Mes tags' });
    await waitFor(() =>
      expect(
        within(nav)
          .getByRole('button', { name: /^Client Dupont/ })
          .querySelector('img'),
      ).not.toBeNull(),
    );
    expect(api.fetchTagLogo).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(api.deleteTagLogoRequest).toHaveBeenCalledWith('t-1');
    await waitFor(() => expect(screen.getByLabelText('Déposer un logo')).toBeTruthy());
    expect(
      within(nav)
        .getByRole('button', { name: /^Client Dupont/ })
        .querySelector('img'),
    ).toBeNull();
  });
});

describe('TagsPanel — modification', () => {
  beforeEach(() => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG], colors: COLORS, max: 20 }));
  });

  it('« Motifs et couleur libre… » ouvre le formulaire complet, pré-rempli, avec l’id existant', async () => {
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG, label: 'Dupont SA' } }));
    await setup();

    await openForm();
    const input = screen.getByRole('textbox');
    expect(input.value).toBe('Client Dupont');

    await userEvent.clear(input);
    await userEvent.type(input, 'Dupont SA');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(api.saveTag).toHaveBeenCalledWith({
      id: 't-1',
      label: 'Dupont SA',
      color: 'red',
      shape: 'circle',
    });
    expect(await fiche('Dupont SA')).toBeTruthy();
  });

  it('pré-remplit la forme et la couleur libre d’un tag personnalisé', async () => {
    api.fetchTags.mockResolvedValue(
      ok({
        tags: [{ ...TAG, color: 'hue-120-40', shape: 'heart' }],
        colors: COLORS,
        shapes: SHAPES,
        max: 20,
      }),
    );
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG, color: 'hue-120-40', shape: 'heart' } }));
    await setup();

    await openForm();
    expect(screen.getByRole('radio', { name: 'Cœur' }).getAttribute('aria-checked')).toBe('true');
    // Le repli s'ouvre seul : la couleur choisie est une couleur libre.
    expect(screen.getByRole('radio', { name: 'Couleur libre' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('slider', { name: 'Angle de la teinte' }).value).toBe('120');
    expect(screen.getByRole('slider', { name: 'Clarté' }).value).toBe('40');

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.saveTag).toHaveBeenCalledWith({
      id: 't-1',
      label: 'Client Dupont',
      color: 'hue-120-40',
      shape: 'heart',
    });
  });

  it('un tag à la clarté par défaut (slug sans clarté) s’ouvre avec le curseur au défaut, et reste tel quel sans retouche', async () => {
    api.fetchTags.mockResolvedValue(
      ok({ tags: [{ ...TAG, color: 'hue-120' }], colors: COLORS, shapes: SHAPES, max: 20 }),
    );
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG, color: 'hue-120' } }));
    await setup();
    await openForm();
    expect(screen.getByRole('slider', { name: 'Clarté' }).value).toBe(
      String(TAG_HUE_LIGHTNESS.default),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.saveTag).toHaveBeenCalledWith({
      id: 't-1',
      label: 'Client Dupont',
      color: 'hue-120',
      shape: 'circle',
    });
  });

  it('un tag d’avant les formes s’ouvre en rond', async () => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG], colors: COLORS, shapes: SHAPES, max: 20 }));
    await setup();
    await openForm();
    expect(screen.getByRole('radio', { name: 'Rond' }).getAttribute('aria-checked')).toBe('true');
  });

  it('« Annuler » referme sans rien envoyer, et rend la fiche', async () => {
    await setup();
    await openForm();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(api.saveTag).not.toHaveBeenCalled();
    // Le champ du NOM a disparu ; celui du contexte est de la fiche revenue.
    expect(screen.queryByRole('textbox', { name: 'Nom' })).toBeNull();
    expect(await fiche('Client Dupont')).toBeTruthy();
  });
});

describe('TagsPanel — suppression', () => {
  beforeEach(() => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG], colors: COLORS, max: 20 }));
  });

  it('demande confirmation avant de supprimer', async () => {
    api.deleteTag.mockResolvedValue(ok({ ok: true, untagged: 0 }));
    await setup();

    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le tag' }));
    expect(api.deleteTag).not.toHaveBeenCalled();
    expect(screen.getByText('Supprimer ce tag ?')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(api.deleteTag).toHaveBeenCalledWith('t-1');
  });

  it('après suppression, la fiche montre le tag suivant', async () => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG, TAG2], colors: COLORS, max: 20 }));
    api.deleteTag.mockResolvedValue(ok({ ok: true, untagged: 0 }));
    await setup();
    await fiche('Client Dupont');

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer le tag' }));
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await fiche('Interne')).toBeTruthy();
  });

  it('annonce combien de conversations perdent leur rangement, et qu’aucune n’est supprimée', async () => {
    historyItems.set([
      { meetingId: 'm-1', tagId: 't-1' },
      { meetingId: 'm-2', tagId: 't-1' },
      { meetingId: 'm-3' },
    ]);
    await setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le tag' }));

    const body = document.querySelector('.tgp-modal-body');
    expect(body.textContent).toContain('2 conversation');
    expect(body.textContent).toContain('Client Dupont');
    expect(body.textContent).toContain('Aucune conversation n’est supprimée');
  });

  it('sans conversation taguée, le message ne parle pas de compte', async () => {
    await setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le tag' }));
    expect(screen.getByText(/ne seront pas supprimées/)).toBeTruthy();
  });

  it('« Annuler » referme la confirmation sans supprimer', async () => {
    await setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le tag' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(api.deleteTag).not.toHaveBeenCalled();
    expect(screen.queryByText('Supprimer ce tag ?')).toBeNull();
  });
});

describe('TagsPanel — rangement par tag', () => {
  beforeEach(() => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG, TAG2], colors: COLORS, max: 20 }));
  });

  /** Le chemin affiché dans le choix `title` de la fiche. */
  const pathIn = (title) =>
    choice(title).closest('.tgfi-option').querySelector('.tgfi-path strong')?.textContent;

  it('la fiche coche la règle du tag : son dossier, ou celui des autres comptes rendus', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            folder: 'Comptes-rendus',
            tagFolders: [
              { tagId: 't-1', folder: 'Clients/Dupont', driveId: 'd1', driveName: 'OneDrive' },
            ],
          },
        }),
      ),
    );
    await setup();
    await fiche('Client Dupont');

    await waitFor(() =>
      expect(choice('Dans un dossier que je choisis').getAttribute('aria-checked')).toBe('true'),
    );
    expect(choice('Avec les autres comptes rendus').getAttribute('aria-checked')).toBe('false');
    expect(pathIn('Dans un dossier que je choisis')).toBe('Clients/Dupont');
    expect(screen.getByText('OneDrive')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Changer de dossier' })).toBeTruthy();

    // L'autre tag suit la règle commune : directement dans le dossier principal.
    const nav = screen.getByRole('navigation', { name: 'Mes tags' });
    await userEvent.click(within(nav).getByRole('button', { name: /^Interne/ }));
    await fiche('Interne');
    expect(choice('Avec les autres comptes rendus').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Directement dans votre dossier principal :')).toBeTruthy();
    expect(pathIn('Avec les autres comptes rendus')).toBe('Comptes-rendus');
    expect(screen.getByRole('button', { name: 'Choisir un dossier…' })).toBeTruthy();
  });

  it('pose le logo de la bibliothèque visée : SharePoint pour un site, OneDrive sinon', async () => {
    // Ce que l'utilisateur manipule doit se voir sans lire : un site
    // SharePoint et le OneDrive personnel ne portent pas le même logo.
    connectApi.fetchConnectStatus.mockResolvedValue(ok(MICROSOFT));
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            folder: 'Comptes-rendus',
            driveId: 'd-me',
            driveName: 'OneDrive',
            tagFolders: [
              {
                tagId: 't-1',
                folder: 'Clients/Dupont',
                driveId: 'd-site',
                driveName: 'Dupont / Documents',
              },
            ],
          },
        }),
      ),
    );
    await setup();
    await fiche('Client Dupont');

    await waitFor(() => {
      // La ligne du tag rangé sur le site, et son dossier dans la fiche.
      expect(document.querySelectorAll('[data-kind="sharepoint"]')).toHaveLength(2);
      // Le dossier principal (choix « avec les autres »).
      expect(document.querySelectorAll('[data-kind="onedrive"]')).toHaveLength(1);
    });
    expect(document.querySelector('[data-kind="google-drive"]')).toBeNull();
  });

  it('Google : le logo Google Drive sur les deux choix', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            tagFolders: [
              { tagId: 't-1', folder: 'Clients/Dupont', driveId: 'd1', driveName: 'Mon Drive' },
            ],
          },
        }),
      ),
    );
    await setup();
    await fiche('Client Dupont');
    const fichEl = document.querySelector('.tgfi');
    await waitFor(() =>
      expect(fichEl.querySelectorAll('[data-kind="google-drive"]')).toHaveLength(2),
    );
  });

  it('ne pose aucun logo tant que le fournisseur n’est pas connu', async () => {
    connectApi.fetchConnectStatus.mockResolvedValue(ko(500, 'network'));
    await setup();
    await fiche('Client Dupont');
    expect(document.querySelector('[data-kind]')).toBeNull();
  });

  it('sous-dossiers actifs : « avec les autres » annonce le dossier au nom du tag', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(settingsPayload({ storage: { folder: 'Comptes-rendus', tagSubfolders: true } })),
    );
    await setup();
    await fiche('Client Dupont');

    expect(
      await screen.findByText('Dans un dossier à son nom, créé au premier dépôt :'),
    ).toBeTruthy();
    expect(pathIn('Avec les autres comptes rendus')).toBe('Comptes-rendus › Client Dupont');
  });

  it('sans dossier personnel, c’est celui de l’administrateur qui s’applique', async () => {
    await setup();
    await fiche('Client Dupont');
    await waitFor(() =>
      expect(pathIn('Avec les autres comptes rendus')).toBe(
        'Dossier défini par votre administrateur',
      ),
    );
  });

  it('choisir « un dossier que je choisis » ouvre la fenêtre, puis écrit un patch PARTIEL qui préserve les autres tags', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            tagFolders: [{ tagId: 't-2', folder: 'Interne/CR', driveId: 'd1', driveName: 'Drive' }],
          },
        }),
      ),
    );
    actionsApi.fetchStorageDrives.mockResolvedValue(
      ok({ drives: [{ id: 'd1', name: 'OneDrive' }], multiDrive: false }),
    );
    actionsApi.fetchStorageFolders.mockResolvedValue(
      ok({ ok: true, folders: [{ name: 'Clients', cursor: 'c-clients' }] }),
    );
    actionsApi.saveActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            tagFolders: [
              { tagId: 't-2', folder: 'Interne/CR', driveId: 'd1', driveName: 'Drive' },
              { tagId: 't-1', folder: 'Clients', driveId: 'd1', driveName: 'OneDrive' },
            ],
          },
        }),
      ),
    );
    await setup();
    await fiche('Client Dupont');

    await waitFor(() => expect(choice('Dans un dossier que je choisis').disabled).toBe(false));
    await userEvent.click(choice('Dans un dossier que je choisis'));
    // Descendre dans « Clients » puis valider la sélection.
    await userEvent.click(await screen.findByText('Clients'));
    await userEvent.click(screen.getByRole('button', { name: 'Choisir ce dossier' }));

    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      storage: {
        tagFolders: [
          { tagId: 't-2', folder: 'Interne/CR', driveId: 'd1', driveName: 'Drive' },
          { tagId: 't-1', folder: 'Clients', driveId: 'd1', driveName: 'OneDrive' },
        ],
      },
    });
    // La réponse enregistrée s'affiche sans rechargement, choix coché.
    await waitFor(() =>
      expect(choice('Dans un dossier que je choisis').getAttribute('aria-checked')).toBe('true'),
    );
    expect(pathIn('Dans un dossier que je choisis')).toBe('Clients');
  });

  it('fermer la fenêtre sans choisir ne coche rien', async () => {
    actionsApi.fetchStorageDrives.mockResolvedValue(
      ok({ drives: [{ id: 'd1', name: 'Mon Drive' }], multiDrive: false }),
    );
    actionsApi.fetchStorageFolders.mockResolvedValue(ok({ ok: true, folders: [] }));
    await setup();
    await fiche('Client Dupont');

    await waitFor(() => expect(choice('Dans un dossier que je choisis').disabled).toBe(false));
    await userEvent.click(choice('Dans un dossier que je choisis'));
    await userEvent.click(await screen.findByRole('button', { name: 'Fermer' }));

    expect(actionsApi.saveActionSettings).not.toHaveBeenCalled();
    expect(choice('Avec les autres comptes rendus').getAttribute('aria-checked')).toBe('true');
    expect(choice('Dans un dossier que je choisis').getAttribute('aria-checked')).toBe('false');
  });

  it('affiche la RACINE d’un Drive partagé comme un dossier choisi, pas comme un vide', async () => {
    // Choisir « ce Drive partagé, à sa racine » rend `folder: ''` avec un
    // `driveId`. Affiché comme « pas de destination », il laissait croire à un
    // dépôt dans Mon Drive alors qu'une bibliothèque était bien choisie.
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            tagSubfolders: true,
            tagFolders: [
              { tagId: 't-1', folder: '', driveId: 'd-equipe', driveName: 'Drive Équipe' },
            ],
          },
        }),
      ),
    );
    await setup();
    await fiche('Client Dupont');

    await waitFor(() =>
      expect(choice('Dans un dossier que je choisis').getAttribute('aria-checked')).toBe('true'),
    );
    expect(pathIn('Dans un dossier que je choisis')).toBe('Racine de la bibliothèque');
    expect(screen.getByText('Drive Équipe')).toBeTruthy();
  });

  it('« Avec les autres comptes rendus » retire la destination du seul tag visé', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            tagFolders: [
              { tagId: 't-1', folder: 'Clients/Dupont', driveId: 'd1', driveName: 'Drive' },
              { tagId: 't-2', folder: 'Interne/CR', driveId: 'd1', driveName: 'Drive' },
            ],
          },
        }),
      ),
    );
    actionsApi.saveActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            tagFolders: [{ tagId: 't-2', folder: 'Interne/CR', driveId: 'd1', driveName: 'Drive' }],
          },
        }),
      ),
    );
    await setup();
    await fiche('Client Dupont');

    await waitFor(() => expect(choice('Avec les autres comptes rendus').disabled).toBe(false));
    await userEvent.click(choice('Avec les autres comptes rendus'));

    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      storage: {
        tagFolders: [{ tagId: 't-2', folder: 'Interne/CR', driveId: 'd1', driveName: 'Drive' }],
      },
    });
    await waitFor(() =>
      expect(choice('Avec les autres comptes rendus').getAttribute('aria-checked')).toBe('true'),
    );
  });

  it('un refus du serveur s’affiche dans la fiche, rien n’est coché d’avance', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: {
            tagFolders: [
              { tagId: 't-1', folder: 'Clients/Dupont', driveId: 'd1', driveName: 'Drive' },
            ],
          },
        }),
      ),
    );
    actionsApi.saveActionSettings.mockResolvedValue(ko(500, 'network'));
    await setup();
    await fiche('Client Dupont');
    await waitFor(() => expect(choice('Avec les autres comptes rendus').disabled).toBe(false));
    await userEvent.click(choice('Avec les autres comptes rendus'));

    expect(await screen.findByText(/Impossible d’enregistrer la destination/)).toBeTruthy();
    expect(choice('Dans un dossier que je choisis').getAttribute('aria-checked')).toBe('true');
  });

  it('dépôt fermé par l’organisation : les choix restent visibles, expliqués, inactifs', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(settingsPayload({ ceiling: { storage: false } })),
    );
    await setup();
    await fiche('Client Dupont');

    expect(await screen.findByText(/dépôt de fichiers est désactivé/)).toBeTruthy();
    expect(choice('Avec les autres comptes rendus').disabled).toBe(true);
    expect(choice('Dans un dossier que je choisis').disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Choisir un dossier…' }).disabled).toBe(true);
  });

  it('compte non relié : la fiche explique le geste à faire', async () => {
    connectApi.fetchConnectStatus.mockResolvedValue(
      ok({ provider: { id: 'google', connected: false, driveReady: false, available: true } }),
    );
    await setup();
    await fiche('Client Dupont');

    expect(await screen.findByText(/Reliez votre compte Google ou Microsoft/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choisir un dossier…' }).disabled).toBe(true);
  });
});

describe('TagsPanel — réglages communs', () => {
  beforeEach(() => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG, TAG2], colors: COLORS, max: 20 }));
  });

  async function openCommon() {
    await setup();
    await fiche('Client Dupont');
    await userEvent.click(screen.getByRole('button', { name: /^Réglages communs/ }));
    await screen.findByRole('heading', { name: 'Réglages communs' });
  }

  it('nomme le dossier principal, avec le logo de sa bibliothèque', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(settingsPayload({ storage: { folder: 'Comptes-rendus', driveName: 'Mon Drive' } })),
    );
    await openCommon();

    expect(await screen.findByText('Comptes-rendus')).toBeTruthy();
    expect(screen.getByText('Mon Drive')).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('.tgc [data-kind="google-drive"]')).not.toBeNull(),
    );

    // Sans dossier personnel : c'est celui de l'administrateur qui s'applique.
    applyActionSettings(settingsPayload());
    expect(await screen.findByText('Dossier défini par votre administrateur')).toBeTruthy();
  });

  it('l’interrupteur « un sous-dossier par tag » enregistre aussitôt, et revient en arrière si le serveur refuse', async () => {
    actionsApi.saveActionSettings
      .mockResolvedValueOnce(ok(settingsPayload({ storage: { tagSubfolders: true } })))
      .mockResolvedValueOnce(ko(500, 'network'));
    await openCommon();

    const toggle = screen.getByRole('checkbox', { name: 'Un sous-dossier par tag' });
    await waitFor(() => expect(toggle.disabled).toBe(false));
    await userEvent.click(toggle);
    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      storage: { tagSubfolders: true },
    });
    expect(toggle.checked).toBe(true);

    // Second geste : refus serveur → l'interrupteur revient, l'erreur s'affiche.
    await userEvent.click(toggle);
    expect(await screen.findByText(/Impossible d’enregistrer la destination/)).toBeTruthy();
    expect(toggle.checked).toBe(true);
  });

  it('l’interrupteur suit la valeur enregistrée APRÈS le montage (modifiée depuis l’onglet Actions)', async () => {
    await openCommon();
    const toggle = screen.getByRole('checkbox', { name: 'Un sous-dossier par tag' });
    expect(toggle.checked).toBe(false);

    applyActionSettings(settingsPayload({ storage: { tagSubfolders: true } }));
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  it('renvoie vers « Entreposer » et « Envoi d’email » pour ce qui sert aussi aux conversations sans tag', async () => {
    await openCommon();
    await userEvent.click(screen.getByRole('button', { name: 'Modifier dans Entreposer' }));
    expect(get(panelNav)).toMatchObject({ active: 'actions', sub: 'storage' });
    await userEvent.click(screen.getByRole('button', { name: 'Modifier dans Envoi d’email' }));
    expect(get(panelNav)).toMatchObject({ active: 'actions', sub: 'mail' });
  });

  it('dit ce que « destinataires habituels » désigne', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(settingsPayload({ mail: { recipients: ['a@client.fr', 'b@client.fr'] } })),
    );
    await openCommon();
    expect(await screen.findByText('vous + 2 adresses')).toBeTruthy();
  });
});

describe('TagsPanel — destinataires par tag', () => {
  beforeEach(() => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG, TAG2], colors: COLORS, max: 20 }));
  });

  it('la fiche montre la liste du tag, ou ce que « destinataires habituels » veut dire', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          mail: {
            recipients: ['interne@client.fr', 'compta@client.fr'],
            tagRecipients: [{ tagId: 't-1', recipients: ['dg@dupont.fr'] }],
          },
        }),
      ),
    );
    await setup();
    await fiche('Client Dupont');

    expect(await screen.findByText('dg@dupont.fr')).toBeTruthy();
    expect(choice('À des personnes précises').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Aujourd’hui : vous + 2 adresses.')).toBeTruthy();
    expect(screen.getByText(/à la place de vos destinataires habituels/)).toBeTruthy();

    const nav = screen.getByRole('navigation', { name: 'Mes tags' });
    await userEvent.click(within(nav).getByRole('button', { name: /^Interne/ }));
    await fiche('Interne');
    expect(choice('Aux destinataires habituels').getAttribute('aria-checked')).toBe('true');
  });

  it('sans liste par défaut, les destinataires habituels sont « vous seul »', async () => {
    await setup();
    await fiche('Client Dupont');
    expect(await screen.findByText('Aujourd’hui : vous seul.')).toBeTruthy();
  });

  it('choisir « des personnes précises » ouvre la fenêtre ; valider écrit un patch PARTIEL, les autres tags préservés', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          mail: { tagRecipients: [{ tagId: 't-2', recipients: ['equipe@client.fr'] }] },
        }),
      ),
    );
    const saved = settingsPayload({
      mail: {
        tagRecipients: [
          { tagId: 't-2', recipients: ['equipe@client.fr'] },
          { tagId: 't-1', recipients: ['dg@dupont.fr'] },
        ],
      },
    });
    actionsApi.saveActionSettings.mockResolvedValue(ok(saved));
    await setup();
    await fiche('Client Dupont');

    await waitFor(() => expect(choice('À des personnes précises').disabled).toBe(false));
    await userEvent.click(choice('À des personnes précises'));
    const dialog = screen.getByRole('dialog', { name: 'Destinataires du tag' });
    expect(dialog.textContent).toContain('remplacent votre liste par défaut');
    await userEvent.type(screen.getByPlaceholderText('nom@exemple.fr'), 'dg@dupont.fr{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      mail: {
        tagRecipients: [
          { tagId: 't-2', recipients: ['equipe@client.fr'] },
          { tagId: 't-1', recipients: ['dg@dupont.fr'] },
        ],
      },
    });
    // Fenêtre fermée, fiche à jour.
    expect(screen.queryByRole('dialog', { name: 'Destinataires du tag' })).toBeNull();
    expect(await screen.findByText('dg@dupont.fr')).toBeTruthy();
    expect(choice('À des personnes précises').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Modifier la liste…' })).toBeTruthy();
  });

  it('un refus du serveur reste dans la fenêtre, adresse nommée', async () => {
    actionsApi.saveActionSettings.mockResolvedValue(
      ko(400, 'recipient_invalid', { rejected: ['dg@dupont.fr'], tagId: 't-1' }),
    );
    await setup();
    await fiche('Client Dupont');
    await waitFor(() => expect(choice('À des personnes précises').disabled).toBe(false));
    await userEvent.click(choice('À des personnes précises'));
    await userEvent.type(screen.getByPlaceholderText('nom@exemple.fr'), 'dg@dupont.fr{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const dialog = await screen.findByRole('dialog', { name: 'Destinataires du tag' });
    expect(dialog.textContent).toContain('Adresses refusées : dg@dupont.fr');
    // L'adresse est encore là, corrigeable.
    expect(dialog.textContent).toContain('dg@dupont.fr');
  });

  it('« Aux destinataires habituels » retire la liste du tag — le dossier n’est pas touché', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(
        settingsPayload({
          storage: { tagFolders: [{ tagId: 't-1', folder: 'Clients/Dupont' }] },
          mail: { tagRecipients: [{ tagId: 't-1', recipients: ['dg@dupont.fr'] }] },
        }),
      ),
    );
    actionsApi.saveActionSettings.mockResolvedValue(
      ok(
        settingsPayload({ storage: { tagFolders: [{ tagId: 't-1', folder: 'Clients/Dupont' }] } }),
      ),
    );
    await setup();
    await fiche('Client Dupont');
    await screen.findByText('dg@dupont.fr');

    await userEvent.click(choice('Aux destinataires habituels'));

    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({ mail: { tagRecipients: [] } });
    await waitFor(() =>
      expect(choice('Aux destinataires habituels').getAttribute('aria-checked')).toBe('true'),
    );
    expect(screen.queryByText('dg@dupont.fr')).toBeNull();
    expect(screen.getByText('Clients/Dupont')).toBeTruthy();
  });

  it('envoi fermé par l’organisation : les choix sont inactifs, et on dit pourquoi', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(
      ok(settingsPayload({ ceiling: { email: false } })),
    );
    await setup();
    await fiche('Client Dupont');
    expect(await screen.findByText(/L’envoi par mail est désactivé/)).toBeTruthy();
    expect(choice('Aux destinataires habituels').disabled).toBe(true);
    expect(choice('À des personnes précises').disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Choisir les personnes…' }).disabled).toBe(true);
  });
});
