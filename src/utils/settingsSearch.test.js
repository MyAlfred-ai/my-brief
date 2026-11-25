/**
 * Moteur de la recherche dans les réglages — ce qui fait qu'on trouve avec
 * ses mots à soi : accents, mots à moitié tapés, fautes de frappe, mots
 * vides. Le catalogue réel est testé à part (config/settingsSearch.test.js).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeSearchText,
  prepareSearchIndex,
  searchSettings,
  searchTokens,
} from './settingsSearch.js';

const ENTRIES = [
  { key: 'audio', title: 'Audio', path: ['Mon compte'], keywords: ['micro', 'casque'] },
  { key: 'mic', title: 'Réglages audio', path: ['Mon compte', 'Audio'], terms: ['Microphone'] },
  { key: 'ms', title: 'Microsoft', path: ['Organisation', 'Authentification'] },
  { key: 'lang', title: 'Langue', path: ['Mon compte', 'Mon profil'], terms: ['Français'] },
  { key: 'pwd', title: 'Mot de passe', path: ['Mon compte', 'Mon profil'] },
  { key: 'logo', title: 'Logo', path: ['Organisation', 'Marque & apparence'] },
  { key: 'auth', title: 'Authentification', keywords: ['login', 'sso'] },
  { key: 'mine', title: 'Mes templates', panel: 'config' },
  { key: 'org', title: 'Templates', panel: 'admin' },
];
const index = prepareSearchIndex(ENTRIES);
const keys = (query, options) => searchSettings(index, query, options).map((e) => e.key);

describe('normalizeSearchText', () => {
  it('ignore accents, casse et ponctuation', () => {
    expect(normalizeSearchText('Préférences IA — Détection d’actions')).toBe(
      'preferences ia detection d actions',
    );
    expect(normalizeSearchText("Cœur  de   l'Équipe")).toBe('coeur de l equipe');
  });

  it('supporte une valeur absente', () => {
    expect(normalizeSearchText(undefined)).toBe('');
    expect(normalizeSearchText(null)).toBe('');
  });
});

describe('searchTokens', () => {
  it('retire les mots qui ne disent pas QUOI', () => {
    expect(searchTokens('Changer la langue')).toEqual(['langue']);
    expect(searchTokens('où régler le micro ?')).toEqual(['micro']);
    expect(searchTokens('how to change my password')).toEqual(['password']);
  });

  it('garde les mots vides quand il ne reste qu’eux', () => {
    expect(searchTokens('changer')).toEqual(['changer']);
  });

  it('dédoublonne', () => {
    expect(searchTokens('logo logo')).toEqual(['logo']);
  });
});

describe('searchSettings', () => {
  it('ne renvoie rien pour une saisie vide', () => {
    expect(keys('')).toEqual([]);
    expect(keys('   ')).toEqual([]);
  });

  it('trouve par synonyme, et le synonyme exact passe avant un début de titre', () => {
    // « micro » est le début de « Microsoft » : il ne doit pas passer devant
    // la page dont c'est le synonyme.
    expect(keys('micro')[0]).toBe('audio');
    expect(keys('micro')).toContain('ms');
  });

  it('trouve un mot tapé à moitié', () => {
    expect(keys('lang')[0]).toBe('lang');
  });

  it('ignore les accents de la saisie comme de l’écran', () => {
    expect(keys('francais')).toEqual(['lang']);
    expect(keys('RÉGLAGES')).toEqual(['mic']);
  });

  it('tolère une faute de frappe, quand rien ne contient le mot tel quel', () => {
    expect(keys('micor')).toContain('audio');
    expect(keys('mot de pase')[0]).toBe('pwd');
  });

  it('ne tolère pas de faute quand le mot existe tel quel ailleurs', () => {
    // « logo » est à une lettre de « login » : la page Authentification ne
    // doit pas répondre, le logo existe.
    expect(keys('logo')).toEqual(['logo']);
  });

  it('préfère les entrées qui couvrent tous les mots de la saisie', () => {
    expect(keys('micro casque')).toEqual(['audio']);
  });

  it('la saisie entière qui est le titre passe en tête', () => {
    expect(keys('mot de passe')[0]).toBe('pwd');
  });

  it('un titre se lit sans ses mots vides : « Mes templates » vaut « templates »', () => {
    const boost = (entry) => (entry.panel === 'config' ? 0.5 : 0);
    expect(keys('templates', { boost })).toEqual(['mine', 'org']);
    const adminFirst = (entry) => (entry.panel === 'admin' ? 0.5 : 0);
    expect(keys('templates', { boost: adminFirst })).toEqual(['org', 'mine']);
  });

  it('borne le nombre de résultats', () => {
    expect(keys('o', { limit: 2 })).toHaveLength(2);
  });

  it('ne trouve rien quand rien ne ressemble', () => {
    expect(keys('zzzz')).toEqual([]);
  });
});
