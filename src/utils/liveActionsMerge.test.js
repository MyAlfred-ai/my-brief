import { describe, it, expect } from 'vitest';
import {
  ensureActionIds,
  splitActionsForPrompt,
  mergeDetectedActions,
  clearActionFlashes,
  normalizeActions,
  toStoredActions,
  prependManualAction,
  setActionShown,
  hasActionContent,
  MAX_UPDATE_WORDS,
} from './liveActionsMerge.js';

const OWNER_PLACEHOLDER = 'À définir';
const DESC_PLACEHOLDER = "Description de l'action...";
const TITLE_PLACEHOLDER = 'Nouvelle action';

const defaults = {
  title: TITLE_PLACEHOLDER,
  owner: OWNER_PLACEHOLDER,
  description: DESC_PLACEHOLDER,
};

const action = (over = {}) => ({
  id: 1,
  title: 'Relancer INITECH',
  owner: 'Alex',
  dueDate: '2026-08-21',
  description: 'Appeler le contact commercial',
  newBadge: 'AI',
  show: true,
  ...over,
});

const merge = (current, incoming, over = {}) =>
  mergeDetectedActions(current, incoming, { idCounter: 1, defaults, now: 1000, ...over });

describe('ensureActionIds', () => {
  it('attribue un id aux actions qui n’en ont pas', () => {
    const { actions, idCounter } = ensureActionIds([{ title: 'a' }, { title: 'b' }]);
    expect(actions.map((a) => a.id)).toEqual([1, 2]);
    expect(idCounter).toBe(2);
  });

  it('repart après le plus grand id existant', () => {
    const { actions, idCounter } = ensureActionIds([{ id: 7, title: 'a' }, { title: 'b' }]);
    expect(actions[1].id).toBe(8);
    expect(idCounter).toBe(8);
  });

  it('renvoie le tableau d’origine si tout est déjà identifié', () => {
    const input = [action()];
    expect(ensureActionIds(input).actions).toBe(input);
  });

  it('redonne un id neuf à un doublon — deux clés égales cassent le rendu keyé', () => {
    const { actions, idCounter } = ensureActionIds([
      action({ id: 1 }),
      action({ id: 1, title: 'Doublon' }),
    ]);
    expect(actions.map((a) => a.id)).toEqual([1, 2]);
    expect(actions[1].title).toBe('Doublon');
    expect(idCounter).toBe(2);
  });
});

describe('textes de remplacement — jamais écrits comme de vraies valeurs', () => {
  it('normalizeActions vide ceux d’autrefois, FR comme EN, et garde le reste', () => {
    const legacy = {
      id: 1,
      title: 'Nouvelle action',
      owner: 'To be decided',
      dueDate: '',
      description: "Description de l'action...",
      newBadge: 'Manual',
      show: true,
    };
    const kept = action({ id: 2 });
    const { actions } = normalizeActions([legacy, kept]);
    expect(actions[0]).toEqual({ ...legacy, title: '', owner: '', description: '' });
    expect(actions[1]).toBe(kept);
  });

  it('normalizeActions rend le tableau d’origine quand il n’y a rien à faire', () => {
    const input = [action()];
    expect(normalizeActions(input).actions).toBe(input);
  });

  it('toStoredActions : sans animation, échéance normalisée, placeholders vidés, masquées gardées', () => {
    const stored = toStoredActions([
      action({ flash: 'new', flashAt: 3, updatedFields: ['owner'], dueDate: '22/08/2026' }),
      action({ id: 2, owner: 'À définir', description: 'Action description...', show: false }),
    ]);
    expect(stored[0]).toEqual({ ...action(), dueDate: '2026-08-22' });
    expect(stored[1]).toMatchObject({ id: 2, owner: '', description: '', show: false });
  });

  it('toStoredActions rend un instantané : modifier la carte ensuite ne le change pas', () => {
    const card = action();
    const [stored] = toStoredActions([card]);
    card.title = 'Modifié après coup';
    expect(stored.title).toBe('Relancer INITECH');
  });

  it('hasActionContent : une carte vierge ou faite de textes de remplacement ne dit rien', () => {
    expect(hasActionContent({ title: '', owner: '', dueDate: '', description: '' })).toBe(false);
    expect(hasActionContent({ title: 'Nouvelle action', owner: 'À définir' })).toBe(false);
    expect(hasActionContent({ title: '', dueDate: '2026-09-18' })).toBe(true);
  });

  it('une création du modèle aux champs vides les laisse VIDES', () => {
    const { actions } = merge([], [{ title: 'Réserver la salle', owner: '', description: '' }]);
    expect(actions[0]).toMatchObject({ title: 'Réserver la salle', owner: '', description: '' });
  });

  it('un placeholder d’autrefois renvoyé par le modèle compte pour vide, sans le passer', () => {
    const { actions, updatedIds } = mergeDetectedActions(
      [action({ owner: 'Alex' })],
      [{ id: 1, owner: 'À définir' }],
      { idCounter: 1 },
    );
    expect(actions[0].owner).toBe('Alex');
    expect(updatedIds).toEqual([]);
  });
});

