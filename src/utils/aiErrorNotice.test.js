import { describe, it, expect } from 'vitest';
import { buildAiErrorNoticeView, providerSuffix } from './aiErrorNotice.js';

const t = (path) => `[${path}]`;
const formatMessage = (path, replacements = {}) =>
  `[${path}]` +
  Object.entries(replacements)
    .map(([k, v]) => ` ${k}=${v}`)
    .join('');

describe('buildAiErrorNoticeView — la carte selon la cause', () => {
  it('crédit épuisé : nomme le fournisseur entre parenthèses', () => {
    const view = buildAiErrorNoticeView(
      { kind: 'credit', provider: 'OpenAI' },
      { t, formatMessage },
    );
    expect(view).toEqual({
      cls: 'credit',
      icon: '🔌',
      title: '[aiNotice.creditTitle]',
      body: '[messages.aiCreditExhausted] provider= (OpenAI)',
    });
  });

  it('crédit épuisé sans fournisseur connu : pas de parenthèses vides', () => {
    const view = buildAiErrorNoticeView({ kind: 'credit' }, { t, formatMessage });
    expect(view.body).toBe('[messages.aiCreditExhausted] provider=');
  });

  it('connexion interrompue', () => {
    expect(buildAiErrorNoticeView({ kind: 'network' }, { t, formatMessage })).toEqual({
      cls: 'network',
      icon: '📡',
      title: '[aiNotice.networkTitle]',
      body: '[messages.aiNetworkError]',
    });
  });

  it('toute autre cause : service indisponible', () => {
    expect(buildAiErrorNoticeView({ kind: 'service' }, { t, formatMessage }).cls).toBe('service');
    expect(buildAiErrorNoticeView({ kind: 'inconnu' }, { t, formatMessage }).cls).toBe('service');
  });
});

describe('providerSuffix', () => {
  it('« (fournisseur) », ou rien', () => {
    expect(providerSuffix('Mistral')).toBe(' (Mistral)');
    expect(providerSuffix('')).toBe('');
    expect(providerSuffix(undefined)).toBe('');
  });
});
