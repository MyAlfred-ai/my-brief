/**
 * Démarrage refusé : chaque cause a son message, et toute autre panne tombe
 * sur un message générique — jamais sur le texte technique de l'erreur.
 */
import { describe, it, expect } from 'vitest';
import { recordingStartErrorKey, startCancelledError } from './recordingErrors.js';
import { uiTextData } from '../config/uiText.js';

const named = (name) => Object.assign(new Error('x'), { name });

describe('recordingStartErrorKey', () => {
  it('micro refusé (invite balayée, réglage du navigateur ou du téléphone)', () => {
    expect(recordingStartErrorKey(named('NotAllowedError'))).toBe('alerts.micDenied');
    expect(recordingStartErrorKey(named('SecurityError'))).toBe('alerts.micDenied');
  });

  it('aucun micro, ou micro choisi introuvable', () => {
    expect(recordingStartErrorKey(named('NotFoundError'))).toBe('alerts.micNotFound');
    expect(recordingStartErrorKey(named('OverconstrainedError'))).toBe('alerts.micNotFound');
  });

  it('micro pris par une autre application', () => {
    expect(recordingStartErrorKey(named('NotReadableError'))).toBe('alerts.micBusy');
    expect(recordingStartErrorKey(named('AbortError'))).toBe('alerts.micBusy');
  });

  it('toute autre panne : message générique', () => {
    expect(recordingStartErrorKey(new Error('WebSocket connection timeout'))).toBe(
      'alerts.recordingStartFailed',
    );
    expect(recordingStartErrorKey(null)).toBe('alerts.recordingStartFailed');
    expect(recordingStartErrorKey('boom')).toBe('alerts.recordingStartFailed');
  });

  it('« Annuler » avant le démarrage : pas une panne, aucun message', () => {
    expect(recordingStartErrorKey(startCancelledError())).toBeNull();
  });

  it('chaque clé existe en français et en anglais', () => {
    const keys = ['micDenied', 'micNotFound', 'micBusy', 'recordingStartFailed'];
    for (const lang of ['fr', 'en']) {
      for (const key of keys) expect(uiTextData[lang].alerts[key]).toBeTruthy();
    }
  });
});
