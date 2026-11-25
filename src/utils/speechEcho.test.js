/**
 * L'écho de la voix de l'Aide IA (utils/speechEcho.js) : ce que le micro
 * renvoie de ce qu'elle vient de dire est reconnu ; ce qu'on lui répond ne
 * l'est pas.
 */
import { describe, it, expect } from 'vitest';
import { isEchoOf, wordsOf } from './speechEcho.js';

const SAID = ['Attention : la signature du lot 2 avait été décidée le 12 mars.'];

describe('speechEcho', () => {
  it('les mots, sans casse, accents ni ponctuation', () => {
    expect(wordsOf('Décidée, le 12 MARS !')).toEqual(['decidee', 'le', '12', 'mars']);
  });

  it('reconnaît sa phrase revenue, même transcrite autrement', () => {
    expect(isEchoOf('attention la signature du lot 2 avait été décidée', SAID)).toBe(true);
    expect(isEchoOf('Décidée le 12 mars.', SAID)).toBe(true);
  });

  it('une réponse qui la reprend en partie reste une phrase de la réunion', () => {
    expect(isEchoOf('Non, la signature du lot 2 on la retire quand même', SAID)).toBe(false);
  });

  it('trop court pour juger, ou rien dit : jamais un écho', () => {
    expect(isEchoOf('Le lot', SAID)).toBe(false);
    expect(isEchoOf('attention la signature du lot', [])).toBe(false);
    expect(isEchoOf('attention la signature du lot', undefined)).toBe(false);
  });
});
