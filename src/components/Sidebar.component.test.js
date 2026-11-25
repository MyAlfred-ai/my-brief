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
import { render, screen, within } from '@testing-library/svelte';
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

// Transport des statistiques : coupé, la colonne n'a rien à lire sur le réseau.
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

  it('dès sept tags, le menu cherche — dans le nom comme dans le contexte', async () => {
    const seven = ['Achats', 'Budget', 'Direction', 'Équipe', 'Formation', 'Interne'].map(
      (label, i) => ({ id: `t-${i}`, label, color: 'red' }),
    );
    tags.set([...seven, { ...TAG_CLIENT, context: 'Cliente : Claire Martin.' }]);
    historyItems.set(taggedHistory());
    setup();
    await userEvent.click(document.querySelector('.sb-tagbar .sb-tagmenu-btn'));
    const search = within(document.querySelector('.sb-tagmenu')).getByRole('searchbox', {
      name: 'Rechercher un tag',
    });
    await userEvent.type(search, 'martin');
    expect(tagFilterOption(TAG_CLIENT.label)).toBeTruthy();
    expect(tagFilterOption('Achats')).toBeUndefined();
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(document.querySelector('.sb-tagmenu').textContent).toContain('Aucun tag ne correspond.');
  });

  it('sous sept tags, pas de recherche dans le menu', async () => {
    tags.set([TAG_CLIENT, TAG_INTERNE]);
    historyItems.set(taggedHistory());
    setup();
    await userEvent.click(document.querySelector('.sb-tagbar .sb-tagmenu-btn'));
    expect(document.querySelector('.sb-tagmenu input')).toBeNull();
  });

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

  it('une section sans groupe (« Outils ») descend en pied de colonne, sous le filet', async () => {
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('config');
    registerPanelNav('config', {
      title: 'Réglages',
      items: [
        { id: 'profile', label: 'Mon profil', icon: null, group: 'Mon compte' },
        { id: 'tags', label: 'Mes tags', icon: null, group: 'Ma bibliothèque' },
        { id: 'tools', label: 'Outils', icon: null },
        { id: 'help', label: 'Aide', icon: null, href: 'https://docs.test/' },
      ],
      active: 'profile',
    });
    setup();

    // « Outils » a un écran : il reste un onglet, le dernier.
    expect(screen.getAllByRole('tab').map((t) => t.textContent.trim())).toEqual([
      'Mon profil',
      'Mes tags',
      'Outils',
    ]);
    // Le filet passe au-dessus de lui ; les liens le suivent sans second filet.
    const rule = document.querySelector('.sb-nav-rule');
    expect(rule).toBeTruthy();
    expect(rule.nextElementSibling.textContent.trim()).toBe('Outils');
    expect(document.querySelector('.sb-nav-links').classList.contains('sb-nav-links-ruled')).toBe(
      false,
    );
  });

  it('sans section en pied, le filet reste celui des liens', async () => {
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('config');
    registerPanelNav('config', {
      title: 'Réglages',
      items: [
        { id: 'profile', label: 'Mon profil', icon: null, group: 'Mon compte' },
        { id: 'help', label: 'Aide', icon: null, href: 'https://docs.test/' },
      ],
      active: 'profile',
    });
    setup();

    expect(document.querySelector('.sb-nav-rule')).toBeNull();
    expect(document.querySelector('.sb-nav-links').classList.contains('sb-nav-links-ruled')).toBe(
      true,
    );
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

describe('Sidebar — recherche dans les réglages', () => {
  // Les pages affichées : la recherche ne propose que celles-là.
  const NAV_ITEMS = [
    { id: 'profile', label: 'Mon profil', icon: null },
    { id: 'meeting', label: 'Pendant la réunion', icon: null },
    { id: 'actions', label: 'Après la réunion', icon: null },
  ];

  async function openConfigNav() {
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('config');
    registerPanelNav('config', { title: 'Réglages', items: NAV_ITEMS, active: 'profile' });
  }

  const field = () => screen.getByRole('combobox', { name: 'Rechercher dans les réglages' });
  const optionTitles = () =>
    screen.getAllByRole('option').map((o) => o.querySelector('.ssr-title').textContent);

  afterEach(async () => {
    const { activePanel, clearPanelNav, panelNav } = await import('../stores/panels.js');
    const { get } = await import('svelte/store');
    activePanel.set(null);
    // Une page visée dans l'AUTRE panneau reste en attente sur une nav sans
    // propriétaire (openPanel) : la vider aussi.
    clearPanelNav(get(panelNav).owner);
  });

  it('la pilule sous « Nouvelle réunion » cherche un réglage ; ses résultats remplacent les sections', async () => {
    await openConfigNav();
    setup();
    expect(field().getAttribute('aria-expanded')).toBe('false');

    await userEvent.type(field(), 'micro');

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(optionTitles()[0]).toBe('Micro et son');
    // Le chemin dit où est le réglage : le groupe, la page, l'onglet.
    expect(screen.getAllByRole('option')[1].textContent).toContain(
      'Mes réunions › Pendant la réunion › Micro et son',
    );
    expect(field().getAttribute('aria-expanded')).toBe('true');
  });

  it('Entrée ouvre la page ET l’onglet du réglage, puis rend les sections', async () => {
    await openConfigNav();
    const { panelNav } = await import('../stores/panels.js');
    const { get } = await import('svelte/store');
    setup();

    await userEvent.type(field(), 'dossier');
    expect(optionTitles()[0]).toBe('Entreposer');
    await userEvent.keyboard('{Enter}');

    expect(get(panelNav)).toMatchObject({ active: 'actions', sub: 'storage' });
    expect(field().value).toBe('');
    expect(screen.getByRole('tablist')).toBeTruthy();
  });

  it('↓ choisit la ligne suivante, annoncée au lecteur d’écran', async () => {
    await openConfigNav();
    setup();
    await userEvent.type(field(), 'micro');
    await userEvent.keyboard('{ArrowDown}');

    const active = field().getAttribute('aria-activedescendant');
    expect(document.getElementById(active).getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById(active).querySelector('.ssr-title').textContent).toBe(
      'Microphone',
    );
  });

  it('rien ne correspond : une phrase le dit, avec une piste', async () => {
    await openConfigNav();
    setup();
    await userEvent.type(field(), 'zzzz');
    expect(screen.getByRole('status').textContent).toContain('Aucun réglage ne correspond');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Échap vide la recherche, et les sections reviennent', async () => {
    await openConfigNav();
    setup();
    await userEvent.type(field(), 'micro');
    await userEvent.keyboard('{Escape}');
    expect(field().value).toBe('');
    expect(screen.getByRole('tablist')).toBeTruthy();
  });

  it('un compte sans rôle administrateur ne trouve rien de l’administration', async () => {
    await openConfigNav();
    setup();
    await userEvent.type(field(), 'logo');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('un administrateur trouve l’administration depuis « Réglages », et y va', async () => {
    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', role: 'admin' },
      capabilities: {},
    });
    await openConfigNav();
    const { activePanel, panelNav } = await import('../stores/panels.js');
    const { get } = await import('svelte/store');
    setup();

    await userEvent.type(field(), 'logo');
    const first = screen.getAllByRole('option')[0];
    expect(first.textContent).toContain('Administration › Organisation › Marque & apparence');
    await userEvent.click(first);

    expect(get(activePanel)).toBe('admin');
    expect(get(panelNav)).toMatchObject({ active: 'branding' });
  });

  it('Ctrl K donne le focus au champ ; sans panneau ouvert, il ouvre « Réglages »', async () => {
    const { onMenuAction } = setup();
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(onMenuAction).toHaveBeenCalledWith('config');

    await openConfigNav();
    await tick();
    await userEvent.keyboard('{Control>}k{/Control}');
    await tick();
    await tick();
    expect(document.activeElement).toBe(field());
  });

  it('rail replié : la loupe déplie la colonne', async () => {
    await openConfigNav();
    const onToggle = vi.fn();
    setup({ isOpen: false, onToggle });
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher un réglage' }));
    expect(onToggle).toHaveBeenCalled();
  });
});

/**
 * Administration : des RUBRIQUES qu'on replie (nav `collapsible`), et les
 * entrées qui ne sont ni des sections ni des liens — les GESTES.
 */
describe('Sidebar — rubriques repliables et gestes', () => {
  const ALERT = { level: 'error', items: [{ level: 'error', text: 'Aucune clé OpenAI.' }] };
  const people = { groupId: 'people', group: 'Personnes', groupIcon: null };
  const models = { groupId: 'models', group: 'Modèles IA', groupIcon: null };
  const ADMIN_ITEMS = [
    { id: 'users', label: 'Comptes', icon: null, ...people },
    { id: 'groups', label: 'Groupes', icon: null, ...people },
    { id: 'ai', label: 'Clés API', icon: null, ...models, alert: ALERT },
  ];
  const FOLDS_KEY = 'mybrief_nav_folds';

  async function openAdminNav() {
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('admin');
    registerPanelNav('admin', {
      title: 'Administration',
      items: ADMIN_ITEMS,
      active: 'users',
      collapsible: true,
    });
  }

  afterEach(async () => {
    const { activePanel, clearPanelNav } = await import('../stores/panels.js');
    activePanel.set(null);
    clearPanelNav('admin');
    clearPanelNav('config');
  });

  it('chaque rubrique est un bouton qui se replie, ses pages rangées dessous', async () => {
    await openAdminNav();
    setup();

    // Plus une liste d'onglets : des rubriques, et la page ouverte se dit
    // par `aria-current`.
    expect(screen.queryByRole('tablist')).toBeNull();
    const rubric = screen.getByRole('button', { name: 'Personnes' });
    expect(rubric.getAttribute('aria-expanded')).toBe('true');
    const pages = screen.getByRole('group', { name: 'Personnes' });
    expect(rubric.getAttribute('aria-controls')).toBe(pages.id);
    expect(
      within(pages)
        .getAllByRole('button')
        .map((b) => b.textContent.trim()),
    ).toEqual(['Comptes', 'Groupes']);
    expect(screen.getByRole('button', { name: 'Comptes' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('button', { name: 'Groupes' }).hasAttribute('aria-current')).toBe(
      false,
    );

    // Replier reste permis sur la rubrique de la page ouverte.
    await userEvent.click(rubric);
    expect(rubric.getAttribute('aria-expanded')).toBe('false');
    expect(pages.classList.contains('sb-nav-sub-folded')).toBe(true);
    expect(JSON.parse(localStorage.getItem(FOLDS_KEY))).toEqual(['people']);
  });

  it('une entrée SANS rubrique (le tableau de bord) reste une entrée simple, en tête', async () => {
    const { activePanel, registerPanelNav } = await import('../stores/panels.js');
    activePanel.set('admin');
    registerPanelNav('admin', {
      title: 'Administration',
      items: [
        { id: 'dashboard', label: 'Tableau de bord', icon: null, groupId: '', group: '' },
        ...ADMIN_ITEMS,
      ],
      active: 'dashboard',
      collapsible: true,
    });
    setup();

    const dashboard = screen.getByRole('button', { name: 'Tableau de bord' });
    expect(dashboard.getAttribute('aria-current')).toBe('page');
    // Ni bouton de rubrique, ni retrait : elle n'appartient à aucune.
    expect(dashboard.hasAttribute('aria-expanded')).toBe(false);
    expect(dashboard.closest('.sb-nav-sub').classList.contains('sb-nav-sub-rubric')).toBe(false);
    expect(
      [...document.querySelectorAll('.sb-nav-rubric')].map((b) => b.textContent.trim()),
    ).toEqual(['Personnes', 'Modèles IA']);
  });

  it('le pli est mémorisé, et une rubrique repliée porte la pastille de ses pages', async () => {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(['models']));
    await openAdminNav();
    setup();

    const rubric = screen.getByRole('button', { name: /^Modèles IA/ });
    expect(rubric.getAttribute('aria-expanded')).toBe('false');
    expect(rubric.querySelector('.cad-error')).toBeTruthy();

    // Dépliée, la page porte sa pastille : la rubrique ne la double pas.
    await userEvent.click(rubric);
    expect(rubric.getAttribute('aria-expanded')).toBe('true');
    expect(rubric.querySelector('.cad')).toBeNull();
    expect(JSON.parse(localStorage.getItem(FOLDS_KEY))).toEqual([]);
  });

  it('arriver sur une page déplie sa rubrique', async () => {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(['models']));
    await openAdminNav();
    const { selectPanelSection } = await import('../stores/panels.js');
    setup();

    selectPanelSection('ai');
    await tick();
    expect(screen.getByRole('button', { name: /^Modèles IA/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('un GESTE (« Se déconnecter ») est un bouton hors des onglets, qui remonte son identifiant', async () => {
    const { activePanel, registerPanelNav, panelNav } = await import('../stores/panels.js');
    const { get } = await import('svelte/store');
    activePanel.set('config');
    registerPanelNav('config', {
      title: 'Réglages',
      items: [
        { id: 'profile', label: 'Mon profil', icon: null, group: 'Mon compte' },
        { id: 'logout', label: 'Se déconnecter', icon: null, action: 'logout', danger: true },
      ],
      active: 'profile',
    });
    const { onMenuAction } = setup();

    expect(screen.getAllByRole('tab').map((t) => t.textContent.trim())).toEqual(['Mon profil']);
    const logout = screen.getByRole('button', { name: 'Se déconnecter' });
    expect(screen.getByRole('tablist').contains(logout)).toBe(false);
    // Sans groupe : un filet le détache des sections.
    expect(logout.closest('.sb-nav-links').classList.contains('sb-nav-links-ruled')).toBe(true);

    await userEvent.click(logout);
    expect(onMenuAction).toHaveBeenCalledWith('logout');
    // Un geste n'ouvre pas d'écran : la section affichée ne bouge pas.
    expect(get(panelNav).active).toBe('profile');
  });
});

/**
 * La carte du compte, en bas de la colonne : l'identité se LIT, deux boutons
 * mènent aux deux espaces — « Réglages » (mon compte) et « Admin »
 * (l'organisation, administrateurs seulement). Plus de menu derrière le nom :
 * ce qu'il portait est la page « Mon profil » des réglages.
 */
describe('Sidebar — carte du compte : deux boutons, deux espaces', () => {
  const ADMIN = {
    user: { name: 'Dev Local', email: 'dev@myalfred.ai', role: 'admin' },
    capabilities: {},
  };
  const cardButtons = () => [...document.querySelectorAll('.sb-user button')];

  it('un compte ordinaire n’a qu’un bouton, « Réglages » ; l’identité ne se clique pas', () => {
    setup();
    expect(cardButtons().map((b) => b.getAttribute('aria-label'))).toEqual(['Réglages']);
    expect(document.querySelector('.sb-user-details').tagName).toBe('DIV');
    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
    // Ni drapeau, ni icône de statistiques, ni menu déroulant derrière le nom.
    expect(
      screen.queryByRole('button', { name: /Switch to English|Passer en français/ }),
    ).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('« Réglages » ouvre les réglages', async () => {
    const { onMenuAction } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(onMenuAction).toHaveBeenCalledWith('config');
  });

  it('administrateur : « Admin » à côté de « Réglages », nommé « Administration »', async () => {
    auth.set(ADMIN);
    const { onMenuAction } = setup();
    expect(cardButtons().map((b) => b.textContent.trim())).toEqual(['Réglages', 'Admin']);
    await userEvent.click(screen.getByRole('button', { name: 'Administration' }));
    expect(onMenuAction).toHaveBeenCalledWith('admin');
  });

  it('le bouton de l’espace ouvert le dit', async () => {
    const { activePanel } = await import('../stores/panels.js');
    auth.set(ADMIN);
    setup();
    activePanel.set('admin');
    await tick();
    expect(
      screen.getByRole('button', { name: 'Administration' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.getByRole('button', { name: 'Réglages' }).hasAttribute('aria-current')).toBe(
      false,
    );
    activePanel.set(null);
  });

  it('rail replié : les deux boutons restent, en icônes nommées', () => {
    auth.set(ADMIN);
    setup({ isOpen: false });
    expect(document.querySelector('.sb-user .aa-compact')).toBeTruthy();
    expect(cardButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Réglages',
      'Administration',
    ]);
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

  it('« Réglages » et « Admin » : le récapitulatif de ce que chacun ouvre', async () => {
    configCheckResponses.account = [TAG_FOLDER];
    configCheckResponses.organization = [KEY_MISSING];
    auth.set({
      user: { name: 'Dev Local', email: 'dev@myalfred.ai', role: 'admin' },
      capabilities: {},
    });
    setup();

    const settings = screen.getByRole('button', { name: 'Réglages' });
    const admin = screen.getByRole('button', { name: 'Administration' });
    await vi.waitFor(() => expect(admin.querySelector('.cad-error')).toBeTruthy());
    expect(settings.querySelector('.cad-warning')).toBeTruthy();
    // Pas d'infobulle native par-dessus la bulle de la pastille.
    expect(admin.hasAttribute('title')).toBe(false);
    expect(settings.hasAttribute('title')).toBe(false);
    expect(screen.getByRole('button', { name: 'Réglages', description: /Clients\/Acme/ })).toBe(
      settings,
    );
    expect(screen.getByRole('button', { name: 'Administration', description: /OpenAI/ })).toBe(
      admin,
    );
  });

  it("un compte ordinaire ne lit jamais les constats de l'organisation", async () => {
    configCheckResponses.account = [];
    setup();
    await vi.waitFor(() => expect(fetchAccountChecks).toHaveBeenCalled());
    expect(fetchOrganizationChecks).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Réglages' }).querySelector('.cad')).toBeNull();
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
