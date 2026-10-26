/**
 * POST /api/refine-transcript — relecture des dernières phrases transcrites à
 * la lumière des notes de réunion (graphie des noms propres et sigles).
 * Garanties : le prompt porte réellement notes et phrases ; une sortie modèle
 * illisible ou mal alignée renvoie les phrases d'origine (jamais une erreur
 * pour l'appelant) ; les entrées vides ne dépensent aucun appel modèle ; les
 * bornes de taille tiennent les mésusages à l'écart.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders } from './helpers.js';
import { refineTranscriptPrompt, parseRefineOutput } from '../lib/prompts.js';

function post(app, body) {
  return app.inject({
    method: 'POST',
    url: '/api/refine-transcript',
    headers: { ...identityHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('parseRefineOutput', () => {
  it('lit {"sentences": [...]}, un tableau nu, et les fences markdown', () => {
    expect(parseRefineOutput('{"sentences": ["A.", "B."]}', 2)).toEqual(['A.', 'B.']);
    expect(parseRefineOutput('["A.", "B."]', 2)).toEqual(['A.', 'B.']);
    expect(parseRefineOutput('```json\n{"sentences": ["A."]}\n```', 1)).toEqual(['A.']);
  });

  it('rejette un désalignement, des non-chaînes, ou de la prose', () => {
    expect(parseRefineOutput('{"sentences": ["A."]}', 2)).toBeNull();
    expect(parseRefineOutput('{"sentences": ["A.", 42]}', 2)).toBeNull();
    expect(parseRefineOutput('Voici les phrases corrigées : A. B.', 2)).toBeNull();
    expect(parseRefineOutput('', 1)).toBeNull();
  });
});

describe('refineTranscriptPrompt — règles limitatives', () => {
  it('énumère les trois cas permis et interdit de substituer un nom différent', () => {
    // La formulation d'origine (« la graphie des notes fait foi ») faisait
    // remplacer n'importe quel prénom par celui des notes. Ces trois marqueurs
    // portent le resserrage — les retirer rouvre le bug.
    const prompt = refineTranscriptPrompt({
      sentences: ['Marc présente le budget.'],
      notes: 'Réunion avec Sophie, chef des ventes AIR FRANCE',
    });
    expect(prompt).toContain('TROIS CAS, ET SEULEMENT CEUX-LÀ');
    expect(prompt).toContain('ne remplace JAMAIS un nom différent');
    expect(prompt).toContain('« Marc » reste « Marc »');
    // Resserrage du 2026-08-28 : ne-rien-changer par défaut, et un mot réel
    // (vrai prénom compris) ne se corrige que sur consigne explicite.
    expect(prompt).toContain('RÈGLE PAR DÉFAUT : NE CHANGE RIEN');
    expect(prompt).toContain('ne se corrige JAMAIS de ta propre initiative');
    expect(prompt).toContain('MANIFESTEMENT écorché');
  });
});

describe('POST /api/refine-transcript', () => {
  it('envoie notes et phrases au modèle et renvoie les phrases relues', async () => {
    const { app, ai } = buildTestApp({
      openai: { chat: '{"sentences": ["On livre chez Globex.", "Rien à corriger."]}' },
    });
    const res = await post(app, {
      sentences: ['On livre chez Klobex.', 'Rien à corriger.'],
      notes: 'Client : Globex',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sentences: ['On livre chez Globex.', 'Rien à corriger.'],
    });
    const prompt = ai.calls[0].params.messages[0].content;
    expect(prompt).toContain('Client : Globex');
    expect(prompt).toContain('On livre chez Klobex.');
    expect(prompt).toBe(
      refineTranscriptPrompt({
        sentences: ['On livre chez Klobex.', 'Rien à corriger.'],
        notes: 'Client : Globex',
      }),
    );
  });

  it('relit sur un petit modèle, sans raisonnement : appelé en continu, la latence prime', async () => {
    // gpt-6-luna raisonne en « medium » si on ne lui dit rien — l'oublier
    // ralentirait chaque relecture pendant la réunion.
    const { app, ai } = buildTestApp({ openai: { chat: '{"sentences": ["A."]}' } });
    await post(app, { sentences: ['A.'], notes: 'Globex' });
    expect(ai.calls[0].params.model).toBe('gpt-6-luna');
    expect(ai.calls[0].params.reasoningEffort).toBe('none');
  });

  it('sortie modèle illisible ou mal alignée → phrases d’origine, statut 200', async () => {
    const { app } = buildTestApp({ openai: { chat: 'désolé, voici une explication…' } });
    const res = await post(app, { sentences: ['Une phrase.'], notes: 'Globex' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sentences: ['Une phrase.'] });
  });

  it('sans notes ou sans phrases : réponse vide, AUCUN appel modèle', async () => {
    const { app, ai } = buildTestApp();
    const r1 = await post(app, { sentences: ['Une phrase.'], notes: '   ' });
    const r2 = await post(app, { sentences: [], notes: 'Globex' });
    expect(r1.json()).toEqual({ sentences: ['Une phrase.'] });
    expect(r2.json()).toEqual({ sentences: [] });
    expect(ai.calls).toHaveLength(0);
  });

  it('borne les entrées : 4 phrases max, phrases et notes tronquées', async () => {
    const { app, ai } = buildTestApp({
      openai: {
        chat: (params) => {
          const sent = JSON.parse(params.messages[0].content.split('#PHRASES\n')[1]);
          return JSON.stringify({ sentences: sent });
        },
      },
    });
    const res = await post(app, {
      sentences: ['a.', 'b.', 'c.', 'd.', 'e.', 'x'.repeat(5000)],
      notes: 'n'.repeat(9000),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sentences).toHaveLength(4);
    const prompt = ai.calls[0].params.messages[0].content;
    expect(prompt).not.toContain('n'.repeat(4001));
    expect(prompt).toContain('n'.repeat(4000));
  });
});
