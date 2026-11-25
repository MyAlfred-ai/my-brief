/**
 * Génération de PDF pour les résumés
 *
 * La mise en page est celle d'un document HTML (en-tête, résumé, styles
 * ci-dessous), calculée par le navigateur dans un conteneur hors écran. Le PDF
 * en est tiré de deux façons :
 *
 * - en TEXTE (src/lib/pdf/) : chaque mot écrit à la place que le navigateur lui
 *   a donnée, dans une police embarquée. Un résumé de six pages pèse une
 *   centaine de Ko, son texte se sélectionne et s'extrait ;
 * - en IMAGE, en secours : la capture html2canvas d'avant — une photo JPEG par
 *   page, ~700 Ko chacune, sans texte extractible. Elle ne sert que si la voie
 *   texte échoue (police injoignable hors ligne, navigateur trop ancien), pour
 *   qu'un PDF sorte toujours : une pièce jointe manquante ne se voit qu'à
 *   réception.
 *
 * ── Charte (depuis le 2026-11-18) ─────────────────────────────────────────
 * Le texte reste noir sur blanc. La marque (Marque & apparence) habille les
 * bords : logo de l'ENTREPRISE en tête de la première page s'il est
 * renseigné, dégradé primaire → secondaire en bande sur chaque page, sous le
 * titre et devant les intertitres, logo de MyBrief discret au pied. Rien de
 * cela ne touche à la zone de texte ni à ses tailles : le Pagimètre
 * (lib/pageMeter.js) rejoue cette mise en page, une retouche des marges ou
 * des corps l'obligerait à être recalibré.
 */
import { get } from 'svelte/store';
import { saveFile } from '../platform/download.js';
import { drawLayout, drawPageFrame, PAGE, pdfBytes, usedFontStyles } from '../lib/pdf/draw.js';
import {
  loadPdfFonts,
  PDF_FONT_FAMILY,
  pdfFontMetrics,
  registerPdfFonts,
} from '../lib/pdf/fonts.js';
import { measureLayout, prepareForMeasure } from '../lib/pdf/measure.js';
import { logoForPdf } from '../lib/pdf/logo.js';
import { pdfBrandColors } from '../lib/pdf/brand.js';
import { branding } from '../stores/branding.js';
import { companyLogo, loadCompanyLogo } from '../stores/companyLogo.js';
import { tagsById, ensureTagLogo } from '../stores/tags.js';
import mybriefLogo from '../logo.webp';

/** Logo de l'entreprise en tête : boîte d'affichage, en px CSS de la bande de 210 mm (≈ 50 × 13 mm). */
const COMPANY_LOGO_BOX = { maxWidth: 220, maxHeight: 56 };
/**
 * Logo du TAG de la réunion (client, projet), à côté de celui de l'entreprise :
 * plus étroit, il l'accompagne sans le concurrencer.
 */
const TAG_LOGO_BOX = { maxWidth: 150, maxHeight: 56 };
/** Logo de MyBrief au pied : dessiné à 6,5 mm par draw.js, préparé à ~400 dpi. */
const FOOT_LOGO_BOX = { maxWidth: 26, maxHeight: 26 };
/**
 * Attente maximale du logo de l'entreprise (lu une fois par session) : hors
 * ligne, le PDF sort sans lui plutôt que de rester suspendu.
 */
const COMPANY_LOGO_WAIT_MS = 3000;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Logo de l'entreprise (data URL), ou '' s'il n'est pas renseigné ou pas joignable à temps. */
async function companyLogoSource() {
  const timeout = new Promise((resolve) => setTimeout(resolve, COMPANY_LOGO_WAIT_MS));
  await Promise.race([loadCompanyLogo(), timeout]).catch(() => {});
  return get(companyLogo).logo;
}

/**
 * Logo du tag de la réunion (data URL), ou '' : pas de tag, pas de logo, ou
 * pas lu à temps — même délai que celui de l'entreprise. Il ne vient pas avec
 * la liste des tags : lu ici s'il ne l'a pas déjà été (stores/tags.js).
 * @param {string|null|undefined} tagId
 */
async function tagLogoSource(tagId) {
  const tag = tagId ? get(tagsById).get(tagId) : null;
  if (!tag?.logoAt) return '';
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), COMPANY_LOGO_WAIT_MS));
  return (await Promise.race([ensureTagLogo(tag), timeout]).catch(() => null)) || '';
}

