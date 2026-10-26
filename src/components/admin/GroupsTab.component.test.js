/**
 * Onglet « Groupes » — cartes, glisser-déposer, création, membres, suppression.
 *
 * Ce qui casserait sans ces tests : une corbeille proposée sur le groupe par
 * défaut (le serveur refuse, mais le geste ne doit pas exister) ; un « Retirer »
 * actif sur un compte dont le groupe par défaut est le seul groupe (le serveur
 * le remettrait aussitôt, l'écran mentirait) ; une création qui ne mène pas
 * aux membres du groupe créé ; une confirmation de suppression qui ne nomme
 * pas le groupe où les membres retombent ; une carte qui accepte le dépôt
 * d'un compte déjà membre ; et un ajout impossible sans souris (la sélection
 * au clavier ou au doigt est le seul chemin sur téléphone).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const listGroups = vi.fn();
const createGroup = vi.fn();
const updateGroup = vi.fn();
const deleteGroup = vi.fn();
const changeGroupMembers = vi.fn();
const listUsers = vi.fn();

vi.mock('../../services/adminGroupsApi.js', () => ({
  listGroups: (...a) => listGroups(...a),
  createGroup: (...a) => createGroup(...a),
  updateGroup: (...a) => updateGroup(...a),
  deleteGroup: (...a) => deleteGroup(...a),
  changeGroupMembers: (...a) => changeGroupMembers(...a),
}));
vi.mock('../../services/adminUsersApi.js', () => ({
  listUsers: (...a) => listUsers(...a),
}));

const { default: GroupsTab } = await import('./GroupsTab.svelte');
const { auth } = await import('../../stores/auth.js');

/** Interrupteur « Proposer l'infographie » de l'onglet IA, tel que la sonde publique le sert. */
function setInfographicOffered(enabled) {
  auth.update((state) => ({
    ...state,
    capabilities: { ...state.capabilities, infographic: { enabled } },
  }));
}

const t = uiTextData.fr.adminGroups;

const DEFAULT = {
  id: 'default',
  name: 'Défaut',
  description: '',
  color: 'slate',
  isDefault: true,
  infographicAllowed: true,
  memberCount: 3,
};
const SALES = {
  id: 'g-sales',
  name: 'Commerciaux',
  description: 'Équipe de vente.',
  color: 'blue',
  isDefault: false,
  meetingMinutesPerMonth: 120,
  memberCount: 1,
};

const user = (email, over = {}) => ({
  email,
  name: email.split('@')[0],
  role: 'user',
  disabled: false,
  hasPassword: true,
  groupIds: ['default'],
  lastConnecion: null,
  ...over,
});

/** Catalogue mutable : la création y ajoute, comme le ferait le serveur. */
let catalogue;
/** Membres par groupe, comptes trouvés par la recherche, et tous les comptes (colonne). */
let members;
let found;
let accounts;

beforeEach(() => {
  vi.clearAllMocks();
  catalogue = [DEFAULT, SALES];
  members = {
    default: [
      user('paul@exemple.fr'),
      user('zoe@exemple.fr', { groupIds: ['default', 'g-sales'] }),
    ],
    'g-sales': [user('zoe@exemple.fr', { groupIds: ['default', 'g-sales'] })],
  };
  found = [user('paul@exemple.fr'), user('zoe@exemple.fr', { groupIds: ['default', 'g-sales'] })];
  accounts = [
    user('paul@exemple.fr'),
    user('zoe@exemple.fr', { groupIds: ['default', 'g-sales'] }),
  ];
  listGroups.mockImplementation(async () => ({
    ok: true,
    data: { groups: catalogue, colors: ['slate', 'blue', 'violet'], max: 50, defaultId: 'default' },
  }));
  listUsers.mockImplementation(async ({ group, q } = {}) => {
    const users = group ? members[group] || [] : q ? found : accounts;
    return { ok: true, data: { users, total: users.length } };
  });
});

/** La tête de carte ouvre les membres : c'est le geste principal de l'écran. */
const openMembersOf = (name) =>
  screen.getByRole('button', { name: t.openMembers.replace('{name}', name) });

const cardOf = (name) =>
  screen.getByRole('button', { name: t.openMembers.replace('{name}', name) }).closest('.gc');

