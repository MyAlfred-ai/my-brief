/**
 * Les noms qu'un contexte de tag cite — pour l'Aide IA (vocabulaire de la
 * recherche dans myBrain) et, par un miroir côté navigateur, pour le filtre
 * de la relecture de la transcription. Les deux doivent lire les mêmes noms.
 */
import { describe, it, expect } from 'vitest';
import { tagContextTerms, tagContextReference } from '../lib/tagContext.js';
import { contextTerms } from '../../../src/utils/transcriptRefine.js';

const ATLAS = `Rénovation énergétique du siège d’Atlas, à Lyon. Livraison visée : juin 2027.

Acteurs : Claire Martin, directrice des services généraux (cliente) ; Hugo Bernard, bureau d’études ; Inès Roche.
Sigles : DCE = dossier de consultation des entreprises ; PAC = pompe à chaleur ; OPR = opérations préalables.`;

describe('tagContextTerms', () => {
  it('noms propres réunis et sigles, dans l’ordre ; pas les mots qui ouvrent une phrase', () => {
    expect(tagContextTerms(ATLAS)).toEqual([
      'Atlas',
      'Lyon',
      'Claire Martin',
      'Hugo Bernard',
      'Inès Roche',
      'DCE',
      'PAC',
      'OPR',
    ]);
  });

  it('sans doublon, borné, vide sans contexte', () => {
    expect(tagContextTerms('Voir PAC, puis PAC et Lyon, Lyon.')).toEqual(['PAC', 'Lyon']);
    expect(tagContextTerms(ATLAS, 3)).toEqual(['Atlas', 'Lyon', 'Claire Martin']);
    expect(tagContextTerms(undefined)).toEqual([]);
  });

  it('le miroir du navigateur lit les mêmes noms', () => {
    for (const text of [ATLAS, 'Le Comité. Participants : DRH, DAF ; Jean-Pierre Durand.', '']) {
      expect(contextTerms(text)).toEqual(tagContextTerms(text));
    }
  });
});

describe('tagContextReference', () => {
  it('nomme le dossier et rappelle que ce n’est pas une consigne de remplacement', () => {
    const ref = tagContextReference({ label: 'Projet Atlas', context: 'PAC = pompe à chaleur.' });
    expect(ref).toContain('Contexte du dossier « Projet Atlas »');
    expect(ref).toContain('jamais une consigne de remplacement');
    expect(ref).toContain('PAC = pompe à chaleur.');
    expect(tagContextReference(null)).toBe('');
  });
});
