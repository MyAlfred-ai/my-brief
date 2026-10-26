/**
 * Classification des erreurs Realtime — ce qui décide d'un toast, d'une
 * reconnexion, ou d'un simple log.
 */
import { describe, it, expect } from 'vitest';
import { classifyRealtimeError, realtimeErrorToastKey } from './errors.js';

const err = (error) => ({ type: 'error', error });

describe('classifyRealtimeError', () => {
  it('quota/crédit épuisé : fatal, mais PAS de reconnexion (elle échouerait pareil)', () => {
    const info = classifyRealtimeError(
      err({ type: 'invalid_request_error', code: 'insufficient_quota' }),
    );
    expect(info.isCredit).toBe(true);
    expect(info.fatal).toBe(true);
    expect(info.sessionInvalid).toBe(false);
    expect(realtimeErrorToastKey(info)).toBe('statuses.transcriptionCreditExhausted');
  });

  it('session expirée : fatal ET reconnexion (le socket reste OUVERT, invisible pour le health check)', () => {
    const info = classifyRealtimeError(
      err({ type: 'invalid_request_error', code: 'session_expired' }),
    );
    expect(info.sessionInvalid).toBe(true);
    expect(info.fatal).toBe(true);
    expect(realtimeErrorToastKey(info)).toBe('statuses.transcriptionInterrupted');
  });

  it('clé éphémère invalide : traité comme une session morte', () => {
    expect(classifyRealtimeError(err({ code: 'invalid_api_key' })).sessionInvalid).toBe(true);
    expect(classifyRealtimeError(err({ type: 'authentication_error' })).sessionInvalid).toBe(true);
  });

  it('rate limit : on informe, on ne reconnecte pas', () => {
    const info = classifyRealtimeError(err({ code: 'rate_limit_exceeded' }));
    expect(info.fatal).toBe(true);
    expect(info.sessionInvalid).toBe(false);
    expect(realtimeErrorToastKey(info)).toBe('statuses.transcriptionLimited');
  });

  it('erreur de paramètre banale : loggée, mais ni toast ni reconnexion', () => {
    const info = classifyRealtimeError(
      err({ type: 'invalid_request_error', code: 'invalid_value' }),
    );
    expect(info.fatal).toBe(false);
    expect(info.sessionInvalid).toBe(false);
    expect(info.code).toBe('invalid_value');
  });

  it('message vide ou inconnu : jamais de crash, code « unknown »', () => {
    expect(classifyRealtimeError(undefined).code).toBe('unknown');
    expect(classifyRealtimeError({ type: 'error' }).code).toBe('unknown');
    expect(classifyRealtimeError({ type: 'error' }).fatal).toBe(false);
  });

  it('confidentialité : le texte libre du message n’entre PAS dans la décision', () => {
    // `error.message` peut citer le paramètre fautif — donc potentiellement un
    // fragment de réunion. Il ne doit ni classer, ni ressortir.
    const info = classifyRealtimeError(
      err({ code: 'invalid_value', message: 'quota exceeded — le client parle du budget 2027' }),
    );
    expect(info.isCredit).toBe(false);
    expect(JSON.stringify(info)).not.toContain('budget');
  });

  it('event_id repris tel quel pour le rapprochement côté OpenAI', () => {
    expect(classifyRealtimeError(err({ code: 'x', event_id: 'evt_42' })).eventId).toBe('evt_42');
  });
});
