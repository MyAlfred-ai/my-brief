import { describe, it, expect } from 'vitest';
import { foldText, searchTags, recentTagIds, tagLabelKey } from './tagSearch.js';

const ATLAS = {
  id: 't-atlas',
  label: 'Projet Atlas',
  context:
    'Rénovation du siège.\n\nActeurs : Claire Martin, cliente ; Hugo Bernard. PAC = pompe à chaleur.',
};
const DURAND = { id: 't-durand', label: 'Client Durand' };
const MARTIN = { id: 't-martin', label: 'Famille Martin' };
const ENERGIE = { id: 't-energie', label: 'Énergie' };

describe('foldText', () => {
  it('ignore casse, accents et espaces en trop', () => {
    expect(foldText('  Énergie   RÉNOVÉE ')).toBe('energie renovee');
  });
});

describe('searchTags', () => {
  it('recherche vide : aucun résultat — l’appelant montre toute la liste', () => {
    expect(searchTags([ATLAS], '   ')).toEqual([]);
  });

  it('le nom qui COMMENCE par la recherche, puis celui qui la contient, puis le contexte', () => {
    const order = searchTags([ATLAS, DURAND, MARTIN], 'mart').map((r) => r.tag.id);
    // « Famille Martin » la contient dans son nom ; « Projet Atlas » par son contexte.
    expect(order).toEqual(['t-martin', 't-atlas']);
    const starts = searchTags([DURAND, { id: 'x', label: 'Durand SA' }], 'durand');
    expect(starts.map((r) => r.tag.id)).toEqual(['x', 't-durand']);
  });

  it('sans accent ni casse : « energie » trouve « Énergie »', () => {
    expect(searchTags([ENERGIE], 'ENERGIE').map((r) => r.tag.id)).toEqual(['t-energie']);
  });

  it('trouvé par le contexte : l’extrait garde le texte tel qu’il est écrit', () => {
    const [hit] = searchTags([ATLAS], 'claire martin');
    expect(hit.snippet.match).toBe('Claire Martin');
    expect(hit.snippet.before).toBe('…du siège. Acteurs : ');
    expect(hit.snippet.after.endsWith('…')).toBe(true);
    // Les retours à la ligne deviennent des espaces : l'extrait tient sur une ligne.
    expect(hit.snippet.before).not.toContain('\n');
  });

  it('un mot accentué du contexte se trouve sans accent, et se rend avec', () => {
    const [hit] = searchTags([ATLAS], 'renovation');
    expect(hit.snippet).toMatchObject({ before: '', match: 'Rénovation' });
  });

  it('trouvé par le nom : pas d’extrait', () => {
    expect(searchTags([ATLAS], 'atlas')[0].snippet).toBeNull();
  });

  it('un tag sans contexte ne répond que par son nom', () => {
    expect(searchTags([DURAND], 'claire')).toEqual([]);
  });
});

describe('tagLabelKey', () => {
  it('compare comme le serveur : casse et espaces neutralisés, accents gardés', () => {
    expect(tagLabelKey('  Client   DURAND ')).toBe(tagLabelKey('client durand'));
    expect(tagLabelKey('Énergie')).not.toBe(tagLabelKey('Energie'));
  });
});

describe('recentTagIds', () => {
  const byId = new Map([ATLAS, DURAND, MARTIN].map((tag) => [tag.id, tag]));

  it('les tags des dernières réunions, sans doublon, du plus récent au plus ancien', () => {
    const items = [
      { tagId: 't-durand' },
      { tagId: null },
      { tagId: 't-durand' },
      { tagId: 't-atlas' },
      { tagId: 't-martin' },
    ];
    expect(recentTagIds(items, byId, 2)).toEqual(['t-durand', 't-atlas']);
  });

  it('un tag supprimé depuis est sauté', () => {
    expect(recentTagIds([{ tagId: 't-supprime' }, { tagId: 't-atlas' }], byId)).toEqual([
      't-atlas',
    ]);
  });
});
