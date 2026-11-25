import { describe, it, expect } from 'vitest';
import {
  listToDelete,
  isYouTubeSubtitlePattern,
  isValidTranscription,
} from './transcriptionValidation.js';

// Mentions de sous-titrage que les modèles inventent sur un silence, sous les
// formes qu'on leur connaît — au-delà des orthographes exactes de listToDelete.
const SUBTITLE_CREDITS = [
  "Sous-titres réalisés par la communauté d'Amara.org",
  "Sous-titres réalisés par la communauté d'Amara.org.",
  "Sous-titres réalisés pour la communauté d'Amara.org",
  'Sous-titres fait par Sous-titres par Amara.org',
  'Sous-titres par Amara.org',
  "Sous-Titres faits par la communauté d'Amara.org",
  'Subtitles by the Amara.org community',
  '❤️ par SousTitreur.com',
  'par SousTitreur.com.',
  'Sous-titres par Jeanne Martin',
  'Sous-titres réalisés par Jeanne Martin',
  "Sous-titres : Le Crayon d'oreille",
  'Sous-titrage par Lune',
  '- Sous-titrage par Lune -',
  'Sous-titrage en français par Lune',
  "Sous-titrage réalisé par Le Crayon d'oreille",
  'Sous-titrage Société Radio-Canada',
  "Sous-titrage ST' 501",
  "— Sous-titrage ST' 501 —",
  'Sous-titrage FR ?',
  'Sous-titrage MFP.',
  'Sous-titrage',
  '– Sous-titrage –',
  'Sous-titres.',
  // Collées à une vraie phrase : la mention condamne le segment, comme avant.
  'Merci. Sous-titrage Société Radio-Canada',
  'À demain Sous-titrage FR',
  "Merci d'avoir regardé cette vidéo ! Sous-titres réalisés par Jeanne Martin",
];

// Phrases de réunion que les anciens motifs faisaient disparaître.
const MEETING_SENTENCES = [
  // « par » + lettre
  'On commence par le budget.',
  'Validé par la direction.',
  'Il est passé par Paris hier.',
  'Par exemple, on peut décaler la livraison.',
  'Le devis a été envoyé par Marie.',
  'On en reparle par mail.',
  'Trois jours par semaine, pas plus.',
  'We are on par with last year.',
  // « réalisé par »
  "Ce travail a été réalisé par l'équipe.",
  "Réalisé par l'équipe de Lyon, relu par nous.",
  'La maquette est réalisée par le studio.',
  // tiret en tête
  '– Oui, on valide.',
  '— Et le budget ?',
  '- On valide.',
  '— Par contre, il faut prévenir le client.',
  // le sous-titrage comme sujet de la réunion
  'On active le sous-titrage pour Marie.',
  "Le sous-titrage en direct est géré par l'IA.",
  "Le sous-titrage par l'IA est en option.",
  'Les sous-titres réalisés par le studio sont arrivés.',
  'Sous-titrage des vidéos, on en est où ?',
  "Sous-titres en anglais, c'est prévu ?",
  "Deuxième sujet. Sous-titrage. Qui s'en occupe ?",
  // témoin : passait déjà
  'Le prestataire tient la mi-mars.',
];

describe('isValidTranscription — hallucinations écartées', () => {
  it.each(listToDelete)('écarte toujours « %s » (listToDelete)', (text) => {
    expect(isValidTranscription(text)).toBe(false);
    expect(isValidTranscription(`  ${text}  `)).toBe(false);
  });

  it('reconnaît les mentions de sous-titrage de listToDelete à leur forme, pas à leur orthographe', () => {
    const credits = listToDelete.filter((text) => /sous-?titr/i.test(text));
    expect(credits.length).toBeGreaterThanOrEqual(9);
    for (const text of credits) {
      expect(isYouTubeSubtitlePattern(text), text).toBe(true);
    }
  });

  it.each(SUBTITLE_CREDITS)('écarte la mention de sous-titrage « %s »', (text) => {
    expect(isYouTubeSubtitlePattern(text)).toBe(true);
    expect(isValidTranscription(text)).toBe(false);
  });

  it.each([
    'Au revoir, à bientôt !',
    'Merci, merci à vous.',
    'À bientôt !',
    "J'avoue",
    'Allez, allez, allez !',
  ])('écarte toujours la formule de fin « %s »', (text) => {
    expect(isValidTranscription(text)).toBe(false);
  });

  it.each([
    '',
    '   ',
    'ok',
    'Hmm',
    'hmmm',
    'euh',
    'Ah',
    '?',
    '...',
    '—',
    '!?',
    null,
    undefined,
    42,
  ])('écarte toujours le vide, les hésitations et la ponctuation seule (%j)', (text) => {
    expect(isValidTranscription(text)).toBe(false);
  });
});

describe('isValidTranscription — phrases de réunion gardées', () => {
  it.each(MEETING_SENTENCES)('garde « %s »', (text) => {
    expect(isYouTubeSubtitlePattern(text)).toBe(false);
    expect(isValidTranscription(text)).toBe(true);
  });

  it('garde le texte entier d’une coupure hors ligne où l’on dit « par »', () => {
    // handleOfflineGapTranscribed valide le texte de TOUTE la coupure d'un
    // bloc : un seul « par » le vidait, et le marqueur disparaissait.
    const gap = [
      'On commence par le budget.',
      'Le devis a été validé par la direction, il reste à le faire signer par le client.',
      "– D'accord. On passe par Marie pour l'envoi ?",
      'Oui, et le sous-titrage des vidéos est réalisé par le studio.',
    ].join(' ');
    expect(isValidTranscription(gap)).toBe(true);
  });

  it('ne prend pas « par » pour un mot quand il n’est qu’un morceau de mot', () => {
    expect(isYouTubeSubtitlePattern('Sous-titrage des parties réparées, parfait.')).toBe(false);
  });
});