/** Une ligne de la colonne « Utilisateurs », qu'on glisse ou qu'on sélectionne. */
const personRow = async (email) => (await screen.findByText(email)).closest('.gp-person');

const fill = (template, values) =>
  Object.entries(values).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), template);

/** jsdom n'a pas de DataTransfer : un double suffit à ce que lit le composant. */
const transfer = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' });

describe('GroupsTab — cartes', () => {
  it('une carte par groupe, le groupe par défaut marqué et sans corbeille', async () => {
    render(GroupsTab);
    await screen.findByText('Commerciaux');

    const def = cardOf('Défaut');
    expect(within(def).getByText(t.defaultBadge)).toBeTruthy();
    expect(within(def).getByText(t.membersMany.replace('{n}', '3'))).toBeTruthy();
    expect(within(def).queryByRole('button', { name: `${t.deleteButton} : Défaut` })).toBeNull();

    const sales = cardOf('Commerciaux');
    expect(within(sales).getByText('Équipe de vente.')).toBeTruthy();
    expect(within(sales).getByText(t.membersOne)).toBeTruthy();
    expect(
      within(sales).getByRole('button', { name: `${t.deleteButton} : Commerciaux` }),
    ).toBeTruthy();
    // Le quota, en clair sur la carte ; « Illimité » quand rien n'est posé.
    expect(within(sales).getByText('120 min / mois')).toBeTruthy();
    expect(within(def).getByText(t.quotaPillUnlimited)).toBeTruthy();
  });
});

