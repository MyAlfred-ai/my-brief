/**
 * Superviseur Realtime — les scénarios qui ont réellement cassé en prod :
 * course rotation/retry, deadlock isReconnecting, double watchdog.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRealtimeSupervisor } from './supervisor.js';

const ROTATION_MS = 25 * 60 * 1000;

function makeSupervisor(overrides = {}) {
  const ctx = {
    connectCalls: [],
    connectImpl: async () => {},
    active: true,
    paused: false,
    socketAlive: true,
    socketDead: false,
    states: [],
    drops: 0,
    restores: 0,
  };
  const sup = createRealtimeSupervisor({
    connect: (info) => {
      ctx.connectCalls.push(info);
      return ctx.connectImpl(info);
    },
    isActive: () => ctx.active,
    isPausedNow: () => ctx.paused,
    isSocketAlive: () => ctx.socketAlive,
    isSocketDead: () => ctx.socketDead,
    onState: (s) => ctx.states.push(s),
    onUnplannedDrop: () => (ctx.drops += 1),
    onRestored: () => (ctx.restores += 1),
    rotationMs: ROTATION_MS,
    ...overrides,
  });
  return { sup, ctx };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('single-flight — le scénario du deadlock historique', () => {
  it('rotation et perte réelle en course : UNE seule connexion part', async () => {
    const { sup, ctx } = makeSupervisor();
    let release;
    ctx.connectImpl = () => new Promise((r) => (release = r));

    sup.reconnect(true); // rotation en cours…
    sup.reconnect(false); // …perte détectée par un autre chemin : ignorée
    sup.reconnect(false);
    expect(ctx.connectCalls).toHaveLength(1);

    release();
    await vi.runOnlyPendingTimersAsync();
    expect(sup.state).toBe('open');
    expect(sup.isReconnecting()).toBe(false);
  });

  it('échec de connexion : retry 5 s, puis succès — jamais bloqué en vol', async () => {
    const { sup, ctx } = makeSupervisor();
    ctx.connectImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('tempkey down'))
      .mockResolvedValue(undefined);

    await sup.reconnect(false).catch(() => {});
    expect(sup.isReconnecting()).toBe(false); // TOUJOURS retombé — pas de deadlock
    expect(sup.state).toBe('backing-off');

    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.connectCalls).toHaveLength(2);
    expect(sup.state).toBe('open');
  });

  it('stop() pendant un backoff : le retry programmé ne part JAMAIS', async () => {
    const { sup, ctx } = makeSupervisor();
    ctx.connectImpl = vi.fn().mockRejectedValue(new Error('down'));
    await sup.reconnect(false).catch(() => {});
    sup.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ctx.connectCalls).toHaveLength(1);
    expect(sup.state).toBe('idle');
  });
});

describe('toasts perte/rétablissement', () => {
  it('perte réelle : drop une seule fois, restore au premier succès', async () => {
    const { sup, ctx } = makeSupervisor();
    ctx.connectImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue(undefined);
    ctx.socketAlive = false;

    await sup.reconnect(false).catch(() => {});
    await vi.advanceTimersByTimeAsync(5000); // retry 1 (échec)
    await vi.advanceTimersByTimeAsync(5000); // retry 2 (succès)
    expect(ctx.drops).toBe(1); // un seul toast « perdue »
    expect(ctx.restores).toBe(1); // un seul « rétablie »
  });

  it('rotation planifiée : AUCUN toast, même en échec tant que le socket tient', async () => {
    const { sup, ctx } = makeSupervisor();
    ctx.connectImpl = vi.fn().mockRejectedValue(new Error('tempkey lent'));
    ctx.socketAlive = true;
    await sup.reconnect(true).catch(() => {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.drops).toBe(0);
    // l'UI reste « connected » : l'ancien socket transcrit toujours
    expect(ctx.states.filter((s) => s === 'disconnected')).toHaveLength(0);
  });

  it('échec de rotation avec ancien socket MORT entre-temps : retry en mode non-planifié', async () => {
    const { sup, ctx } = makeSupervisor();
    ctx.connectImpl = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    ctx.socketAlive = false; // l'ancien est tombé pendant la rotation
    await sup.reconnect(true).catch(() => {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.connectCalls[1].planned).toBe(false); // downgrade planifié → réel
  });
});

describe('échéanciers', () => {
  it('rotation préventive à rotationMs, silencieuse (planned=true)', async () => {
    const { sup, ctx } = makeSupervisor();
    sup.noteConnected();
    sup.start();
    await vi.advanceTimersByTimeAsync(ROTATION_MS - 60_000);
    expect(ctx.connectCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ctx.connectCalls).toHaveLength(1);
    expect(ctx.connectCalls[0].planned).toBe(true);
    sup.stop();
  });

  it('pas de rotation en pause ni à l’arrêt', async () => {
    const { sup, ctx } = makeSupervisor();
    sup.noteConnected();
    sup.start();
    ctx.paused = true;
    await vi.advanceTimersByTimeAsync(ROTATION_MS * 2);
    expect(ctx.connectCalls).toHaveLength(0);
    ctx.paused = false;
    ctx.active = false;
    await vi.advanceTimersByTimeAsync(ROTATION_MS * 2);
    expect(ctx.connectCalls).toHaveLength(0);
    sup.stop();
  });

  it('onPeriodicCheck === false court-circuite le tick (plafond 8 h)', async () => {
    const { sup, ctx } = makeSupervisor();
    sup.noteConnected();
    let stopAll = false;
    sup.start({ onPeriodicCheck: () => !stopAll });
    stopAll = true;
    await vi.advanceTimersByTimeAsync(ROTATION_MS + 60_000);
    expect(ctx.connectCalls).toHaveLength(0);
    sup.stop();
  });

  it('health check : socket mort détecté → reconnexion non planifiée, une seule', async () => {
    const { sup, ctx } = makeSupervisor();
    let release;
    ctx.connectImpl = () => new Promise((r) => (release = r));
    sup.noteConnected();
    sup.start();
    ctx.socketDead = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ctx.connectCalls).toHaveLength(1);
    expect(ctx.connectCalls[0].planned).toBe(false);
    // ticks suivants pendant la reconnexion : single-flight, rien de plus
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ctx.connectCalls).toHaveLength(1);
    release();
    sup.stop();
  });

  it('rotation entraîne le flux système via onRotationDue — une fois par rotation', async () => {
    const { sup, ctx } = makeSupervisor();
    // Câblage réel : le succès de connect fait basculer le canal, dont
    // onSwitched appelle noteConnected — l'horloge de rotation repart.
    ctx.connectImpl = async () => sup.noteConnected();
    const sysRotations = vi.fn();
    sup.noteConnected();
    sup.start({ onRotationDue: sysRotations });
    await vi.advanceTimersByTimeAsync(ROTATION_MS + 60_000);
    expect(sysRotations).toHaveBeenCalledOnce();
    // Le cycle suivant repart de la reconnexion, pas de zéro absolu.
    await vi.advanceTimersByTimeAsync(ROTATION_MS + 60_000);
    expect(sysRotations).toHaveBeenCalledTimes(2);
    sup.stop();
  });
});