/**
 * Génère un PDF à partir d'un résumé HTML
 * @param {Object} config - Configuration
 * @param {boolean} config.hasGeneratedSummary - Indique si un résumé a été généré
 * @param {string} config.summaryText - Texte HTML du résumé
 * @param {string} config.userName - Nom de l'utilisateur
 * @param {string} config.currentTemplate - Template actuel
 * @param {string} config.currentLanguage - Langue actuelle
 * @param {Array} config.templateOptions - Options de templates
 * @param {Function} config.t - Fonction de traduction
 * @param {Function} config.formatMessage - Fonction pour formater les messages
 * @param {Function} config.setStatus - Fonction pour définir le statut
 * @param {Function} config.isValidUserName - Fonction pour valider le nom d'utilisateur
 * @param {Object} config.uiText - Objet de traduction
 * @returns {Promise<void>}
 */
export async function generatePDF(config) {
  const { hasGeneratedSummary, t, setStatus } = config;

  if (!hasGeneratedSummary) {
    alert(t('alerts.noTranscription'));
    return;
  }

  const { blob, filename } = await buildSummaryPdfBlob(config);

  // Natif : pdf.save() est un no-op en WebView => Filesystem + feuille de
  // partage via l'adaptateur plateforme.
  await saveFile({ filename, mimeType: 'application/pdf', data: blob });

  console.log('✅ PDF généré et téléchargé:', filename);
  setStatus('statuses.exported');
}

/**
 * Styles du document. `font-family` nomme d'abord la police embarquée
 * (cf. lib/pdf/fonts.js) : c'est avec elle que le navigateur doit mesurer ce
 * que le PDF écrira. Si elle n'a pas pu être chargée, la pile d'origine prend
 * le relais — et la capture image avec.
 */
const PDF_STYLES = `
      .pdf-container {
        font-family: '${PDF_FONT_FAMILY}', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #1e293b;
        line-height: 1.6;
        padding: 20px;
        font-size: 11pt;
        background: white;
      }

      .pdf-header {
        margin-bottom: 24px;
      }

      .pdf-brandline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 22px;
      }

      .pdf-logos {
        display: flex;
        align-items: center;
        gap: 18px;
        flex: none;
      }

      .pdf-company-logo,
      .pdf-tag-logo {
        display: block;
        flex: none;
      }

      .pdf-metadata {
        margin-left: auto;
        text-align: right;
        color: #64748b;
        font-size: 9.5pt;
        line-height: 1.5;
      }

      .pdf-metadata p {
        margin: 0;
      }

      .pdf-metadata .pdf-date {
        color: #0f172a;
        font-weight: bold;
      }

      .pdf-header h1 {
        color: #0f172a;
        font-size: 21pt;
        line-height: 1.25;
        font-weight: bold;
        margin: 0 0 12px;
      }

      .pdf-accent {
        width: 72px;
        height: 5px;
        background: linear-gradient(90deg, var(--pdf-from), var(--pdf-to));
      }

      .pdf-content {
        margin-top: 20px;
      }

      .pdf-content h1 {
        color: #0f172a;
        font-size: 15pt;
        margin-top: 20px;
        margin-bottom: 10px;
        font-weight: bold;
        position: relative;
      }

      .pdf-content h2 {
        color: #0f172a;
        font-size: 13pt;
        margin-top: 15px;
        margin-bottom: 8px;
        font-weight: bold;
        position: relative;
      }

      .pdf-content h3 {
        color: #1e293b;
        font-size: 12pt;
        margin-top: 12px;
        margin-bottom: 6px;
        font-weight: bold;
      }

      .pdf-content .pdf-tick {
        position: absolute;
        left: -14px;
        top: 0.3em;
        width: 4px;
        height: 1em;
        background: linear-gradient(180deg, var(--pdf-from), var(--pdf-to));
      }

      .pdf-content p {
        margin: 8px 0;
        text-align: justify;
      }

      .pdf-content strong, .pdf-content b {
        font-weight: bold;
        color: #0f172a;
      }

      .pdf-content em, .pdf-content i {
        font-style: italic;
      }

      .pdf-content ul, .pdf-content ol {
        margin: 10px 0;
        padding-left: 25px;
      }

      .pdf-content ul ul, .pdf-content ul ol,
      .pdf-content ol ul, .pdf-content ol ol {
        margin: 4px 0;
        padding-left: 20px;
      }

      .pdf-content li {
        margin: 3px 0;
      }

      .pdf-content ul li {
        list-style-type: disc;
      }

      .pdf-content ol li {
        list-style-type: decimal;
      }
    `;