describe('GroupsTab — glisser-déposer', () => {
  const salesGrows = () =>
    changeGroupMembers.mockImplementation(async (id, { add = [] }) => ({
      ok: true,
      data: { group: { ...SALES, memberCount: 1 + add.length }, added: add.length, removed: 0 },
    }));

  it('glisser un compte sur une carte l ajoute au groupe, et la carte suit', async () => {
    salesGrows();
    render(GroupsTab);
    const paul = await personRow('paul@exemple.fr');
    const dataTransfer = transfer();

    await fireEvent.dragStart(paul, { dataTransfer });
    // Firefox ne glisse rien sans donnée attachée.
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'paul@exemple.fr');
    // Chaque carte dit ce qu'elle fera : Paul est déjà dans Défaut.
    expect(within(cardOf('Défaut')).getByText(t.dropAlready)).toBeTruthy();
    const sales = cardOf('Commerciaux');
    expect(within(sales).getByText(t.dropHere)).toBeTruthy();

    // Survol accepté : l'événement est annulé, la carte invite à relâcher.
    expect(await fireEvent.dragOver(sales, { dataTransfer })).toBe(false);
    expect(within(sales).getByText(t.dropRelease)).toBeTruthy();
    await fireEvent.drop(sales, { dataTransfer });
    await fireEvent.dragEnd(paul, { dataTransfer });

    expect(changeGroupMembers).toHaveBeenCalledWith('g-sales', { add: ['paul@exemple.fr'] });
    await screen.findByText(fill(t.addedTo, { name: 'paul', group: 'Commerciaux' }));
    // L'effectif du serveur, et le nouveau membre en tête de la pile d'avatars.
    const card = cardOf('Commerciaux');
    expect(within(card).getByText(t.membersMany.replace('{n}', '2'))).toBeTruthy();
    expect(
      within(card)
        .getAllByTitle(/^(paul|zoe)$/)[0]
        .getAttribute('title'),
    ).toBe('paul');
    // Plus rien en main : les cibles ont disparu.
    expect(screen.queryByText(t.dropAlready)).toBeNull();
  });

  it('une carte refuse le compte qui en est déjà membre', async () => {
    render(GroupsTab);
    const zoe = await personRow('zoe@exemple.fr');
    const dataTransfer = transfer();

    await fireEvent.dragStart(zoe, { dataTransfer });
    const sales = cardOf('Commerciaux');
    expect(within(sales).getByText(t.dropAlready)).toBeTruthy();
    // Survol NON annulé : le navigateur montre « interdit » et ne dépose pas.
    expect(await fireEvent.dragOver(sales, { dataTransfer })).toBe(true);
    await fireEvent.drop(sales, { dataTransfer });

    expect(changeGroupMembers).not.toHaveBeenCalled();
  });

  it('sans souris : sélectionner le compte, puis choisir la carte', async () => {
    salesGrows();
    render(GroupsTab);
    const paul = await personRow('paul@exemple.fr');

    await userEvent.click(paul);
    expect(paul.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(fill(t.pickedHint, { name: 'paul' }))).toBeTruthy();
    // Déjà dans Défaut : la carte le dit, et n'offre pas d'ajout.
    expect(within(cardOf('Défaut')).getByText(t.dropAlready)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: fill(t.dropAddTo, { name: 'paul', group: 'Défaut' }) }),
    ).toBeNull();

    await userEvent.click(
      screen.getByRole('button', {
        name: fill(t.dropAddTo, { name: 'paul', group: 'Commerciaux' }),
      }),
    );
    expect(changeGroupMembers).toHaveBeenCalledWith('g-sales', { add: ['paul@exemple.fr'] });
    await screen.findByText(fill(t.addedTo, { name: 'paul', group: 'Commerciaux' }));
    expect(paul.getAttribute('aria-pressed')).toBe('false');
  });

  it('au clavier : Entrée envoie vers le premier groupe possible, Échap ramène au compte', async () => {
    render(GroupsTab);
    const paul = await personRow('paul@exemple.fr');
    paul.focus();

    await userEvent.keyboard('{Enter}');
    const add = screen.getByRole('button', {
      name: fill(t.dropAddTo, { name: 'paul', group: 'Commerciaux' }),
    });
    await waitFor(() => expect(document.activeElement).toBe(add));

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(t.dropAlready)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(paul));
    expect(changeGroupMembers).not.toHaveBeenCalled();
  });

  it('un refus du serveur s annonce, et la carte ne bouge pas', async () => {
    changeGroupMembers.mockResolvedValue({
      ok: false,
      status: 404,
      data: { error: 'user_not_found' },
    });
    render(GroupsTab);
    const paul = await personRow('paul@exemple.fr');
    await userEvent.click(paul);
    await userEvent.click(
      screen.getByRole('button', {
        name: fill(t.dropAddTo, { name: 'paul', group: 'Commerciaux' }),
      }),
    );

    await screen.findByText(t.errors.user_not_found);
    expect(within(cardOf('Commerciaux')).getByText(t.membersOne)).toBeTruthy();
  });

  it('les cartes montrent leurs membres, et le reste de l effectif du serveur', async () => {
    render(GroupsTab);
    await personRow('paul@exemple.fr');
    // Défaut compte 3 membres au serveur, 2 sont chargés : 2 visages et « +1 ».
    const def = cardOf('Défaut');
    expect(within(def).getByTitle('paul').textContent).toBe('P');
    expect(within(def).getByTitle('zoe').textContent).toBe('Z');
    expect(within(def).getByText('+1')).toBeTruthy();
  });

  it('la recherche filtre la colonne', async () => {
    render(GroupsTab);
    await personRow('paul@exemple.fr');
    await userEvent.type(screen.getByLabelText(t.peopleSearch), 'zo');
    expect(screen.queryByText('paul@exemple.fr')).toBeNull();
    expect(screen.getByText('zoe@exemple.fr')).toBeTruthy();
  });

  it('colonne tronquée : la recherche interroge aussi le serveur', async () => {
    listUsers.mockImplementation(async ({ group, q } = {}) => {
      if (group) return { ok: true, data: { users: members[group] || [], total: 0 } };
      if (q) return { ok: true, data: { users: [user('zelie@exemple.fr')], total: 1 } };
      return { ok: true, data: { users: accounts, total: 250 } };
    });
    render(GroupsTab);
    await screen.findByText(fill(t.peopleTruncated, { shown: 2, total: 250 }));

    await userEvent.type(screen.getByLabelText(t.peopleSearch), 'zel');
    await screen.findByText('zelie@exemple.fr');
    expect(listUsers).toHaveBeenCalledWith({ q: 'zel', limit: 50 });
  });
});

