/**
 * Sidebar — la liste affichée est FILTRÉE, et c'est tout l'enjeu.
 *
 * Ce composant a longtemps renvoyé à App un INDEX calculé sur sa liste filtrée,
 * qu'App réindexait ensuite sur la liste COMPLÈTE. Une recherche active
 * suffisait donc à ouvrir — et surtout à supprimer — une autre réunion que
 * celle cliquée. Les tests ci-dessous verrouillent le contrat actuel : la
 * Sidebar émet un meetingId, jamais une position.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

// Le sélecteur de tag du menu contextuel écrit vraiment : on coupe le transport.
const setMeetingTagMock = vi.fn(async () => ({ ok: true, status: 200, data: { ok: true } }));
vi.mock('../services/tagsApi.js', () => ({
  fetchTags: vi.fn(async () => ({ ok: true, status: 200, data: { tags: [] } })),
  saveTag: vi.fn(),
  deleteTag: vi.fn(),
  setMeetingTag: (...a) => setMeetingTagMock(...a),
}));

// Diagnostic de configuration : la Sidebar le relit à chaque changement de
// compte. Réponses scriptées par test, jamais de réseau.
const configCheckResponses = { account: [], organization: [] };
const fetchAccountChecks = vi.fn(async () => ({
  ok: true,
  status: 200,
  data: { issues: configCheckResponses.account },
}));
const fetchOrganizationChecks = vi.fn(async () => ({
  ok: true,
  status: 200,
  data: { issues: configCheckResponses.organization },
}));
vi.mock('../services/configChecksApi.js', () => ({
  fetchAccountChecks: (...a) => fetchAccountChecks(...a),
  fetchOrganizationChecks: (...a) => fetchOrganizationChecks(...a),
}));

// « Ce mois-ci » (menu de compte) relit /stats/me à chaque ouverture.
const fetchMyStats = vi.fn(async () => ({
  ok: true,
  status: 200,
  data: { totals: { meetings: 6, durationSeconds: 10980, summaries: 8 }, credit: null },
}));
vi.mock('../services/statsApi.js', () => ({
  fetchMyStats: (...a) => fetchMyStats(...a),
  fetchTeamCredits: vi.fn(),
  fetchAccountStats: vi.fn(),
}));

const Sidebar = (await import('./Sidebar.svelte')).default;
const { historyItems, isLoadingHistory, selectedMeetingId } = await import('../stores/history.js');
const { isRecordingStore, isPausedStore, liveMeetingIdStore } =
  await import('../stores/recording.js');
const { tags, tagColors } = await import('../stores/tags.js');
const { auth } = await import('../stores/auth.js');
const { applyQuota, resetQuota } = await import('../stores/quota.js');
const { liveElapsedStore } = await import('../stores/recording.js');
const { resetConfigChecks } = await import('../stores/configChecks.js');
const { summaryGenerations, beginSummaryGeneration, endSummaryGeneration } =
  await import('../stores/summaryGeneration.js');

/**
 * « Client Dupont » est en 2e position de la liste complète et en 1re de la
 * liste filtrée par « client » : tout l'écart que l'ancien code confondait.
 */
const MEETINGS = [
  { meetingId: 'm-1', title: 'Point produit', weekLabel: 'Cette semaine', date: '01/08' },
  { meetingId: 'm-2', title: 'Client Dupont', weekLabel: 'Cette semaine', date: '02/08' },
  { meetingId: 'm-3', title: 'Rétro sprint', weekLabel: 'Cette semaine', date: '03/08' },
];

const TAG_CLIENT = { id: 'tag-client', label: 'Client X', color: 'red' };
const TAG_INTERNE = { id: 'tag-interne', label: 'Interne', color: 'blue' };

function setup(props = {}) {
  const onSelectHistory = vi.fn();
  const onDeleteHistory = vi.fn();
  const onMenuAction = vi.fn();
  render(Sidebar, { props: { onSelectHistory, onDeleteHistory, onMenuAction, ...props } });
  return { onSelectHistory, onDeleteHistory, onMenuAction };
}

/** Ouvre le menu ⋯ d'une ligne (clic droit, comme dans l'app). */
async function openContextMenu(title) {
  const row = screen.getByText(title).closest('.sb-item');
  await userEvent.pointer({ keys: '[MouseRight]', target: row });
}

/**
 * Un même libellé de tag apparaît dans le menu de filtre ET dans le sélecteur
 * du menu contextuel : les requêtes de tag sont donc portées par zone, sinon
 * getByText en trouve deux.
 */
const byLabelIn = (selector, label) =>
  [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === label);

const tagMenuItem = (label) => byLabelIn('.ctx-menu .tp-item', label);

/**
 * Le filtre par tag est un MENU DÉROULANT (la rangée de puces débordait de la
 * colonne) : filtrer = ouvrir le menu puis choisir une entrée. Les entrées
 * portent un compteur à côté du libellé, d'où la recherche sur le seul texte
 * du libellé (TagChip ou .sb-tagmenu-label).
 */
const tagFilterOption = (label) =>
  [...document.querySelectorAll('.sb-tagmenu .sb-tagmenu-item')].find(
    (el) => (el.querySelector('.tag-label, .sb-tagmenu-label')?.textContent ?? '').trim() === label,
  );

async function pickTagFilter(label) {
  await userEvent.click(document.querySelector('.sb-tagbar .sb-tagmenu-btn'));
  await userEvent.click(tagFilterOption(label));
}

