/**
 * Motif d'adresse email, partagé par tout ce qui en valide une.
 *
 * Il vivait dans routes/auth/schemas.js, seul consommateur à l'époque. Les
 * destinataires paramétrables (lib/actions/recipients.js) en ont besoin aussi :
 * deux expressions régulières d'email dans un dépôt, c'est deux règles qui
 * divergent au premier correctif.
 *
 * Volontairement permissif — pas de `format: 'email'` (ajv-formats n'est pas
 * enregistré, cf. l'en-tête de routes/auth/schemas.js), et une validation
 * d'adresse conforme à la RFC 5322 refuserait des adresses qui fonctionnent.
 *
 * ⚠️ Ce motif n'est PAS suffisant pour une adresse destinée à un en-tête de
 * message. Il n'interdit ni la virgule, ni les chevrons, ni les guillemets :
 * `a@b.fr,victime` le passe (un seul `@`), et un transport qui joint la liste
 * en une chaîne y verrait deux destinataires. La liste de caractères interdits
 * vit dans lib/actions/recipients.js — c'est là qu'est le contrôle, pas ici.
 */
export const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

export const EMAIL_RE = new RegExp(EMAIL_PATTERN);