describe('GroupsTab — droit aux infographies', () => {
  it('la carte porte la pastille du droit, seulement quand le groupe le donne', async () => {
    render(GroupsTab);
    await screen.findByText('Commerciaux');
    expect(within(cardOf('Défaut')).getByText(t.infographicPill)).toBeTruthy();
    expect(within(cardOf('Commerciaux')).queryByText(t.infographicPill)).toBeNull();
  });

  it('le formulaire envoie le droit, et prévient quand l onglet IA a coupé l infographie', async () => {
    updateGroup.mockResolvedValue({ ok: true, data: { group: { ...SALES } } });
    setInfographicOffered(false);
    render(GroupsTab);
    await screen.findByText('Commerciaux');

    await userEvent.click(screen.getByRole('button', { name: `${t.editTitle} : Commerciaux` }));
    const right = screen.getByRole('checkbox', { name: t.infographicLabel });
    expect(right.checked).toBe(false);
    await userEvent.click(right);
    // Droit donné, mais l'onglet IA ne propose pas l'infographie : on le dit.
    expect(screen.getByText(t.infographicGlobalOff)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    expect(updateGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g-sales', infographicAllowed: true }),
    );
  });

  it('sans objet quand l onglet IA propose l infographie', async () => {
    setInfographicOffered(true);
    render(GroupsTab);
    await screen.findByText('Commerciaux');
    await userEvent.click(screen.getByRole('button', { name: `${t.editTitle} : Défaut` }));
    expect(screen.getByRole('checkbox', { name: t.infographicLabel }).checked).toBe(true);
    expect(screen.queryByText(t.infographicGlobalOff)).toBeNull();
  });
});

describe('GroupsTab — quota de minutes', () => {
  it('le formulaire envoie le quota limité, et null pour « Illimité »', async () => {
    updateGroup.mockResolvedValue({ ok: true, data: { group: { ...SALES } } });
    render(GroupsTab);
    await screen.findByText('Commerciaux');

    await userEvent.click(screen.getByRole('button', { name: `${t.editTitle} : Commerciaux` }));
    // Le groupe est limité : le nombre est là, saisissable.
    const minutes = screen.getByRole('spinbutton', { name: t.quotaMinutesLabel });
    expect(minutes.value).toBe('120');
    expect(minutes.disabled).toBe(false);
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '90');
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    expect(updateGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g-sales', meetingMinutesPerMonth: 90 }),
    );

    // Retour au formulaire : « Illimité » envoie null et fige le nombre.
    await screen.findByText('Commerciaux');
    await userEvent.click(screen.getByRole('button', { name: `${t.editTitle} : Commerciaux` }));
    await userEvent.click(screen.getByRole('radio', { name: t.quotaUnlimited }));
    expect(screen.getByRole('spinbutton', { name: t.quotaMinutesLabel }).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    expect(updateGroup).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'g-sales', meetingMinutesPerMonth: null }),
    );
  });

  it('limité sans nombre : refus avant l envoi', async () => {
    render(GroupsTab);
    await screen.findByText('Commerciaux');
    await userEvent.click(screen.getByRole('button', { name: `${t.editTitle} : Commerciaux` }));
    await userEvent.clear(screen.getByRole('spinbutton', { name: t.quotaMinutesLabel }));
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    await screen.findByText(t.errors.quota_required);
    expect(updateGroup).not.toHaveBeenCalled();
  });
});

describe('GroupsTab — création', () => {
  it('crée le groupe avec nom, description et couleur, puis ouvre ses membres', async () => {
    const created = {
      id: 'g-dir',
      name: 'Direction',
      description: 'Le comité.',
      color: 'violet',
      isDefault: false,
      memberCount: 0,
    };
    createGroup.mockImplementation(async () => {
      catalogue = [...catalogue, created];
      return { ok: true, data: { group: created } };
    });
    render(GroupsTab);
    await screen.findByText('Commerciaux');

    await userEvent.click(screen.getByRole('button', { name: /Nouveau groupe/ }));
    await userEvent.type(screen.getByLabelText(t.nameLabel), 'Direction');
    await userEvent.type(screen.getByLabelText(t.descriptionLabel), 'Le comité.');
    await userEvent.click(screen.getByRole('radio', { name: 'violet' }));
    await userEvent.click(screen.getByRole('button', { name: t.save }));

    expect(createGroup).toHaveBeenCalledWith({
      name: 'Direction',
      description: 'Le comité.',
      color: 'violet',
      meetingMinutesPerMonth: null,
      // Un groupe neuf naît sans droit : il se donne explicitement.
      infographicAllowed: false,
    });
    // On crée un groupe pour y mettre des gens : la fiche des membres s'ouvre.
    await screen.findByText(t.noMembers);
    expect(listUsers).toHaveBeenCalledWith({ group: 'g-dir', limit: 200 });
  });

  it('affiche le refus du serveur dans le formulaire', async () => {
    createGroup.mockResolvedValue({ ok: false, status: 409, data: { error: 'duplicate_name' } });
    render(GroupsTab);
    await screen.findByText('Commerciaux');

    await userEvent.click(screen.getByRole('button', { name: /Nouveau groupe/ }));
    await userEvent.type(screen.getByLabelText(t.nameLabel), 'Commerciaux');
    await userEvent.click(screen.getByRole('button', { name: t.save }));

    await screen.findByText(t.errors.duplicate_name);
  });
});