beforeEach(() => {
  localStorage.clear();
  setMeetingTagMock.mockClear();
  historyItems.set(MEETINGS);
  isLoadingHistory.set(false);
  selectedMeetingId.set(null);
  tags.set([]);
  tagColors.set(['slate', 'red', 'blue']);
  isRecordingStore.set(false);
  isPausedStore.set(false);
  liveMeetingIdStore.set(null);
  summaryGenerations.set([]);
  resetQuota();
  liveElapsedStore.set(0);
  resetConfigChecks();
  configCheckResponses.account = [];
  configCheckResponses.organization = [];
  fetchAccountChecks.mockClear();
  fetchOrganizationChecks.mockClear();
  auth.set({ user: { name: 'Dev Local', email: 'dev@myalfred.ai' }, capabilities: {} });
});

/**
 * La capsule de compte, en bas de la colonne : l'avatar cerclé du crédit, le
 * nom, ce qu'il reste du mois. Elle a remplacé la carte « Temps de réunion » :
 * ce que la carte disait (le reste, le direct, l'épuisement et son mois, le
 * groupe en infobulle) doit rester dit.
 */
describe('Sidebar — capsule de compte et crédit de temps', () => {
  const LIMITED = {
    unlimited: false,
    limitMinutes: 60,
    usedSeconds: 15 * 60,
    usedMinutes: 15,
    remainingMinutes: 45,
    exhausted: false,
    period: { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' },
    group: { id: 'default', name: 'Défaut', color: 'slate' },
  };
  const capsule = () => document.querySelector('.sb-user-details');
  const line = () => document.querySelector('.sb-user-line');

  it('sans quota : le nom et l’adresse, pas d’anneau', () => {
    setup();
    expect(capsule().querySelector('.sb-user-name').textContent).toBe('Dev Local');
    expect(line().textContent).toBe('dev@myalfred.ai');
    expect(capsule().querySelector('.cav-ring')).toBeNull();
    // La carte d'avant n'existe plus.
    expect(document.querySelector('.qm')).toBeNull();
  });

  it('avec un quota : l’anneau, et le reste du mois sous le nom', async () => {
    setup();
    applyQuota(LIMITED);
    await tick();
    expect(capsule().querySelector('.cav-ring')).toBeTruthy();
    expect(line().textContent).toBe('45 min restantes');
    // L'infobulle garde ce que disait la carte : le groupe et le renouvellement.
    expect(capsule().getAttribute('title')).toContain('45 min restantes.');
    expect(capsule().getAttribute('title')).toContain('Défaut');
    expect(capsule().getAttribute('title')).toContain('1er octobre');
  });

  it('déduit la réunion en cours, et dit « Quota atteint », le mois en infobulle', async () => {
    applyQuota(LIMITED);
    setup();
    liveElapsedStore.set(20 * 60);
    await tick();
    expect(line().textContent).toBe('25 min restantes');

    liveElapsedStore.set(50 * 60);
    await tick();
    expect(line().textContent).toBe('Quota atteint');
    expect(line().classList.contains('sb-user-line-out')).toBe(true);
    expect(capsule().getAttribute('title')).toContain('Renouvelé le 1er octobre.');
  });

  it('rail replié : l’avatar cerclé reste', async () => {
    applyQuota(LIMITED);
    setup({ isOpen: false });
    await tick();
    expect(capsule().querySelector('.cav-ring')).toBeTruthy();
  });
});

describe('Sidebar — identité des réunions', () => {
  it('émet le meetingId de la réunion cliquée (liste non filtrée)', async () => {
    const { onSelectHistory } = setup();
    await userEvent.click(screen.getByText('Client Dupont'));
    expect(onSelectHistory).toHaveBeenCalledWith('m-2');
  });

  it('émet le bon meetingId AVEC une recherche active — la régression historique', async () => {
    const { onSelectHistory } = setup();
    await userEvent.type(screen.getByRole('textbox', { name: /réunion|meeting/i }), 'client');

    // La liste filtrée ne contient plus que « Client Dupont », en position 0.
    expect(screen.queryByText('Point produit')).toBeNull();
    await userEvent.click(screen.getByText('Client Dupont'));

    // Un index 0 aurait désigné « Point produit » côté App.
    expect(onSelectHistory).toHaveBeenCalledWith('m-2');
    expect(onSelectHistory).not.toHaveBeenCalledWith(0);
  });

  it('la corbeille supprime la réunion cliquée, filtre actif compris', async () => {
    const { onDeleteHistory } = setup();
    await userEvent.type(screen.getByRole('textbox', { name: /réunion|meeting/i }), 'rétro');

    const ligne = screen.getByText('Rétro sprint').closest('.sb-item');
    await userEvent.click(ligne.querySelector('.sb-item-delete'));

    expect(onDeleteHistory).toHaveBeenCalledWith('m-3');
  });

  it('surligne la réunion sélectionnée par son id, pas par sa position', async () => {
    selectedMeetingId.set('m-3');
    setup();
    expect(screen.getByText('Rétro sprint').closest('.sb-item').className).toContain(
      'sb-item-selected',
    );
    expect(screen.getByText('Point produit').closest('.sb-item').className).not.toContain(
      'sb-item-selected',
    );
  });

  it('le surlignage suit la réunion quand le filtre change sa position', async () => {
    selectedMeetingId.set('m-3');
    setup();
    await userEvent.type(screen.getByRole('textbox', { name: /réunion|meeting/i }), 'r');

    // « Rétro sprint » a changé de rang dans la liste affichée : elle reste
    // pourtant la ligne surlignée.
    const surlignees = document.querySelectorAll('.sb-item-selected');
    expect(surlignees).toHaveLength(1);
    expect(surlignees[0].textContent).toContain('Rétro sprint');
  });
});

describe('Sidebar — pastilles de tag', () => {
  it('affiche une pastille sur les conversations taguées, et seulement elles', () => {
    tags.set([TAG_CLIENT]);
    historyItems.set([
      { ...MEETINGS[0], tagId: 'tag-client' },
      MEETINGS[1],
      { ...MEETINGS[2], tagId: 'tag-client' },
    ]);
    setup();
    expect(
      screen.getByText('Point produit').closest('.sb-item').querySelector('.tag-dot'),
    ).toBeTruthy();
    expect(screen.getByText('Client Dupont').closest('.sb-item').querySelector('.tag-dot')).toBe(
      null,
    );
    expect(document.querySelectorAll('.sb-item .tag-dot')).toHaveLength(2);
  });

  it('un tagId qui n’est plus au catalogue n’affiche pas de pastille orpheline', () => {
    tags.set([TAG_CLIENT]);
    historyItems.set([{ ...MEETINGS[0], tagId: 'supprime-ailleurs' }]);
    setup();
    expect(document.querySelectorAll('.sb-item .tag-dot')).toHaveLength(0);
  });
});

describe('Sidebar — filtre par tag', () => {
  const taggedHistory = () => [
    { ...MEETINGS[0], tagId: 'tag-client' },
    { ...MEETINGS[1], tagId: 'tag-interne' },
    MEETINGS[2], // sans tag
  ];

  it('la barre de filtre n’apparaît pas tant qu’aucun tag n’existe', () => {
    setup();
    expect(document.querySelector('.sb-tagbar')).toBe(null);
  });

  it('filtrer sur un tag ne laisse que ses conversations', async () => {
    tags.set([TAG_CLIENT, TAG_INTERNE]);
    historyItems.set(taggedHistory());
    setup();

    await pickTagFilter('Client X');
    expect(screen.getByText('Point produit')).toBeTruthy();
    expect(screen.queryByText('Client Dupont')).toBeNull();
    expect(screen.queryByText('Rétro sprint')).toBeNull();
  });

  it('« Sans tag » ne laisse que les conversations non rangées', async () => {
    tags.set([TAG_CLIENT, TAG_INTERNE]);
    historyItems.set(taggedHistory());
    setup();

    await pickTagFilter('Sans tag');
    expect(screen.getByText('Rétro sprint')).toBeTruthy();
    expect(screen.queryByText('Point produit')).toBeNull();
  });

  it('rechoisir le même tag revient à « Tous »', async () => {
    tags.set([TAG_CLIENT, TAG_INTERNE]);
    historyItems.set(taggedHistory());
    setup();

    await pickTagFilter('Client X');
    expect(screen.queryByText('Rétro sprint')).toBeNull();
    await pickTagFilter('Client X');
    expect(screen.getByText('Rétro sprint')).toBeTruthy();
  });

  it('chaque entrée du menu annonce combien de réunions elle laisserait', async () => {
    tags.set([TAG_CLIENT, TAG_INTERNE]);
    historyItems.set(taggedHistory());
    setup();

    await userEvent.click(document.querySelector('.sb-tagbar .sb-tagmenu-btn'));
    expect(tagFilterOption('Tous').querySelector('.sb-tagmenu-count').textContent).toBe('3');
    expect(tagFilterOption('Client X').querySelector('.sb-tagmenu-count').textContent).toBe('1');
    expect(tagFilterOption('Sans tag').querySelector('.sb-tagmenu-count').textContent).toBe('1');
  });

  it('le bouton du menu porte le tag actif — un filtre ne peut pas être invisible', async () => {
    tags.set([TAG_CLIENT, TAG_INTERNE]);
    historyItems.set(taggedHistory());
    setup();

    await pickTagFilter('Client X');
    expect(document.querySelector('.sb-tagbar .sb-tagmenu-btn').textContent).toContain('Client X');
  });

  it('se combine avec la recherche texte', async () => {
    tags.set([TAG_CLIENT]);
    historyItems.set([
      { ...MEETINGS[0], tagId: 'tag-client' },
      { ...MEETINGS[2], tagId: 'tag-client' },
    ]);
    setup();

    await pickTagFilter('Client X');
    await userEvent.type(screen.getByRole('textbox', { name: /réunion|meeting/i }), 'rétro');
    expect(screen.getByText('Rétro sprint')).toBeTruthy();
    expect(screen.queryByText('Point produit')).toBeNull();
  });

  it('le filtre est persisté', async () => {
    tags.set([TAG_CLIENT]);
    historyItems.set(taggedHistory());
    setup();
    await pickTagFilter('Client X');
    expect(localStorage.getItem('mybrief_tag_filter')).toBe('tag-client');
  });

  it('un filtre persisté sur un tag disparu se comporte comme « Tous »', () => {
    // Sinon l'historique resterait vide sans que rien à l'écran l'explique.
    localStorage.setItem('mybrief_tag_filter', 'tag-supprime');
    tags.set([TAG_CLIENT]);
    historyItems.set(taggedHistory());
    setup();
    expect(screen.getByText('Point produit')).toBeTruthy();
    expect(screen.getByText('Rétro sprint')).toBeTruthy();
  });
});

describe('Sidebar — pose du tag depuis le menu contextuel', () => {
  it('range la conversation cliquée, même avec une recherche active', async () => {
    tags.set([TAG_CLIENT, TAG_INTERNE]);
    setup();
    await userEvent.type(screen.getByRole('textbox', { name: /réunion|meeting/i }), 'client');
    await openContextMenu('Client Dupont');

    await userEvent.click(screen.getByRole('button', { name: /^Tag$/ }));
    await userEvent.click(tagMenuItem('Interne'));

    expect(setMeetingTagMock).toHaveBeenCalledWith('m-2', 'tag-interne');
  });

  it('« Aucun tag » sort la conversation de son rangement', async () => {
    tags.set([TAG_CLIENT]);
    historyItems.set([{ ...MEETINGS[0], tagId: 'tag-client' }]);
    setup();
    await openContextMenu('Point produit');
    await userEvent.click(screen.getByRole('button', { name: /^Tag$/ }));
    await userEvent.click(tagMenuItem('Aucun tag'));

    expect(setMeetingTagMock).toHaveBeenCalledWith('m-1', null);
  });

  it('« Gérer les tags… » ouvre le panneau sans rien écrire', async () => {
    tags.set([TAG_CLIENT]);
    const { onMenuAction } = setup();
    await openContextMenu('Point produit');
    await userEvent.click(screen.getByRole('button', { name: /^Tag$/ }));
    await userEvent.click(tagMenuItem('Gérer les tags…'));

    expect(onMenuAction).toHaveBeenCalledWith('tags');
    expect(setMeetingTagMock).not.toHaveBeenCalled();
  });
});

/**
 * Le filtre par tag est PERSISTÉ : rouvert des jours plus tard, il tronque la
 * liste sans geste récent qui l'explique. Une réunion neuve naissant sans tag,
 * elle n'apparaît jamais.
 *
 * Le localStorage de la WebView étant distinct de celui du navigateur, le
 * filtre peut être actif dans l'app et absent du PWA — d'où un symptôme qui ne
 * se reproduit que d'un côté.
 *
 * Le bouton du menu porte la sélection, et ce bandeau dit les CONSÉQUENCES
 * (combien de masquées) avec la sortie en un clic.
 */
describe('Sidebar — un filtre actif ne peut pas rester invisible', () => {
  const banner = () => document.querySelector('.sb-filterbar');

  it('annonce le nombre de réunions masquées quand un filtre est actif', async () => {
    tags.set([TAG_CLIENT]);
    historyItems.set([
      { ...MEETINGS[0], tagId: 'tag-client' },
      MEETINGS[1], // sans tag → masquée
      MEETINGS[2], // sans tag → masquée
    ]);
    setup();
    await pickTagFilter('Client X');

    expect(banner()).not.toBeNull();
    expect(banner().textContent).toContain('2 réunions masquées');
  });

  it('le bandeau rétablit la liste complète en un geste', async () => {
    tags.set([TAG_CLIENT]);
    historyItems.set([{ ...MEETINGS[0], tagId: 'tag-client' }, MEETINGS[1], MEETINGS[2]]);
    setup();
    await pickTagFilter('Client X');
    expect(screen.queryByText('Client Dupont')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Tout afficher' }));

    expect(screen.getByText('Client Dupont')).toBeTruthy();
    expect(banner()).toBeNull();
  });

  it('survit au rechargement : un filtre relu du localStorage est annoncé', async () => {
    // Exactement l'état d'une app native rouverte des jours plus tard.
    localStorage.setItem('mybrief_tag_filter', 'tag-client');
    tags.set([TAG_CLIENT]);
    historyItems.set([{ ...MEETINGS[0], tagId: 'tag-client' }, MEETINGS[1], MEETINGS[2]]);
    setup();

    expect(banner()).not.toBeNull();
    expect(banner().textContent).toContain('2 réunions masquées');
  });

  it('aucun bandeau quand le filtre ne masque rien', async () => {
    tags.set([TAG_CLIENT]);
    historyItems.set([
      { ...MEETINGS[0], tagId: 'tag-client' },
      { ...MEETINGS[1], tagId: 'tag-client' },
    ]);
    setup();
    await pickTagFilter('Client X');

    expect(banner()).toBeNull();
  });

  it('aucun bandeau sans filtre, même avec une recherche qui masque', async () => {
    // La recherche est visible dans son champ : elle n'a pas besoin d'un
    // bandeau, et en produire un serait du bruit permanent.
    tags.set([TAG_CLIENT]);
    setup();
    await userEvent.type(screen.getByRole('textbox', { name: /réunion|meeting/i }), 'client');

    expect(screen.queryByText('Point produit')).toBeNull();
    expect(banner()).toBeNull();
  });
});

describe('Sidebar — mode réglages (panneau à sections ouvert)', () => {
  const NAV_ITEMS = [
    { id: 'audio', label: 'Réglages audio', icon: null },
    { id: 'actions', label: 'Actions', icon: null },
  ];

  async function openConfigNav() {
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('config');
    registerPanelNav('config', {
      title: 'Ma configuration',
      items: NAV_ITEMS,
      active: 'audio',
    });
  }

  it("remplace l'historique par les sections du panneau, recherche comprise", async () => {
    await openConfigNav();
    setup();

    // Le menu est là, avec le titre du panneau et la section active marquée.
    expect(screen.getByRole('tablist', { name: 'Ma configuration' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent.trim())).toEqual(['Réglages audio', 'Actions']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');

    // L'historique et sa recherche ont cédé la place.
    expect(screen.queryByText('Point produit')).toBeNull();
    expect(screen.queryByRole('textbox', { name: /réunion|meeting/i })).toBeNull();

    // « Nouvelle réunion » reste le chemin de sortie.
    expect(screen.getByText('Nouvelle réunion')).toBeTruthy();
  });

  it('cliquer une section la sélectionne dans le store partagé', async () => {
    await openConfigNav();
    const { panelNav } = await import('../stores/panels.js');
    const { get } = await import('svelte/store');
    setup();

    await userEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    expect(get(panelNav).active).toBe('actions');
  });

  it('une entrée LIEN (« Aide ») s’ouvre dans un nouvel onglet, hors des onglets', async () => {
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('config');
    registerPanelNav('config', {
      title: 'Ma configuration',
      items: [...NAV_ITEMS, { id: 'help', label: 'Aide', icon: null, href: 'https://docs.test/' }],
      active: 'audio',
    });
    setup();

    // Un lien n'est pas un onglet : la liste d'onglets ne le compte pas.
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent.trim())).toEqual(['Réglages audio', 'Actions']);

    const link = screen.getByRole('link', { name: /^Aide/ });
    expect(link.getAttribute('href')).toBe('https://docs.test/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    // Le nom accessible annonce le nouvel onglet, que seule la flèche montre.
    expect(link.getAttribute('aria-label')).toMatch(/\((nouvel onglet|new tab)\)$/);
    expect(screen.getByRole('tablist').contains(link)).toBe(false);
  });

  it('sans nav enregistrée (panneau sans sections), l’historique reste', async () => {
    const { activePanel, clearPanelNav, panelNav } = await import('../stores/panels.js');
    const { get } = await import('svelte/store');
    clearPanelNav(get(panelNav).owner);
    activePanel.set('templates');
    setup();

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('Point produit')).toBeTruthy();
  });

  it('le logo mène à l’accueil, « Retour à l’accueil » referme seulement les réglages', async () => {
    // Deux gestes distincts : le logo est l'accueil de n'importe quel site
    // (App referme aussi la réunion affichée) ; l'entrée du sommaire rend
    // l'écran principal tel qu'il était, sur la réunion qu'il montrait.
    await openConfigNav();
    const { onMenuAction } = setup();
    const [logo, navHome] = screen.getAllByRole('button', { name: "Retour à l'accueil" });
    expect(logo.querySelector('img')).toBeTruthy();

    await userEvent.click(logo);
    expect(onMenuAction).toHaveBeenLastCalledWith('welcome');
    await userEvent.click(navHome);
    expect(onMenuAction).toHaveBeenLastCalledWith('home');
  });

  it('panneau refermé : le menu disparaît, l’historique revient tel quel', async () => {
    await openConfigNav();
    setup();
    expect(screen.queryByText('Point produit')).toBeNull();

    const { activePanel, clearPanelNav } = await import('../stores/panels.js');
    activePanel.set(null);
    clearPanelNav('config');
    // L'attente passe par le re-rendu Svelte.
    expect(await screen.findByText('Point produit')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('Sidebar — roue crantée et menu de compte', () => {
  const clickGear = () => userEvent.click(screen.getByRole('button', { name: 'Configuration' }));
  const openAccountMenu = () => userEvent.click(document.querySelector('.sb-user-details'));
  const menuLabels = () =>
    [...document.querySelectorAll('.sb-profile-menu .am-item')].map((b) => b.textContent.trim());

  it('la colonne ne porte plus que la capsule et la roue : ni drapeau, ni icône de statistiques', () => {
    setup();
    const buttons = [...document.querySelectorAll('.sb-user button')];
    expect(buttons.map((b) => b.className.split(' ')[0])).toEqual([
      'sb-user-details',
      'sb-user-settings',
    ]);
    expect(screen.queryByRole('button', { name: 'Mes statistiques' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Switch to English|Passer en français/ }),
    ).toBeNull();
  });

  it('la roue crantée ouvre le panneau — plus de menu déroulant à traverser', async () => {
    auth.set({ user: { name: 'Dev Local', email: 'dev@myalfred.ai' }, capabilities: {} });
    const { onMenuAction } = setup();

    await clickGear();
    expect(onMenuAction).toHaveBeenCalledWith('config');
    // Rien ne s'ouvre par-dessus : la colonne de gauche liste déjà les écrans.
    expect(document.querySelector('.sb-profile-menu')).toBeNull();
  });

  it('le menu du nom porte l’identité, « Ce mois-ci », la langue et la sortie, pas les réglages', async () => {
    const { onMenuAction } = setup();
    await openAccountMenu();

    expect(menuLabels()).toEqual(['Se déconnecter']);
    expect(document.querySelector('.am-email').textContent).toBe('dev@myalfred.ai');
    expect(screen.getByRole('region', { name: 'Ce mois-ci' })).toBeTruthy();
    expect(await screen.findByText('3 h 03')).toBeTruthy();
    // La roue crantée est à côté : pas de doublon dans le menu.
    expect(screen.queryByRole('menuitem', { name: 'Configuration' })).toBeNull();

    await userEvent.click(screen.getByRole('menuitem', { name: 'Voir mes statistiques' }));
    expect(onMenuAction).toHaveBeenCalledWith('stats');
    expect(document.querySelector('.sb-profile-menu')).toBeNull();
  });

  it('la langue se choisit dans le menu, en FR | EN nommés dans leur langue', async () => {
    const onSetLanguage = vi.fn();
    setup({ onSetLanguage });
    await openAccountMenu();

    const fr = screen.getByRole('menuitemradio', { name: 'Français' });
    const en = screen.getByRole('menuitemradio', { name: 'English' });
    expect(fr.getAttribute('aria-checked')).toBe('true');
    expect(en.getAttribute('lang')).toBe('en');
    await userEvent.click(fr);
    expect(onSetLanguage).not.toHaveBeenCalled();
    await userEvent.click(en);
    expect(onSetLanguage).toHaveBeenCalledWith('en');
  });

  it('« Changer de mot de passe » : menu de compte, et seulement en mode mot de passe', async () => {
    setup();
    await openAccountMenu();
    expect(menuLabels()).not.toContain('Changer de mot de passe');
    await userEvent.keyboard('{Escape}');

    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', authMode: 'password' },
      capabilities: {},
    });
    await openAccountMenu();
    expect(menuLabels()).toContain('Changer de mot de passe');
  });

  it('l’avatar dit par quoi la session a été ouverte, sans perdre les initiales', async () => {
    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', authProvider: 'password' },
      capabilities: {},
    });
    setup();
    expect(document.querySelector('.ua').getAttribute('title')).toBe('Connecté par mot de passe');
    expect(document.querySelector('.ua-disc').textContent).toBe('DL');

    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', authProvider: 'entra' },
      capabilities: {},
    });
    await tick();
    expect(document.querySelector('.ua').getAttribute('title')).toBe('Connecté avec Microsoft');
    // Le rond reste le rond : la pastille s'ajoute, elle ne remplace pas.
    expect(document.querySelector('.ua-disc').textContent).toBe('DL');
  });

  it('l’avatar montre la photo Google, et retombe sur les initiales si elle ne charge pas', async () => {
    const photo = 'https://lh3.googleusercontent.com/a/photo=s96-c';
    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', authProvider: 'google', picture: photo },
      capabilities: {},
    });
    setup();
    const img = document.querySelector('.sb-user-details .ua-photo');
    expect(img.getAttribute('src')).toBe(photo);
    // L'adresse de l'app n'a pas à partir chez Google avec la photo — et la
    // politique doit précéder `src` : une photo en cache se charge dès que
    // `src` est posé (Chromium envoyait alors le référent).
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    const order = [...img.attributes].map((attr) => attr.name);
    expect(order.indexOf('referrerpolicy')).toBeLessThan(order.indexOf('src'));
    // La pastille reste : la photo dit qui, le logo dit comment.
    expect(document.querySelector('.sb-user-details .ua-badge')).toBeTruthy();

    img.dispatchEvent(new Event('error'));
    await tick();
    expect(document.querySelector('.sb-user-details .ua-photo')).toBeNull();
    expect(document.querySelector('.sb-user-details .ua-disc').textContent.trim()).toBe('DL');

    // Une autre photo (photo changée, autre compte) retente sa chance.
    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', picture: `${photo}&v=2` },
      capabilities: {},
    });
    await tick();
    expect(document.querySelector('.sb-user-details .ua-photo')).toBeTruthy();
  });

  it('fournisseur inconnu : pas de pastille plutôt qu’une fausse', async () => {
    setup();
    auth.set({ user: { name: 'Dev Local', email: 'dev@myalfred.ai' }, capabilities: {} });
    await tick();
    expect(document.querySelector('.ua')).toBeTruthy();
    expect(document.querySelector('.ua-badge')).toBeNull();
  });

  it('le menu de compte nomme les groupes attribués par l’administration', async () => {
    auth.set({
      user: {
        name: 'Dev Local',
        email: 'dev@myalfred.ai',
        groups: [
          { id: 'default', name: 'Défaut', color: 'slate' },
          { id: 'g-sales', name: 'Commerciaux', color: 'blue' },
        ],
      },
      capabilities: {},
    });
    setup();
    await openAccountMenu();

    expect(screen.getByText('Vos groupes')).toBeTruthy();
    expect(
      [...document.querySelectorAll('.am-groups .gc-name')].map((el) => el.textContent),
    ).toEqual(['Défaut', 'Commerciaux']);
    // Lecture seule : aucune entrée de menu n'est venue s'ajouter.
    expect(menuLabels()).toEqual(['Se déconnecter']);
  });

  it('sans groupes connus (ancienne réponse de session), le bloc n’apparaît pas', async () => {
    setup();
    await openAccountMenu();
    expect(screen.queryByText('Vos groupes')).toBeNull();
    expect(document.querySelector('.am-groups')).toBeNull();
  });

  it('l’administration est une ligne du menu de compte, réservée aux admins', async () => {
    const { onMenuAction } = setup();
    await openAccountMenu();
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).toBeNull();
    await userEvent.keyboard('{Escape}');

    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', role: 'admin' },
      capabilities: {},
    });
    await tick();
    // Plus de bouclier dans la colonne : l'administration se cherche dans le menu.
    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
    await openAccountMenu();
    expect(menuLabels()).toEqual(['Administration', 'Se déconnecter']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Administration' }));
    expect(onMenuAction).toHaveBeenCalledWith('admin');
    // La roue crantée, elle, reste ouverte à tous et vise un autre panneau.
    expect(screen.getByRole('button', { name: 'Configuration' })).toBeTruthy();
  });
});