describe('prependManualAction', () => {
  it('ajoute en tête une carte vierge — aucun texte écrit à la place de l’utilisateur', () => {
    const { actions, idCounter } = prependManualAction([action()], 1);
    expect(actions[0]).toEqual({
      id: 2,
      title: '',
      owner: '',
      dueDate: '',
      description: '',
      newBadge: 'Manual',
      show: true,
    });
    expect(actions[1]).toEqual(action());
    expect(idCounter).toBe(2);
  });

  it('compteur en arrière (réunion rouverte) : l’id repart du plus grand de la liste', () => {
    const { actions } = prependManualAction([action({ id: 5 }), action({ id: 9 })], 0);
    expect(actions[0].id).toBe(10);
  });
});

describe('setActionShown — masquer et rétablir', () => {
  it('masque puis rétablit, par id, sans muter l’origine', () => {
    const original = action({ id: 4 });
    const hidden = setActionShown([action(), original], { id: 4 }, false);
    expect(hidden[1]).toMatchObject({ id: 4, show: false });
    expect(original.show).toBe(true);
    expect(hidden[0]).toEqual(action());

    const back = setActionShown(hidden, hidden[1], true);
    expect(back[1].show).toBe(true);
  });

  it('rend le tableau d’origine quand rien ne change', () => {
    const list = [action()];
    expect(setActionShown(list, list[0], true)).toBe(list);
    expect(setActionShown(list, { id: 99 }, false)).toBe(list);
  });
});

describe('splitActionsForPrompt', () => {
  const placeholders = {
    ownerPlaceholder: OWNER_PLACEHOLDER,
    descriptionPlaceholder: DESC_PLACEHOLDER,
  };

  it('n’envoie que les champs utiles au modèle', () => {
    const { active } = splitActionsForPrompt([action({ flash: 'new', flashAt: 5 })], placeholders);
    expect(active).toEqual([
      {
        id: 1,
        title: 'Relancer INITECH',
        owner: 'Alex',
        dueDate: '2026-08-21',
        description: 'Appeler le contact commercial',
      },
    ]);
  });

  it('remplace les textes de remplacement par du vide', () => {
    const { active } = splitActionsForPrompt(
      [action({ owner: OWNER_PLACEHOLDER, description: DESC_PLACEHOLDER })],
      placeholders,
    );
    expect(active[0].owner).toBe('');
    expect(active[0].description).toBe('');
  });

  it('sépare les actions supprimées, sans leur id', () => {
    const { active, dismissed } = splitActionsForPrompt(
      [action(), action({ id: 2, title: 'Écrire au notaire', show: false })],
      placeholders,
    );
    expect(active).toHaveLength(1);
    expect(dismissed).toEqual([
      { title: 'Écrire au notaire', description: 'Appeler le contact commercial' },
    ]);
  });

  it('reconnaît les textes de remplacement d’autrefois sans qu’on les lui passe', () => {
    const { active } = splitActionsForPrompt([action({ owner: 'To be decided' })]);
    expect(active[0].owner).toBe('');
  });

  it('n’envoie pas une carte vierge : le modèle n’a rien à y affiner', () => {
    const blank = { id: 2, title: '', owner: '', dueDate: '', description: '', show: true };
    const { active, dismissed } = splitActionsForPrompt([blank, action()]);
    expect(active.map((a) => a.id)).toEqual([1]);
    expect(dismissed).toEqual([]);
  });
});

