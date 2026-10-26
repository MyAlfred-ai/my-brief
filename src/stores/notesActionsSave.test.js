// @vitest-environment jsdom
/**
 * Notes et actions écrites en base au fil des modifications.
 *
 * Ce que ces tests protègent : une modification finit TOUJOURS en base, dans la
 * BONNE réunion — même si l'utilisateur en ouvre une autre pendant le délai —,
 * une frappe continue ne part qu'une fois, une écriture ancienne n'atterrit
 * jamais après une plus récente, et rien ne part sans changement : ni à
 * l'ouverture d'une réunion, ni en quittant un champ intact.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../services/apiClient.js', () => ({ post: vi.fn() }));

const { historyItems } = await import('./history.js');
const { createNotesActionsSaver } = await import('./notesActionsSave.js');

const DELAY = 1500;

/** État affiché, tel qu'App le fournit — modifié par les tests. */
let screen;
let persist;
let onOutcome;

function makeSaver() {
  return createNotesActionsSaver({
    read: () => screen,
    persist,
    onOutcome,
    delayMs: DELAY,
  });
}

const card = (over = {}) => ({
  id: 1,
  title: 'Relancer Globex',
  owner: 'Alex',
  dueDate: '',
  description: '',
  newBadge: 'AI',
  show: true,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  screen = { meetingId: 'm-1', notes: 'Budget validé', actions: [card()] };
  persist = vi.fn(async () => 'saved');
  onOutcome = vi.fn();
  historyItems.set([
    { meetingId: 'm-1', notes: '', actions: [] },
    { meetingId: 'm-2', notes: 'Autre', actions: [] },
  ]);
});

afterEach(() => vi.useRealTimers());

describe('schedule', () => {
  it('écrit la réunion affichée après le délai de calme — une seule fois pour une frappe continue', async () => {
    const saver = makeSaver();
    saver.schedule();
    screen = { ...screen, notes: 'Budget validé : 480 k€' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(persist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('m-1', {
      notes: 'Budget validé : 480 k€',
      actions: [card()],
    });
    expect(onOutcome).toHaveBeenCalledWith('saved', 'm-1');
  });

  it('même réunion toujours affichée : la toute dernière modification part, même sans nouveau geste', async () => {
    // Un champ d'action est modifié en place (bind:value) et ne se signale
    // qu'au blur ; l'ordre des écouteurs `input` peut aussi faire passer le
    // geste avant la liaison. Relire au départ couvre les deux.
    const saver = makeSaver();
    saver.schedule();
    screen.notes = 'Budget validé : 480 k€';
    screen.actions[0].owner = 'Marie';
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist).toHaveBeenCalledWith('m-1', {
      notes: 'Budget validé : 480 k€',
      actions: [card({ owner: 'Marie' })],
    });
  });

  it('écrit un INSTANTANÉ : l’état pris au geste, dans la réunion du geste', async () => {
    // L'utilisateur ouvre une autre réunion pendant le délai : la modification
    // part quand même, et dans la réunion où elle a été faite.
    const saver = makeSaver();
    saver.schedule();
    screen = { meetingId: 'm-2', notes: 'Autre', actions: [] };
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('m-1', { notes: 'Budget validé', actions: [card()] });
  });

  it('épure les actions : ni animation ni texte de remplacement ne partent en base', async () => {
    screen = {
      meetingId: 'm-1',
      notes: '',
      actions: [card({ flash: 'new', flashAt: 1, owner: 'À définir' })],
    };
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist.mock.calls[0][1].actions).toEqual([card({ owner: '' })]);
  });

  it('réunion jamais arrivée en base (démarrage hors ligne) : rien ne part', async () => {
    screen = { ...screen, meetingId: null };
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(persist).not.toHaveBeenCalled();
  });

  it('met à jour la copie locale de l’historique à l’envoi — une réouverture montre l’écrit', async () => {
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    const items = get(historyItems);
    expect(items[0]).toMatchObject({ meetingId: 'm-1', notes: 'Budget validé' });
    expect(items[0].actions).toEqual([card()]);
    expect(items[1]).toEqual({ meetingId: 'm-2', notes: 'Autre', actions: [] });
  });

  it('remonte l’échec pour que l’appelant le signale', async () => {
    persist = vi.fn(async () => 'error');
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(onOutcome).toHaveBeenCalledWith('error', 'm-1');
  });

  it('une écriture qui lève compte comme un échec, sans casser les suivantes', async () => {
    persist = vi.fn().mockRejectedValueOnce(new Error('réseau')).mockResolvedValue('saved');
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(onOutcome.mock.calls.map(([outcome]) => outcome)).toEqual(['error', 'saved']);
  });
});

