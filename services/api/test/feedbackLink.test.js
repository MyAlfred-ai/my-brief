/**
 * Lien « Déclarer un bug ou une idée » : propre à chaque installation.
 *
 * L'adresse du formulaire de remontées est donnée par l'environnement
 * (FEEDBACK_URL) et transmise par la sonde publique /auth/config. Sans elle,
 * l'entrée disparaît du menu — un lien en dur enverrait les utilisateurs de
 * toute installation vers le formulaire d'une autre.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp } from './helpers.js';
import { loadConfig } from '../lib/config.js';

async function probe(config) {
  const { app } = buildTestApp({ config });
  const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
  return JSON.parse(res.body);
}

describe('FEEDBACK_URL', () => {
  it('vide par défaut', () => {
    expect(loadConfig({}).feedbackUrl).toBe('');
  });

  it('lu depuis l’environnement', () => {
    expect(loadConfig({ FEEDBACK_URL: 'https://retours.example.test/f' }).feedbackUrl).toBe(
      'https://retours.example.test/f',
    );
  });

  it('refuse ce qui n’est pas une adresse http(s)', () => {
    expect(loadConfig({ FEEDBACK_URL: 'javascript:alert(1)' }).feedbackUrl).toBe('');
  });

  it('transmis par la sonde publique', async () => {
    const data = await probe({ feedbackUrl: 'https://retours.example.test/f' });
    expect(data.feedbackUrl).toBe('https://retours.example.test/f');
  });

  it('absent de l’environnement : la sonde renvoie une chaîne vide', async () => {
    expect((await probe({ feedbackUrl: '' })).feedbackUrl).toBe('');
  });
});

describe('DOCS_URL', () => {
  it('la documentation publique par défaut', () => {
    expect(loadConfig({}).docsUrl).toBe('https://docs.myalfred.ai/my-brief/');
  });

  it('remplaçable par l’environnement, en http(s) seulement', () => {
    expect(loadConfig({ DOCS_URL: 'https://aide.example.test/' }).docsUrl).toBe(
      'https://aide.example.test/',
    );
    expect(loadConfig({ DOCS_URL: 'file:///etc/passwd' }).docsUrl).toBe(
      'https://docs.myalfred.ai/my-brief/',
    );
  });

  it('transmis par la sonde publique', async () => {
    expect((await probe({ docsUrl: 'https://aide.example.test/' })).docsUrl).toBe(
      'https://aide.example.test/',
    );
  });
});