describe('mergeDetectedActions — créations', () => {
  it('ajoute une action neuve en tête, marquée pour l’animation', () => {
    const { actions, createdIds, idCounter } = merge(
      [action()],
      [{ title: 'Envoyer le devis', owner: 'Marie', dueDate: '2026-08-22' }],
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      id: 2,
      title: 'Envoyer le devis',
      owner: 'Marie',
      newBadge: 'AI',
      show: true,
      flash: 'new',
      flashAt: 1000,
    });
    expect(createdIds).toEqual([2]);
    expect(idCounter).toBe(2);
  });

  it('jette un id inventé par le modèle et attribue un id du compteur', () => {
    const { actions, createdIds } = merge([action()], [{ id: 999, title: 'Réserver la salle' }]);
    expect(actions[0].id).toBe(2);
    expect(createdIds).toEqual([2]);
  });

  it('compteur en arrière de la liste : la création ne reprend pas un id existant', () => {
    const { actions, createdIds } = merge([action({ id: 6 })], [{ title: 'Réserver la salle' }], {
      idCounter: 0,
    });
    expect(createdIds).toEqual([7]);
    expect(actions.map((a) => a.id)).toEqual([7, 6]);
  });

  it('normalise la date d’échéance', () => {
    const { actions } = merge([], [{ title: 'Point budget', dueDate: '22/08/2026' }]);
    expect(actions[0].dueDate).toBe('2026-08-22');
  });

  it('ignore les entrées qui ne sont pas des objets', () => {
    const current = [action()];
    const { actions, createdIds } = merge(current, ['bruit', null, 42, ['x']]);
    expect(actions).toBe(current);
    expect(createdIds).toEqual([]);
  });
});

