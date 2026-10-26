import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders } from './helpers.js';
import { CLIENT_EVENT_MAX_PER_WINDOW, buildEventLog } from '../routes/clientEvents.js';

const drop = {
  type: 'realtime_drop',
  meetingId: '6086e76c-35b9-4159-a853-070c660c6437',
  at: '2026-08-26T13:41:11.000Z',
  channel: 'mic',
  durationMs: 679_000,
  code: 'session_expired',
};

function postEvent(app, body, headers = identityHeaders('alex@myalfred.ai')) {
  return app.inject({ method: 'POST', url: '/api/client-event', headers, payload: body });
}

describe('POST /api/client-event', () => {
  it('accepte une charge utile de métadonnées et répond 204', async () => {
    const { app } = buildTestApp();
    const res = await postEvent(app, drop);
    expect(res.statusCode).toBe(204);
  });

  it('les quatre types de la pile Realtime sont acceptés', async () => {
    const { app } = buildTestApp();
    for (const type of [
      'realtime_drop',
      'realtime_restored',
      'realtime_watchdog',
      'realtime_error',
    ]) {
      const res = await postEvent(app, { type });
      expect(res.statusCode).toBe(204);
    }
  });

  it('un type inconnu est refusé (400) — pas de collecte ouverte', async () => {
    const { app } = buildTestApp();
    const res = await postEvent(app, { type: 'whatever' });
    expect(res.statusCode).toBe(400);
  });

  it('type absent → 400', async () => {
    const { app } = buildTestApp();
    expect((await postEvent(app, { meetingId: 'x' })).statusCode).toBe(400);
  });

  it('CONFIDENTIALITÉ : un champ hors schéma est retiré du corps, la requête passe sans lui', async () => {
    const { app } = buildTestApp();
    // `additionalProperties: false` + le `removeAdditional` par défaut de
    // Fastify : le champ n'atteint jamais le handler. On accepte l'évènement
    // (un client d'une version voisine ne doit pas être cassé) mais amputé.
    const res = await postEvent(app, { ...drop, transcript: 'le client valide le budget 2027' });
    expect(res.statusCode).toBe(204);
  });

  it('CONFIDENTIALITÉ : la ligne de log est recomposée par liste blanche — 2e filet', () => {
    // Le filet qui tient même si une évolution du schéma laissait passer un
    // champ : rien hors liste blanche n'atteint les logs.
    const line = buildEventLog(
      { ...drop, transcript: 'le budget 2027', text: 'bonjour à tous' },
      'alex@myalfred.ai',
    );
    expect(Object.keys(line).sort()).toEqual(
      ['at', 'channel', 'code', 'durationMs', 'event', 'meetingId', 'user'].sort(),
    );
    expect(JSON.stringify(line)).not.toContain('budget');
    expect(JSON.stringify(line)).not.toContain('bonjour');
  });

  it('les champs texte sont bornés (code, meetingId)', async () => {
    const { app } = buildTestApp();
    expect(
      (await postEvent(app, { type: 'realtime_error', code: 'x'.repeat(200) })).statusCode,
    ).toBe(400);
    expect(
      (await postEvent(app, { type: 'realtime_drop', meetingId: 'y'.repeat(100) })).statusCode,
    ).toBe(400);
  });

  it('durée hors bornes refusée (une valeur folle ne doit pas polluer les logs)', async () => {
    const { app } = buildTestApp();
    expect((await postEvent(app, { type: 'realtime_drop', durationMs: -5 })).statusCode).toBe(400);
    expect(
      (await postEvent(app, { type: 'realtime_drop', durationMs: 99 * 60 * 60 * 1000 })).statusCode,
    ).toBe(400);
  });

  it('sans identité : accepté quand même — une coupure vaut d’être tracée si la session vient de mourir', async () => {
    const { app } = buildTestApp();
    const res = await postEvent(app, { type: 'realtime_drop' }, {});
    expect(res.statusCode).toBe(204);
  });

  it('fréquence bornée par utilisateur : au-delà du plafond, 429', async () => {
    const { app } = buildTestApp();
    for (let i = 0; i < CLIENT_EVENT_MAX_PER_WINDOW; i++) {
      expect((await postEvent(app, { type: 'realtime_error' })).statusCode).toBe(204);
    }
    const over = await postEvent(app, { type: 'realtime_error' });
    expect(over.statusCode).toBe(429);
    expect(over.json()).toEqual({ error: 'too_many_events' });
    // Le plafond est PAR utilisateur : un autre compte n'est pas puni.
    const other = await postEvent(
      app,
      { type: 'realtime_error' },
      identityHeaders('bea@client.fr'),
    );
    expect(other.statusCode).toBe(204);
  });
});
