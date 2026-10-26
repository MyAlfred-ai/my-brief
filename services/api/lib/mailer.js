/**
 * Envoi d'emails — réinitialisation de mot de passe, et envoi d'un document
 * (transcription ou résumé) à son propriétaire via l'action « Envoyer par
 * mail » (administration, onglet « Actions »).
 *
 * nodemailer plutôt qu'une API transactionnelle (Resend, Brevo) : le
 * déploiement sur site a souvent un relais SMTP interne et pas d'accès
 * sortant garanti vers un service tiers.
 *
 * SMTP_HOST vide ⇒ la fonctionnalité est désactivée PROPREMENT : `enabled` vaut
 * false, /api/auth/config le dit au frontend (qui masque le lien « mot de passe
 * oublié ») et /api/auth/forgot-password répond 501. Jamais de crash au boot.
 */
import nodemailer from 'nodemailer';
import { escapeHtml } from './text.js';

const noopLogger = { info() {}, warn() {} };

const TEXTS = {
  fr: {
    subject: 'Réinitialisation de votre mot de passe myBrief',
    intro: 'Vous avez demandé à réinitialiser votre mot de passe myBrief.',
    action: 'Cliquez sur le lien ci-dessous pour en choisir un nouveau :',
    expiry: (min) => `Ce lien est valable ${min} minutes et ne peut servir qu'une seule fois.`,
    ignore:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
  },
  en: {
    subject: 'Reset your myBrief password',
    intro: 'You asked to reset your myBrief password.',
    action: 'Use the link below to choose a new one:',
    expiry: (min) => `This link is valid for ${min} minutes and can only be used once.`,
    ignore: 'If you did not request this, ignore this email: your password is unchanged.',
  },
};

const DOC_TEXTS = {
  fr: {
    transcriptionSubject: (title) =>
      title ? `Transcription — ${title}` : 'Transcription de votre réunion myBrief',
    summarySubject: (title) => (title ? `Résumé — ${title}` : 'Résumé de votre réunion myBrief'),
    intro: 'Voici le document demandé depuis myBrief.',
    footer: 'Email envoyé automatiquement par myBrief, à votre demande.',
  },
  en: {
    transcriptionSubject: (title) =>
      title ? `Transcript — ${title}` : 'Transcript of your myBrief meeting',
    summarySubject: (title) => (title ? `Summary — ${title}` : 'Summary of your myBrief meeting'),
    intro: 'Here is the document you requested from myBrief.',
    footer: 'Email sent automatically by myBrief, at your request.',
  },
};

