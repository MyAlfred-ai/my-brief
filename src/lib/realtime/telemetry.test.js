/**
 * Télémétrie des coupures — anti-rafale, plafond, et surtout : rien d'autre que
 * des métadonnées ne doit partir.
 */
import { describe, it, expect, vi } from 'vitest';
import { createClientEventReporter, CLIENT_EVENT_TYPES } from './telemetry.js';

function makeReporter(overrides = {}) {
  const sentBodies = [];
  let clock = 1_000_000;
  const reporter = createClientEventReporter({
    send: (body) => {
      sentBodies.push(body);
      return Promise.resolve();
    },
    getMeetingId: () => '6086e76c-35b9-4159-a853-070c660c6437',
    now: () => clock,
    ...overrides,
  });
  return { reporter, sentBodies, tick: (ms) => (clock += ms) };
}

describe('createClientEventReporter', () => {
  it('émet type, horodatage, meetingId, durée et code — et rien de plus', () => {
    const { reporter, sentBodies } = makeReporter();
    reporter.report(CLIENT_EVENT_TYPES.WATCHDOG, {
      channel: 'mic',
      durationMs: 679_000,
      attempt: 1,
    });
    expect(sentBodies).toHaveLength(1);
    expect(Object.keys(sentBodies[0]).sort()).toEqual(
      ['at', 'attempt', 'channel', 'durationMs', 'meetingId', 'type'].sort(),
    );
    expect(sentBodies[0].type).toBe('realtime_watchdog');
    expect(sentBodies[0].durationMs).toBe(679_000);
  });

  it('un champ non prévu est ignoré : aucun transcript ne peut fuir par ici', () => {
    const { reporter, sentBodies } = makeReporter();
    reporter.report(CLIENT_EVENT_TYPES.ERROR, {
      code: 'insufficient_quota',
      transcript: 'le client valide le budget 2027',
      text: 'bonjour à tous',
    });
    expect(JSON.stringify(sentBodies[0])).not.toContain('budget');
    expect(JSON.stringify(sentBodies[0])).not.toContain('bonjour');
    expect(sentBodies[0].code).toBe('insufficient_quota');
  });

  it('anti-rafale PAR TYPE : une erreur répétée est étouffée, le rétablissement passe quand même', () => {
    const { reporter, sentBodies, tick } = makeReporter({ minIntervalMs: 5_000 });
    for (let i = 0; i < 30; i++) {
      reporter.report(CLIENT_EVENT_TYPES.ERROR, { code: 'invalid_value' });
      tick(100);
    }
    expect(sentBodies.filter((b) => b.type === 'realtime_error')).toHaveLength(1);
    reporter.report(CLIENT_EVENT_TYPES.RESTORED, { channel: 'mic' });
    expect(sentBodies.filter((b) => b.type === 'realtime_restored')).toHaveLength(1);
  });

  it('plafond sur la vie de l’onglet', () => {
    const { reporter, sentBodies, tick } = makeReporter({ minIntervalMs: 0, maxPerSession: 3 });
    for (let i = 0; i < 10; i++) {
      reporter.report(CLIENT_EVENT_TYPES.DROP, {});
      tick(1000);
    }
    expect(sentBodies).toHaveLength(3);
  });

  it('un échec d’envoi ne remonte jamais (ni throw, ni rejet non capturé)', () => {
    const onUnhandled = vi.fn();
    const { reporter } = makeReporter({
      send: () => Promise.reject(new Error('hors ligne')),
    });
    process.on('unhandledRejection', onUnhandled);
    expect(() => reporter.report(CLIENT_EVENT_TYPES.DROP, {})).not.toThrow();
    process.off('unhandledRejection', onUnhandled);
    expect(onUnhandled).not.toHaveBeenCalled();
  });

  it('un send qui lève de façon synchrone est avalé aussi', () => {
    const { reporter } = makeReporter({
      send: () => {
        throw new Error('boom');
      },
    });
    expect(() => reporter.report(CLIENT_EVENT_TYPES.DROP, {})).not.toThrow();
  });
});