/**
 * Pastilles de configuration : une section où il reste quelque chose à régler
 * le montre, et les boutons qui ouvrent les panneaux le montrent AVANT qu'on
 * les ouvre — on suit les pastilles jusqu'au réglage.
 */
describe('Sidebar — pastilles de configuration', () => {
  const KEY_MISSING = { section: 'ai', code: 'ai_key_missing', level: 'error' };
  const TAG_FOLDER = {
    section: 'tags',
    code: 'tag_folder_missing',
    level: 'warning',
    vars: { tag: 'Acme', folder: 'Clients/Acme' },
  };

  it('une section à régler porte une pastille, et sa phrase la décrit', async () => {
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('admin');
    registerPanelNav('admin', {
      title: 'Administration',
      items: [
        { id: 'branding', label: 'Configuration', icon: null },
        {
          id: 'ai',
          label: 'IA',
          icon: null,
          alert: { level: 'error', items: [{ level: 'error', text: 'Aucune clé OpenAI.' }] },
        },
      ],
      active: 'branding',
    });
    setup();

    const ai = screen.getByRole('tab', { name: /^IA/, description: 'Aucune clé OpenAI.' });
    expect(ai.querySelector('.cad-error')).toBeTruthy();
    // Pas de bulle native par-dessus la nôtre.
    expect(ai.hasAttribute('title')).toBe(false);
    expect(screen.getByRole('tab', { name: 'Configuration' }).querySelector('.cad')).toBeNull();
    // Écran tactile : la phrase s'écrit sous le libellé, et l'entrée ainsi
    // marquée cale sa tuile d'icône et sa pastille sur le libellé.
    expect(ai.classList.contains('sb-nav-item-alert')).toBe(true);
    expect(
      screen.getByRole('tab', { name: 'Configuration' }).classList.contains('sb-nav-item-alert'),
    ).toBe(false);
  });

  it('roue crantée et administration : le récapitulatif de ce que chacun ouvre', async () => {
    configCheckResponses.account = [TAG_FOLDER];
    configCheckResponses.organization = [KEY_MISSING];
    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', role: 'admin' },
      capabilities: {},
    });
    setup();

    const gear = screen.getByRole('button', { name: 'Configuration' });
    const capsule = document.querySelector('.sb-user-details');
    // L'administration est dans le menu : sa pastille se voit sur la capsule,
    // menu fermé — sans infobulle native par-dessus la bulle.
    await vi.waitFor(() => expect(capsule.querySelector('.cad-error')).toBeTruthy());
    expect(capsule.hasAttribute('title')).toBe(false);
    expect(gear.querySelector('.cad-warning')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Configuration', description: /Clients\/Acme/ }),
    ).toBe(gear);

    await userEvent.click(capsule);
    const admin = screen.getByRole('menuitem', { name: /^Administration/ });
    expect(admin.querySelector('.cad-error')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Administration/, description: /OpenAI/ })).toBe(
      admin,
    );
  });

  it("un compte ordinaire ne lit jamais les constats de l'organisation", async () => {
    configCheckResponses.account = [];
    setup();
    await vi.waitFor(() => expect(fetchAccountChecks).toHaveBeenCalled());
    expect(fetchOrganizationChecks).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Configuration' }).querySelector('.cad')).toBeNull();
  });

  it('ouvrir un panneau relit les constats', async () => {
    const { activePanel } = await import('../stores/panels.js');
    activePanel.set(null);
    setup();
    await vi.waitFor(() => expect(fetchAccountChecks).toHaveBeenCalledTimes(1));
    activePanel.set('config');
    await vi.waitFor(() => expect(fetchAccountChecks).toHaveBeenCalledTimes(2));
    activePanel.set(null);
  });
});

