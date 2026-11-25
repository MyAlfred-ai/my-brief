/**
 * Le Markdown simple des réponses de l'Aide IA (utils/miniMarkdown.js).
 *
 * Deux garanties : ce qu'une fiche de myBrain emploie est compris — gras,
 * listes, liens, liens de wiki —, et RIEN de ce qu'un texte contient ne devient
 * autre chose qu'un nœud de texte ou un lien http(s).
 */
import { describe, it, expect } from 'vitest';
import { closeOpenMarkdown, parseMarkdown } from './miniMarkdown.js';

const text = (v) => ({ t: 'text', v });

describe('parseMarkdown — les blocs', () => {
  it('une ligne, un paragraphe ; les lignes vides ne comptent pas', () => {
    expect(parseMarkdown('Bonjour.\n\nLe lot 2 est en retard.')).toEqual([
      { t: 'p', c: [text('Bonjour.')] },
      { t: 'p', c: [text('Le lot 2 est en retard.')] },
    ]);
  });

  it('les listes à puces et numérotées se regroupent', () => {
    expect(
      parseMarkdown('En bref :\n- Budget validé.\n* Livraison fin mars.\n1. Devis\n2) Recette'),
    ).toEqual([
      { t: 'p', c: [text('En bref :')] },
      { t: 'ul', items: [[text('Budget validé.')], [text('Livraison fin mars.')]] },
      { t: 'ol', items: [[text('Devis')], [text('Recette')]] },
    ]);
  });

  it('un titre devient une ligne en gras ; une citation, une citation', () => {
    expect(parseMarkdown('## Objectif\n> Livrer en mars')).toEqual([
      { t: 'h', c: [text('Objectif')] },
      { t: 'quote', c: [text('Livrer en mars')] },
    ]);
  });

  it('un tableau est aplati, son trait de séparation oublié', () => {
    expect(parseMarkdown('| Lot | Date |\n|---|:--:|\n| Lot 2 | 15 mars |')).toEqual([
      { t: 'p', c: [text('Lot · Date')] },
      { t: 'p', c: [text('Lot 2 · 15 mars')] },
    ]);
  });

  it('un bloc de code garde son contenu tel quel, même jamais refermé', () => {
    expect(parseMarkdown('```js\nconst a = **1**;\n```')).toEqual([
      { t: 'pre', v: 'const a = **1**;' },
    ]);
    expect(parseMarkdown('```\nà suivre')).toEqual([{ t: 'pre', v: 'à suivre' }]);
  });
});

describe('parseMarkdown — en ligne', () => {
  const inline = (source, base) => parseMarkdown(source, { base })[0].c;

  it('gras, italique, code — imbriqués', () => {
    expect(inline('Le **projet _AMBRE_** est `prioritaire`, *vraiment*.')).toEqual([
      text('Le '),
      { t: 'strong', c: [text('projet '), { t: 'em', c: [text('AMBRE')] }] },
      text(' est '),
      { t: 'code', v: 'prioritaire' },
      text(', '),
      { t: 'em', c: [text('vraiment')] },
      text('.'),
    ]);
  });

  it('ce qui ressemble à de la syntaxe sans en être reste du texte', () => {
    expect(inline('2 * 3 * 4 = 24, et le champ user_name_id.')).toEqual([
      text('2 * 3 * 4 = 24, et le champ user_name_id.'),
    ]);
    expect(inline('Un seul ** astérisque double.')).toEqual([
      text('Un seul ** astérisque double.'),
    ]);
  });

  it('un lien http(s) est cliquable ; un lien relatif part de la base donnée', () => {
    expect(inline('Voir [la fiche](https://cerveau.example.test/cerveau?f=a).')).toEqual([
      text('Voir '),
      { t: 'link', href: 'https://cerveau.example.test/cerveau?f=a', c: [text('la fiche')] },
      text('.'),
    ]);
    expect(inline('[Atlas](/cerveau?f=wiki/atlas.md)', 'https://cerveau.example.test')).toEqual([
      {
        t: 'link',
        href: 'https://cerveau.example.test/cerveau?f=wiki/atlas.md',
        c: [text('Atlas')],
      },
    ]);
  });

  it('tout autre lien n’est que son texte — jamais une adresse exécutable', () => {
    for (const url of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html;base64,AAAA',
      'vbscript:x',
      '//evil.example',
      '/cerveau?f=a', // relatif, mais aucune base
      'mailto:a@b.c',
    ]) {
      expect(inline(`[clique](${url})`), url).toEqual([text('clique')]);
    }
  });

  it('une adresse peut contenir une paire de parenthèses', () => {
    expect(inline('[Mars](https://fr.example.test/wiki/Mars_(planète)) est loin.')).toEqual([
      { t: 'link', href: 'https://fr.example.test/wiki/Mars_(plan%C3%A8te)', c: [text('Mars')] },
      text(' est loin.'),
    ]);
  });

  it('un lien de wiki rend son texte, sans crochets', () => {
    expect(inline('Cf. [[Projet Atlas]] et [[wiki/clients/acme|le client]].')).toEqual([
      text('Cf. Projet Atlas et le client.'),
    ]);
  });

  it('des balises écrites dans le texte restent du texte', () => {
    expect(inline('<img src=x onerror=alert(1)> **ok**')).toEqual([
      text('<img src=x onerror=alert(1)> '),
      { t: 'strong', c: [text('ok')] },
    ]);
  });
});

describe('closeOpenMarkdown — un texte en train de s’écrire', () => {
  it('referme le gras et le code restés ouverts sur la dernière ligne', () => {
    expect(closeOpenMarkdown('Le **projet SAB')).toBe('Le **projet SAB**');
    expect(closeOpenMarkdown('Lance `npm te')).toBe('Lance `npm te`');
    expect(closeOpenMarkdown('**Fini**\nLe **début')).toBe('**Fini**\nLe **début**');
    expect(closeOpenMarkdown('Rien à fermer.')).toBe('Rien à fermer.');
  });

  it('tait un lien dont on n’a que le début', () => {
    expect(closeOpenMarkdown('Voir [la fic')).toBe('Voir ');
    expect(closeOpenMarkdown('Voir [la fiche](https://cerv')).toBe('Voir ');
    expect(closeOpenMarkdown('Cf. [[Projet At')).toBe('Cf. ');
    expect(closeOpenMarkdown('Voir [la fiche](https://a.b) puis')).toBe(
      'Voir [la fiche](https://a.b) puis',
    );
  });
});
