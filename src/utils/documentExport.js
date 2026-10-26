/**
 * Fichier joint aux actions post-réunion (« Envoyer par mail », « Entreposer »),
 * et nom des documents téléchargés.
 *
 * Le résumé part en PDF — le document mis en page que l'utilisateur reconnaît —
 * et la transcription en texte brut. Le PDF est tiré de la mise en page du
 * navigateur : c'est donc le client qui fabrique les octets et l'API qui les
 * relaie au fournisseur.
 *
 * ── Pourquoi ce module lit les stores lui-même ─────────────────────────────
 * Le gabarit de nom et la langue pourraient être des arguments. Ils ne le sont
 * pas : leur seul appelant est App.svelte, qui est à son plafond `max-lines`
 * (cf. eslint.config.js) et ne peut plus accueillir une ligne. Les lire ici est
 * de toute façon le bon découpage — un seul point d'accès au réglage, et une
 * signature d'appel qui ne bouge pas quand un paramètre s'ajoute.
 */
import { get } from 'svelte/store';
import { buildSummaryPdfBlob } from './pdf.js';
import {
  DOCUMENT_TYPE_LABEL,
  documentFilename,
  fileDatePart,
  renderFilenameTemplate,
} from './filename.js';
import { ensureActionSettings } from '../stores/actionSettings.js';
import { currentLanguageStore } from '../store.js';

/** Le type de document se déduit de l'extension : PDF ⇒ résumé, sinon transcription. */
const kindOf = (ext) => (ext === 'pdf' ? 'summary' : 'transcription');

/**
 * Nom du fichier d'un document, daté de la réunion quand elle est connue.
 *
 * Applique le gabarit personnel de l'utilisateur s'il en a défini un, sinon la
 * convention intégrée `AAAA-MM-JJ-titre.ext`.
 *
 * Le serveur ré-applique le même gabarit sur ce qu'il reçoit (cf. `renamed` dans
 * lib/actions/execute.js) : ce chemin-ci sert le TÉLÉCHARGEMENT direct, que le
 * serveur ne voit jamais, et évite un renommage visible sur les deux autres.
 *
 * @param {{historyItem?: object, ext: string, fallback: string}} params
 * @returns {Promise<string>}
 */
export async function documentNameFor({ historyItem, ext, fallback }) {
  const title = (historyItem?.title || '').trim() || fallback;
  const date = historyItem?.lastConnecion || historyItem?.now;
  const lang = get(currentLanguageStore) === 'en' ? 'en' : 'fr';

  const { settings } = await ensureActionSettings();
  const templated = renderFilenameTemplate(
    settings?.naming?.filenameTemplate,
    {
      titre: title,
      date: fileDatePart(date),
      type: DOCUMENT_TYPE_LABEL[lang][kindOf(ext)],
      compte: '',
    },
    { ext },
  );

  return templated || documentFilename({ title, date, ext, fallback });
}

/**
 * Fichier à joindre pour le document demandé.
 *
 * Renvoie null si le rendu échoue : un PDF qui ne se fabrique pas ne doit pas
 * empêcher l'envoi du mail, dont le corps porte déjà tout le contenu.
 *
 * @param {{kind: 'transcription'|'summary', transcriptionText: string,
 *   historyItem?: object, pdfConfig: object}} params
 * @returns {Promise<{blob: Blob, filename: string}|null>}
 */
export async function buildActionAttachment({ kind, transcriptionText, historyItem, pdfConfig }) {
  try {
    if (kind === 'summary') {
      const { blob } = await buildSummaryPdfBlob(pdfConfig);
      return {
        blob,
        filename: await documentNameFor({ historyItem, ext: 'pdf', fallback: 'compte-rendu' }),
      };
    }
    return {
      blob: new Blob([transcriptionText], { type: 'text/plain;charset=utf-8' }),
      filename: await documentNameFor({ historyItem, ext: 'txt', fallback: 'transcription' }),
    };
  } catch (error) {
    console.error('Génération de la pièce jointe échouée:', error);
    return null;
  }
}
