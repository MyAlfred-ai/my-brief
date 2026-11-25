/**
 * Boîte à idées de l'Aide IA (lib/aiHelp/ideas.js) — quand une idée est
 * permise, et ce qui en fait une redite. Fonctions pures : ni base, ni modèle.
 */
import { describe, it, expect } from 'vitest';
import {
  IDEA_GAP_MS,
  IDEA_LOOK_MS,
  IDEA_MIN_CHARS,
  ideaDue,
  repeatsIdea,
} from '../lib/aiHelp/ideas.js';

const NOW = Date.parse('2026-11-25T10:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;
const idea = (at, title = 'Une piste') => ({ kind: 'idea', at, title });
const enough = IDEA_MIN_CHARS;

describe('ideaDue — quand une idée est permise', () => {
  it('jamais en « Discrètes », ni à un niveau inconnu', () => {
    expect(ideaDue({ pace: 'quiet', items: [], material: 50_000, now: NOW })).toBe(false);
    expect(ideaDue({ pace: 'bavard', items: [], material: 50_000, now: NOW })).toBe(false);
  });

  it('pas avant que la réunion ait de quoi la nourrir', () => {
    expect(ideaDue({ pace: 'normal', items: [], material: enough - 1, now: NOW })).toBe(false);
    expect(ideaDue({ pace: 'normal', items: [], material: enough, now: NOW })).toBe(true);
  });

  it('« Normales » : dix minutes au moins entre deux idées', () => {
    expect(IDEA_GAP_MS.normal).toBe(10 * MIN);
    const recent = [idea(ago(9 * MIN))];
    expect(ideaDue({ pace: 'normal', items: recent, material: enough, now: NOW })).toBe(false);
    const old = [idea(ago(10 * MIN))];
    expect(ideaDue({ pace: 'normal', items: old, material: enough, now: NOW })).toBe(true);
  });

  it('« Soutenues » : cinq minutes', () => {
    expect(IDEA_GAP_MS.busy).toBe(5 * MIN);
    const items = [idea(ago(6 * MIN))];
    expect(ideaDue({ pace: 'busy', items, material: enough, now: NOW })).toBe(true);
    expect(ideaDue({ pace: 'normal', items, material: enough, now: NOW })).toBe(false);
  });

  it('seule la DERNIÈRE idée compte ; les autres interventions ne retardent rien', () => {
    const items = [
      idea(ago(30 * MIN)),
      idea(ago(3 * MIN)),
      { kind: 'alert', at: ago(20 * MIN), title: 'Contradiction' },
    ];
    expect(ideaDue({ pace: 'normal', items, material: enough, now: NOW })).toBe(false);
    const others = [{ kind: 'alert', at: ago(1 * MIN), title: 'Contradiction' }];
    expect(ideaDue({ pace: 'normal', items: others, material: enough, now: NOW })).toBe(true);
  });

  it('on ne redemande pas une idée à chaque lecture : deux minutes après la dernière demande', () => {
    expect(IDEA_LOOK_MS).toBe(2 * MIN);
    const base = { pace: 'normal', items: [], material: enough, now: NOW };
    expect(ideaDue({ ...base, lookedAt: ago(1 * MIN) })).toBe(false);
    expect(ideaDue({ ...base, lookedAt: ago(2 * MIN) })).toBe(true);
  });

  it('une date illisible ne bloque rien', () => {
    const items = [idea('pas une date')];
    expect(ideaDue({ pace: 'normal', items, lookedAt: 'n/a', material: enough, now: NOW })).toBe(
      true,
    );
  });
});

describe('repeatsIdea — une idée déjà proposée, dite autrement', () => {
  it('mêmes mots à l’accent, au pluriel et à la casse près', () => {
    expect(
      repeatsIdea('Organiser des tests utilisateurs avant le lancement', [
        'Prévoir un test utilisateur avant lancement',
      ]),
    ).toBe(true);
    expect(
      repeatsIdea('Vérifier le délai de livraison du fournisseur', [
        'Délais de livraison : vérifier auprès du fournisseur',
      ]),
    ).toBe(true);
  });

  it('un même sujet, une autre idée : gardée', () => {
    expect(
      repeatsIdea('Négocier une pénalité de retard avec le fournisseur', [
        'Vérifier le délai de livraison du fournisseur',
      ]),
    ).toBe(false);
  });

  it('un titre court : seul le même titre est une redite', () => {
    expect(repeatsIdea('Un lot 2 bis ?', ['un lot 2 bis'])).toBe(true);
    expect(repeatsIdea('Un lot 3 ?', ['Un lot 2 bis ?'])).toBe(false);
    expect(repeatsIdea('Vérifier le délai de livraison', [])).toBe(false);
  });

  it('les mots vides ne rapprochent pas deux idées', () => {
    // « tout », « faire », « avant » : trois mots sur quatre en commun, aucun qui porte l'idée.
    expect(repeatsIdea('Tout faire avant l’audit', ['Tout faire avant la signature'])).toBe(false);
  });
});
