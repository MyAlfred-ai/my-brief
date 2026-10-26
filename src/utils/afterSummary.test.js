/**
 * « Et maintenant ? » — ce que la fenêtre qui suit le premier résumé annonce
 * (utils/afterSummary.js).
 *
 * L'aperçu doit suivre la règle du SERVEUR, dans le même ordre
 * (services/api/lib/actions/resolve.js) : une fenêtre qui annoncerait un
 * dossier et en verrait un autre servi serait pire que pas d'aperçu.
 */
import { describe, it, expect } from 'vitest';
import {
  afterSummaryChoices,
  mailPlan,
  listAfterRemoval,
  storagePreview,
  readablePath,
  launchLabel,
  freshTagColor,
} from './afterSummary.js';
import { looksLikeEmail } from './mailDraft.js';

const ACME = { id: 't-acme', label: 'Client Acme', color: 'red' };

const SETTINGS = {
  mail: {
    recipients: ['equipe@moi.fr'],
    tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com'] }],
  },
  storage: { folder: 'CR', driveId: '', driveName: '', tagSubfolders: false, tagFolders: [] },
};

describe('afterSummaryChoices', () => {
  const OPEN = {
    summary: { email: true, storage: true },
    emailReady: true,
    storageProvider: 'google',
  };

  it('mail et dépôt suivent les mêmes conditions que « Partager »', () => {
    expect(afterSummaryChoices(OPEN, { tagged: false })).toEqual({
      email: true,
      storage: true,
      any: true,
    });
    // Interrupteur ouvert mais aucun moyen d'envoi : le bouton échouerait.
    expect(afterSummaryChoices({ ...OPEN, emailReady: false }, { tagged: true }).email).toBe(false);
    // Aucun fournisseur choisi : rien où déposer.
    expect(afterSummaryChoices({ ...OPEN, storageProvider: '' }, { tagged: true }).storage).toBe(
      false,
    );
  });

  it('une réunion rangée, sans mail ni dépôt ouverts, n’a rien à se voir proposer', () => {
    const closed = { summary: { email: false, storage: false }, emailReady: true };
    expect(afterSummaryChoices(closed, { tagged: true }).any).toBe(false);
    // …mais une réunion SANS tag peut toujours être rangée.
    expect(afterSummaryChoices(closed, { tagged: false }).any).toBe(true);
    expect(afterSummaryChoices(null, { tagged: false }).any).toBe(true);
  });
});

describe('mailPlan', () => {
  it('le tag qui a sa liste la montre, et les ajouts y vont', () => {
    expect(mailPlan(SETTINGS, 't-acme')).toEqual({
      source: 'tag',
      recipients: ['dg@acme.com'],
      target: 't-acme',
    });
  });

  it('un tag SANS liste montre la liste par défaut, mais les ajouts vont au TAG', () => {
    // L'adresse d'un client ne doit jamais entrer dans la liste par défaut, où
    // elle recevrait les comptes rendus de tous les autres.
    expect(mailPlan(SETTINGS, 't-autre')).toEqual({
      source: 'user',
      recipients: ['equipe@moi.fr'],
      target: 't-autre',
    });
  });

  it('sans tag, la liste par défaut est la seule qui existe', () => {
    expect(mailPlan(SETTINGS, null)).toEqual({
      source: 'user',
      recipients: ['equipe@moi.fr'],
      target: null,
    });
  });
});

describe('listAfterRemoval', () => {
  it('retire l’adresse de la liste visée', () => {
    expect(
      listAfterRemoval({
        settings: SETTINGS,
        target: 't-acme',
        recipients: ['dg@acme.com', 'compta@acme.com'],
        address: 'compta@acme.com',
        seeded: false,
      }),
    ).toEqual(['dg@acme.com']);
  });

  it('une liste de tag née ici, revenue à la liste par défaut, est RETIRÉE', () => {
    // Faute de frappe corrigée : le tag retombe sur la liste par défaut au lieu
    // d'en garder une copie figée.
    expect(
      listAfterRemoval({
        settings: SETTINGS,
        target: 't-autre',
        recipients: ['equipe@moi.fr', 'typo@acme.cmo'],
        address: 'typo@acme.cmo',
        seeded: true,
      }),
    ).toEqual([]);
  });

  it('une liste par défaut n’est jamais vidée par ce raccourci', () => {
    expect(
      listAfterRemoval({
        settings: SETTINGS,
        target: null,
        recipients: ['equipe@moi.fr', 'x@y.fr'],
        address: 'x@y.fr',
        seeded: true,
      }),
    ).toEqual(['equipe@moi.fr']);
  });
});