/**
 * Fabrique le PDF du résumé et le rend sous forme d'octets, sans le
 * télécharger.
 *
 * Séparé de `generatePDF` parce que le même document a désormais deux
 * destinations : le téléchargement, et l'envoi au serveur (pièce jointe d'un
 * mail, dépôt sur un Drive). La mise en page est celle du navigateur : elle ne
 * peut pas être refaite côté serveur, et c'est le client qui transmet les
 * octets.
 *
 * @param {Object} config - même forme que `generatePDF`
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function buildSummaryPdfBlob(config) {
  const {
    summaryText,
    userName,
    currentTemplate,
    currentLanguage,
    templateOptions,
    formatMessage,
    setStatus,
    uiText,
  } = config;

  // Déclarés hors du try : le rendu se fait dans un conteneur hors écran qui
  // DOIT être retiré même quand le rendu échoue. Tant que cette fonction ne
  // servait qu'à l'export manuel, l'oubli passait inaperçu ; elle est désormais
  // appelée à chaque envoi de mail et chaque dépôt, où l'échec est silencieux —
  // les conteneurs s'accumuleraient dans la page.
  let styleElement = null;
  let tempDiv = null;

  try {
    // Obtenir les informations
    const selectedTemplate = templateOptions.find((opt) => opt.value === currentTemplate);
    const templateTitle = selectedTemplate
      ? selectedTemplate.labels[currentLanguage]
      : uiText.sections.summaryTitle;
    const pdfTitle = `${uiText.sections.summaryTitle} - ${templateTitle}`;

    const now = new Date();
    const dateStr = now.toLocaleDateString(currentLanguage === 'fr' ? 'fr-FR' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const finalUserName = userName || uiText.transcription.defaultAuthor;

    // Indiquer l'état dans la barre de statut existante
    setStatus('statuses.summaryGenerating');

    // Avant la mise en page : le navigateur doit mesurer avec la police que
    // le PDF embarquera. Sans elle, repli sur la capture image. Les logos se
    // préparent en même temps (cf. lib/pdf/logo.js) ; un logo qui ne vient
    // pas laisse sa place vide, le document sort quand même.
    const [fonts, headLogo, tagLogo, footLogo] = await Promise.all([
      loadPdfFonts().catch((error) => {
        console.warn('⚠️ Police du PDF indisponible, rendu en image:', error);
        return null;
      }),
      companyLogoSource().then((src) => logoForPdf(src, COMPANY_LOGO_BOX)),
      tagLogoSource(config.tagId).then((src) => logoForPdf(src, TAG_LOGO_BOX)),
      logoForPdf(mybriefLogo, FOOT_LOGO_BOX),
    ]);
    const colors = pdfBrandColors(get(branding));

    styleElement = document.createElement('style');
    styleElement.textContent = PDF_STYLES;

    // Le logo de l'entreprise, puis celui du client ou du projet (le tag de
    // la réunion) : les deux à gauche, la date à droite.
    const logoImg = (logo, className) =>
      logo
        ? `<img class="${className}" data-pdf-logo alt="" src="${logo.data}"
           style="width: ${logo.width}px; height: ${logo.height}px">`
        : '';
    const logoHtml =
      headLogo || tagLogo
        ? `<div class="pdf-logos">${logoImg(headLogo, 'pdf-company-logo')}${logoImg(tagLogo, 'pdf-tag-logo')}</div>`
        : '';
    // Sans nom d'utilisateur, `userName` vaut déjà le libellé par défaut :
    // « Intervenant: Intervenant » n'apprend rien.
    const authorHtml =
      finalUserName && finalUserName !== uiText.transcription.defaultAuthor
        ? `<p>${escapeHtml(uiText.transcription.defaultAuthor)}: ${escapeHtml(finalUserName)}</p>`
        : '';

    // Créer le contenu HTML pour le PDF (sans footer, il sera ajouté sur chaque page)
    const htmlContent = `
      <div class="pdf-header">
        <div class="pdf-brandline">
          ${logoHtml}
          <div class="pdf-metadata">
            <p class="pdf-date">${escapeHtml(dateStr)}</p>
            ${authorHtml}
          </div>
        </div>
        <h1>${escapeHtml(pdfTitle)}</h1>
        <div class="pdf-accent"></div>
      </div>

      <div class="pdf-content">
        ${summaryText}
      </div>
    `;

    // Créer un élément temporaire hors écran pour générer le PDF
    // La mise en page ne dépend pas du viewport — l'élément peut rester invisible
    tempDiv = document.createElement('div');
    tempDiv.className = 'pdf-container';
    tempDiv.innerHTML = htmlContent;

    tempDiv.style.position = 'fixed';
    tempDiv.style.left = '-10000px';
    tempDiv.style.top = '0';
    tempDiv.style.width = '210mm';
    tempDiv.style.minHeight = '100px';
    tempDiv.style.backgroundColor = 'white';
    tempDiv.style.pointerEvents = 'none';
    tempDiv.style.setProperty('--pdf-from', colors.from);
    tempDiv.style.setProperty('--pdf-to', colors.to);

    // Trait de la marque devant les intertitres principaux : un élément vide
    // en position absolue, dans la marge — rien ne bouge dans le texte.
    for (const heading of tempDiv.querySelectorAll('.pdf-content h1, .pdf-content h2')) {
      const tick = document.createElement('span');
      tick.className = 'pdf-tick';
      tick.setAttribute('aria-hidden', 'true');
      heading.prepend(tick);
    }

    // Ajouter le style et le contenu au document
    document.head.appendChild(styleElement);
    document.body.appendChild(tempDiv);

    // Attendre que le DOM soit bien mis à jour, et les images décodées : une
    // image pas encore prête n'est pas relevée (cf. measure.js).
    await new Promise((resolve) => setTimeout(resolve, 300));
    await Promise.all(
      Array.from(tempDiv.querySelectorAll('img'), (img) => img.decode?.().catch(() => {})),
    );

    const footerText =
      currentLanguage === 'fr'
        ? 'Document généré par MyBrief - développé par MyAlfred.ai'
        : 'Document generated by MyBrief - developed by MyAlfred.ai';
    const meta = {
      title: pdfTitle,
      author: finalUserName,
      language: currentLanguage,
      footerText,
      chrome: { from: colors.fromRgb, to: colors.toRgb, logo: footLogo },
    };

    let pdf = null;
    if (fonts) {
      try {
        pdf = await renderTextPdf(tempDiv, fonts, meta);
      } catch (error) {
        console.warn('⚠️ Rendu texte du PDF en échec, rendu en image:', error);
      }
    }
    if (!pdf) pdf = await renderImagePdf(tempDiv, meta);

    const filename = `mybrief_resume_${now.toISOString().split('T')[0]}.pdf`;
    return { blob: new Blob([pdfBytes(pdf)], { type: 'application/pdf' }), filename };
  } catch (error) {
    console.error('❌ Erreur lors de la génération du PDF:', error);
    console.error('❌ Stack:', error.stack);
    throw new Error(formatMessage('alerts.pdfGenerationError', { error: error.message }));
  } finally {
    // `remove()` plutôt que `removeChild` : sans effet si l'élément n'a jamais
    // été attaché, ce qui arrive quand l'échec survient avant l'insertion.
    tempDiv?.remove();
    styleElement?.remove();
  }
}

/**
 * PDF d'un document HTML quelconque — même chaîne que le résumé : mise en page
 * par le navigateur dans un conteneur hors écran, écriture en texte, capture
 * image en secours. Sert au rapport des statistiques d'administration.
 *
 * La feuille `styles` doit nommer `PDF_FONT_FAMILY` en tête de ses polices :
 * c'est avec elle que le navigateur doit mesurer ce que le PDF écrira. Un bloc
 * marqué `data-pdf-keep` ne se coupe pas d'une page à l'autre (cf. measure.js).
 *
 * @param {{html: string, styles: string, className: string,
 *          meta: {title: string, author: string, language: string, footerText: string,
 *                 chrome?: import('../lib/pdf/draw.js').PageChrome}}} input
 *   - sans `chrome`, le pied d'origine (cf. drawPageFrame)
 * @returns {Promise<Blob>}
 */