/**
 * La réunion est inscrite dans l'historique dès le premier mot : une de ses
 * lignes peut donc être EN TRAIN de tourner. L'italique est le seul signal qui
 * la distingue d'une archive.
 */
describe('Sidebar — réunion en cours d’enregistrement', () => {
  const enDirect = (id) => {
    liveMeetingIdStore.set(id);
    isRecordingStore.set(true);
  };

  it('met en italique la ligne qui enregistre, et elle seule', async () => {
    setup();
    enDirect('m-2');
    await tick();
    const live = screen.getByText('Client Dupont').closest('.sb-item');
    const archive = screen.getByText('Point produit').closest('.sb-item');
    expect(live.classList.contains('sb-item-live')).toBe(true);
    expect(archive.classList.contains('sb-item-live')).toBe(false);
  });

  it('l’italique tombe avec l’arrêt, même si l’identifiant traîne encore', async () => {
    // L'identifiant reste posé le temps que la clôture aboutisse côté réseau :
    // c'est la CONJONCTION avec l'état d'enregistrement qui fait foi, sinon une
    // ligne resterait en italique après la fin de la réunion.
    setup();
    enDirect('m-2');
    await tick();
    isRecordingStore.set(false);
    await tick();
    expect(
      screen.getByText('Client Dupont').closest('.sb-item').classList.contains('sb-item-live'),
    ).toBe(false);
  });

  it('étincelle « titre en cours » sur la ligne dont le serveur rédige le titre, et elle seule', async () => {
    // « Enregistrer » sans résumé (ou compte rendu en cours) : le serveur pose
    // `titlePending` et le vrai titre arrive quelques secondes plus tard. Le
    // libellé daté reste lisible, l'étincelle dit qu'il va changer.
    setup();
    historyItems.set([
      { ...MEETINGS[0], title: 'Réunion 04-09-2026 10:15', titlePending: true },
      MEETINGS[1],
    ]);
    await tick();
    const naming = screen.getByText('Réunion 04-09-2026 10:15').closest('.sb-item');
    expect(naming.querySelector('.sb-item-naming')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Titre en cours de rédaction…' })).toBeTruthy();
    const archive = screen.getByText('Client Dupont').closest('.sb-item');
    expect(archive.querySelector('.sb-item-naming')).toBeNull();
  });

  it('reste en italique pendant une pause', async () => {
    setup();
    liveMeetingIdStore.set('m-2');
    isPausedStore.set(true);
    await tick();
    expect(
      screen.getByText('Client Dupont').closest('.sb-item').classList.contains('sb-item-live'),
    ).toBe(true);
  });

  it('cliquer la ligne en cours émet son meetingId comme les autres', async () => {
    // La Sidebar ne connaît pas le direct : c'est App qui, sur cet identifiant,
    // ramène à la transcription en cours plutôt qu'au brouillon en base.
    const { onSelectHistory } = setup();
    enDirect('m-2');
    await tick();
    await userEvent.click(screen.getByText('Client Dupont'));
    expect(onSelectHistory).toHaveBeenCalledWith('m-2');
  });
});

/**
 * Compte rendu en cours de rédaction : le titre de la réunion concernée s'anime
 * (reflet CSS), et elle seule — l'utilisateur peut lire une autre réunion
 * pendant ce temps, l'historique lui dit laquelle s'écrit.
 */
describe('Sidebar — compte rendu en cours de rédaction', () => {
  const WRITING = 'Résumé en cours de rédaction…';
  const row = (title) => screen.getByText(title).closest('.sb-item');

  it('anime le titre de la réunion qui s’écrit, et de celle-là seulement', async () => {
    setup();
    beginSummaryGeneration('m-2', { id: 'v-pending' });
    await tick();
    expect(row('Client Dupont').classList.contains('sb-item-writing')).toBe(true);
    expect(row('Point produit').classList.contains('sb-item-writing')).toBe(false);
    // Le reflet ne se lit pas : un libellé hors écran le dit, sur cette ligne seulement.
    expect(row('Client Dupont').textContent).toContain(WRITING);
    expect(row('Point produit').textContent).not.toContain(WRITING);
    expect(screen.getByText('Client Dupont').getAttribute('title')).toBe(
      `Client Dupont — ${WRITING}`,
    );
    expect(screen.getByText('Point produit').getAttribute('title')).toBe('Point produit');
  });

  it('l’animation tombe quand la rédaction se termine, réussie ou non', async () => {
    setup();
    beginSummaryGeneration('m-2', { id: 'v-pending' });
    await tick();
    endSummaryGeneration('v-pending');
    await tick();
    expect(row('Client Dupont').classList.contains('sb-item-writing')).toBe(false);
    expect(row('Client Dupont').textContent).not.toContain(WRITING);
  });

  it('deux réunions peuvent s’écrire en même temps : deux titres animés', async () => {
    setup();
    beginSummaryGeneration('m-1', { id: 'v-a' });
    beginSummaryGeneration('m-3', { id: 'v-b' });
    await tick();
    expect(row('Point produit').classList.contains('sb-item-writing')).toBe(true);
    expect(row('Rétro sprint').classList.contains('sb-item-writing')).toBe(true);
    expect(row('Client Dupont').classList.contains('sb-item-writing')).toBe(false);
  });

  it('la ligne reste cliquable : on lit la réunion pendant sa rédaction', async () => {
    const { onSelectHistory } = setup();
    beginSummaryGeneration('m-2', { id: 'v-pending' });
    await tick();
    await userEvent.click(screen.getByText('Client Dupont'));
    expect(onSelectHistory).toHaveBeenCalledWith('m-2');
  });
});

/**
 * Jusqu'à 1100 px (téléphone, tablette en portrait, fenêtre étroite), la barre
 * est un tiroir : un choix fait dedans la referme, le résultat s'affiche
 * dessous. Au-delà, elle est une colonne et reste ouverte.
 */
describe('Sidebar — en tiroir', () => {
  const realWidth = window.innerWidth;
  const setWidth = (w) =>
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  afterEach(() => setWidth(realWidth));

  async function pickSectionAt(width) {
    setWidth(width);
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('config');
    registerPanelNav('config', {
      title: 'Ma configuration',
      items: [
        { id: 'audio', label: 'Réglages audio', icon: null },
        { id: 'actions', label: 'Actions', icon: null },
      ],
      active: 'audio',
    });
    const onToggle = vi.fn();
    setup({ isOpen: true, onToggle });
    await userEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    return onToggle;
  }

  it('choisir une section referme le tiroir à 820 px (iPad en portrait)', async () => {
    expect(await pickSectionAt(820)).toHaveBeenCalledTimes(1);
  });

  it('… mais pas la colonne à 1280 px', async () => {
    expect(await pickSectionAt(1280)).not.toHaveBeenCalled();
  });

  it('le logo laisse App refermer le tiroir : il ne le rebascule pas lui-même', async () => {
    // App referme le tiroir sur TOUTE action du menu, « welcome » comprise ; un
    // second basculement ici, avec un `isOpen` pas encore à jour, le rouvrait.
    setWidth(375);
    const onToggle = vi.fn();
    const { onMenuAction } = setup({ isOpen: true, onToggle });
    await userEvent.click(screen.getAllByRole('button', { name: /accueil|home/i })[0]);
    expect(onMenuAction).toHaveBeenCalledWith('welcome');
    expect(onToggle).not.toHaveBeenCalled();
  });
});
