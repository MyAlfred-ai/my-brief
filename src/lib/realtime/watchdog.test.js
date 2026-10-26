/**
 * Chien de garde « transcription muette » — les scénarios de l'incident du
 * 26/08/2026 et les deux pièges qu'il ne doit PAS déclencher (réunion
 * silencieuse, pause).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSilenceWatchdog } from './watchdog.js';

const STALE_MS = 40_000;
const CHECK_MS = 5_000;

function makeWatchdog(overrides = {}) {
  const ctx = { eligible: true, stale: [] };
  const wd = createSilenceWatchdog({
    staleMs: STALE_MS,
    checkMs: CHECK_MS,
    isEligible: () => ctx.eligible,
    onStale: (info) => ctx.stale.push(info),
    ...overrides,
  });
  return { wd, ctx };
}

/** Parle pendant `ms` : une frame non silencieuse tous les 100 ms, comme le processor. */
async function speakFor(wd, ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    wd.noteAudioSent(0.2);
    await vi.advanceTimersByTimeAsync(100);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('socket zombie — socket ouvert, plus un seul message', () => {
  it('silence prolongé avec audio qui part : UNE seule reconnexion, pas de rafale', async () => {
    const { wd, ctx } = makeWatchdog();
    wd.start();
    await speakFor(wd, STALE_MS + CHECK_MS * 2);
    expect(ctx.stale).toHaveLength(1);
    expect(ctx.stale[0].attempt).toBe(1);

    // Le silence continue : le prochain déclenchement attend un seuil ÉLARGI
    // (backoff), donc rien de nouveau juste après.
    await speakFor(wd, STALE_MS);
    expect(ctx.stale).toHaveLength(1);
    wd.stop();
  });

  it('backoff : 2e tentative seulement après le double du seuil', async () => {
    const { wd, ctx } = makeWatchdog();
    wd.start();
    await speakFor(wd, STALE_MS + CHECK_MS);
    expect(ctx.stale).toHaveLength(1);
    await speakFor(wd, STALE_MS * 2 + CHECK_MS);
    expect(ctx.stale).toHaveLength(2);
    expect(wd.attempts).toBe(2);
    wd.stop();
  });

  it('un message reçu annule le backoff en cours', async () => {
    const { wd, ctx } = makeWatchdog();
    wd.start();
    await speakFor(wd, STALE_MS + CHECK_MS);
    expect(wd.attempts).toBe(1);
    wd.noteMessage(); // le canal répond de nouveau
    expect(wd.attempts).toBe(0);
    // …et le seuil est revenu au nominal.
    await speakFor(wd, STALE_MS + CHECK_MS);
    expect(ctx.stale).toHaveLength(2);
    wd.stop();
  });
});

describe('les faux positifs à ne jamais produire', () => {
  it('messages reçus régulièrement : AUCUNE reconnexion', async () => {
    const { wd, ctx } = makeWatchdog();
    wd.start();
    for (let i = 0; i < 20; i++) {
      wd.noteMessage(); // n'importe quel type suffit (session.updated, delta…)
      await speakFor(wd, STALE_MS / 2);
    }
    expect(ctx.stale).toHaveLength(0);
    wd.stop();
  });

  it('réunion réellement SILENCIEUSE : aucune reconnexion, même très longtemps', async () => {
    const { wd, ctx } = makeWatchdog();
    wd.start();
    // Le processor tourne (frames envoyées) mais tout est sous le seuil de RMS.
    for (let i = 0; i < 200; i++) {
      wd.noteAudioSent(0.0005);
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(STALE_MS * 10);
    expect(ctx.stale).toHaveLength(0);
    expect(wd.sawAudio).toBe(false);
    wd.stop();
  });

  it('pause : le compteur glisse, rien ne se déclenche — et la reprise repart de zéro', async () => {
    const { wd, ctx } = makeWatchdog();
    wd.start();
    ctx.eligible = false;
    await speakFor(wd, STALE_MS * 5);
    expect(ctx.stale).toHaveLength(0);

    ctx.eligible = true;
    wd.reset();
    // Juste sous le seuil après la reprise : toujours rien.
    await speakFor(wd, STALE_MS - CHECK_MS * 2);
    expect(ctx.stale).toHaveLength(0);
    wd.stop();
  });

  it('premier mot après un long blanc : pas de déclenchement instantané', async () => {
    const { wd, ctx } = makeWatchdog();
    wd.start();
    // 10 min sans parole ET sans message : normal, rien ne part.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(ctx.stale).toHaveLength(0);
    // Quelqu'un parle enfin : le compte utile part de MAINTENANT, pas du
    // dernier message — sinon la reconnexion tomberait avant qu'OpenAI ait pu
    // répondre au premier mot.
    await speakFor(wd, CHECK_MS * 2);
    expect(ctx.stale).toHaveLength(0);
    await speakFor(wd, STALE_MS);
    expect(ctx.stale).toHaveLength(1);
    // La durée signalée est bien le silence RÉEL (≈ 10 min + le seuil).
    expect(ctx.stale[0].silentMs).toBeGreaterThan(10 * 60 * 1000);
    wd.stop();
  });

  it('stop() : plus aucun réveil', async () => {
    const { wd, ctx } = makeWatchdog();
    wd.start();
    wd.noteAudioSent(0.3);
    wd.stop();
    await vi.advanceTimersByTimeAsync(STALE_MS * 5);
    expect(ctx.stale).toHaveLength(0);
  });
});