export async function htmlToPdfBlob({ html, styles, className, meta }) {
  let styleElement = null;
  let container = null;
  try {
    const fonts = await loadPdfFonts().catch((error) => {
      console.warn('⚠️ Police du PDF indisponible, rendu en image:', error);
      return null;
    });
    styleElement = document.createElement('style');
    styleElement.textContent = styles;
    container = document.createElement('div');
    container.className = className;
    container.innerHTML = html;
    Object.assign(container.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '210mm',
      backgroundColor: 'white',
      pointerEvents: 'none',
    });
    document.head.appendChild(styleElement);
    document.body.appendChild(container);
    // Polices déclarées : la mise en page doit les avoir appliquées avant d'être relevée.
    await document.fonts?.ready;

    let pdf = null;
    if (fonts) {
      try {
        pdf = await renderTextPdf(container, fonts, meta);
      } catch (error) {
        console.warn('⚠️ Rendu texte du PDF en échec, rendu en image:', error);
      }
    }
    if (!pdf) pdf = await renderImagePdf(container, meta);
    return new Blob([pdfBytes(pdf)], { type: 'application/pdf' });
  } finally {
    container?.remove();
    styleElement?.remove();
  }
}

/**
 * Nouveau document A4, compressé, avec ses métadonnées : titre, auteur et
 * langue aident les outils (et les IA) qui classent ou lisent le fichier.
 */
