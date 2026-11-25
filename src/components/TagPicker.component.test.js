/**
 * Sélecteur de tag — trouver et créer sans quitter la réunion.
 *
 * Ce qui compte : on trouve un tag par ce que cite son contexte (pas
 * seulement par son nom), Entrée pose le premier résultat, et un nom inconnu
 * se crée d'un geste puis se pose. Le serveur reste juge du doublon et du
 * plafond : le sélecteur ne propose pas ce qu'il refuserait.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const api = {
  fetchTags: vi.fn(),
  saveTag: vi.fn(),
  saveTagContextRequest: vi.fn(),
  deleteTag: vi.fn(),
  setMeetingTag: vi.fn(),
};
vi.mock('../services/tagsApi.js', () => ({
  fetchTags: (...a) => api.fetchTags(...a),
  saveTag: (...a) => api.saveTag(...a),
  saveTagContextRequest: (...a) => api.saveTagContextRequest(...a),
  deleteTag: (...a) => api.deleteTag(...a),
  setMeetingTag: (...a) => api.setMeetingTag(...a),
}));

const TagPicker = (await import('./TagPicker.svelte')).default;
const { tags, tagsMax, tagColors } = await import('../stores/tags.js');
const { historyItems } = await import('../stores/history.js');

const ok = (data) => ({ ok: true, status: 200, data });
const ko = (status, error) => ({ ok: false, status, data: { error } });

const ATLAS = {
  id: 't-atlas',
  label: 'Projet Atlas',
  color: 'teal',
  context: 'Acteurs : Claire Martin, cliente ; Hugo Bernard, bureau d’études.',
};
const DURAND = { id: 't-durand', label: 'Client Durand', color: 'red' };
const INTERNE = { id: 't-interne', label: 'Interne', color: 'blue' };

const search = () => screen.getByRole('searchbox', { name: 'Rechercher un tag' });
const entries = () =>
  screen.queryAllByRole('menuitemradio').map((el) => el.textContent.replace(/\s+/g, ' ').trim());

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  tags.set([DURAND, INTERNE, ATLAS]);
  tagsMax.set(30);
  tagColors.set(['slate', 'red', 'teal', 'blue', 'green']);
  historyItems.set([]);
});

describe('TagPicker — trouver', () => {
  it('trouve un tag par une personne citée dans son contexte, extrait à l’appui', async () => {
    render(TagPicker, { onPick: vi.fn() });
    await userEvent.type(search(), 'martin');
    expect(entries()).toEqual(['Aucun tag', expect.stringContaining('Projet Atlas')]);
    const mark = document.querySelector('.tp-snippet mark');
    expect(mark.textContent).toBe('Martin');
    expect(document.querySelector('.tp-snippet').textContent).toContain('Claire Martin');
  });

  it('Entrée pose le premier résultat', async () => {
    const onPick = vi.fn();
    render(TagPicker, { onPick });
    await userEvent.type(search(), 'dur{Enter}');
    expect(onPick).toHaveBeenCalledWith('t-durand');
  });

  it('rien ne correspond : on le dit, et on propose de créer', async () => {
    render(TagPicker, { onPick: vi.fn() });
    await userEvent.type(search(), 'Chantier Rives');
    expect(entries()).toEqual(['Aucun tag']);
    expect(screen.getByRole('menuitem', { name: 'Créer « Chantier Rives »' })).toBeTruthy();
  });

  it('à partir de six tags, ceux des dernières réunions passent en tête', async () => {
    const more = ['A', 'B', 'C'].map((l) => ({
      id: `t-${l}`,
      label: `Dossier ${l}`,
      color: 'slate',
    }));
    tags.set([DURAND, INTERNE, ATLAS, ...more]);
    historyItems.set([{ tagId: 't-atlas' }, { tagId: 't-C' }, { tagId: 't-atlas' }]);
    render(TagPicker, { onPick: vi.fn() });
    expect(screen.getByText('Récents')).toBeTruthy();
    expect(screen.getByText('Tous les tags')).toBeTruthy();
    const order = entries();
    expect(order.slice(1, 3)).toEqual(['Projet Atlas', 'Dossier C']);
    // Pas de doublon : un récent n'est pas répété dans « Tous les tags ».
    expect(order.filter((e) => e === 'Projet Atlas')).toHaveLength(1);
  });

  it('sous six tags, une seule liste', () => {
    historyItems.set([{ tagId: 't-atlas' }]);
    render(TagPicker, { onPick: vi.fn() });
    expect(screen.queryByText('Récents')).toBeNull();
  });
});

describe('TagPicker — créer', () => {
  it('crée le tag tapé, avec une pastille libre, et le pose aussitôt', async () => {
    api.saveTag.mockResolvedValue(
      ok({ tag: { id: 't-new', label: 'Chantier Rives', color: 'slate' } }),
    );
    const onPick = vi.fn();
    render(TagPicker, { onPick });
    await userEvent.type(search(), '  Chantier Rives ');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Créer « Chantier Rives »' }));
    // Première couleur que ses tags n'ont pas encore.
    expect(api.saveTag).toHaveBeenCalledWith({ label: 'Chantier Rives', color: 'slate' });
    expect(onPick).toHaveBeenCalledWith('t-new');
  });

  it('Entrée crée quand rien ne correspond', async () => {
    api.saveTag.mockResolvedValue(ok({ tag: { id: 't-new', label: 'Rives', color: 'slate' } }));
    const onPick = vi.fn();
    render(TagPicker, { onPick });
    await userEvent.type(search(), 'Rives{Enter}');
    expect(api.saveTag).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('t-new');
  });

  it('pas de « Créer » pour un nom qui existe déjà — casse et espaces mis à part', async () => {
    render(TagPicker, { onPick: vi.fn() });
    await userEvent.type(search(), 'client   DURAND');
    expect(screen.queryByRole('menuitem', { name: /^Créer/ })).toBeNull();
  });

  it('plafond atteint : « Créer » inactif, et la limite dite', async () => {
    tagsMax.set(3);
    render(TagPicker, { onPick: vi.fn() });
    await userEvent.type(search(), 'Rives');
    expect(screen.getByRole('menuitem', { name: 'Créer « Rives »' }).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Limite atteinte : 3 tags au maximum.');
  });

  it('un refus du serveur s’affiche, rien n’est posé', async () => {
    api.saveTag.mockResolvedValue(ko(409, 'duplicate_label'));
    const onPick = vi.fn();
    render(TagPicker, { onPick });
    await userEvent.type(search(), 'Rives');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Créer « Rives »' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Vous avez déjà un tag portant ce nom.',
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  it('sans création permise, ni « Créer » ni invitation à créer', async () => {
    render(TagPicker, { onPick: vi.fn(), allowCreate: false });
    expect(search().getAttribute('placeholder')).toBe('Rechercher un tag');
    await userEvent.type(search(), 'Rives');
    expect(screen.queryByRole('menuitem', { name: /^Créer/ })).toBeNull();
    expect(screen.getByText('Aucun tag ne correspond.')).toBeTruthy();
  });
});
