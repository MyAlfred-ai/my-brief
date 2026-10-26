import { describe, it, expect } from 'vitest';
import { extractTranscriptionText, recordErrorKey } from './audioProcessing.js';

/**
 * Parse de la réponse /record (n8n), partagé entre l'import manuel et la
 * transcription différée des segments hors ligne. Les formats varient selon la
 * configuration du workflow — tous doivent rester supportés.
 */
describe('extractTranscriptionText', () => {
  it('texte brut sans content-type JSON', () => {
    expect(extractTranscriptionText('Bonjour tout le monde.', 'text/plain')).toBe(
      'Bonjour tout le monde.',
    );
  });

  it('objet { text }', () => {
    expect(extractTranscriptionText('{"text":"Salut."}', 'application/json')).toBe('Salut.');
  });

  it('tableau n8n [{ message: { content } }]', () => {
    expect(
      extractTranscriptionText('[{"message":{"content":"Contenu."}}]', 'application/json'),
    ).toBe('Contenu.');
  });

  it('tableau [{ output: { transcription } }]', () => {
    expect(
      extractTranscriptionText('[{"output":{"transcription":"Sortie."}}]', 'application/json'),
    ).toBe('Sortie.');
  });

  it('JSON détecté sans content-type (heuristique accolade)', () => {
    expect(extractTranscriptionText('{"transcription":"Texte."}', '')).toBe('Texte.');
  });

  it('JSON invalide : retombe sur le texte brut', () => {
    expect(extractTranscriptionText('{pas du json', 'application/json')).toBe('{pas du json');
  });

  it('réponse vide → null', () => {
    expect(extractTranscriptionText('', 'application/json')).toBeNull();
    expect(extractTranscriptionText('{}', 'application/json')).toBeNull();
  });
});

describe('recordErrorKey', () => {
  it('503 record_busy → message dédié', () => {
    expect(recordErrorKey('{"error":"record_busy"}')).toBe('alerts.recordBusy');
  });

  it('413 audio_too_long → dire de couper le fichier, pas citer OpenAI', () => {
    expect(recordErrorKey('{"error":"audio_too_long"}')).toBe('alerts.audioTooLong');
  });

  it('autre slug, corps OpenAI relayé ou corps non JSON → null (message générique)', () => {
    expect(recordErrorKey('{"error":"missing_file"}')).toBeNull();
    expect(recordErrorKey('{"error":{"code":"insufficient_quota"}}')).toBeNull();
    expect(recordErrorKey('{"error":"constructor"}')).toBeNull();
    expect(recordErrorKey('Bad Gateway')).toBeNull();
    expect(recordErrorKey('')).toBeNull();
  });
});