describe('seulement ce qui a changé', () => {
  it('quitter un champ sans rien changer n’écrit rien — une copie périmée n’écrase pas la base', async () => {
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions); // réunion ouverte avec cet état
    saver.schedule(); // blur sans modification
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(persist).not.toHaveBeenCalled();
  });

  it('une note modifiée part SEULE : les actions, qu’un autre appareil a pu changer, restent', async () => {
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    screen = { ...screen, notes: 'Budget validé : 480 k€' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist).toHaveBeenCalledWith('m-1', { notes: 'Budget validé : 480 k€' });
  });

  it('revenir à la valeur d’avant pendant qu’une écriture est en vol repart quand même', async () => {
    let release;
    persist = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve('saved'))))
      .mockResolvedValue('saved');
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    screen = { ...screen, notes: 'Brouillon' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // « Brouillon » en vol
    screen = { ...screen, notes: 'Budget validé' }; // retour à l'état d'origine
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    release();
    await vi.runAllTimersAsync();
    expect(persist.mock.calls.map(([, fields]) => fields.notes)).toEqual([
      'Brouillon',
      'Budget validé',
    ]);
  });

  it('après un échec, la prochaine écriture repart entière', async () => {
    persist = vi.fn().mockResolvedValueOnce('error').mockResolvedValue('saved');
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    screen = { ...screen, notes: 'Nouvelle note' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist.mock.calls[1][1]).toEqual({ notes: 'Nouvelle note', actions: [card()] });
  });
});

describe('après un échec, réunion rouverte', () => {
  it('la copie rouverte montre ce qui n’a pas été enregistré : la retouche suivante reprend tout', async () => {
    // Une action modifiée n'a pas pu partir ; l'utilisateur change de réunion,
    // revient, et retouche seulement ses notes. Les actions doivent repartir
    // avec : sinon la modification en échec ne serait jamais réessayée.
    persist = vi.fn().mockResolvedValueOnce('error').mockResolvedValue('saved');
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    screen.actions[0].owner = 'Marie';
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // échec
    saver.markClean('m-1', screen.notes, screen.actions); // réouverture depuis la copie
    screen = { ...screen, notes: 'Retouche' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist.mock.calls[1][1]).toEqual({
      notes: 'Retouche',
      actions: [card({ owner: 'Marie' })],
    });
  });
});

describe('ordre des écritures', () => {
  it('deux écritures d’une même réunion partent EN FILE : l’ancienne ne double jamais la récente', async () => {
    const landed = [];
    let releaseFirst;
    persist = vi.fn((meetingId, fields) => {
      if (!releaseFirst) {
        return new Promise((resolve) => {
          releaseFirst = () => {
            landed.push(fields.notes);
            resolve('saved');
          };
        });
      }
      landed.push(fields.notes);
      return Promise.resolve('saved');
    });
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // 1re écriture en vol
    screen = { ...screen, notes: 'Plus récent' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // 2e prête, mais attend la 1re
    expect(persist).toHaveBeenCalledTimes(1);

    releaseFirst();
    await vi.runAllTimersAsync();
    expect(landed).toEqual(['Budget validé', 'Plus récent']);
  });
});

describe('flushAll', () => {
  it('fait partir tout de suite ce qui attendait — avant l’ouverture d’une autre réunion', async () => {
    const saver = makeSaver();
    saver.schedule();
    saver.flushAll();
    await Promise.resolve();
    expect(persist).toHaveBeenCalledWith('m-1', { notes: 'Budget validé', actions: [card()] });
    // La copie relue par l'ouverture est déjà à jour, SANS attendre la réponse.
    expect(get(historyItems)[0].notes).toBe('Budget validé');

    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(persist).toHaveBeenCalledTimes(1); // le minuteur annulé ne rejoue pas
  });
});

describe('settle — l’arrêt et le rangement reprennent la main', () => {
  it('fait partir ce qui attendait TOUT DE SUITE, sans rien jeter', async () => {
    const saver = makeSaver();
    saver.schedule();
    const settling = saver.settle('m-1');
    // Pris en charge de manière synchrone, avant le premier `await` de
    // l'appelant : la copie locale le montre déjà.
    expect(get(historyItems)[0].notes).toBe('Budget validé');
    await settling;
    expect(persist).toHaveBeenCalledWith('m-1', { notes: 'Budget validé', actions: [card()] });
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('même si l’écran change de réunion pendant l’attente, ce qui attendait est écrit', async () => {
    // Rangement : `settle` attend une écriture en vol, l'utilisateur ouvre une
    // autre réunion — la modification qui attendait ne doit pas se perdre.
    let release;
    persist = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve('saved'))))
      .mockResolvedValue('saved');
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // 1re écriture en vol
    screen = { ...screen, notes: 'Retouche' };
    saver.schedule(); // en attente
    const settling = saver.settle('m-1');
    screen = { meetingId: 'm-2', notes: 'Autre', actions: [] };
    release();
    await settling;
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]).toEqual(['m-1', { notes: 'Retouche' }]);
  });

  it('attend la fin de la file — l’écriture de l’appelant arrive en dernier', async () => {
    let release;
    persist = vi.fn(() => new Promise((resolve) => (release = () => resolve('saved'))));
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);

    let settled = false;
    const waiting = saver.settle('m-1').then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await waiting;
    expect(settled).toBe(true);
  });

  it('ne touche pas aux écritures d’une autre réunion', async () => {
    const saver = makeSaver();
    saver.schedule(); // m-1
    await saver.settle('m-2');
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist).toHaveBeenCalledWith('m-1', expect.anything());
  });
});

