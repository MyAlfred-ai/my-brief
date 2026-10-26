/**
 * Rédactions en cours — rattachées chacune à SA réunion.
 *
 * Ce qui se vérifie ici : une rédaction s'inscrit et se retire par sa version
 * (pas par réunion : une réunion sans identifiant n'en a pas), la Sidebar lit
 * les identifiants des lignes à animer, et App retrouve la version en attente
 * d'une réunion qu'il rouvre — par identifiant, quelle qu'en soit la forme.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  summaryGenerations,
  generatingMeetingIds,
  beginSummaryGeneration,
  endSummaryGeneration,
  pendingVersionFor,
} from './summaryGeneration.js';

beforeEach(() => summaryGenerations.set([]));

describe('summaryGeneration — inscription et retrait', () => {
  it('inscrit une rédaction et la retire par sa version', () => {
    beginSummaryGeneration('m-1', { id: 'v-1' });
    expect(get(generatingMeetingIds).has('m-1')).toBe(true);
    endSummaryGeneration('v-1');
    expect(get(generatingMeetingIds).size).toBe(0);
    expect(pendingVersionFor('m-1')).toBeNull();
  });

  it('plusieurs réunions à la fois : chacune sa ligne, chacune sa version', () => {
    beginSummaryGeneration('m-1', { id: 'v-1' });
    beginSummaryGeneration('m-2', { id: 'v-2' });
    expect([...get(generatingMeetingIds)].sort()).toEqual(['m-1', 'm-2']);
    endSummaryGeneration('v-1');
    expect(get(generatingMeetingIds).has('m-1')).toBe(false);
    expect(pendingVersionFor('m-2')).toEqual({ id: 'v-2' });
  });

  it('retirer une version inconnue ne touche à rien', () => {
    beginSummaryGeneration('m-1', { id: 'v-1' });
    endSummaryGeneration('v-autre');
    expect(pendingVersionFor('m-1')).toEqual({ id: 'v-1' });
  });
});

describe('summaryGeneration — réunion rouverte pendant sa rédaction', () => {
  it('rend la version en attente de la réunion, par identifiant normalisé', () => {
    // Les identifiants circulent tantôt en chaîne, tantôt bruts (document
    // Mongo) : la comparaison passe par String, comme meetingIdOf.
    beginSummaryGeneration(42, { id: 'v-1' });
    expect(pendingVersionFor('42')).toEqual({ id: 'v-1' });
    expect(get(generatingMeetingIds).has('42')).toBe(true);
  });

  it('une autre réunion n’a rien à remettre', () => {
    beginSummaryGeneration('m-1', { id: 'v-1' });
    expect(pendingVersionFor('m-2')).toBeNull();
  });

  it('réunion sans identifiant (audio importé) : inscrite, sans ligne à animer ni retour possible', () => {
    beginSummaryGeneration(null, { id: 'v-1' });
    expect(get(summaryGenerations)).toHaveLength(1);
    expect(get(generatingMeetingIds).size).toBe(0);
    expect(pendingVersionFor(null)).toBeNull();
    endSummaryGeneration('v-1');
    expect(get(summaryGenerations)).toHaveLength(0);
  });
});
