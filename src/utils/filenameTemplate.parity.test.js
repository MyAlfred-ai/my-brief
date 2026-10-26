/**
 * Parité entre les DEUX implémentations du gabarit de nom de fichier.
 *
 * Elles existent toutes les deux parce que la duplication est structurelle :
 * le conteneur de l'API ne copie que `server.js app.js lib routes`
 * (services/api/Dockerfile), il ne peut donc pas importer `src/`. Et le nom réel
 * est fabriqué côté navigateur, puisque c'est lui qui produit les octets du PDF.
 *
 * Ce test est le filet de cette duplication. Il ne tourne qu'en développement et
 * en CI (le projet vitest `node` inclut `src/**` ET `services/**`), jamais dans
 * le conteneur — exactement ce qu'il faut.
 *
 * Une divergence ici n'est pas cosmétique : le serveur renomme la pièce jointe
 * que le client a nommée (cf. `renamed` dans lib/actions/execute.js). Deux règles
 * différentes, et l'utilisateur voit son fichier changer de nom en route.
 */
import { describe, it, expect } from 'vitest';
import {
  renderFilenameTemplate as client,
  renderSubjectTemplate as clientSubject,
} from './filename.js';
import {
  renderFilenameTemplate as server,
  renderActionTemplate as serverSubject,
} from '../../services/api/lib/actions/templating.js';

const VARS = {
  titre: 'Comité du 8 — été',
  date: '2026-08-09',
  type: 'Résumé',
  compte: 'moi@client.fr',
};

const CASES = [
  ['{{date}}-{{titre}}', 'pdf'],
  ['{{titre}}', 'txt'],
  ['{{type}} {{date}}', 'pdf'],
  ['CR-{{title}}', 'pdf'],
  // Variable inconnue : retirée des deux côtés.
  ['{{client}}-{{titre}}', 'pdf'],
  // Extension jamais gabaritable.
  ['{{titre}}.exe', 'pdf'],
  // Gabarit stérile : null des deux côtés, l'appelant retombe sur le nom intégré.
  ['{{client}}', 'pdf'],
  ['', 'pdf'],
  ['   ', 'txt'],
  // Passe unique : la valeur substituée n'est pas re-balayée.
  ['{{titre}}', 'pdf'],
  // Chemin et caractères interdits.
  ['{{compte}}', 'txt'],
];

describe('renderFilenameTemplate — client et serveur', () => {
  for (const [template, ext] of CASES) {
    it(`rend la même chose pour « ${template || '(vide)'} » en .${ext}`, () => {
      expect(client(template, VARS, { ext })).toBe(server(template, VARS, { ext }));
    });
  }

  it('reste d’accord sur les valeurs piégeuses', () => {
    const pieges = [
      { ...VARS, titre: '../../secret' },
      { ...VARS, titre: '{{date}}' },
      { ...VARS, titre: 'Point\r\nBcc: victime@ailleurs.com' },
      { ...VARS, titre: 'a'.repeat(300) },
      { ...VARS, titre: '' },
    ];
    for (const vars of pieges) {
      expect(client('{{date}}-{{titre}}', vars, { ext: 'pdf' })).toBe(
        server('{{date}}-{{titre}}', vars, { ext: 'pdf' }),
      );
    }
  });
});

/**
 * L'objet du brouillon « Rédiger dans ma messagerie » se développe côté client
 * (le serveur ne voit pas ce mail) : il doit rester celui de l'envoi automatique.
 */
describe('renderSubjectTemplate — client et serveur', () => {
  const SUBJECTS = [
    'CR {{titre}} — {{date}}',
    '{{type}} : {{title}} ({{account}})',
    '{{client}} {{titre}}',
    '{{client}}',
    '',
    '   ',
  ];

  for (const template of SUBJECTS) {
    it(`rend le même objet pour « ${template || '(vide)'} »`, () => {
      expect(clientSubject(template, VARS)).toBe(serverSubject(template, VARS));
    });
  }

  it('reste d’accord sur les valeurs piégeuses', () => {
    const pieges = [
      { ...VARS, titre: '{{date}}' },
      { ...VARS, titre: 'Point\r\nBcc: victime@ailleurs.com' },
      { ...VARS, titre: 'a'.repeat(300) },
      { ...VARS, titre: '' },
    ];
    for (const vars of pieges) {
      expect(clientSubject('CR {{titre}}', vars)).toBe(serverSubject('CR {{titre}}', vars));
    }
  });
});
