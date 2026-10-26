/**
 * Onglet « Utilisateurs » — activation depuis la liste, fiche du compte, pages.
 *
 * Ce qui casserait sans ces tests : un interrupteur qui enverrait `disabled`
 * à l'envers (désactiver quelqu'un en voulant l'activer) ; un refus du serveur
 * — dernier administrateur actif, son propre compte — qui laisserait
 * l'interrupteur basculé alors que rien n'a bougé en base ; et un
 * `users.map` remplacé par une mutation en place, invisible pour le `{#each}`
 * keyé (le piège de réactivité déjà rencontré ailleurs).
 *
 * Depuis la liste dense : réinitialiser et supprimer passent par la fiche du
 * compte (la ligne les montre seulement au survol) — une fiche qui les
 * perdrait les rendrait inaccessibles au téléphone. « Afficher la suite »
 * ne doit ni dupliquer une ligne (le `{#each}` keyé lèverait une erreur) ni
 * mélanger deux recherches ; une réponse lente ne doit pas écraser la
 * suivante.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';
import { auth } from '../../stores/auth.js';

const listUsers = vi.fn();
const updateUser = vi.fn();
const createUser = vi.fn();
const resetUserPassword = vi.fn();
const deleteUser = vi.fn();
const listGroups = vi.fn();

vi.mock('../../services/adminUsersApi.js', () => ({
  listUsers: (...a) => listUsers(...a),
  updateUser: (...a) => updateUser(...a),
  createUser: (...a) => createUser(...a),
  resetUserPassword: (...a) => resetUserPassword(...a),
  deleteUser: (...a) => deleteUser(...a),
}));
vi.mock('../../services/adminGroupsApi.js', () => ({
  listGroups: (...a) => listGroups(...a),
}));

const { default: UsersTab } = await import('./UsersTab.svelte');

const t = uiTextData.fr.adminUsers;
const ADMIN = 'chef@exemple.fr';

const GROUPS = [
  { id: 'default', name: 'Défaut', color: 'slate', isDefault: true, memberCount: 1 },
  { id: 'g-sales', name: 'Commerciaux', color: 'blue', isDefault: false, memberCount: 0 },
];

const user = (over = {}) => ({
  email: 'paul@exemple.fr',
  name: 'Paul',
  role: 'user',
  disabled: false,
  hasPassword: true,
  groupIds: ['default'],
  lastConnecion: null,
  ...over,
});

/** L'interrupteur d'une ligne, retrouvé par son nom accessible. */
const toggleFor = (email) => screen.getByRole('checkbox', { name: `${t.activeToggle} — ${email}` });

const fill = (template, values) =>
  Object.entries(values).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, v), template);

/** Ouvre la fiche d'un compte comme à la souris : clic sur son adresse. */
async function openFiche(email) {
  await userEvent.click(await screen.findByText(email));
  return screen.getByRole('heading', { name: t.editTitle });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.set({
    status: 'authenticated',
    user: { email: ADMIN, role: 'admin' },
    capabilities: { passwordPolicy: { minLength: 10 } },
  });
  listUsers.mockResolvedValue({ ok: true, data: { users: [user()], total: 1 } });
  listGroups.mockResolvedValue({
    ok: true,
    data: { groups: GROUPS, colors: ['slate', 'blue'], max: 50, defaultId: 'default' },
  });
});

