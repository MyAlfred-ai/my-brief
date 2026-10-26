import { describe, it, expect } from 'vitest';
import { ownerFilter } from '../lib/ownerScope.js';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';

const EMAIL = 'alex@myalfred.ai';
/** Les templates transverses ne sont modifiables que par un admin. */
const adminSeed = (extra = {}) => ({ user: [userDoc(EMAIL, { role: 'admin' })], ...extra });

async function postJson(app, url, body, email = EMAIL) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('templates globaux', () => {
  it('GET /api/templates renvoie {templates:[...]} sans _id', async () => {
    const { app } = buildTestApp({
      seed: {
        templates: [
          { _id: 'x', value: 'standard', icon: '📄', labels: { fr: 'Standard' }, prompt: 'p' },
        ],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: identityHeaders(),
    });
    // `orgContext` voyage avec les templates : le navigateur assemble le prompt
    // de résumé et a besoin des deux au même moment (cf. routes/templates.js).
    // Les corrections automatiques de la transcription aussi : le navigateur
    // les applique au direct.
    expect(res.json()).toEqual({
      templates: [{ value: 'standard', icon: '📄', labels: { fr: 'Standard' }, prompt: 'p' }],
      orgContext: '',
      transcriptCorrections: [],
    });
  });

  it('save = delete-puis-insert avec les défauts n8n (icône 📄, labels fr/en = value)', async () => {
    const { app, db } = buildTestApp({ seed: adminSeed() });
    const res = await postJson(app, '/api/templates/save', { value: 'compta' });
    expect(res.json()).toEqual({ ok: true });
    expect(db.calls.find((c) => c.op === 'deleteMany').filter).toEqual({ value: 'compta' });
    const insert = db.calls.find((c) => c.op === 'insertOne');
    expect(insert.doc).toEqual({
      value: 'compta',
      icon: '📄',
      labels: { fr: 'compta', en: 'compta' },
      prompt: '',
    });
  });

  it('delete supprime par value', async () => {
    const { app, db } = buildTestApp({ seed: adminSeed({ templates: [{ value: 'compta' }] }) });
    const res = await postJson(app, '/api/templates/delete', { value: 'compta' });
    expect(res.json()).toEqual({ ok: true });
    expect(db.data.get('templates')).toHaveLength(0);
  });

  it('delete : un opérateur à la place de value ne vide pas le catalogue', async () => {
    const { app, db } = buildTestApp({
      seed: adminSeed({ templates: [{ value: 'compta' }, { value: 'rh' }] }),
    });
    const res = await postJson(app, '/api/templates/delete', { value: { $ne: '' } });
    expect(res.statusCode).toBe(400);
    expect(db.data.get('templates')).toHaveLength(2);
  });
});

describe('templates utilisateur (cap 5)', () => {
  const five = (email) => Array.from({ length: 5 }, (_, i) => ({ email, value: `tpl-${i}` }));

  it('GET renvoie {templates:[]} même vide, filtré par email', async () => {
    const { app } = buildTestApp({
      seed: { userTemplates: [{ email: 'autre@x.fr', value: 'pas-a-moi' }] },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/user-templates',
      headers: identityHeaders(EMAIL),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ templates: [] });
  });

  it('cap 5 compté PAR UTILISATEUR (fix : n8n comptait sur toute la collection)', async () => {
    // 5 templates appartenant à un AUTRE compte : je peux encore créer.
    const { app } = buildTestApp({ seed: { userTemplates: five('autre@x.fr') } });
    const ok = await postJson(app, '/api/user-templates/save', { value: 'mon-template' });
    expect(ok.json().ok).toBe(true);

    // 5 templates à MOI : limite atteinte, en 200 + {ok:false} (contrat frontend).
    const { app: full } = buildTestApp({ seed: { userTemplates: five(EMAIL) } });
    const ko = await postJson(full, '/api/user-templates/save', { value: 'sixieme' });
    expect(ko.statusCode).toBe(200);
    expect(ko.json()).toEqual({ ok: false, error: 'limit_reached', count: 5, max: 5 });
  });

  it('mettre à jour un template existant passe malgré la limite', async () => {
    const { app, db } = buildTestApp({ seed: { userTemplates: five(EMAIL) } });
    const res = await postJson(app, '/api/user-templates/save', { value: 'tpl-2', icon: '🎯' });
    expect(res.json().ok).toBe(true);
    const insert = db.calls.find((c) => c.op === 'insertOne');
    expect(insert.doc.email).toBe(EMAIL);
    expect(insert.doc.icon).toBe('🎯');
  });

  it('validations : value_required et value_invalid en 200 + {ok:false}', async () => {
    const { app } = buildTestApp();
    expect((await postJson(app, '/api/user-templates/save', {})).json()).toEqual({
      ok: false,
      error: 'value_required',
    });
    expect((await postJson(app, '/api/user-templates/save', { value: 'a b!' })).json()).toEqual({
      ok: false,
      error: 'value_invalid',
    });
  });

  it('delete scopé {email, value}', async () => {
    const { app, db } = buildTestApp({
      seed: {
        userTemplates: [
          { email: EMAIL, value: 'tpl' },
          { email: 'autre@x.fr', value: 'tpl' },
        ],
      },
    });
    await postJson(app, '/api/user-templates/delete', { value: 'tpl' });
    expect(db.calls.find((c) => c.op === 'deleteMany').filter).toEqual(
      ownerFilter(EMAIL, { value: 'tpl' }),
    );
    expect(db.data.get('userTemplates')).toHaveLength(1); // celui de l'autre compte survit
  });

  it('delete : un opérateur à la place de value ne supprime rien', async () => {
    const { app, db } = buildTestApp({
      seed: {
        userTemplates: [
          { email: EMAIL, value: 'tpl-a' },
          { email: EMAIL, value: 'tpl-b' },
        ],
      },
    });
    const res = await postJson(app, '/api/user-templates/delete', { value: { $ne: '' } });
    expect(res.json()).toEqual({ ok: false, error: 'value_required' });
    expect(db.data.get('userTemplates')).toHaveLength(2);
  });
});

describe('configuration utilisateur', () => {
  it('GET renvoie {context} ("" si aucun document)', async () => {
    const { app } = buildTestApp({
      seed: { userConfig: [{ email: EMAIL, context: 'Je suis PM chez MyAlfred' }] },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/user-config',
      headers: identityHeaders(EMAIL),
    });
    expect(res.json()).toEqual({ context: 'Je suis PM chez MyAlfred' });

    const { app: empty } = buildTestApp();
    const res2 = await empty.inject({
      method: 'GET',
      url: '/api/user-config',
      headers: identityHeaders(EMAIL),
    });
    expect(res2.json()).toEqual({ context: '' });
  });

  it('GET accepte le repli x-auth-request-user (fix : n8n ne lisait que ce header-là, harmonisé)', async () => {
    const { app } = buildTestApp({
      seed: { userConfig: [{ email: 'entra@client.fr', context: 'ctx' }] },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/user-config',
      headers: { 'x-auth-request-user': 'entra@client.fr' },
    });
    expect(res.json()).toEqual({ context: 'ctx' });
  });

  it('save tronque à 4000 caractères et remplace le document', async () => {
    const { app, db } = buildTestApp({
      seed: { userConfig: [{ email: EMAIL, context: 'ancien' }] },
    });
    const res = await postJson(app, '/api/user-config/save', { context: 'x'.repeat(5000) });
    expect(res.json()).toEqual({ ok: true });
    const docs = db.data.get('userConfig').filter((d) => d.email === EMAIL);
    expect(docs).toHaveLength(1);
    expect(docs[0].context).toHaveLength(4000);
  });

  it('context non-string coercé en chaîne vide', async () => {
    const { app, db } = buildTestApp();
    await postJson(app, '/api/user-config/save', { context: { hack: true } });
    expect(db.data.get('userConfig')[0].context).toBe('');
  });
});

describe('Pagimètre des templates (`pageMeter`, position par défaut en pages)', () => {
  it('admin : ramené au pas du curseur, lu avec le template', async () => {
    const { app, db } = buildTestApp({ seed: adminSeed() });
    await postJson(app, '/api/templates/save', { value: 'comite', prompt: 'p', pageMeter: 1.3 });
    const insert = db.calls.find((c) => c.op === 'insertOne');
    expect(insert.doc.pageMeter).toBe(1.5);
    const res = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: identityHeaders(),
    });
    expect(res.json().templates[0]).toMatchObject({ value: 'comite', pageMeter: 1.5 });
  });

  it('absent, désactivé (null) ou invalide : le champ n’est pas écrit — le document d’avant', async () => {
    for (const pageMeter of [undefined, null, 0, 42, 'beaucoup', { pages: 1 }]) {
      const { app, db } = buildTestApp({ seed: adminSeed() });
      await postJson(app, '/api/templates/save', { value: 'comite', pageMeter });
      const insert = db.calls.find((c) => c.op === 'insertOne');
      expect(insert.doc, String(pageMeter)).not.toHaveProperty('pageMeter');
    }
  });

  it('le désactiver sur un template qui l’avait retire le champ (document remplacé)', async () => {
    const { app, db } = buildTestApp({
      seed: adminSeed({ templates: [{ value: 'standard', prompt: 'p', pageMeter: 1 }] }),
    });
    await postJson(app, '/api/templates/save', { value: 'standard', prompt: 'p', pageMeter: null });
    expect(db.data.get('templates')).toEqual([
      expect.not.objectContaining({ pageMeter: expect.anything() }),
    ]);
  });

  it('templates utilisateur : même règle, scopée au compte', async () => {
    const { app, db } = buildTestApp();
    await postJson(app, '/api/user-templates/save', { value: 'point-hebdo', pageMeter: 0.25 });
    const insert = db.calls.find((c) => c.op === 'insertOne' && c.collection === 'userTemplates');
    expect(insert.doc.pageMeter).toBe(0.25);
    const res = await app.inject({
      method: 'GET',
      url: '/api/user-templates',
      headers: identityHeaders(EMAIL),
    });
    expect(res.json().templates[0]).toMatchObject({ value: 'point-hebdo', pageMeter: 0.25 });
  });
});
