import { describe, it, expect } from 'vitest';
import { storageLabel, libraryKind } from './storageVocabulary.js';

describe('libraryKind', () => {
  it('distingue une bibliothèque SharePoint du OneDrive par le nom composé « Site / Bibliothèque »', () => {
    // C'est la composition de la fenêtre de navigation (`fullDriveName`).
    expect(libraryKind('microsoft', 'Marketing / Documents')).toBe('sharepoint');
    expect(libraryKind('microsoft', 'OneDrive')).toBe('onedrive');
    // Destination sans bibliothèque nommée (ancienne, ou dossier de l'organisation) : le OneDrive.
    expect(libraryKind('microsoft', '')).toBe('onedrive');
    expect(libraryKind('microsoft', undefined)).toBe('onedrive');
  });

  it('un seul logo chez Google, Drive partagés compris', () => {
    expect(libraryKind('google', 'Mon Drive')).toBe('google-drive');
    expect(libraryKind('google', 'Drive Équipe')).toBe('google-drive');
    expect(libraryKind('google', '')).toBe('google-drive');
  });

  it('aucun logo tant que le fournisseur est inconnu', () => {
    expect(libraryKind('', 'OneDrive')).toBe('');
    expect(libraryKind(undefined, 'Marketing / Documents')).toBe('');
  });
});

describe('storageLabel', () => {
  it('nomme l’espace de dépôt du fournisseur retenu', () => {
    expect(storageLabel('google')).toBe('Google Drive');
    expect(storageLabel('microsoft')).toBe('OneDrive');
  });

  it('ne nomme aucun fournisseur tant qu’il est inconnu', () => {
    // Avant la réponse de /connect/status, nommer « Google Drive » sur une
    // installation Microsoft afficherait un fournisseur que personne n'a relié.
    expect(storageLabel('')).toBe('Drive');
    expect(storageLabel(undefined)).toBe('Drive');
    expect(storageLabel('', 'votre espace')).toBe('votre espace');
  });
});