describe('UsersTab — activation depuis la liste', () => {
  it('coché pour un compte actif, décoché pour un compte désactivé', async () => {
    listUsers.mockResolvedValue({
      ok: true,
      data: { users: [user(), user({ email: 'zoe@exemple.fr', disabled: true })], total: 2 },
    });
    render(UsersTab);

    await waitFor(() => expect(toggleFor('paul@exemple.fr').checked).toBe(true));
    expect(toggleFor('zoe@exemple.fr').checked).toBe(false);
  });

  it('décocher envoie disabled: true et grise la ligne sans recharger la liste', async () => {
    updateUser.mockResolvedValue({ ok: true, data: { user: user({ disabled: true }) } });
    render(UsersTab);
    await waitFor(() => expect(toggleFor('paul@exemple.fr').checked).toBe(true));

    await userEvent.click(toggleFor('paul@exemple.fr'));

    expect(updateUser).toHaveBeenCalledWith({ email: 'paul@exemple.fr', disabled: true });
    // Le badge « Désactivé » apparaît : la ligne a bien pris le retour serveur.
    await screen.findByText(t.disabledBadge);
    // Une seule lecture : celle du montage. La ligne est remplacée sur place.
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it('recocher envoie disabled: false', async () => {
    listUsers.mockResolvedValue({
      ok: true,
      data: { users: [user({ disabled: true })], total: 1 },
    });
    updateUser.mockResolvedValue({ ok: true, data: { user: user({ disabled: false }) } });
    render(UsersTab);
    await waitFor(() => expect(toggleFor('paul@exemple.fr').checked).toBe(false));

    await userEvent.click(toggleFor('paul@exemple.fr'));

    expect(updateUser).toHaveBeenCalledWith({ email: 'paul@exemple.fr', disabled: false });
    await waitFor(() => expect(toggleFor('paul@exemple.fr').checked).toBe(true));
  });

  it('un refus du serveur affiche l’erreur ET remet l’interrupteur en place', async () => {
    updateUser.mockResolvedValue({ ok: false, status: 409, data: { error: 'last_admin' } });
    render(UsersTab);
    await waitFor(() => expect(toggleFor('paul@exemple.fr').checked).toBe(true));

    await userEvent.click(toggleFor('paul@exemple.fr'));

    await screen.findByText(t.errors.last_admin);
    // Rien n'a changé en base : l'interrupteur ne doit pas rester décoché.
    expect(toggleFor('paul@exemple.fr').checked).toBe(true);
    expect(screen.queryByText(t.disabledBadge)).toBeNull();
  });

  it('son propre compte n’est pas désactivable depuis la liste', async () => {
    listUsers.mockResolvedValue({
      ok: true,
      data: { users: [user({ email: ADMIN, role: 'admin' })], total: 1 },
    });
    render(UsersTab);

    await waitFor(() => expect(toggleFor(ADMIN).disabled).toBe(true));
    await userEvent.click(toggleFor(ADMIN));
    expect(updateUser).not.toHaveBeenCalled();
  });
});

/**
 * Groupes sur les comptes : la ligne montre ceux du compte par leur NOM (elle
 * ne reçoit que des identifiants), la fiche les coche et les envoie, et le
 * filtre de la liste interroge le serveur — jamais un tri local sur une page.
 */
describe('UsersTab — groupes', () => {
  it('la ligne nomme les groupes du compte, et ignore un identifiant sans groupe', async () => {
    listUsers.mockResolvedValue({
      ok: true,
      data: { users: [user({ groupIds: ['default', 'g-sales', 'supprime'] })], total: 1 },
    });
    render(UsersTab);

    const row = (await screen.findByText('paul@exemple.fr')).closest('.au-row');
    await waitFor(() => expect(within(row).getByText('Commerciaux')).toBeTruthy());
    expect(within(row).getByText('Défaut')).toBeTruthy();
    expect(row.querySelectorAll('.gc')).toHaveLength(2);
  });

  it('la fiche coche les groupes du compte et envoie la sélection', async () => {
    updateUser.mockResolvedValue({
      ok: true,
      data: { user: user({ groupIds: ['default', 'g-sales'] }) },
    });
    render(UsersTab);
    await screen.findByText('paul@exemple.fr');
    await waitFor(() => expect(listGroups).toHaveBeenCalledTimes(1));

    await openFiche('paul@exemple.fr');
    const sales = screen.getByRole('checkbox', { name: 'Commerciaux' });
    expect(screen.getByRole('checkbox', { name: 'Défaut' }).checked).toBe(true);
    expect(sales.checked).toBe(false);
    await userEvent.click(sales);
    await userEvent.click(screen.getByRole('button', { name: t.save }));

    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'paul@exemple.fr', groupIds: ['default', 'g-sales'] }),
    );
  });

  it('le filtre par groupe recharge la liste depuis le serveur', async () => {
    render(UsersTab);
    await screen.findByText('paul@exemple.fr');
    const filter = await screen.findByRole('combobox', { name: t.groupFilterLabel });

    await userEvent.selectOptions(filter, 'g-sales');

    expect(listUsers).toHaveBeenLastCalledWith({ q: '', group: 'g-sales' });
  });
});