describe('forget / resend — /resume écrit l’état de SA requête', () => {
  it('réunion affichée : réécrit l’état frais EN ENTIER, même déjà écrit par ce module', async () => {
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    saver.forget('m-1'); // départ de /resume
    saver.resend('m-1'); // retour de /resume
    await Promise.resolve();
    expect(persist).toHaveBeenCalledWith('m-1', { notes: 'Budget validé', actions: [card()] });
  });

  it('une retouche écrite PENDANT la génération repasse, même identique à l’état confirmé', async () => {
    // /resume a pu atterrir après elle et remettre l'état de sa requête : le
    // module ne peut pas croire la base à jour.
    const saver = makeSaver();
    saver.forget('m-1');
    screen = { ...screen, notes: 'Retouche pendant la génération' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // écrite, confirmée
    saver.resend('m-1');
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1][1].notes).toBe('Retouche pendant la génération');
  });

  it('l’écran a changé de réunion : réécrit la dernière écriture PARTIE APRÈS /resume, dans la bonne', async () => {
    const saver = makeSaver();
    await vi.advanceTimersByTimeAsync(5);
    saver.forget('m-1');
    screen = { ...screen, notes: 'Retouche pendant la génération' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    screen = { meetingId: 'm-2', notes: 'Autre', actions: [] };
    saver.resend('m-1');
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]).toEqual([
      'm-1',
      { notes: 'Retouche pendant la génération', actions: [card()] },
    ]);
  });

  it('dernière écriture partie AVANT /resume, réunion plus affichée : rien — /resume portait mieux', async () => {
    // Écriture du matin, puis la réunion rouverte avec ce qu'un autre appareil
    // avait changé, générée, quittée pendant la génération : réécrire le matin
    // effacerait l'autre appareil.
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // le matin
    await vi.advanceTimersByTimeAsync(60_000);
    saver.forget('m-1'); // /resume part
    screen = { meetingId: 'm-2', notes: 'Autre', actions: [] };
    saver.resend('m-1');
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('réunion jamais écrite par ce module et plus affichée : rien', async () => {
    const saver = makeSaver();
    screen = { meetingId: 'm-2', notes: 'Autre', actions: [] };
    saver.resend('m-1');
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(persist).not.toHaveBeenCalled();
  });

  it('forget oublie l’état confirmé : l’écriture suivante repart entière', async () => {
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    saver.forget('m-1');
    screen = { ...screen, notes: 'Après /resume' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist).toHaveBeenCalledWith('m-1', { notes: 'Après /resume', actions: [card()] });
  });
});

