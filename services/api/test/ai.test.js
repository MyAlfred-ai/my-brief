import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders } from './helpers.js';
import { UpstreamError } from '../lib/openai.js';
import { parseActionsOutput, sanitizeTitle, todayParis } from '../lib/prompts.js';

describe('/api/tempkey', () => {
  it('transmet la langue du client (fix : n8n codait fr en dur)', async () => {
    const { app, ai } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/tempkey?lang=en',
      headers: identityHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(ai.calls[0]).toMatchObject({ method: 'realtimeClientSecret', lang: 'en' });
  });

  it('ouvre la session avec le modèle réglé en administration, et le dit au client', async () => {
    // Le navigateur renvoie un `session.update` sur son WebSocket : s'il n'a pas
    // le même modèle, le réglage d'administration reste sans effet visible.
    const { app, ai } = buildTestApp({
      seed: { appSettings: [{ key: 'ai', transcriptionModel: 'gpt-live-transcribe' }] },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/tempkey',
      headers: identityHeaders(),
    });
    expect(ai.calls[0].model).toBe('gpt-live-transcribe');
    expect(res.json().transcriptionModel).toBe('gpt-live-transcribe');
  });

  it('un modèle retiré par OpenAI (choisi avant le 26/02/2027) part sur son remplaçant', async () => {
    // Ignoré comme une valeur inconnue, il ferait retomber l'installation sur
    // le défaut, bien plus cher : il est traduit, réglage ET environnement.
    for (const [seed, config] of [
      [[{ key: 'ai', transcriptionModel: 'gpt-4o-mini-transcribe' }], undefined],
      [[{ key: 'ai', transcriptionModel: 'gpt-4o-transcribe' }], undefined],
      [[], { openai: { apiKey: '', baseUrl: '', models: { transcription: 'whisper-1' } } }],
    ]) {
      const { app, ai } = buildTestApp({ seed: { appSettings: seed }, config });
      const res = await app.inject({
        method: 'GET',
        url: '/api/tempkey',
        headers: identityHeaders(),
      });
      expect(ai.calls[0].model).toBe('gpt-transcribe');
      expect(res.json().transcriptionModel).toBe('gpt-transcribe');
    }
  });

  it('aucun réglage → modèle par défaut, celui utilisé avant que le choix existe', async () => {
    const { app, ai } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/tempkey',
      headers: identityHeaders(),
    });
    expect(ai.calls[0].model).toBe('gpt-realtime-whisper');
    expect(res.json().transcriptionModel).toBe('gpt-realtime-whisper');
  });

  it('langue absente ou invalide → fr', async () => {
    const { app, ai } = buildTestApp();
    await app.inject({ method: 'GET', url: '/api/tempkey', headers: identityHeaders() });
    await app.inject({
      method: 'GET',
      url: '/api/tempkey?lang=<script>',
      headers: identityHeaders(),
    });
    expect(ai.calls[0].lang).toBe('fr');
    expect(ai.calls[1].lang).toBe('fr');
  });

  it('garantit les deux formes .value et .client_secret.value (deux parseurs frontend)', async () => {
    const { app } = buildTestApp({
      openai: { realtimeClientSecret: { value: 'ek_abc', expires_at: 1 } },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/tempkey',
      headers: identityHeaders(),
    });
    const body = res.json();
    expect(body.value).toBe('ek_abc'); // lu par App.svelte
    expect(body.client_secret.value).toBe('ek_abc'); // lu par utils/peerConnection.js
  });

  it('relaie verbatim un 429 quota OpenAI (signatures crédit du frontend)', async () => {
    const upstreamBody = '{"error":{"message":"You exceeded your current quota"}}';
    const { app } = buildTestApp({
      openai: {
        realtimeClientSecret: () => {
          throw new UpstreamError(429, upstreamBody);
        },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/tempkey',
      headers: identityHeaders(),
    });
    expect(res.statusCode).toBe(429);
    expect(res.body).toBe(upstreamBody); // corps verbatim : CREDIT_SIGNATURES doit matcher
  });

  it('remappe un 401 OpenAI (clé invalide) en 502 — jamais relayé tel quel (le frontend le prendrait pour une session expirée)', async () => {
    const { app } = buildTestApp({
      openai: {
        realtimeClientSecret: () => {
          throw new UpstreamError(401, '{"error":{"message":"Incorrect API key"}}');
        },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/tempkey',
      headers: identityHeaders(),
    });
    expect(res.statusCode).toBe(502);
  });
});

