/**
 * Routes de réunion sans schéma de corps — un identifiant est une CHAÎNE.
 *
 * Ce qui casserait sans ces tests : un objet passé tel quel dans un filtre
 * Mongo y devient un opérateur. `{"meetingId": {"$ne": ""}}` sur
 * /history/delete effaçait toutes les réunions du demandeur d'un coup, et
 * `{"versionId": {"$ne": ""}}` sur /versions/delete toutes les versions d'une
 * réunion. La portée reste celle du demandeur (ownerFilter) : c'est un
 * effacement de masse involontaire, pas une fuite.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders } from './helpers.js';

const EMAIL = 'alex@myalfred.ai';
const ne = { $ne: '' };

const seed = () => ({
  resume: [
    {
      meetingId: 'm-1',
      email: EMAIL,
      emailLower: EMAIL,
      title: 'Point client',
      transcription: 'Bonjour.',
      versions: [
        { id: 'v-1', html: '<p>Un</p>' },
        { id: 'v-2', html: '<p>Deux</p>' },
      ],
    },
    { meetingId: 'm-2', email: EMAIL, emailLower: EMAIL, title: 'Comité', versions: [] },
  ],
});

function postJson(app, url, body) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(EMAIL), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('identifiants des routes de réunion', () => {
  it('/history/delete : un opérateur à la place du meetingId est refusé, rien ne part', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await postJson(app, '/api/history/delete', { meetingId: ne });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ ok: false, error: 'meetingId_required' });
    expect(db.data.get('resume').map((r) => r.meetingId)).toEqual(['m-1', 'm-2']);
  });

  it('/history/delete : un identifiant chaîne supprime cette réunion seule', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await postJson(app, '/api/history/delete', { meetingId: 'm-1' });
    expect(res.json()).toEqual({ ok: true });
    expect(db.data.get('resume').map((r) => r.meetingId)).toEqual(['m-2']);
  });

  it('/history/rename : un opérateur ne renomme rien', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await postJson(app, '/api/history/rename', { meetingId: ne, title: 'X' });
    expect(res.statusCode).toBe(400);
    expect(db.data.get('resume').map((r) => r.title)).toEqual(['Point client', 'Comité']);
  });

  it('/versions/delete : un opérateur à la place du versionId ne vide pas la réunion', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await postJson(app, '/api/versions/delete', { meetingId: 'm-1', versionId: ne });
    expect(res.statusCode).toBe(400);
    expect(db.data.get('resume')[0].versions.map((v) => v.id)).toEqual(['v-1', 'v-2']);
  });

  it('/versions/update : identifiant ou HTML qui ne sont pas des chaînes → refusés', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    for (const body of [
      { meetingId: ne, versionId: 'v-1', html: '<p>X</p>' },
      { meetingId: 'm-1', versionId: 'v-1', html: { $x: 1 } },
    ]) {
      const res = await postJson(app, '/api/versions/update', body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(db.data.get('resume')[0].versions[0].html).toBe('<p>Un</p>');
  });

  it('/versions/add : une version qui n’est pas un objet est refusée', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    for (const version of [['v-3'], 'v-3']) {
      const res = await postJson(app, '/api/versions/add', { meetingId: 'm-1', version });
      expect(res.statusCode).toBe(400);
    }
    expect(db.data.get('resume')[0].versions).toHaveLength(2);
  });

  it('/transcription/update : une transcription qui n’est pas du texte est refusée', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await postJson(app, '/api/transcription/update', {
      meetingId: 'm-1',
      transcription: ['Bonjour.'],
    });
    expect(res.statusCode).toBe(400);
    expect(db.data.get('resume')[0].transcription).toBe('Bonjour.');
  });
});