function newPdf(jsPDF, { title, author, language }) {
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  // Métadonnées en Latin-1 : l'emoji du titre n'a pas d'encodage fiable ici.
  const latin1 = (s) =>
    String(s || '')
      .replace(/[^\u{20}-\u{FF}]/gu, '')
      .trim();
  pdf.setProperties({ title: latin1(title), author: latin1(author), creator: 'MyBrief' });
  pdf.setLanguage(language === 'en' ? 'en' : 'fr');
  return pdf;
}

/** PDF texte : relevé de la mise en page, puis écriture (cf. src/lib/pdf/). */
async function renderTextPdf(container, fonts, meta) {
  const { jsPDF } = await import('jspdf');
  const metrics = pdfFontMetrics(jsPDF, fonts);
  prepareForMeasure(container);
  const layout = measureLayout(container, metrics);

  const pdf = newPdf(jsPDF, meta);
  registerPdfFonts(pdf, fonts, usedFontStyles(layout));
  const pages = drawLayout(pdf, layout, {
    footerText: meta.footerText,
    metrics,
    chrome: meta.chrome || null,
  });
  console.log(`📄 PDF texte : ${pages} page(s)`);
  return pdf;
}

/**
 * PDF image — l'ancien rendu, gardé en secours.
 *
 * html2canvas-pro et non html2canvas : les fonds de marque sont des color-mix()
 * dont la valeur calculée est `color(srgb …)`, que html2canvas 1.4 ne sait pas
 * parser — la capture levait « unsupported color function "color" » et aucun
 * PDF ne sortait (ni téléchargement, ni pièce jointe, ni dépôt Drive).
 */
async function renderImagePdf(tempDiv, meta) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);
  const canvas = await html2canvas(tempDiv, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: tempDiv.scrollWidth,
    height: tempDiv.scrollHeight,
  });

  const pdf = newPdf(jsPDF, meta);
  const { margin } = PAGE;
  const imgWidth = PAGE.width - 2 * margin;
  const contentHeight = PAGE.height - 2 * margin - PAGE.footer;
  const sliceHeight = contentHeight * (canvas.width / imgWidth);
  const totalPages = Math.ceil(canvas.height / sliceHeight);

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) pdf.addPage();

    // Portion de l'image à afficher sur cette page
    const sourceY = i * sliceHeight;
    const sourceHeight = Math.min(sliceHeight, canvas.height - sourceY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sourceHeight;
    pageCanvas
      .getContext('2d')
      .drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);

    const displayHeight = (sourceHeight * imgWidth) / canvas.width;
    pdf.addImage(
      pageCanvas.toDataURL('image/jpeg', 0.95),
      'JPEG',
      margin,
      margin,
      imgWidth,
      displayHeight,
    );
    drawPageFrame(pdf, i + 1, totalPages, meta.footerText, meta.chrome || null);
  }
  console.log(`📄 PDF image : ${totalPages} page(s)`);
  return pdf;
}