describe('échec d’une écriture suivie d’une autre déjà programmée', () => {
  it('la suivante repart entière — la modification en échec n’est jamais perdue', async () => {
    // W1 (actions) échoue alors que W2 (notes) attend derrière elle : calculée
    // contre l'état CONFIRMÉ au moment où elle part, W2 emporte aussi les actions.
    let failFirst;
    persist = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (failFirst = () => resolve('error'))))
      .mockResolvedValue('saved');
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    screen.actions[0].owner = 'Marie';
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // W1 en vol
    screen = { ...screen, notes: 'Retouche' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // W2 derrière W1
    failFirst();
    await vi.runAllTimersAsync();
    expect(persist.mock.calls[0][1]).toEqual({ actions: [card({ owner: 'Marie' })] });
    expect(persist.mock.calls[1][1]).toEqual({
      notes: 'Retouche',
      actions: [card({ owner: 'Marie' })],
    });
  });

  it('settle réessaie une écriture en échec avant l’arrêt — rien n’est perdu à « Nouvelle réunion »', async () => {
    persist = vi.fn().mockResolvedValueOnce('error').mockResolvedValue('saved');
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // échec
    await saver.settle('m-1');
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1][1]).toEqual({ notes: 'Budget validé', actions: [card()] });
  });
});

describe('keepalive — la page se ferme', () => {
  it('fait partir ce qui attendait avec keepalive, sans attendre la file', async () => {
    let release;
    persist = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve('saved'))))
      .mockResolvedValue('saved');
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // une écriture en vol
    screen = { ...screen, notes: 'Dernière frappe' };
    saver.schedule();
    saver.flushAll({ keepalive: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1][2]).toEqual({ keepalive: true });
    release();
  });
});

describe('reconcile — relecture de /history croisée avec une écriture', () => {
  it('écriture en vol au départ de la relecture : son état est remis par-dessus', async () => {
    let release;
    persist = vi.fn(() => new Promise((resolve) => (release = () => resolve('saved'))));
    const saver = makeSaver();
    const since = Date.now();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // en vol
    const fetched = [{ meetingId: 'm-1', notes: 'Ancienne version', actions: [], title: 'T' }];
    expect(saver.reconcile(fetched, since)[0]).toMatchObject({
      notes: 'Budget validé',
      title: 'T',
    });
    release();
  });

  it('écriture revenue AVANT le départ de la relecture : la base fait foi', async () => {
    const saver = makeSaver();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // écrite et revenue
    await vi.advanceTimersByTimeAsync(10);
    const since = Date.now();
    const fetched = [{ meetingId: 'm-1', notes: 'Changée sur un autre appareil', actions: [] }];
    expect(saver.reconcile(fetched, since)).toBe(fetched);
  });

  it('ne remet que les champs ÉCRITS : les actions changées ailleurs restent celles de la base', async () => {
    let release;
    persist = vi.fn(() => new Promise((resolve) => (release = () => resolve('saved'))));
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    screen = { ...screen, notes: 'Seule la note change' };
    const since = Date.now();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY); // { notes } en vol
    const other = [card({ id: 9, title: 'Ajoutée sur un autre appareil' })];
    const [item] = saver.reconcile(
      [{ meetingId: 'm-1', notes: 'Ancienne', actions: other }],
      since,
    );
    expect(item.notes).toBe('Seule la note change');
    expect(item.actions).toEqual(other);
    release();
  });
});

describe('handOver — l’arrêt et le rangement écrivent eux-mêmes', () => {
  it('rend l’état épuré de la réunion affichée, et null pour une autre', () => {
    const saver = makeSaver();
    expect(saver.handOver('m-1')).toEqual({ notes: 'Budget validé', actions: [card()] });
    expect(saver.handOver('m-2')).toBeNull();
    expect(saver.handOver(null)).toBeNull();
  });

  it('n’écrit rien lui-même', async () => {
    const saver = makeSaver();
    saver.handOver('m-1');
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(persist).not.toHaveBeenCalled();
  });

  it('oublie l’état connu en base : une valeur ramenée à l’identique repart quand même', async () => {
    // L'arrêt a écrit « Tapée pendant l'arrêt » hors de la file ; l'utilisateur
    // revient à la note d'avant. Sauter l'écriture parce que « la base l'a
    // déjà » laisserait en base la version de l'arrêt.
    const saver = makeSaver();
    saver.markClean('m-1', screen.notes, screen.actions);
    screen = { ...screen, notes: 'Tapée pendant l’arrêt' };
    saver.handOver('m-1'); // écrite par /history/stop
    screen = { ...screen, notes: 'Budget validé' };
    saver.schedule();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(persist).toHaveBeenCalledWith('m-1', { notes: 'Budget validé', actions: [card()] });
  });
});
