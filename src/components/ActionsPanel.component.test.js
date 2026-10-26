/**
 * Panneau « Actions détectées ».
 *
 * Ce qui compte ici : pendant l'enregistrement le panneau se montre AVANT
 * d'avoir quoi que ce soit à montrer (état « à l'écoute » et indicateur
 * d'analyse — c'est ce qui dit aux participants que la détection tourne), et
 * les marqueurs d'animation d'une action créée ou affinée atterrissent bien
 * sur la BONNE carte : la liste est keyée par id parce que les nouvelles
 * actions sont ajoutées en tête.
 *
 * Et une action masquée n'est pas perdue : elle se retrouve sous « Actions
 * masquées », d'où elle se rétablit. Une carte vierge montre des
 * placeholders, jamais un faux texte.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const ActionsPanel = (await import('./ActionsPanel.svelte')).default;

const uiText = {
  actions: {
    detectedTitle: 'Actions détectées',
    actionPlaceholder: 'Action…',
    ownerPlaceholder: 'À définir',
    manualEditHint: 'Cliquez pour éditer la description...',
    emptyMessage: 'Les actions détectées apparaîtront ici.',
    listeningMessage: 'À l’écoute des actions…',
    analysisLabel: 'Analyse en cours…',
    collapsePanel: 'Réduire les actions',
    expandPanel: 'Afficher les actions',
    hiddenToggle: 'Actions masquées ({count})',
    restoreAction: 'Rétablir',
    restoreActionLabel: 'Rétablir l’action « {title} »',
    untitledAction: 'Action sans titre',
  },
};

const texts = {
  buttons: { addAction: 'Ajouter une action', hideAction: 'Masquer l’action' },
};

const action = (over = {}) => ({
  id: 1,
  title: 'Relancer INITECH',
  owner: 'Alex',
  dueDate: '2026-08-21',
  description: 'Appeler le contact commercial',
  show: true,
  ...over,
});

const props = (over = {}) => ({
  actions: [],
  countsLabel: 'Actions : 0 visibles · 0 masquées',
  uiText,
  texts,
  ...over,
});

describe('ActionsPanel', () => {
  it('affiche les actions, la plus récente en tête', () => {
    render(ActionsPanel, {
      props: props({
        actions: [action({ id: 2, title: 'Envoyer le devis' }), action()],
      }),
    });

    const titles = screen.getAllByPlaceholderText('Action…');
    expect(titles.map((i) => i.value)).toEqual(['Envoyer le devis', 'Relancer INITECH']);
  });

  it('pendant l’enregistrement, se montre sans action avec l’état « à l’écoute »', () => {
    render(ActionsPanel, { props: props({ listening: true }) });

    expect(screen.getByText('À l’écoute des actions…')).toBeTruthy();
    expect(screen.queryByText('Les actions détectées apparaîtront ici.')).toBeNull();
  });

  it('hors enregistrement, garde le message d’attente d’origine', () => {
    render(ActionsPanel, { props: props({ listening: false }) });

    expect(screen.getByText('Les actions détectées apparaîtront ici.')).toBeTruthy();
    expect(screen.queryByText('À l’écoute des actions…')).toBeNull();
  });

  it('signale une analyse en cours, et seulement quand elle tourne', async () => {
    const { rerender } = render(ActionsPanel, {
      props: props({ listening: true, analysisActive: true }),
    });
    expect(screen.getByRole('status', { name: 'Analyse en cours…' })).toBeTruthy();

    await rerender(props({ listening: true, analysisActive: false }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('marque la carte créée et la carte affinée, chacune la sienne', () => {
    const { container } = render(ActionsPanel, {
      props: props({
        actions: [
          action({ id: 3, title: 'Réserver la salle', flash: 'new' }),
          action({ id: 2, title: 'Envoyer le devis', flash: 'updated', updatedFields: ['owner'] }),
          action(),
        ],
      }),
    });

    const cards = container.querySelectorAll('.ap-card');
    expect(cards[0].classList.contains('ap-card-flash-new')).toBe(true);
    expect(cards[1].classList.contains('ap-card-flash-updated')).toBe(true);
    // La carte intacte ne porte aucun marqueur.
    expect(cards[2].className).not.toContain('flash');
    // Le champ précisé s'éclaire, pas les autres.
    expect(cards[1].querySelector('.ap-owner-input').classList.contains('ap-field-updated')).toBe(
      true,
    );
    expect(cards[1].querySelector('.ap-title-input').classList.contains('ap-field-updated')).toBe(
      false,
    );
  });

  it('remonte le masquage et l’ajout manuel', async () => {
    const onRemove = vi.fn();
    const onAddManual = vi.fn();
    const target = action();
    render(ActionsPanel, { props: props({ actions: [target], onRemove, onAddManual }) });

    // « Masquer », pas « Supprimer » : le compteur parle d'actions masquées,
    // et l'action se rétablit.
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Masquer l’action' }));
    expect(onRemove).toHaveBeenCalledWith(target);

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une action' }));
    expect(onAddManual).toHaveBeenCalled();
  });

  it('une carte vierge montre des placeholders, jamais un faux texte', () => {
    const { container } = render(ActionsPanel, {
      props: props({
        actions: [action({ title: '', owner: '', dueDate: '', description: '' })],
      }),
    });
    const title = container.querySelector('.ap-title-input');
    const owner = container.querySelector('.ap-owner-input');
    const desc = container.querySelector('.ap-desc');
    expect([title.value, owner.value, desc.value]).toEqual(['', '', '']);
    expect(title.placeholder).toBe('Action…');
    expect(owner.placeholder).toBe('À définir');
    expect(desc.placeholder).toBe('Cliquez pour éditer la description...');
  });

  it('liste les actions masquées, repliées, et rétablit celle choisie', async () => {
    const onRestore = vi.fn();
    const hidden = action({ id: 7, title: 'Écrire au notaire', show: false });
    render(ActionsPanel, {
      props: props({
        actions: [action()],
        hiddenActions: [hidden, action({ id: 8, title: '', description: '', show: false })],
        onRestore,
      }),
    });

    // Repliée par défaut : la liste ne pousse pas les cartes vers le bas.
    const toggle = screen.getByRole('button', { name: /Actions masquées \(2\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Écrire au notaire')).toBeNull();

    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Écrire au notaire')).toBeTruthy();
    // Une masquée sans titre ni description reste désignable.
    expect(screen.getByText('Action sans titre')).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Rétablir l’action « Écrire au notaire »' }),
    );
    expect(onRestore).toHaveBeenCalledWith(hidden);
  });

  it('sans action masquée, aucune section « Actions masquées »', () => {
    render(ActionsPanel, { props: props({ actions: [action()], hiddenActions: [] }) });
    expect(screen.queryByRole('button', { name: /Actions masquées/ })).toBeNull();
  });

  it('replie le panneau et propose l’ajout depuis le rail', async () => {
    const onToggleCollapsed = vi.fn();
    const onAddFromCollapsed = vi.fn();
    const { container } = render(ActionsPanel, {
      props: props({ collapsed: true, onToggleCollapsed, onAddFromCollapsed }),
    });

    expect(container.querySelector('.actions-panel-new').classList.contains('ap-collapsed')).toBe(
      true,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Afficher les actions' }));
    expect(onToggleCollapsed).toHaveBeenCalled();

    // Le bouton d'ajout du contenu reste dans le DOM (masqué en CSS quand le
    // panneau est replié) : c'est bien celui du rail qui est visé ici.
    await userEvent.click(container.querySelector('.ap-collapsed-add'));
    expect(onAddFromCollapsed).toHaveBeenCalled();
  });

  it('échappe au fondu bas pendant l’enregistrement', () => {
    // Le voile `.main-area::after` (z 40) délave tout ce qui touche le bas de
    // la zone principale ; le panneau live doit passer au-dessus.
    const { container } = render(ActionsPanel, { props: props({ listening: true }) });
    expect(container.querySelector('.actions-panel-new').classList.contains('ap-live')).toBe(true);
  });
});
