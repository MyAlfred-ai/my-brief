/**
 * Feuille d'infographie — ce qui se lit des personnes.
 *
 * Le pied NOMME les participants (prénom et nom), il ne les réduit pas à des
 * initiales : on doit pouvoir lire qui était là. Au-delà de huit, la liste
 * s'arrête sur « et N autres ». Les actions gardent le nom du responsable.
 * L'empilement des formes et du texte se vérifie au banc Chromium (jsdom ne
 * met rien en page) — cf. la dernière section d'infographic.css.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import InfographicSheet from './InfographicSheet.svelte';
import { normalizeLayout } from '../../../services/api/lib/infographicLayout.js';

const PEOPLE = [
  'Léa Martin',
  'Hugo Bernard',
  'Nina Lefèvre',
  'Paul Garnier',
  'Sofia Roux',
  'Karim Haddad',
  'Inès Roux',
  'Théo Nguyen',
  'Jade Morel',
  'Marc Duval',
];

function sheet({ participants, language = 'fr' }) {
  const layout = normalizeLayout(
    {
      gabarit: 'bilan',
      titre: 'Sprint 14 : objectifs tenus',
      heros: { valeur: '8/10', libelle: 'objectifs atteints', icone: 'cible' },
      bilan: { reussites: ['Démo réussie'], difficultes: ['Revues lentes'], essais: [] },
      participants,
      prochaineEtape: 'Sprint 15',
    },
    {
      language,
      actions: [{ text: 'Créer le créneau de revue', assignee: 'Ben Nguyen', dueDate: '' }],
    },
  );
  const { container } = render(InfographicSheet, { props: { layout } });
  return container;
}

const foot = (container) => container.querySelector('.ig-people').textContent.replace(/\s+/g, ' ');

describe('InfographicSheet — les personnes', () => {
  it('le pied nomme chaque participant, sans initiales', () => {
    const container = sheet({ participants: PEOPLE.slice(0, 3) });
    expect(foot(container)).toContain('Participants · Léa Martin, Hugo Bernard, Nina Lefèvre');
    expect(container.querySelector('.ig-foot').textContent).not.toMatch(/\bLM\b|\bHB\b/);
  });

  it('au-delà de huit : les huit premiers, puis « et N autres »', () => {
    const fr = foot(sheet({ participants: PEOPLE }));
    expect(fr).toContain('Théo Nguyen et 2 autres');
    expect(fr).not.toContain('Jade Morel');
    expect(foot(sheet({ participants: PEOPLE.slice(0, 9), language: 'en' }))).toContain(
      'Théo Nguyen and 1 other',
    );
  });

  it('une action garde le nom de son responsable, pas ses initiales', () => {
    const action = sheet({ participants: [] }).querySelector('.ig-action');
    expect(action.textContent).toContain('Ben Nguyen');
    expect(action.textContent).not.toMatch(/\bBN\b/);
  });
});