describe('storagePreview — même ordre que resolveFolder', () => {
  it('1. destination propre au tag, bibliothèque comprise', () => {
    const settings = {
      storage: {
        ...SETTINGS.storage,
        tagSubfolders: true,
        tagFolders: [{ tagId: 't-acme', folder: 'Clients/Acme', driveName: 'Site / Docs' }],
      },
    };
    expect(storagePreview(settings, ACME)).toEqual({
      kind: 'tagFolder',
      path: 'Clients/Acme',
      library: 'Site / Docs',
    });
  });

  it('…y compris la racine d’un Drive partagé (chemin vide, bibliothèque choisie)', () => {
    const settings = {
      storage: { tagFolders: [{ tagId: 't-acme', folder: '', driveId: 'd-1', driveName: 'Acme' }] },
    };
    expect(storagePreview(settings, ACME).kind).toBe('tagFolder');
  });

  it('2. sous-dossier au nom du tag, sous le dossier personnel — « / » neutralisé', () => {
    const settings = { storage: { ...SETTINGS.storage, tagSubfolders: true } };
    expect(storagePreview(settings, { ...ACME, label: 'Acme/Lyon' })).toEqual({
      kind: 'tagSubfolder',
      path: 'CR/Acme-Lyon',
      library: '',
    });
  });

  it('2 bis. sous-dossier d’un dossier d’organisation : nommé, sans chemin inventé', () => {
    const settings = { storage: { folder: '', driveId: '', tagSubfolders: true } };
    expect(storagePreview(settings, ACME)).toEqual({ kind: 'tagSubfolder', path: '', library: '' });
  });

  it('3. dossier personnel, puis 4. organisation', () => {
    expect(storagePreview(SETTINGS, ACME)).toEqual({ kind: 'user', path: 'CR', library: '' });
    expect(storagePreview({ storage: {} }, null)).toEqual({
      kind: 'default',
      path: '',
      library: '',
    });
    expect(storagePreview(null, null).kind).toBe('default');
  });
});

describe('libellés', () => {
  it('le bouton nomme les gestes, dans l’ordre où ils partent', () => {
    expect(launchLabel([], 'et')).toBe('');
    expect(launchLabel(['envoyer'], 'et')).toBe('Envoyer');
    expect(launchLabel(['ranger', 'envoyer'], 'et')).toBe('Ranger et envoyer');
    expect(launchLabel(['ranger', 'envoyer', 'entreposer'], 'et')).toBe(
      'Ranger, envoyer et entreposer',
    );
    expect(launchLabel(['file', 'send'], 'and')).toBe('File and send');
  });

  it('un chemin se lit avec des chevrons', () => {
    expect(readablePath('Clients/Acme/2026')).toBe('Clients › Acme › 2026');
    expect(readablePath('')).toBe('');
  });

  it('adresse : le motif permissif de la saisie', () => {
    expect(looksLikeEmail('dg@acme.com')).toBe(true);
    expect(looksLikeEmail(' dg@acme.com ')).toBe(true);
    expect(looksLikeEmail('dg@acme')).toBe(false);
    expect(looksLikeEmail('a@b.fr,victime@c.fr')).toBe(false);
  });

  it('un tag créé ici prend une couleur encore libre', () => {
    const palette = ['red', 'blue', 'green'];
    expect(freshTagColor(palette, [{ color: 'red' }])).toBe('blue');
    expect(freshTagColor(palette, [{ color: 'red' }, { color: 'blue' }, { color: 'green' }])).toBe(
      'red',
    );
  });
});
