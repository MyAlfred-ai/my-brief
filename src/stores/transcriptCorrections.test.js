/**
 * Corrections de la transcription — la liste de l'organisation et les « Mots
 * remplacés » du compte, compilées en un seul correcteur.
 *
 * Ce que ces tests protègent : un remplacement écrit dans les notes est versé
 * UNE fois dans la liste du compte, et s'applique aussitôt ; ce qui est déjà
 * corrigé ne repart pas au serveur ; le choix de ne rien apprendre est tenu ;
 * un échec n'est pas pris pour un « déjà proposé ».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const fetchUserCorrections = vi.fn();
const saveUserCorrectionsApi = vi.fn();
const learnUserCorrections = vi.fn();

vi.mock('../services/transcriptApi.js', () => ({
  fetchUserCorrections: (...a) => fetchUserCorrections(...a),
  saveUserCorrections: (...a) => saveUserCorrectionsApi(...a),
  learnUserCorrections: (...a) => learnUserCorrections(...a),
}));

const {
  adoptCorrections,
  correctTranscript,
  learnNoteReplacements,
  refreshUserCorrections,
  resetUserCorrections,
  saveUserCorrections,
  setTranscriptCorrections,
  setUserCorrections,
  transcriptCorrections,
  userCorrections,
} = await import('./transcriptCorrections.js');

/** Le serveur, en plus simple : ajoute chaque paire, et rend la liste. */
function serverLearns() {
  learnUserCorrections.mockImplementation(async (replacements) => {
    const rules = [
      ...get(userCorrections).rules,
      ...replacements.map(({ from, to }) => ({ from: [from], to })),
    ];
    return { ok: true, data: { settings: { rules, learn: true }, added: replacements } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetUserCorrections();
  setTranscriptCorrections([]);
  serverLearns();
});

describe('un seul correcteur pour deux listes', () => {
  it('applique la liste de l’organisation et celle du compte', () => {
    adoptCorrections({
      transcriptCorrections: [{ from: ['Klobex'], to: 'Globex' }],
      userTranscriptCorrections: { rules: [{ from: ['Durend'], to: 'Durand' }], learn: true },
    });
    expect(correctTranscript('M. Durend a vu Klobex.')).toBe('M. Durand a vu Globex.');
  });

  it('sur une même écriture, le mot juste du compte gagne', () => {
    adoptCorrections({
      transcriptCorrections: [{ from: ['Klobex'], to: 'Globex' }],
      userTranscriptCorrections: { rules: [{ from: ['klobex'], to: 'GLOBEX' }] },
    });
    expect(correctTranscript('On a revu Klobex.')).toBe('On a revu GLOBEX.');
  });

  it('les deux plafonds s’additionnent : la liste du compte ne chasse pas l’autre', () => {
    const personal = Array.from({ length: 100 }, (_, i) => ({ from: [`perso${i}x`], to: `P${i}` }));
    const shared = Array.from({ length: 50 }, (_, i) => ({ from: [`orga${i}x`], to: `O${i}` }));
    adoptCorrections({
      transcriptCorrections: shared,
      userTranscriptCorrections: { rules: personal },
    });
    expect(correctTranscript('perso99x et orga49x')).toBe('P99 et O49');
  });

  it('une réponse sans liste du compte : vide, apprentissage allumé', () => {
    adoptCorrections({ transcriptCorrections: [{ from: ['Klobex'], to: 'Globex' }] });
    expect(get(userCorrections)).toEqual({ rules: [], learn: true });
    expect(get(transcriptCorrections)).toHaveLength(1);
  });

  it('l’administration qui enregistre sa liste ne touche pas celle du compte', () => {
    setUserCorrections({ rules: [{ from: ['Durend'], to: 'Durand' }] });
    setTranscriptCorrections([{ from: ['Klobex'], to: 'Globex' }]);
    expect(get(userCorrections).rules).toHaveLength(1);
  });
});

describe('learnNoteReplacements', () => {
  it('verse le remplacement des notes dans la liste, et il s’applique aussitôt', async () => {
    const res = await learnNoteReplacements('Point budget.\nRemplace Durend par Durand');
    expect(learnUserCorrections).toHaveBeenCalledWith([{ from: 'Durend', to: 'Durand' }]);
    expect(res).toEqual({ ok: true, added: [{ from: 'Durend', to: 'Durand' }], full: false });
    expect(correctTranscript('Durend arrive.')).toBe('Durand arrive.');
  });

  it('ne repropose pas ce qui vient de l’être, ni ce qui est déjà corrigé', async () => {
    await learnNoteReplacements('Remplace Durend par Durand');
    await learnNoteReplacements('Remplace Durend par Durand\nUne ligne de plus');
    expect(learnUserCorrections).toHaveBeenCalledTimes(1);

    setTranscriptCorrections([{ from: ['Klobex'], to: 'Globex' }]);
    const res = await learnNoteReplacements('Klobex → Globex');
    expect(res.added).toEqual([]);
    expect(learnUserCorrections).toHaveBeenCalledTimes(1);
  });

  it('un remplacement retiré des réglages ne revient pas dans la même session', async () => {
    await learnNoteReplacements('Remplace Durend par Durand');
    setUserCorrections({ rules: [] });
    await learnNoteReplacements('Remplace Durend par Durand');
    expect(learnUserCorrections).toHaveBeenCalledTimes(1);
  });

  it('une consigne nouvelle part seule', async () => {
    await learnNoteReplacements('Remplace Durend par Durand');
    await learnNoteReplacements('Remplace Durend par Durand\nMarket → Marquet');
    expect(learnUserCorrections).toHaveBeenLastCalledWith([{ from: 'Market', to: 'Marquet' }]);
  });

  it('rien ne part quand le compte a coupé l’apprentissage', async () => {
    setUserCorrections({ rules: [], learn: false });
    const res = await learnNoteReplacements('Remplace Durend par Durand');
    expect(res).toEqual({ ok: true, added: [], full: false });
    expect(learnUserCorrections).not.toHaveBeenCalled();
  });

  it('rien ne part pour des notes sans remplacement à retenir', async () => {
    await learnNoteReplacements('Remplacer Paul par Marie sur le projet Atlas\nBudget → validé');
    expect(learnUserCorrections).not.toHaveBeenCalled();
  });

  it('un échec rend son slug, et la consigne sera reproposée', async () => {
    learnUserCorrections.mockResolvedValueOnce({
      ok: false,
      status: 0,
      data: { error: 'network' },
    });
    const failed = await learnNoteReplacements('Remplace Durend par Durand');
    expect(failed).toEqual({ ok: false, error: 'network', added: [], full: false });

    serverLearns();
    const retried = await learnNoteReplacements('Remplace Durend par Durand');
    expect(retried.added).toEqual([{ from: 'Durend', to: 'Durand' }]);
  });

  it('liste pleine : le serveur le dit, le store le rend', async () => {
    learnUserCorrections.mockResolvedValueOnce({
      ok: true,
      data: { settings: { rules: [], learn: true }, added: [], full: true },
    });
    const res = await learnNoteReplacements('Remplace Durend par Durand');
    expect(res).toEqual({ ok: true, added: [], full: true });
  });
});

describe('l’écran de réglages', () => {
  it('relit la liste du compte', async () => {
    fetchUserCorrections.mockResolvedValue({
      ok: true,
      data: { settings: { rules: [{ from: ['Durend'], to: 'Durand' }], learn: false } },
    });
    expect(await refreshUserCorrections()).toEqual({ ok: true });
    expect(get(userCorrections)).toEqual({
      rules: [{ from: ['Durend'], to: 'Durand' }],
      learn: false,
    });
  });

  it('enregistre, et rend le slug du serveur en échec', async () => {
    saveUserCorrectionsApi.mockResolvedValueOnce({
      ok: true,
      data: { settings: { rules: [{ from: ['Durend'], to: 'Durand' }], learn: true } },
    });
    expect(await saveUserCorrections({ rules: [{ from: ['Durend'], to: 'Durand' }] })).toEqual({
      ok: true,
    });
    expect(correctTranscript('Durend')).toBe('Durand');

    saveUserCorrectionsApi.mockResolvedValueOnce({
      ok: false,
      status: 403,
      data: { error: 'bad_origin' },
    });
    expect(await saveUserCorrections({ learn: false })).toEqual({
      ok: false,
      error: 'bad_origin',
    });
    expect(get(userCorrections).learn).toBe(true);
  });

  it('la déconnexion ne laisse rien au compte suivant', async () => {
    await learnNoteReplacements('Remplace Durend par Durand');
    resetUserCorrections();
    expect(correctTranscript('Durend')).toBe('Durend');
    // Et sa mémoire de session non plus : la même consigne repart pour le suivant.
    await learnNoteReplacements('Remplace Durend par Durand');
    expect(learnUserCorrections).toHaveBeenCalledTimes(2);
  });
});