describe('/api/actions', () => {
  it('appelle gpt-6-luna avec transcription + actions déjà traitées, renvoie {actions}', async () => {
    const { app, ai } = buildTestApp({
      openai: {
        chat: '```json\n[{"title":"Relancer INITECH","owner":"Alex","dueDate":"2026-08-10","description":"Appeler le client"}]\n```',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      headers: { ...identityHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        content: 'Action pour Alex : relancer INITECH',
        actions: [{ title: 'Déjà vue' }],
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().actions).toHaveLength(1);
    expect(res.json().actions[0].title).toBe('Relancer INITECH');
    const prompt = ai.calls[0].params.messages[0].content;
    expect(ai.calls[0].params.model).toBe('gpt-6-luna');
    // Explicite : gpt-6-luna raisonne en « medium » par défaut, mais la
    // détection ne doit pas suivre un défaut d'OpenAI qui changerait.
    expect(ai.calls[0].params.reasoningEffort).toBe('medium');
    expect(prompt).toContain('Action pour Alex : relancer INITECH');
    expect(prompt).toContain('"Déjà vue"'); // actions déjà traitées injectées
    expect(prompt).toContain(todayParis()); // date du jour pour les dueDate
  });

  it('sortie vide ou illisible → {actions: []}', async () => {
    const { app } = buildTestApp({ openai: { chat: 'Rien de particulier détecté.' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      headers: { ...identityHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'blabla', actions: [] }),
    });
    expect(res.json()).toEqual({ actions: [] });
  });

  it('demande explicitement les engagements induits et les mises à jour par id', async () => {
    const { app, ai } = buildTestApp({ openai: { chat: '[]' } });
    await app.inject({
      method: 'POST',
      url: '/api/actions',
      headers: { ...identityHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'blabla', actions: [] }),
    });
    const prompt = ai.calls[0].params.messages[0].content;
    // Sans ces deux consignes, on retombe sur le comportement d'origine : une
    // action au mot « action », et plus jamais modifiable ensuite. L'engagement
    // pris sans annonce est la seconde question du niveau par défaut
    // (cf. SENSITIVITY_RULES.balanced) ; c'est lui qu'on vérifie ici.
    expect(prompt).toContain('se la voit-il CONFIER');
    expect(prompt).toContain('MISES À JOUR');
    expect(prompt).toContain('"id"');
  });

  it('une mise à jour réécrit l’action, elle ne l’allonge pas', async () => {
    const { app, ai } = buildTestApp({ openai: { chat: '[]' } });
    await app.inject({
      method: 'POST',
      url: '/api/actions',
      headers: { ...identityHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'blabla', actions: [] }),
    });
    const prompt = ai.calls[0].params.messages[0].content;
    // « Repars des valeurs existantes » faisait ajouter « Précision ajoutée :
    // … » à la description à chaque fenêtre (recette, 2026-10-13).
    expect(prompt).not.toContain('repars des valeurs existantes');
    expect(prompt).toContain('La description se RÉÉCRIT');
    expect(prompt).toContain('fourre-tout');
  });

  it('transmet les actions supprimées pour qu’elles ne reviennent pas', async () => {
    const { app, ai } = buildTestApp({ openai: { chat: '[]' } });
    await app.inject({
      method: 'POST',
      url: '/api/actions',
      headers: { ...identityHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        content: 'on reparle du devis',
        actions: [{ id: 4, title: 'Vivante' }],
        dismissed: [{ title: 'Envoyer le devis' }],
      }),
    });
    const prompt = ai.calls[0].params.messages[0].content;
    expect(prompt).toContain('ACTIONS REFUSÉES');
    expect(prompt).toContain('"Envoyer le devis"');
    expect(prompt).toContain('"id":4');
  });

  it('restitue l’id d’une mise à jour', async () => {
    const { app } = buildTestApp({
      openai: { chat: '[{"id":3,"title":"Envoyer le devis","owner":"Marie"}]' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      headers: { ...identityHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ content: "c'est Marie qui envoie le devis", actions: [] }),
    });
    expect(res.json().actions[0]).toMatchObject({ id: 3, owner: 'Marie' });
  });
});

