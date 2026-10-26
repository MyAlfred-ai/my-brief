import { describe, it, expect } from 'vitest';
import { checkPassword, DEFAULT_MIN_LENGTH } from './passwordPolicy.js';

describe('politique de mot de passe (miroir client)', () => {
  it('accepte un mot de passe conforme', () => {
    expect(checkPassword('un-mot-de-passe-correct')).toEqual({ ok: true });
  });

  it('renvoie les mêmes slugs que le serveur', () => {
    // Une seule table de traduction pour les deux côtés : tout écart afficherait
    // « une erreur est survenue » au lieu du vrai message.
    expect(checkPassword('')).toEqual({ ok: false, reason: 'required' });
    expect(checkPassword('a'.repeat(DEFAULT_MIN_LENGTH - 1))).toEqual({
      ok: false,
      reason: 'too_short',
    });
    expect(checkPassword('a'.repeat(201))).toEqual({ ok: false, reason: 'too_long' });
    expect(checkPassword('alex-est-content', { email: 'alex@myalfred.ai' })).toEqual({
      ok: false,
      reason: 'contains_email',
    });
  });

  it('suit la longueur minimale annoncée par le serveur', () => {
    expect(checkPassword('douzecarac12', { minLength: 12 })).toEqual({ ok: true });
    expect(checkPassword('douzecarac1', { minLength: 12 })).toEqual({
      ok: false,
      reason: 'too_short',
    });
  });

  it('ignore une partie locale d email trop courte pour être discriminante', () => {
    expect(checkPassword('abcdefghijkl', { email: 'ab@x.fr' })).toEqual({ ok: true });
  });
});
