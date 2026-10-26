/**
 * La question « Quel type de réunion ? » : startRecording attend la réponse,
 * et la fenêtre disparaît dès qu'elle est donnée — y compris « Annuler ».
 */
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { meetingTypeAsked, askMeetingType, answerMeetingType } from './meetingType.js';

describe('meetingType', () => {
  it('pose la question, puis rend la réponse et referme la fenêtre', async () => {
    const pending = askMeetingType();
    expect(get(meetingTypeAsked)).toBe(true);
    answerMeetingType(true);
    await expect(pending).resolves.toBe(true);
    expect(get(meetingTypeAsked)).toBe(false);
  });

  it('« Annuler » répond null : startRecording renonce à démarrer', async () => {
    const pending = askMeetingType();
    answerMeetingType(null);
    await expect(pending).resolves.toBeNull();
    expect(get(meetingTypeAsked)).toBe(false);
  });

  it('une réponse en trop (double clic) est sans effet', async () => {
    const pending = askMeetingType();
    answerMeetingType(false);
    answerMeetingType(true);
    await expect(pending).resolves.toBe(false);
  });
});

describe('meetingType — ce que la visio va ouvrir', () => {
  it('garde le contexte de la question : fenêtre de partage, ou périphérique nommé', async () => {
    const { meetingTypeContext } = await import('./meetingType.js');
    const first = askMeetingType();
    expect(get(meetingTypeContext)).toEqual({ path: 'share' });
    answerMeetingType(false);
    await first;

    const second = askMeetingType({ path: 'device', deviceLabel: 'BlackHole 2ch' });
    expect(get(meetingTypeContext)).toEqual({ path: 'device', deviceLabel: 'BlackHole 2ch' });
    answerMeetingType(true);
    await expect(second).resolves.toBe(true);
  });
});
