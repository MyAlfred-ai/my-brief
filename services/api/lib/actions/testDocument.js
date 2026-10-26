/**
 * Document factice du bouton « Tester ».
 *
 * Il traverse EXACTEMENT la chaîne d'une action réelle (lib/actions/execute.js) :
 * mêmes réglages résolus, mêmes transports, mêmes erreurs. C'est tout l'intérêt
 * — un test qui fabriquerait son propre chemin ne validerait que ce chemin-là.
 *
 * ── Pourquoi un `.txt`, et jamais un PDF ───────────────────────────────────
 * Le PDF est tiré de la mise en page du navigateur : il n'existe que là.
 * Un `.txt` valide de toute façon 100 % de ce que le test doit prouver —
 * résolution du dossier, autorisations, upload, et le gabarit de nom. Ce qu'il
 * ne prouve pas (que le navigateur sait fabriquer un PDF) ne relève pas de la
 * configuration.
 *
 * ── Pourquoi le fichier n'est PAS supprimé après coup ──────────────────────
 * Le scope `drive.file` permettrait de le reprendre. Mais un fichier qui
 * apparaît et disparaît est le contraire d'un diagnostic : l'utilisateur doit
 * pouvoir aller le voir. L'interface annonce où il a été déposé.
 */
import { normalizeDocument } from './document.js';

const TEXTS = {
  fr: {
    title: 'myBrief — test de configuration',
    intro: 'Ceci est un test de configuration myBrief.',
    body: (who, when) =>
      `Déclenché par ${who} le ${when}.\n\n` +
      "Si vous lisez ce message, l'envoi fonctionne : le compte, les " +
      'destinataires et le transport sont correctement configurés.\n\n' +
      "Aucune donnée de réunion n'a été utilisée pour ce test.",
    fileNote: (who, when) =>
      `Fichier de test déposé par myBrief.\n\nDéclenché par ${who} le ${when}.\n\n` +
      'Sa présence prouve que le dossier cible existe et que le compte relié a ' +
      'le droit d’y écrire. Vous pouvez le supprimer.',
  },
  en: {
    title: 'myBrief — configuration test',
    intro: 'This is a myBrief configuration test.',
    body: (who, when) =>
      `Triggered by ${who} on ${when}.\n\n` +
      'If you are reading this, sending works: account, recipients and ' +
      'transport are configured correctly.\n\n' +
      'No meeting data was used for this test.',
    fileNote: (who, when) =>
      `Test file deposited by myBrief.\n\nTriggered by ${who} on ${when}.\n\n` +
      'Its presence proves the target folder exists and that the linked ' +
      'account may write to it. You can delete it.',
  },
};

/**
 * @param {{user: object, kind?: 'transcription'|'summary', lang?: string,
 *   now?: Date}} params
 * @returns {{document: object, file: {filename: string, content: Buffer,
 *   contentType: string}}}
 */
export function buildTestDocument({ user, kind = 'summary', lang = 'fr', now = new Date() }) {
  const t = TEXTS[lang] || TEXTS.fr;
  const who = user.email;
  const when = now.toISOString().replace('T', ' ').slice(0, 16);

  const text = `${t.intro}\n\n${t.body(who, when)}`;
  // Le corps prend la forme du type demandé — texte brut pour une
  // transcription, HTML pour un résumé — afin d'exercer la vraie branche de
  // `buildDocumentEmail` plutôt qu'une variante réservée au test.
  const content =
    kind === 'summary'
      ? `<p>${t.intro}</p><pre style="font-family:inherit;white-space:pre-wrap">${t.body(who, when)}</pre>`
      : text;

  // Passe par le normalisateur commun : le document de test est soumis aux
  // mêmes bornes que celui d'un envoi réel, sans exception.
  const parsed = normalizeDocument({ kind, title: t.title, content, lang });

  return {
    document: parsed.document,
    file: {
      filename: 'mybrief-test.txt',
      content: Buffer.from(t.fileNote(who, when), 'utf8'),
      contentType: 'text/plain; charset=utf-8',
    },
  };
}
