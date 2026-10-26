/**
 * Gabarits d'objet et de nom de fichier (lib/actions/templating.js).
 *
 * Le test central est celui de la PASSE UNIQUE. C'est la seule différence de
 * fond avec `interpolateTemplate` (src/config/templates.js), et c'est celle qui
 * justifie de ne pas l'avoir réutilisée : là-bas, une valeur substituée qui
 * contiendrait `{{date}}` serait à son tour développée. Ici, l'objet d'un mail
 * est alimenté par un titre de réunion dicté à la voix, et part chez des tiers.
 */
import { describe, it, expect } from 'vitest';
import {
  renderActionTemplate,
  renderFilenameTemplate,
  listTemplateVariables,
  slugifySegment,
} from '../lib/actions/templating.js';

const VARS = { titre: 'Point client', date: '2026-08-09', type: 'Résumé', compte: 'moi@client.fr' };

describe('renderActionTemplate', () => {
  it('développe les variables connues', () => {
    expect(renderActionTemplate('CR {{titre}} — {{date}}', VARS)).toBe(
      'CR Point client — 2026-08-09',
    );
  });

  it('accepte les alias anglais', () => {
    expect(renderActionTemplate('{{title}} / {{kind}}', VARS)).toBe('Point client / Résumé');
  });

  it('RETIRE une variable inconnue au lieu de la laisser littérale', () => {
    // Personne ne veut lire `{{client}}` dans l'objet d'un mail arrivé chez un
    // client.
    expect(renderActionTemplate('CR {{client}} {{titre}}', VARS)).toBe('CR Point client');
  });

  it('ne réinterpole pas une valeur substituée — passe UNIQUE', () => {
    const piege = { ...VARS, titre: '{{date}}' };
    expect(renderActionTemplate('{{titre}}', piege)).toBe('{{date}}');
  });

  it('retire les retours à la ligne des VALEURS — injection d’en-tête', () => {
    const piege = { ...VARS, titre: 'Point\r\nBcc: victime@ailleurs.com' };
    const rendu = renderActionTemplate('CR {{titre}}', piege);
    expect(rendu).not.toMatch(/[\r\n]/);
    expect(rendu).toBe('CR Point Bcc: victime@ailleurs.com');
  });

  it('plafonne la longueur du résultat', () => {
    const long = { ...VARS, titre: 'a'.repeat(500) };
    expect(renderActionTemplate('{{titre}}', long, { max: 50 })).toHaveLength(50);
  });

  it('gabarit vide ⇒ chaîne vide, pour que l’appelant garde sa valeur intégrée', () => {
    expect(renderActionTemplate('', VARS)).toBe('');
    expect(renderActionTemplate('   ', VARS)).toBe('');
    expect(renderActionTemplate(undefined, VARS)).toBe('');
  });

  it('tolère une variable absente du contexte', () => {
    expect(renderActionTemplate('CR {{titre}}', {})).toBe('CR');
  });
});

describe('listTemplateVariables', () => {
  it('sépare le connu de l’inconnu', () => {
    const { known, unknown } = listTemplateVariables('{{titre}} {{client}} {{date}} {{client}}');
    expect(known).toEqual(['titre', 'date']);
    expect(unknown).toEqual(['client']);
  });

  it('canonise les alias', () => {
    expect(listTemplateVariables('{{title}}').known).toEqual(['titre']);
  });
});

describe('renderFilenameTemplate', () => {
  it('produit un nom sluggé, extension ajoutée après coup', () => {
    expect(renderFilenameTemplate('{{date}}-{{titre}}', VARS, { ext: 'pdf' })).toBe(
      '2026-08-09-point-client.pdf',
    );
  });

  it("n'autorise jamais l'extension à venir du gabarit", () => {
    expect(renderFilenameTemplate('{{titre}}.exe', VARS, { ext: 'pdf' })).toBe(
      'point-client-exe.pdf',
    );
  });

  it('neutralise un chemin', () => {
    const piege = { ...VARS, titre: '../../secret' };
    expect(renderFilenameTemplate('{{titre}}', piege, { ext: 'txt' })).toBe('secret.txt');
  });

  it('gabarit vide ou stérile ⇒ null, pour retomber sur le nom intégré', () => {
    expect(renderFilenameTemplate('', VARS, { ext: 'pdf' })).toBeNull();
    expect(renderFilenameTemplate('{{client}}', VARS, { ext: 'pdf' })).toBeNull();
  });
});

describe('slugifySegment', () => {
  it('décompose les accents plutôt que de les garder', () => {
    // Les API de Drive les acceptent, mais leur normalisation diffère d'une
    // plateforme à l'autre : deux fichiers d'apparence identique cohabitent.
    expect(slugifySegment('Comité du 8 — été')).toBe('comite-du-8-ete');
  });

  it('borne la longueur', () => {
    expect(slugifySegment('a'.repeat(200))).toHaveLength(80);
  });
});