describe('mergeDetectedActions — mises à jour', () => {
  it('met à jour par id et liste les champs modifiés', () => {
    const { actions, updatedIds, createdIds } = merge(
      [action({ owner: OWNER_PLACEHOLDER })],
      [{ id: 1, title: 'Relancer INITECH', owner: 'Marie', dueDate: '2026-08-21' }],
    );

    expect(createdIds).toEqual([]);
    expect(updatedIds).toEqual([1]);
    expect(actions[0]).toMatchObject({
      owner: 'Marie',
      flash: 'updated',
      flashAt: 1000,
      updatedFields: ['owner'],
    });
  });

  it('n’écrase pas une valeur saisie par une valeur vide du modèle', () => {
    const { actions, updatedIds } = merge(
      [action({ owner: 'Alex' })],
      [{ id: 1, owner: '', dueDate: '' }],
    );
    expect(actions[0].owner).toBe('Alex');
    expect(updatedIds).toEqual([]);
  });

  it('traite un texte de remplacement comme une valeur vide', () => {
    const { actions, updatedIds } = merge(
      [action({ owner: 'Alex' })],
      [{ id: 1, owner: OWNER_PLACEHOLDER }],
    );
    expect(actions[0].owner).toBe('Alex');
    expect(updatedIds).toEqual([]);
  });

  it('ne fait rien quand le modèle repasse une action inchangée', () => {
    const current = [action()];
    const { actions, updatedIds } = merge(current, [
      {
        id: 1,
        title: 'Relancer INITECH',
        owner: 'Alex',
        description: 'Appeler le contact commercial',
      },
    ]);
    expect(actions).toBe(current);
    expect(updatedIds).toEqual([]);
  });

  it('ne ressuscite pas une action supprimée par l’utilisateur', () => {
    const current = [action({ show: false })];
    const { actions, createdIds, updatedIds } = merge(current, [{ id: 1, owner: 'Marie' }]);
    expect(actions).toBe(current);
    expect(createdIds).toEqual([]);
    expect(updatedIds).toEqual([]);
  });

  it('refuse une description qui enfle — le reste de la mise à jour passe', () => {
    const long = `Appeler le contact commercial. ${'Précision ajoutée : un point de plus. '.repeat(8)}`;
    const { actions, updatedIds } = merge(
      [action({ owner: OWNER_PLACEHOLDER })],
      [{ id: 1, owner: 'Marie', description: long }],
    );
    expect(updatedIds).toEqual([1]);
    expect(actions[0].description).toBe('Appeler le contact commercial');
    expect(actions[0]).toMatchObject({ owner: 'Marie', updatedFields: ['owner'] });
  });

  it('des précisions ajoutées fenêtre après fenêtre ne font pas une carte fourre-tout', () => {
    // Le cas de la recette : le modèle reprend la description existante et y
    // ajoute la phrase qu'il vient d'entendre, à chaque appel.
    let current = [action()];
    for (let i = 1; i <= 20; i++) {
      const previous = current[0].description;
      current = merge(current, [
        { id: 1, description: `${previous} Précision ajoutée : sujet numéro ${i} évoqué.` },
      ]).actions;
    }
    expect(current[0].description.split(/\s+/).length).toBeLessThanOrEqual(
      MAX_UPDATE_WORDS.description,
    );
  });

  it('refuse un porteur qui devient une liste de rôles', () => {
    const { actions, updatedIds } = merge(
      [action({ owner: 'Nicolas' })],
      [
        {
          id: 1,
          owner:
            'sponsors et référents (référent technique : Nicolas) ; Tristan (responsable communication)',
        },
      ],
    );
    expect(actions[0].owner).toBe('Nicolas');
    expect(updatedIds).toEqual([]);
  });

  it('laisse passer une description réécrite de longueur normale', () => {
    const rewritten =
      'Appeler le contact commercial pour fixer la démonstration et lui envoyer la proposition révisée avant la fin du mois';
    const { actions } = merge([action()], [{ id: 1, description: rewritten }]);
    expect(actions[0].description).toBe(rewritten);
  });

  it('rattache par le titre une action redite sans id', () => {
    const { actions, createdIds, updatedIds } = merge(
      [action()],
      [{ title: 'relancer initech !', owner: 'Marie' }],
    );
    expect(actions).toHaveLength(1);
    expect(createdIds).toEqual([]);
    expect(updatedIds).toEqual([1]);
    expect(actions[0].owner).toBe('Marie');
  });
});

describe('mergeDetectedActions — immutabilité', () => {
  it('ne mute jamais le tableau ni les objets d’origine', () => {
    const original = action();
    const current = [original];
    const { actions } = merge(current, [{ id: 1, owner: 'Marie' }]);

    expect(actions).not.toBe(current);
    expect(actions[0]).not.toBe(original);
    expect(original.owner).toBe('Alex');
  });

  it('conserve la référence des cartes non touchées (saisie en cours préservée)', () => {
    const untouched = action({ id: 2, title: 'Écrire au notaire' });
    const { actions } = merge([action(), untouched], [{ id: 1, owner: 'Marie' }]);
    expect(actions.find((a) => a.id === 2)).toBe(untouched);
  });
});

describe('clearActionFlashes', () => {
  it('retire les marqueurs d’animation des actions visées', () => {
    const actions = [action({ flash: 'new', flashAt: 1000 })];
    const cleared = clearActionFlashes(actions, [1]);
    expect(cleared[0].flash).toBeUndefined();
    expect(cleared[0].flashAt).toBeUndefined();
    expect(cleared[0].title).toBe('Relancer INITECH');
  });

  it('laisse intactes les actions non visées', () => {
    const kept = action({ id: 2, flash: 'updated' });
    const cleared = clearActionFlashes([action({ flash: 'new' }), kept], [1]);
    expect(cleared[1]).toBe(kept);
  });

  it('renvoie le tableau d’origine quand il n’y a rien à nettoyer', () => {
    const actions = [action()];
    expect(clearActionFlashes(actions, [1])).toBe(actions);
    expect(clearActionFlashes(actions, [])).toBe(actions);
  });
});
