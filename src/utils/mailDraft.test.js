// @vitest-environment jsdom
/**
 * « Rédiger dans ma messagerie » : le texte du mail, ses destinataires et son
 * objet (les règles de l'envoi automatique) et le lien `mailto:`.
 */
import { describe, it, expect } from 'vitest';
import {
  htmlToText,
  draftRecipients,
  draftSubject,
  storageFollowsTag,
  buildMailto,
  MAILTO_BODY_MAX,
} from './mailDraft.js';

describe('htmlToText — le résumé de l’éditeur, lisible dans un mail', () => {
  it('titres et paragraphes séparés d’une ligne vide', () => {
    const html =
      '<h1>Compte rendu</h1><p>Point <strong>hebdo</strong>.</p><h2>Décisions</h2><p>Aucune.</p>';
    expect(htmlToText(html)).toBe('Compte rendu\n\nPoint hebdo.\n\nDécisions\n\nAucune.');
  });

  it('listes TipTap (un paragraphe par puce) : puces, numéros, sous-niveaux indentés', () => {
    const html =
      '<ul><li><p>Budget validé</p><ul><li><p>détail A</p></li></ul></li>' +
      '<li><p>Devis</p></li></ul><ol><li><p>Julien</p></li><li><p>Sophie</p></li></ol>';
    expect(htmlToText(html)).toBe('• Budget validé\n  • détail A\n• Devis\n\n1. Julien\n2. Sophie');
  });

  it('entités décodées, espaces du HTML ramenées à une seule, retours à la ligne gardés', () => {
    expect(htmlToText('<p>A &amp; B&nbsp;:\n   C<br>D</p>')).toBe('A & B : C\nD');
  });

  it('vide ou absent : chaîne vide', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null)).toBe('');
  });
});

describe('draftRecipients — la règle de l’envoi automatique', () => {
  const settings = {
    mail: {
      recipients: ['equipe@exemple.fr'],
      tagRecipients: [{ tagId: 't-client', recipients: ['client@exemple.fr', 'chef@exemple.fr'] }],
    },
  };

  it('la liste du tag REMPLACE la liste par défaut', () => {
    expect(draftRecipients(settings, 't-client')).toEqual({
      source: 'tag',
      recipients: ['client@exemple.fr', 'chef@exemple.fr'],
    });
  });

  it('tag sans liste, ou pas de tag : la liste par défaut', () => {
    expect(draftRecipients(settings, 't-autre')).toEqual({
      source: 'user',
      recipients: ['equipe@exemple.fr'],
    });
    expect(draftRecipients(settings, null).recipients).toEqual(['equipe@exemple.fr']);
  });

  it('réglages pas encore chargés : aucun destinataire, sans erreur', () => {
    expect(draftRecipients(null, 't-client')).toEqual({ source: 'user', recipients: [] });
  });
});

describe('draftSubject — la chaîne de l’envoi automatique', () => {
  const vars = {
    titre: 'Point Dupont',
    date: '2026-09-15',
    type: 'Résumé',
    compte: 'moi@exemple.fr',
  };
  const BUILTIN = 'Résumé — Point Dupont';
  const state = (personal, org) => ({
    settings: { mail: { subjectTemplate: personal } },
    defaults: { subjectTemplate: org },
  });

  it('gabarit personnel, sinon celui de l’organisation', () => {
    expect(draftSubject(state('CR {{titre}} ({{date}})', '[Org] {{titre}}'), vars, BUILTIN)).toBe(
      'CR Point Dupont (2026-09-15)',
    );
    expect(draftSubject(state('', '[Org] {{type}} — {{titre}}'), vars, BUILTIN)).toBe(
      '[Org] Résumé — Point Dupont',
    );
  });

  it('aucun gabarit, gabarit qui ne laisse rien, ou réglages absents : l’objet intégré', () => {
    expect(draftSubject(state('', ''), vars, BUILTIN)).toBe(BUILTIN);
    expect(draftSubject(state('{{client}}', ''), vars, BUILTIN)).toBe(BUILTIN);
    expect(draftSubject(null, vars, BUILTIN)).toBe(BUILTIN);
  });
});

describe('storageFollowsTag — même ordre que le serveur', () => {
  it('destination propre au tag (chemin OU bibliothèque seule), ou sous-dossiers par tag', () => {
    expect(
      storageFollowsTag({ storage: { tagFolders: [{ tagId: 't', folder: 'Clients/A' }] } }, 't'),
    ).toBe(true);
    expect(
      storageFollowsTag(
        { storage: { tagFolders: [{ tagId: 't', folder: '', driveId: 'd1' }] } },
        't',
      ),
    ).toBe(true);
    expect(storageFollowsTag({ storage: { tagSubfolders: true } }, 't')).toBe(true);
  });

  it('pas de tag, ou tag sans règle : non', () => {
    expect(storageFollowsTag({ storage: { tagSubfolders: true } }, null)).toBe(false);
    expect(storageFollowsTag({ storage: { tagFolders: [] } }, 't')).toBe(false);
  });
});

describe('buildMailto', () => {
  it('destinataires lisibles, objet et corps encodés, fins de ligne en CRLF', () => {
    const { url, truncated } = buildMailto({
      to: ['client@exemple.fr', 'a.b+c@exemple.fr'],
      subject: 'Résumé — Point client',
      body: 'Ligne 1\nLigne 2 & fin',
    });
    expect(truncated).toBe(false);
    expect(url).toBe(
      'mailto:client@exemple.fr,a.b%2Bc@exemple.fr?subject=R%C3%A9sum%C3%A9%20%E2%80%94%20Point%20client' +
        '&body=Ligne%201%0D%0ALigne%202%20%26%20fin',
    );
  });

  it('sans destinataire : l’utilisateur les choisit dans sa messagerie', () => {
    expect(buildMailto({ to: [], subject: 'S', body: 'B' }).url).toBe('mailto:?subject=S&body=B');
  });

  it('corps trop long : coupé, suivi de la note, et signalé', () => {
    const body = 'x'.repeat(MAILTO_BODY_MAX + 500);
    const { url, truncated } = buildMailto({ subject: 'S', body, truncatedNote: '[suite coupée]' });
    expect(truncated).toBe(true);
    const decoded = decodeURIComponent(url.split('&body=')[1]);
    expect(decoded.endsWith('\r\n\r\n[suite coupée]')).toBe(true);
    expect(decoded.length).toBe(MAILTO_BODY_MAX + 4 + '[suite coupée]'.length);
  });
});