describe('GroupsTab — membres', () => {
  it('liste les membres et retire un compte du groupe', async () => {
    changeGroupMembers.mockImplementation(async (id, { remove = [] }) => {
      members[id] = members[id].filter((u) => !remove.includes(u.email));
      return { ok: true, data: { group: { ...SALES, memberCount: 0 }, added: 0, removed: 1 } };
    });
    render(GroupsTab);
    await screen.findByText('Commerciaux');
    await userEvent.click(openMembersOf('Commerciaux'));

    await screen.findByText('zoe@exemple.fr');
    await userEvent.click(screen.getByRole('button', { name: `${t.remove} : zoe@exemple.fr` }));

    expect(changeGroupMembers).toHaveBeenCalledWith('g-sales', { remove: ['zoe@exemple.fr'] });
    await screen.findByText(t.noMembers);
  });

  it('dans le groupe par défaut, un compte qui n a pas d autre groupe ne se retire pas', async () => {
    render(GroupsTab);
    await screen.findByText('Commerciaux');
    await userEvent.click(openMembersOf('Défaut'));

    await screen.findByText('paul@exemple.fr');
    // Paul n'est que dans Défaut : le serveur l'y remettrait, l'écran ne propose pas le geste.
    expect(screen.getByRole('button', { name: `${t.remove} : paul@exemple.fr` }).disabled).toBe(
      true,
    );
    // Zoé est aussi dans Commerciaux : elle peut quitter le groupe par défaut.
    expect(screen.getByRole('button', { name: `${t.remove} : zoe@exemple.fr` }).disabled).toBe(
      false,
    );
  });

  it('la recherche écarte les membres déjà présents et ajoute le compte choisi', async () => {
    changeGroupMembers.mockImplementation(async (id, { add = [] }) => {
      members[id] = [...members[id], ...found.filter((u) => add.includes(u.email))];
      return { ok: true, data: { group: { ...SALES, memberCount: 2 }, added: 1, removed: 0 } };
    });
    render(GroupsTab);
    await screen.findByText('Commerciaux');
    await userEvent.click(openMembersOf('Commerciaux'));
    await screen.findByText('zoe@exemple.fr');

    await userEvent.type(screen.getByLabelText(t.addMemberLabel), 'pau');
    // Zoé est déjà membre : seul Paul est proposé.
    const candidate = (await screen.findByText('paul@exemple.fr')).closest('.gm-candidate');
    expect(document.querySelectorAll('.gm-candidate')).toHaveLength(1);
    await userEvent.click(within(candidate).getByRole('button'));

    expect(changeGroupMembers).toHaveBeenCalledWith('g-sales', { add: ['paul@exemple.fr'] });
    await waitFor(() => expect(document.querySelectorAll('.gm-row')).toHaveLength(2));
  });
});

describe('GroupsTab — suppression', () => {
  it('confirme en nommant le groupe où retombent les membres, puis supprime', async () => {
    deleteGroup.mockImplementation(async () => {
      catalogue = [DEFAULT];
      return { ok: true, status: 204, data: {} };
    });
    render(GroupsTab);
    await screen.findByText('Commerciaux');

    await userEvent.click(screen.getByRole('button', { name: `${t.deleteButton} : Commerciaux` }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/« Commerciaux »/)).toBeTruthy();
    expect(within(dialog).getByText(/« Défaut »/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: t.deleteConfirm }));

    expect(deleteGroup).toHaveBeenCalledWith('g-sales');
    await waitFor(() => expect(screen.queryByText('Commerciaux')).toBeNull());
  });
});