/** Repli texte d'un contenu HTML : suffisant pour un client mail sans HTML. */
function stripHtml(html) {
  return String(html || '')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sujet + corps (texte et HTML) d'un envoi de document — partagé entre le
 * relais SMTP (sendDocument) et l'envoi via le Gmail de l'utilisateur
 * (routes/actions.js) : même document, quel que soit le transport.
 *
 * `subjectTemplate` remplace l'objet intégré quand il est renseigné. Il est
 * développé ICI, et pas dans les routes, parce que c'est le seul point que les
 * trois transports traversent : un objet calculé ailleurs finirait par différer
 * selon celui qui gagne la course de repli. Gabarit vide ⇒ sortie strictement
 * identique à celle d'avant les gabarits.
 *
 * @param {{kind: 'transcription'|'summary', title?: string, content: string,
 *   lang?: string, subject?: string}} payload - `content` est du texte brut pour
 *   une transcription, le HTML de l'éditeur pour un résumé ; `subject` est
 *   l'objet déjà développé par lib/actions/templating.js, s'il y en a un.
 * @returns {{subject: string, text: string, html: string}}
 */
export function buildDocumentEmail({ kind, title = '', content, lang = 'fr', subject: custom }) {
  const t = DOC_TEXTS[lang] || DOC_TEXTS.fr;
  const subject =
    custom || (kind === 'summary' ? t.summarySubject(title) : t.transcriptionSubject(title));
  const isHtml = kind === 'summary';
  const bodyHtml = isHtml
    ? content
    : `<pre style="font-family: inherit; white-space: pre-wrap;">${escapeHtml(content)}</pre>`;
  return {
    subject,
    text: `${t.intro}\n\n${isHtml ? stripHtml(content) : content}\n\n—\n${t.footer}`,
    html: `<p>${t.intro}</p><hr>${bodyHtml}<hr><p style="color:#888;font-size:12px">${t.footer}</p>`,
  };
}

function renderText(t, link, minutes) {
  return `${t.intro}\n\n${t.action}\n${link}\n\n${t.expiry(minutes)}\n\n${t.ignore}\n`;
}

function renderHtml(t, link, minutes) {
  return (
    `<p>${t.intro}</p><p>${t.action}</p>` +
    `<p><a href="${link}">${link}</a></p>` +
    `<p>${t.expiry(minutes)}</p><p>${t.ignore}</p>`
  );
}

/**
 * @param {{host: string, port: number, secure: boolean, user: string,
 *          pass: string, from: string}} smtp - section `smtp` de lib/config.js
 *   (plus de lecture d'environnement ici : config.js est la seule porte).
 * @param {{info: Function, warn: Function}} [log]
 */
export function createMailer(smtp, log = noopLogger) {
  if (!smtp?.host) {
    return {
      enabled: false,
      async sendPasswordReset() {
        throw new Error('mailer_disabled');
      },
      async sendDocument() {
        throw new Error('mailer_disabled');
      },
    };
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass || '' } } : {}),
  });

  // Vérification NON bloquante : un relais SMTP momentanément injoignable ne
  // doit pas empêcher l'API de démarrer (le reste de l'app n'en dépend pas).
  transport
    .verify()
    .then(() => log.info(`[api] SMTP prêt (${smtp.host})`))
    .catch((err) =>
      log.warn(`[api] SMTP injoignable au démarrage (non bloquant) : ${err.message}`),
    );

  const from = smtp.from || `myBrief <no-reply@${smtp.host}>`;

  return {
    enabled: true,
    /**
     * @param {{to: string, link: string, lang?: string, expiresInMinutes?: number}} payload
     */
    async sendPasswordReset({ to, link, lang = 'fr', expiresInMinutes = 30 }) {
      const t = TEXTS[lang] || TEXTS.fr;
      // Le corps ne contient QUE le lien : jamais de mot de passe en clair,
      // même généré.
      await transport.sendMail({
        from,
        to,
        subject: t.subject,
        text: renderText(t, link, expiresInMinutes),
        html: renderHtml(t, link, expiresInMinutes),
      });
    },

    /**
     * Envoie une transcription ou un résumé.
     *
     * Les destinataires viennent des RÉGLAGES PERSISTÉS de l'utilisateur,
     * résolus par lib/actions/resolve.js — jamais d'un champ de la requête
     * d'envoi (cf. l'en-tête de routes/actions/execute.js).
     *
     * `replyTo` compte plus qu'il n'en a l'air sur ce transport : le `from` est
     * le `no-reply` du serveur, et sans lui la réponse d'un destinataire tiers
     * n'atteindrait personne.
     *
     * @param {{to: string|string[], cc?: string|string[], replyTo?: string,
     *   kind: 'transcription'|'summary', title?: string, content: string,
     *   lang?: string, subject?: string,
     *   attachments?: Array<{filename: string, content: Buffer, contentType: string}>}} payload
     *   - `content` est du texte brut pour une transcription, le HTML de
     *   l'éditeur pour un résumé ; `attachments` porte le même document mis en
     *   forme (PDF), fabriqué par le navigateur.
     */
    async sendDocument({
      to,
      cc,
      replyTo,
      kind,
      title = '',
      content,
      lang = 'fr',
      subject: custom,
      attachments,
    }) {
      const { subject, text, html } = buildDocumentEmail({
        kind,
        title,
        content,
        lang,
        subject: custom,
      });
      await transport.sendMail({
        from,
        to,
        ...(cc?.length ? { cc } : {}),
        ...(replyTo ? { replyTo } : {}),
        subject,
        text,
        html,
        attachments,
      });
    },
  };
}
