/**
 * Recherche élargie dans myBrain (lib/aiHelp/brainSearch.js) — contre un
 * myBrain factice qui cherche comme le vrai : plein texte par PRÉFIXE, tous
 * les mots exigés, aucune faute tolérée.
 *
 * Ce que ces tests protègent : un nom que la transcription a écorché retrouve
 * quand même sa fiche, une fiche désignée par son nom passe devant une fiche
 * qui le cite, et une lecture en panne n'arrête pas les autres.
 */
import { describe, it, expect } from 'vitest';
import { searchBrain, titleMatches, BRAIN_NAMES_MAX } from '../lib/aiHelp/brainSearch.js';

class BrainDown extends Error {}

const SHEETS = [
  { path: 'p/ambre', title: 'Projet AMBRE', content: 'Refonte du portail client de Marquet.' },
  {
    path: 'c/marquet',
    title: 'Marquet',
    content: 'Client de la logistique. Projet en cours : AMBRE.',
  },
  { path: 'c/collinet', title: 'Collinet SAS', content: 'Client. Contact : la direction.' },
  {
    path: 'n/copil',
    title: 'Compte rendu du copil',
    content: 'On a parlé de Marquet et du budget.',
  },
];

function fakeBrain({ sheets = SHEETS, byName = {}, failing = () => false } = {}) {
  const calls = [];
  const tokens = (text) =>
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  return {
    calls,
    deps: {
      isBrainFailure: (err) => err instanceof BrainDown,
      search: async (query, limit) => {
        calls.push(`search:${query}`);
        if (failing('search', query)) throw new BrainDown('search');
        const words = tokens(query);
        return sheets
          .filter((sheet) =>
            words.every((word) =>
              tokens(`${sheet.title} ${sheet.content}`).some((token) => token.startsWith(word)),
            ),
          )
          .slice(0, limit)
          .map(({ path, title }) => ({ path, title }));
      },
      sheetByName: async (name) => {
        calls.push(`name:${name}`);
        if (failing('name', name)) throw new BrainDown('name');
        const path = byName[name.toLowerCase()];
        const sheet = sheets.find((entry) => entry.path === path);
        if (sheet) return sheet;
        const err = new BrainDown('introuvable');
        err.candidates = [];
        throw err;
      },
      readSheet: async (path) => {
        calls.push(`read:${path}`);
        if (failing('read', path)) throw new BrainDown('read');
        return sheets.find((entry) => entry.path === path);
      },
    },
  };
}

describe('titleMatches', () => {
  it('le même nom, ou celui qui sonne pareil', () => {
    expect(titleMatches('Projet AMBRE', 'ambre')).toBe(true);
    expect(titleMatches('Marquet', 'Market')).toBe(true);
    expect(titleMatches('Collinet SAS', 'Colinnet')).toBe(true);
    expect(titleMatches('Projet AMBRE', 'projet arbre')).toBe(true);
  });

  it('une fiche qui ne fait que CITER le nom ne le porte pas', () => {
    expect(titleMatches('Compte rendu du copil', 'Marquet')).toBe(false);
    expect(titleMatches('Projet AMBRE', 'Atlas')).toBe(false);
    expect(titleMatches('', 'Atlas')).toBe(false);
  });
});

describe('searchBrain', () => {
  it('un nom bien écrit : sa fiche d’abord, celles qui le citent ensuite', async () => {
    const brain = fakeBrain();
    const { sheets, matched } = await searchBrain({ ...brain.deps, names: ['Marquet'] });
    expect(sheets.map((sheet) => sheet.path)).toEqual(['c/marquet', 'p/ambre', 'n/copil']);
    expect(matched).toEqual([]); // rien à rapprocher : il était bien écrit
  });

  it('un nom écorché : le préfixe, puis l’oreille, retrouvent la fiche', async () => {
    const brain = fakeBrain();
    const { sheets, matched } = await searchBrain({ ...brain.deps, names: ['Market'] });
    expect(brain.calls).toEqual(expect.arrayContaining(['search:Market', 'search:mar']));
    expect(sheets.map((sheet) => sheet.path)).toEqual(['c/marquet']);
    expect(matched).toEqual([{ heard: 'Market', title: 'Marquet' }]);
  });

  it('le préfixe ne ramène pas n’importe quoi : seul un titre qui sonne pareil est gardé', async () => {
    const brain = fakeBrain({
      sheets: [
        ...SHEETS,
        { path: 'x/marges', title: 'Marges internes', content: 'Mode d’emploi.' },
      ],
    });
    const { sheets } = await searchBrain({ ...brain.deps, names: ['Market'] });
    expect(sheets.map((sheet) => sheet.path)).toEqual(['c/marquet']);
  });

  it('la fiche que myBrain résout par son nom (un alias) passe devant tout, sans relecture', async () => {
    const brain = fakeBrain({ byName: { portail: 'p/ambre' } });
    const { sheets } = await searchBrain({ ...brain.deps, names: ['Portail'] });
    expect(sheets[0].path).toBe('p/ambre');
    expect(brain.calls).not.toContain('read:p/ambre');
  });

  it('plusieurs graphies d’un même nom ne lisent pas la fiche deux fois', async () => {
    const brain = fakeBrain();
    const { sheets } = await searchBrain({ ...brain.deps, names: ['AMBRE', 'Ambre', 'ambre'] });
    expect(sheets.filter((sheet) => sheet.path === 'p/ambre')).toHaveLength(1);
    expect(brain.calls.filter((call) => call === 'search:AMBRE')).toHaveLength(1);
    expect(brain.calls).not.toContain('search:Ambre');
  });

  it('les sujets complètent, derrière les noms', async () => {
    const brain = fakeBrain();
    const { sheets } = await searchBrain({
      ...brain.deps,
      names: ['Collinet'],
      topics: ['budget'],
    });
    expect(sheets.map((sheet) => sheet.path)).toEqual(['c/collinet', 'n/copil']);
  });

  it('ce que le contexte a déjà rendu n’est pas relu, et le nombre de fiches est borné', async () => {
    const brain = fakeBrain();
    const { sheets } = await searchBrain({
      ...brain.deps,
      names: ['Marquet'],
      known: ['c/marquet'],
      max: 1,
    });
    expect(sheets.map((sheet) => sheet.path)).toEqual(['p/ambre']);
  });

  it('une lecture en panne n’arrête pas les autres', async () => {
    const brain = fakeBrain({ failing: (kind, what) => kind === 'name' || what === 'p/ambre' });
    const { sheets } = await searchBrain({ ...brain.deps, names: ['Marquet'] });
    expect(sheets.map((sheet) => sheet.path)).toEqual(['c/marquet', 'n/copil']);
  });

  it('une erreur qui n’est pas une panne de myBrain remonte', async () => {
    const brain = fakeBrain();
    brain.deps.search = async () => {
      throw new TypeError('bug');
    };
    await expect(searchBrain({ ...brain.deps, names: ['Marquet'] })).rejects.toThrow('bug');
  });

  it('rien à chercher, ou trop : aucun appel, et jamais plus de noms que le plafond', async () => {
    const idle = fakeBrain();
    expect(await searchBrain({ ...idle.deps, names: ['', ' ', 'a'] })).toEqual({
      sheets: [],
      matched: [],
    });
    expect(idle.calls).toEqual([]);

    const busy = fakeBrain();
    await searchBrain({
      ...busy.deps,
      names: Array.from({ length: 20 }, (_, i) => `Inconnu${String.fromCharCode(65 + i)}`),
    });
    expect(busy.calls.filter((call) => call.startsWith('name:'))).toHaveLength(BRAIN_NAMES_MAX);
  });
});
