import { describe, it, expect } from 'vitest';
import { scaffoldToTiptapDoc, tiptapDocToScaffold } from './scaffold.js';

const p = (text) =>
  text === undefined
    ? { type: 'paragraph' }
    : { type: 'paragraph', content: [{ type: 'text', text }] };

describe('scaffold ⇄ TipTap — paragraphes vides (sauts de ligne voulus)', () => {
  it('les paragraphes vides survivent à la sérialisation via le marqueur <br>', () => {
    // Avant le marqueur, un paragraphe vide devenait '' puis était avalé par
    // le join('\n\n') + la compression : les sauts de ligne tapés dans
    // « Mise en forme du résumé » disparaissaient à l'enregistrement.
    const doc = { type: 'doc', content: [p('Ligne 1'), p(), p(), p('Ligne 2')] };
    const md = tiptapDocToScaffold(doc);
    expect(md).toBe('Ligne 1\n\n<br>\n\n<br>\n\nLigne 2');
  });

  it('round-trip complet : le nombre et l’ordre des blocs sont préservés', () => {
    const doc = { type: 'doc', content: [p('Avant'), p(), p('Après')] };
    const back = scaffoldToTiptapDoc(tiptapDocToScaffold(doc));
    expect(back.content).toHaveLength(3);
    expect(back.content.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(back.content[1].content).toBeUndefined();
  });

  it('une ligne <br> (variantes <br/>, <br />) parse en paragraphe vide', () => {
    const back = scaffoldToTiptapDoc('A\n\n<br/>\n\n<br />\n\nB');
    expect(back.content).toHaveLength(4);
    expect(back.content[1].content).toBeUndefined();
    expect(back.content[2].content).toBeUndefined();
  });

  it('un document fait uniquement de paragraphes vides reste un scaffold vide', () => {
    expect(tiptapDocToScaffold({ type: 'doc', content: [p(), p()] })).toBe('');
  });

  it('NON-RÉGRESSION : la ligne vide simple du markdown reste un séparateur, pas un bloc', () => {
    const back = scaffoldToTiptapDoc('A\n\nB');
    expect(back.content).toHaveLength(2);
  });
});
