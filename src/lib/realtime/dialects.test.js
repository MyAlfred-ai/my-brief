/**
 * Dialectes Realtime — ce que les tests du canal ne montrent pas en détail :
 * la recomposition du texte de Speechmatics (ponctuation attachée) et la
 * règle du préfixe qui choisit le fournisseur.
 */
import { describe, it, expect } from 'vitest';
import { dialectProvider, speechmaticsText } from './dialects.js';

const item = (content, type = 'word', attaches_to = 'none') => ({
  type,
  attaches_to,
  alternatives: [{ content }],
});

describe('speechmaticsText', () => {
  it('colle la ponctuation selon `attaches_to`, d’un segment à l’autre', () => {
    const state = { started: false, glueNext: false };
    expect(
      speechmaticsText(
        {
          results: [
            item('Il'),
            item('dit'),
            item(':', 'punctuation', 'previous'),
            item('«', 'punctuation', 'next'),
          ],
        },
        state,
      ),
    ).toBe('Il dit: «');
    // Le segment suivant reste collé au guillemet ouvrant.
    expect(
      speechmaticsText({ results: [item('oui'), item('»', 'punctuation', 'previous')] }, state),
    ).toBe('oui»');
    expect(
      speechmaticsText(
        { results: [item('peut'), item('-', 'punctuation', 'both'), item('être')] },
        state,
      ),
    ).toBe(' peut-être');
  });

  it('sans `results`, retombe sur `metadata.transcript`', () => {
    const state = { started: true, glueNext: false };
    expect(speechmaticsText({ metadata: { transcript: 'Bonjour. ' } }, state)).toBe(' Bonjour.');
    expect(speechmaticsText({ metadata: { transcript: '' } }, state)).toBe('');
  });
});

describe('dialectProvider', () => {
  it('déduit le fournisseur du préfixe, OpenAI par défaut', () => {
    expect(dialectProvider('voxtral-mini-transcribe-realtime-2602')).toBe('mistral');
    expect(dialectProvider('speechmatics-enhanced')).toBe('speechmatics');
    expect(dialectProvider('universal-streaming-multilingual')).toBe('assemblyai');
    expect(dialectProvider('gpt-transcribe')).toBe('openai');
    expect(dialectProvider('')).toBe('openai');
  });
});