describe('UsersTab — la ligne ouvre la fiche du compte', () => {
  it('un clic sur la ligne, hors des contrôles, ouvre la fiche', async () => {
    render(UsersTab);

    await openFiche('paul@exemple.fr');

    expect(screen.getByLabelText(t.nameLabel).value).toBe('Paul');
  });

  it('au clavier, le nom est le bouton qui ouvre la fiche', async () => {
    render(UsersTab);
    const open = await screen.findByRole('button', { name: `${t.editTitle} : Paul` });

    open.focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('heading', { name: t.editTitle })).toBeTruthy();
  });

  it('l’interrupteur n’ouvre pas la fiche', async () => {
    updateUser.mockResolvedValue({ ok: true, data: { user: user({ disabled: true }) } });
    render(UsersTab);
    await waitFor(() => expect(toggleFor('paul@exemple.fr').checked).toBe(true));

    await userEvent.click(toggleFor('paul@exemple.fr'));

    expect(screen.queryByRole('heading', { name: t.editTitle })).toBeNull();
  });

  it('la fiche porte « Réinitialiser le mot de passe » et « Supprimer le compte »', async () => {
    render(UsersTab);
    await openFiche('paul@exemple.fr');

    expect(screen.getByRole('button', { name: t.resetPassword })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.deleteAccount })).toBeTruthy();
  });

  it('sa propre fiche ne propose pas la suppression', async () => {
    listUsers.mockResolvedValue({
      ok: true,
      data: { users: [user({ email: ADMIN, role: 'admin' })], total: 1 },
    });
    render(UsersTab);
    await openFiche(ADMIN);

    expect(screen.getByRole('button', { name: t.resetPassword })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.deleteAccount })).toBeNull();
  });

  it('réinitialiser depuis la fiche : le mot de passe s’affiche, la fiche suit', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    listUsers.mockResolvedValue({
      ok: true,
      data: { users: [user({ hasPassword: false })], total: 1 },
    });
    resetUserPassword.mockResolvedValue({
      ok: true,
      data: { user: user({ hasPassword: true }), generatedPassword: 'Provisoire-4821' },
    });
    render(UsersTab);
    await openFiche('paul@exemple.fr');
    expect(screen.getByText(t.noPasswordBadge)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: t.resetPassword }));

    expect(resetUserPassword).toHaveBeenCalledWith({ email: 'paul@exemple.fr' });
    await screen.findByText('Provisoire-4821');
    // La fiche reste ouverte derrière, et sait que le compte a un mot de passe.
    expect(screen.getByRole('heading', { name: t.editTitle })).toBeTruthy();
    expect(screen.queryByText(t.noPasswordBadge)).toBeNull();
    confirm.mockRestore();
  });

  it('supprimer depuis la fiche ramène à la liste rechargée', async () => {
    deleteUser.mockResolvedValue({ ok: true, status: 204, data: {} });
    render(UsersTab);
    await openFiche('paul@exemple.fr');

    await userEvent.click(screen.getByRole('button', { name: t.deleteAccount }));
    await userEvent.type(
      screen.getByLabelText(fill(t.deleteConfirmLabel, { email: 'paul@exemple.fr' })),
      'paul@exemple.fr',
    );
    listUsers.mockResolvedValue({ ok: true, data: { users: [], total: 0 } });
    await userEvent.click(screen.getByRole('button', { name: t.deleteConfirm }));

    expect(deleteUser).toHaveBeenCalledWith('paul@exemple.fr', true);
    await screen.findByText(t.empty);
    expect(screen.queryByRole('heading', { name: t.editTitle })).toBeNull();
  });
});

describe('UsersTab — pages et recherche', () => {
  it('« Afficher la suite » ajoute la page suivante, sans doublon', async () => {
    const zoe = user({ email: 'zoe@exemple.fr', name: 'Zoé' });
    listUsers
      .mockResolvedValueOnce({ ok: true, data: { users: [user(), zoe], total: 3 } })
      // Un compte créé entre-temps décale la fenêtre : Zoé revient en tête.
      .mockResolvedValueOnce({
        ok: true,
        data: { users: [zoe, user({ email: 'yves@exemple.fr', name: 'Yves' })], total: 3 },
      });
    render(UsersTab);
    await screen.findByText(fill(t.countPartial, { shown: 2, total: 3 }));

    await userEvent.click(screen.getByRole('button', { name: t.showMore }));

    expect(listUsers).toHaveBeenLastCalledWith({ q: '', group: '', skip: 2 });
    await screen.findByText('yves@exemple.fr');
    expect(screen.getAllByText('zoe@exemple.fr')).toHaveLength(1);
    expect(screen.getByText(fill(t.countMany, { count: 3 }))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.showMore })).toBeNull();
  });

  it('une réponse lente de la recherche n’écrase pas la plus récente', async () => {
    render(UsersTab);
    await screen.findByText('paul@exemple.fr');
    let answerSlow;
    listUsers
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerSlow = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        data: { users: [user({ email: 'zoe@exemple.fr', name: 'Zoé' })], total: 1 },
      });
    const search = screen.getByPlaceholderText(t.searchPlaceholder);

    await userEvent.type(search, 'z');
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2));
    await userEvent.type(search, 'o');
    await screen.findByText('zoe@exemple.fr');
    answerSlow({
      ok: true,
      data: { users: [user({ email: 'zack@exemple.fr', name: 'Zack' })], total: 1 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('zack@exemple.fr')).toBeNull();
    expect(screen.getByText('zoe@exemple.fr')).toBeTruthy();
  });
});
