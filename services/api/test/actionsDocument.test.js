/**
 * Le document d'une action et ses deux portes d'entrée (lib/actions/document.js).
 *
 * Il y a deux chemins de validation et c'est irréductible : ajv ne voit jamais
 * un corps multipart. Ce qui était réductible, c'était d'avoir deux jeux de
 * BORNES et deux VALIDATIONS à tenir en miroir à la main. Ces tests épinglent
 * la structure qui les a remplacés :
 *
 *   - le schéma ajv est dérivé des constantes, il ne les redéclare pas ;
 *   - la même entrée invalide est refusée par les deux portes.
 *
 * Sans le second, la dérive redeviendrait possible sans que rien ne rougisse.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_CONTENT,
  TITLE_MAX,
  DOCUMENT_KINDS,
  DOCUMENT_LANGS,
  actionDocumentSchema,
  normalizeDocument,
  safeFilename,
} from '../lib/actions/document.js';
import { buildTestApp, userDoc, identityHeaders } from './helpers.js';

const USER = 'simple@client.fr';

function multipartBody(fields) {
  const boundary = '----mybrieftest';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  }
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cr.pdf"\r\n` +
      `Content-Type: application/pdf\r\n\r\n%PDF\r\n`,
  );
  chunks.push(`--${boundary}--\r\n`);
  return { body: Buffer.from(chunks.join(''), 'utf8'), boundary };
}

describe('schéma dérivé des constantes', () => {
  it('ne redéclare aucune borne', () => {
    expect(actionDocumentSchema.properties.kind.enum).toBe(DOCUMENT_KINDS);
    expect(actionDocumentSchema.properties.lang.enum).toBe(DOCUMENT_LANGS);
    expect(actionDocumentSchema.properties.content.maxLength).toBe(MAX_CONTENT);
    expect(actionDocumentSchema.properties.title.maxLength).toBe(TITLE_MAX);
  });

  it("refuse tout champ non déclaré — c'est ce qui neutralise un destinataire forgé", () => {
    expect(actionDocumentSchema.additionalProperties).toBe(false);
  });
});

describe('normalizeDocument', () => {
  it('accepte un document complet', () => {
    const { document } = normalizeDocument({
      kind: 'summary',
      title: 'Comité',
      content: '<p>x</p>',
      lang: 'en',
      meetingId: 'm-1',
    });
    expect(document).toEqual({
      kind: 'summary',
      title: 'Comité',
      content: '<p>x</p>',
      lang: 'en',
      meetingId: 'm-1',
    });
  });

  it('rend un meetingId vide plutôt qu’absent quand il n’est pas fourni', () => {
    // Le champ existe TOUJOURS : `resolveActionContext` teste sa valeur, pas sa
    // présence, et une forme qui varie selon l'appelant est ce qui fait diverger
    // les deux chemins d'entrée que ce module existe pour réunir.
    const { document } = normalizeDocument({ kind: 'summary', content: 'x' });
    expect(document.meetingId).toBe('');
  });

  it('retombe sur le français pour une langue inconnue, sans échouer', () => {
    // La langue ne gouverne que le libellé du sujet : la refuser priverait
    // l'utilisateur de son envoi pour un détail cosmétique.
    expect(normalizeDocument({ kind: 'summary', content: 'x', lang: 'de' }).document.lang).toBe(
      'fr',
    );
  });

  it('tronque un titre trop long au lieu de refuser', () => {
    const long = 'a'.repeat(TITLE_MAX + 50);
    expect(
      normalizeDocument({ kind: 'summary', content: 'x', title: long }).document.title,
    ).toHaveLength(TITLE_MAX);
  });

  it('refuse un type inconnu et un contenu absent ou trop gros', () => {
    expect(normalizeDocument({ kind: 'facture', content: 'x' }).error).toBe('invalid_kind');
    expect(normalizeDocument({ kind: 'summary', content: '' }).error).toBe('invalid_content');
    expect(normalizeDocument({ kind: 'summary', content: 'x'.repeat(MAX_CONTENT + 1) }).error).toBe(
      'invalid_content',
    );
  });
});

describe('les deux portes refusent la même chose', () => {
  const cases = [
    { label: 'un type inconnu', patch: { kind: 'facture' } },
    { label: 'un contenu vide', patch: { content: '' } },
  ];

  for (const { label, patch } of cases) {
    it(`${label} : refusé en JSON comme en multipart`, async () => {
      const { app, mailer } = buildTestApp({ seed: { user: [userDoc(USER)] } });
      const base = { kind: 'summary', title: 'Comité', content: '<p>x</p>', lang: 'fr' };

      const json = await app.inject({
        method: 'POST',
        url: '/api/actions/email',
        headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
        body: JSON.stringify({ ...base, ...patch }),
      });

      const { body, boundary } = multipartBody({ ...base, ...patch });
      const multipart = await app.inject({
        method: 'POST',
        url: '/api/actions/email',
        headers: {
          ...identityHeaders(USER),
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(json.statusCode).toBe(400);
      expect(multipart.statusCode).toBe(400);
      // Rien n'est parti par l'une ni par l'autre.
      expect(mailer.sent).toHaveLength(0);
    });
  }
});

describe('safeFilename', () => {
  it('laisse intact un nom fabriqué par le frontend', () => {
    // src/utils/filename.js produit exactement cette forme : la moindre
    // normalisation de plus la rendrait méconnaissable.
    expect(safeFilename('2026-08-08-point-client.pdf')).toBe('2026-08-08-point-client.pdf');
    expect(safeFilename('Comité du 8 — notes.txt')).toBe('Comité du 8 — notes.txt');
  });

  it('retire les caractères qu’un fournisseur refuse ou interprète', () => {
    // OneDrive répond 400 sur un `/`, Google l'accepte et crée un nom sale.
    expect(safeFilename('dossier/sous/fichier.pdf')).toBe('dossiersousfichier.pdf');
    // Le `:` part avec les retours à la ligne : c'est un séparateur de flux
    // alternatif sur Windows et un séparateur d'en-tête partout ailleurs.
    expect(safeFilename('cr\r\nBcc: x.pdf')).toBe('crBcc x.pdf');
  });

  it('neutralise un nom de traversée ou masqué', () => {
    expect(safeFilename('../../secret.pdf')).toBe('secret.pdf');
    expect(safeFilename('.caché')).toBe('caché');
  });

  it('retombe sur le nom générique quand il ne reste rien', () => {
    expect(safeFilename('')).toBe('document');
    expect(safeFilename('///')).toBe('document');
    expect(safeFilename(undefined)).toBe('document');
  });
});
