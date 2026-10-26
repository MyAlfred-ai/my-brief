import { describe, it, expect } from 'vitest';
import { normalizeSummaryHtml, afterFailedGeneration, pendingVersionFrom } from './summary.js';

describe('normalizeSummaryHtml — marqueurs de blocs IA résiduels', () => {
  it('purge les marqueurs [[AI_…]] laissés en préfixe par le LLM', () => {
    // Mesuré en dev (27/08) : le modèle génère bien un bloc distinct par
    // marqueur mais laisse parfois le marqueur en tête au lieu de le
    // remplacer — il ne doit jamais atteindre le compte rendu affiché.
    const out = normalizeSummaryHtml(
      '[[AI_RESUME_BLOCK]]<h2>Synthèse</h2><p>Long résumé.</p>\n' +
        '[[AI_SUMMARY_100_WORDS]]<p>Résumé court.</p>\n' +
        '[[AI_KEY_POINTS]]<ul><li>Point.</li></ul>',
    );
    expect(out).not.toContain('[[AI_');
    expect(out).toContain('<p>Long résumé.</p>');
    expect(out).toContain('<p>Résumé court.</p>');
    expect(out).toContain('<li>Point.</li>');
  });

  it('retire aussi un marqueur isolé dans son propre <p>', () => {
    const out = normalizeSummaryHtml('<p>[[AI_SUMMARY_20_WORDS]]</p><p>Contenu.</p>');
    expect(out).toBe('<p>Contenu.</p>');
  });

  it('NON-RÉGRESSION : un résumé sans marqueur ressort inchangé (hors espaces)', () => {
    const out = normalizeSummaryHtml('<h1>Titre</h1>\n<p>Corps du résumé.</p>');
    expect(out).toBe('<h1>Titre</h1><p>Corps du résumé.</p>');
  });

  it('un saut de ligne du template (<p><br></p>) survit au nettoyage', () => {
    // La purge des <p> vides ne vaut que pour les marqueurs : un <p><br></p>
    // est un retour chariot voulu de la mise en forme.
    const out = normalizeSummaryHtml('<p>Avant</p>\n<p><br></p>\n<p>Après</p>');
    expect(out).toBe('<p>Avant</p><p><br></p><p>Après</p>');
  });
});

describe('afterFailedGeneration — un résumé en échec n’efface pas la version affichée', () => {
  const versions = [
    { id: 'v1', html: '<p>Premier</p>' },
    { id: 'v2', html: '<h1>Second</h1>\n<p>Corps.</p>' },
    { id: 'p', html: '', pending: true },
  ];

  it('« Nouveau résumé » en échec : la version affichée reste, sans le message', () => {
    // Le message posé à la place de la version y entrait au premier blur de
    // l'éditeur, puis en base à la première frappe : le résumé précédent était
    // remplacé par « Une erreur s'est produite. ».
    const next = afterFailedGeneration(versions, 'v2', 'p', 'Une erreur s’est produite.');
    expect(next.versions.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(next.activeVersionId).toBe('v2');
    expect(next.summaryText).toBe('<h1>Second</h1><p>Corps.</p>');
  });

  it('premier résumé en échec : faute de version, le message', () => {
    const next = afterFailedGeneration([versions[2]], null, 'p', 'Une erreur s’est produite.');
    expect(next).toEqual({
      versions: [],
      activeVersionId: null,
      summaryText: 'Une erreur s’est produite.',
    });
  });

  it('version en attente déjà affichée : repli sur la dernière qui reste', () => {
    const next = afterFailedGeneration(versions, 'p', 'p', 'Erreur');
    expect(next.activeVersionId).toBe('v2');
    expect(next.summaryText).toBe('<h1>Second</h1><p>Corps.</p>');
  });
});

describe('pendingVersionFrom — la version en attente d’une rédaction', () => {
  it('reprend les choix de la carte, et le template courant à défaut', () => {
    const v = pendingVersionFrom({ ton: 'formel', pages: 2 }, 'standard');
    expect(v).toMatchObject({
      html: '',
      template: 'standard',
      ton: 'formel',
      pages: 2,
      pending: true,
    });
    expect(v.id).toBeTruthy();
    expect(v.longueur).toBeNull();
    expect(v.customPrompt).toBeNull();
  });

  it('sans Pagimètre, pas de clé `pages` : le badge de longueur reste muet', () => {
    expect('pages' in pendingVersionFrom(null, 'standard')).toBe(false);
    expect('pages' in pendingVersionFrom({ pages: null }, 'standard')).toBe(false);
  });

  it('deux versions en attente ont deux identifiants', () => {
    expect(pendingVersionFrom(null, 's').id).not.toBe(pendingVersionFrom(null, 's').id);
  });
});
