/**
 * Corps envoyés par l'onglet IA. Les tests du composant simulent ce module :
 * c'est ici, et seulement ici, que le NOM des champs attendus par le serveur
 * est tenu (routes/auth/schemas.js refuse tout champ inconnu).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn();
vi.mock('./apiClient.js', () => ({ post: (...a) => post(...a), get: vi.fn() }));

const { testTranscriptionModel } = await import('./adminUsersApi.js');

beforeEach(() => post.mockReset());

describe('testTranscriptionModel', () => {
  it('la clé tierce collée part en `providerKey`, quel que soit le fournisseur', async () => {
    await testTranscriptionModel('speechmatics-melia-1', 'cle-collee');
    expect(post).toHaveBeenCalledWith('/admin/settings/ai/test-transcription', {
      model: 'speechmatics-melia-1',
      providerKey: 'cle-collee',
    });
  });

  it('sans clé collée, le modèle seul ; sans modèle, pas de corps', async () => {
    await testTranscriptionModel('gpt-transcribe');
    await testTranscriptionModel('');
    expect(post.mock.calls).toEqual([
      ['/admin/settings/ai/test-transcription', { model: 'gpt-transcribe' }],
      ['/admin/settings/ai/test-transcription', undefined],
    ]);
  });
});