describe('parseActionsOutput', () => {
  it('tolère JSON nu, fences, objet {actions}, et texte', () => {
    expect(parseActionsOutput('[{"title":"a"}]')).toEqual([{ title: 'a' }]);
    expect(parseActionsOutput('```json\n[{"title":"b"}]\n```')).toEqual([{ title: 'b' }]);
    expect(parseActionsOutput('{"actions":[{"title":"c"}]}')).toEqual([{ title: 'c' }]);
    expect(parseActionsOutput('Voici : [{"title":"d"}] fin')).toEqual([{ title: 'd' }]);
    expect(parseActionsOutput('rien')).toEqual([]);
    expect(parseActionsOutput('')).toEqual([]);
  });

  it('conserve un id entier et accepte sa forme texte', () => {
    expect(parseActionsOutput('[{"id":3,"title":"a"}]')).toEqual([{ id: 3, title: 'a' }]);
    expect(parseActionsOutput('[{"id":"3","title":"a"}]')).toEqual([{ id: 3, title: 'a' }]);
  });

  it('retire un id inexploitable plutôt que de le transmettre', () => {
    // Un id fantaisiste ne doit pas désigner une action à écraser : sans id,
    // le client crée une nouvelle action, ce qui est réparable d'un clic.
    expect(parseActionsOutput('[{"id":3.5,"title":"a"}]')).toEqual([{ title: 'a' }]);
    expect(parseActionsOutput('[{"id":"douze","title":"a"}]')).toEqual([{ title: 'a' }]);
    expect(parseActionsOutput('[{"id":null,"title":"a"}]')).toEqual([{ title: 'a' }]);
  });

  it('écarte ce qui n’est pas un objet', () => {
    expect(parseActionsOutput('["bruit", null, 42, {"title":"a"}]')).toEqual([{ title: 'a' }]);
  });
});

describe('sanitizeTitle', () => {
  it('retire guillemets et ponctuation finale, tronque à 80, replie si vide', () => {
    expect(sanitizeTitle('"Point produit Q3."')).toBe('Point produit Q3');
    expect(sanitizeTitle("  'Kickoff GLOBEX !'  ")).toBe('Kickoff GLOBEX');
    expect(sanitizeTitle('x'.repeat(120))).toHaveLength(80);
    expect(sanitizeTitle('')).toBe('Réunion sans titre');
    expect(sanitizeTitle('"?"')).toBe('Réunion sans titre');
  });

  it('plafonne à 5 mots — la consigne du prompt ne suffit pas', () => {
    // Le modèle rend régulièrement une phrase entière malgré TITLE_RULES ; la
    // sidebar la couperait au milieu d'un mot, sujet illisible.
    expect(sanitizeTitle('Point sur la migration INITECH et le planning de recette')).toBe(
      'Point sur la migration INITECH',
    );
    expect(sanitizeTitle('Budget 2026, priorités et arbitrages')).toBe(
      'Budget 2026, priorités et arbitrages',
    );
    // Pas de ponctuation de liaison orpheline en fin de coupe.
    expect(sanitizeTitle('Budget 2026, arbitrages, recrutements, outils, roadmap')).toBe(
      'Budget 2026, arbitrages, recrutements, outils',
    );
  });

  it('laisse passer un titre déjà court', () => {
    expect(sanitizeTitle('Démo MyBrief pour Globex')).toBe('Démo MyBrief pour Globex');
  });
});
