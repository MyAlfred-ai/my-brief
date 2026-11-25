/**
 * Tags de conversation — CRUD scopé par utilisateur.
 *
 * Deux propriétés tiennent tout le reste : un tag n'est JAMAIS visible ni
 * modifiable par un autre compte, et supprimer un tag ne laisse pas de
 * conversation pointant dans le vide.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import {
  TAG_COLORS,
  TAG_SHAPES,
  TAG_HUE_LIGHTNESS,
  USER_TAGS_MAX,
  TAG_LABEL_MAX,
  TAG_LOGO_MAX,
  TAG_LOGOS_COLLECTION,
} from '../routes/tags.js';
import { TAG_CONTEXT_MAX } from '../lib/tagContext.js';
import { uiTextData } from '../../../src/config/uiText.js';

const EMAIL = 'alex@myalfred.ai';
const AUTRE = 'bob@myalfred.ai';

const seedUsers = (extra = {}) => ({
  user: [userDoc(EMAIL), userDoc(AUTRE)],
  ...extra,
});

/** Tag tel qu'il est stocké (champs d'appartenance + labelLower compris). */
const tagDoc = (email, id, label, color = 'blue') => ({
  email,
  emailLower: email.toLowerCase(),
  id,
  label,
  labelLower: label.toLowerCase(),
  color,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
});

const getTags = (app, email = EMAIL) =>
  app.inject({ method: 'GET', url: '/api/tags', headers: identityHeaders(email) });

const postJson = (app, url, body, email = EMAIL) =>
  app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('GET /api/tags', () => {
  it('renvoie les tags du compte, la palette, les formes et le plafond', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Client Dupont', 'red')] }),
    });
    const res = await getTags(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      tags: [
        {
          id: 't-1',
          label: 'Client Dupont',
          color: 'red',
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-01T10:00:00.000Z',
        },
      ],
      colors: TAG_COLORS,
      shapes: TAG_SHAPES,
      hueLightness: TAG_HUE_LIGHTNESS,
      max: USER_TAGS_MAX,
      contextMax: TAG_CONTEXT_MAX,
      logoMax: TAG_LOGO_MAX,
    });
  });

  it('un tag d’avant les formes est servi sans `shape` — le client en fait un rond', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Ancien')] }),
    });
    const tag = (await getTags(app)).json().tags[0];
    expect(tag).not.toHaveProperty('shape');
  });

  it("ne fuit ni _id ni l'email du propriétaire", async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [{ _id: 'x', ...tagDoc(EMAIL, 't-1', 'Interne') }] }),
    });
    const tag = getTags(app).then((r) => r.json().tags[0]);
    expect(await tag).not.toHaveProperty('_id');
    expect(await tag).not.toHaveProperty('email');
    expect(await tag).not.toHaveProperty('emailLower');
    expect(await tag).not.toHaveProperty('labelLower');
  });

  it('ne montre jamais les tags d’un autre compte', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({
        userTags: [tagDoc(EMAIL, 't-1', 'À moi'), tagDoc(AUTRE, 't-2', 'À Bob')],
      }),
    });
    expect((await getTags(app)).json().tags.map((t) => t.id)).toEqual(['t-1']);
    expect((await getTags(app, AUTRE)).json().tags.map((t) => t.id)).toEqual(['t-2']);
  });

  it('trie sur labelLower — sinon « Zèbre » passerait avant « alpha »', async () => {
    const { app, db } = buildTestApp({ seed: seedUsers() });
    await getTags(app);
    expect(db.calls.find((c) => c.collection === 'userTags' && c.op === 'find').sort).toEqual({
      labelLower: 1,
    });
  });

  it('401 sans identité', async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/tags/save — création', () => {
  it('crée un tag avec un id généré et le renvoie', async () => {
    const { app, db } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/save', { label: 'Client Dupont', color: 'red' });
    expect(res.statusCode).toBe(200);

    const { tag } = res.json();
    expect(tag.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(tag).toMatchObject({ label: 'Client Dupont', color: 'red', shape: 'circle' });

    const stored = db.data.get('userTags')[0];
    expect(stored).toMatchObject({
      email: EMAIL,
      emailLower: EMAIL,
      label: 'Client Dupont',
      labelLower: 'client dupont',
      color: 'red',
      shape: 'circle',
    });
  });

  it('enregistre la forme choisie', async () => {
    const { app, db } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/save', { label: 'X', color: 'red', shape: 'star' });
    expect(res.statusCode).toBe(200);
    expect(res.json().tag.shape).toBe('star');
    expect(db.data.get('userTags')[0].shape).toBe('star');
  });

  it('400 sur une forme hors liste — la liste servie n’est pas un contrôle', async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/save', { label: 'X', color: 'red', shape: 'blob' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('shape_invalid');
  });

  it('accepte une couleur libre `hue-<angle>[-<clarté>]` et la stocke telle quelle', async () => {
    const { app, db } = buildTestApp({ seed: seedUsers() });
    const colors = ['hue-0', 'hue-7', 'hue-210', 'hue-359', 'hue-210-35', 'hue-210-68', 'hue-0-50'];
    for (const color of colors) {
      const res = await postJson(app, '/api/tags/save', { label: `Tag ${color}`, color });
      expect(res.statusCode, color).toBe(200);
      expect(res.json().tag.color).toBe(color);
    }
    expect(db.data.get('userTags').map((t) => t.color)).toEqual(colors);
  });

  it.each([
    'hue-360',
    'hue-07',
    'hue-',
    'hue-12a',
    'hue--5',
    'hue-1000',
    'Hue-12',
    // Clarté hors bornes ou mal écrite.
    `hue-210-${TAG_HUE_LIGHTNESS.min - 1}`,
    `hue-210-${TAG_HUE_LIGHTNESS.max + 1}`,
    'hue-210-5',
    'hue-210-045',
    'hue-210-',
    'hue-210-60-1',
    'hue-360-60',
  ])('400 sur la couleur libre mal formée « %s »', async (color) => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/save', { label: 'X', color });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('color_invalid');
  });

  it('les bornes de clarté servies encadrent la clarté par défaut', () => {
    const { min, max } = TAG_HUE_LIGHTNESS;
    expect(min).toBeLessThan(TAG_HUE_LIGHTNESS.default);
    expect(TAG_HUE_LIGHTNESS.default).toBeLessThan(max);
    // Deux chiffres : c'est ce que le slug admet.
    expect(min).toBeGreaterThanOrEqual(10);
    expect(max).toBeLessThanOrEqual(99);
  });

  it('normalise les espaces du libellé', async () => {
    const { app, db } = buildTestApp({ seed: seedUsers() });
    await postJson(app, '/api/tags/save', { label: '  Client   Dupont  ', color: 'blue' });
    expect(db.data.get('userTags')[0].label).toBe('Client Dupont');
  });

  it('400 sur un libellé vide ou fait d’espaces', async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/save', { label: '   ', color: 'blue' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('label_required');
  });

  it(`400 au-delà de ${TAG_LABEL_MAX} caractères`, async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/save', {
      label: 'x'.repeat(TAG_LABEL_MAX + 1),
      color: 'blue',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'label_too_long', max: TAG_LABEL_MAX });
  });

  it('400 sur une couleur hors palette — la liste servie n’est pas un contrôle', async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/save', { label: 'X', color: '#ff0000' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('color_invalid');
  });

  it('409 sur un libellé déjà pris, casse et espaces neutralisés', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Client Dupont')] }),
    });
    const res = await postJson(app, '/api/tags/save', { label: 'client  DUPONT', color: 'green' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('duplicate_label');
  });

  it('le doublon se juge PAR COMPTE — deux utilisateurs peuvent nommer pareil', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(AUTRE, 't-2', 'Client Dupont')] }),
    });
    const res = await postJson(app, '/api/tags/save', { label: 'Client Dupont', color: 'green' });
    expect(res.statusCode).toBe(200);
  });

  it(`409 au-delà de ${USER_TAGS_MAX} tags, plafond compté par compte`, async () => {
    const mine = Array.from({ length: USER_TAGS_MAX }, (_, i) =>
      tagDoc(EMAIL, `t-${i}`, `Tag ${i}`),
    );
    const { app } = buildTestApp({ seed: seedUsers({ userTags: mine }) });
    const res = await postJson(app, '/api/tags/save', { label: 'Un de trop', color: 'blue' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'limit_reached',
      count: USER_TAGS_MAX,
      max: USER_TAGS_MAX,
    });
  });

  it('le plafond d’un autre compte ne bloque personne', async () => {
    const others = Array.from({ length: USER_TAGS_MAX }, (_, i) =>
      tagDoc(AUTRE, `t-${i}`, `Tag ${i}`),
    );
    const { app } = buildTestApp({ seed: seedUsers({ userTags: others }) });
    const res = await postJson(app, '/api/tags/save', { label: 'Le mien', color: 'blue' });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/tags/save — modification', () => {
  it('renomme, recolore et change la forme sans changer l’id', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Client Dupont', 'red')] }),
    });
    const res = await postJson(app, '/api/tags/save', {
      id: 't-1',
      label: 'Dupont SA',
      color: 'teal',
      shape: 'heart',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tag).toMatchObject({
      id: 't-1',
      label: 'Dupont SA',
      color: 'teal',
      shape: 'heart',
    });

    const stored = db.data.get('userTags')[0];
    expect(stored).toMatchObject({
      id: 't-1',
      label: 'Dupont SA',
      labelLower: 'dupont sa',
      shape: 'heart',
    });
  });

  it('le corps est complet, pas un patch : sans `shape`, le tag redevient rond', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [{ ...tagDoc(EMAIL, 't-1', 'X', 'red'), shape: 'star' }] }),
    });
    const res = await postJson(app, '/api/tags/save', { id: 't-1', label: 'X', color: 'red' });
    expect(res.statusCode).toBe(200);
    expect(db.data.get('userTags')[0].shape).toBe('circle');
  });

  it('garder son propre libellé n’est pas un doublon', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Client Dupont', 'red')] }),
    });
    const res = await postJson(app, '/api/tags/save', {
      id: 't-1',
      label: 'Client Dupont',
      color: 'teal',
    });
    expect(res.statusCode).toBe(200);
  });

  it('409 en reprenant le libellé d’un AUTRE de ses tags', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({
        userTags: [tagDoc(EMAIL, 't-1', 'Client Dupont'), tagDoc(EMAIL, 't-2', 'Interne')],
      }),
    });
    const res = await postJson(app, '/api/tags/save', {
      id: 't-2',
      label: 'Client Dupont',
      color: 'blue',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('duplicate_label');
  });

  it('404 sur un id inconnu — jamais de création silencieuse', async () => {
    const { app, db } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/save', {
      id: 'jamais-vu',
      label: 'X',
      color: 'blue',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('tag_not_found');
    expect(db.data.get('userTags') || []).toHaveLength(0);
  });

  it('404 sur le tag d’un autre compte — et le tag reste intact', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(AUTRE, 't-2', 'À Bob', 'green')] }),
    });
    const res = await postJson(app, '/api/tags/save', {
      id: 't-2',
      label: 'Détourné',
      color: 'red',
    });
    expect(res.statusCode).toBe(404);
    expect(db.data.get('userTags')[0]).toMatchObject({ label: 'À Bob', color: 'green' });
  });

  it('le plafond ne bloque pas une modification', async () => {
    const mine = Array.from({ length: USER_TAGS_MAX }, (_, i) =>
      tagDoc(EMAIL, `t-${i}`, `Tag ${i}`),
    );
    const { app } = buildTestApp({ seed: seedUsers({ userTags: mine }) });
    const res = await postJson(app, '/api/tags/save', {
      id: 't-0',
      label: 'Renommé',
      color: 'pink',
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/tags/context', () => {
  const ATLAS = 'Rénovation du siège. Acteurs : Claire Martin, cliente.';

  it('enregistre le contexte, et GET /tags le sert avec le tag', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    const res = await postJson(app, '/api/tags/context', { id: 't-1', context: ATLAS });
    expect(res.statusCode).toBe(200);
    expect(res.json().tag).toMatchObject({ id: 't-1', context: ATLAS });
    expect((await getTags(app)).json().tags[0].context).toBe(ATLAS);
  });

  it('normalise : fins de ligne, lignes vides en série, espaces de bord', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    const res = await postJson(app, '/api/tags/context', {
      id: 't-1',
      context: '  Projet.  \r\n\r\n\r\n\r\nActeurs : Claire.   \n',
    });
    expect(res.json().tag.context).toBe('Projet.\n\nActeurs : Claire.');
  });

  it('un contexte vide le retire : le tag redevient un simple classeur', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({
        userTags: [{ ...tagDoc(EMAIL, 't-1', 'Projet Atlas'), context: ATLAS }],
      }),
    });
    const res = await postJson(app, '/api/tags/context', { id: 't-1', context: '   ' });
    expect(res.statusCode).toBe(200);
    expect(db.data.get('userTags')[0]).not.toHaveProperty('context');
  });

  it(`400 au-delà de ${TAG_CONTEXT_MAX} caractères — refusé, jamais coupé en silence`, async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    const res = await postJson(app, '/api/tags/context', {
      id: 't-1',
      context: 'x'.repeat(TAG_CONTEXT_MAX + 1),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'context_too_long', max: TAG_CONTEXT_MAX });
    expect(db.data.get('userTags')[0]).not.toHaveProperty('context');
  });

  it('404 sur le tag d’un autre compte — et son contexte reste intact', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({
        userTags: [{ ...tagDoc(AUTRE, 't-2', 'À Bob'), context: 'Secret de Bob' }],
      }),
    });
    const res = await postJson(app, '/api/tags/context', { id: 't-2', context: 'pris' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'tag_not_found' });
    expect(db.data.get('userTags')[0].context).toBe('Secret de Bob');
  });

  it('/tags/save laisse le contexte en place', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({
        userTags: [{ ...tagDoc(EMAIL, 't-1', 'Projet Atlas'), context: ATLAS }],
      }),
    });
    await postJson(app, '/api/tags/save', { id: 't-1', label: 'Atlas', color: 'teal' });
    expect((await getTags(app)).json().tags[0]).toMatchObject({ label: 'Atlas', context: ATLAS });
  });

  it('400 sans contexte ou avec un id objet — jamais d’opérateur Mongo', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    expect((await postJson(app, '/api/tags/context', { id: 't-1' })).statusCode).toBe(400);
    const res = await postJson(app, '/api/tags/context', { id: { $ne: '' }, context: 'x' });
    expect(res.statusCode).toBe(400);
  });

  it('401 sans identité', async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/tags/context',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 't-1', context: 'x' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it.each(['fr', 'en'])('le refus d’un contexte trop long a son message (%s)', (lang) => {
    expect(uiTextData[lang].tagsPanel.errors.context_too_long).toContain('{max}');
  });
});

describe('logo d’un tag', () => {
  // Les vrais premiers octets d'un PNG, d'un JPEG et d'un WebP.
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const getLogo = (app, id, email = EMAIL) =>
    app.inject({ method: 'GET', url: `/api/tags/logo?id=${id}`, headers: identityHeaders(email) });

  it('se pose, s’annonce par `logoAt` dans la liste, et se lit à part', async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    const res = await postJson(app, '/api/tags/logo', { id: 't-1', dataUrl: PNG });
    expect(res.statusCode).toBe(200);
    const { logoAt } = res.json().tag;
    expect(logoAt).toBeTruthy();
    const listed = (await getTags(app)).json().tags[0];
    expect(listed.logoAt).toBe(logoAt);
    // La liste ne transporte JAMAIS l'image.
    expect(JSON.stringify(listed)).not.toContain('base64');
    expect((await getLogo(app, 't-1')).json()).toEqual({ id: 't-1', dataUrl: PNG, logoAt });
  });

  it('remplacer laisse un seul logo, avec son appartenance', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    await postJson(app, '/api/tags/logo', { id: 't-1', dataUrl: PNG });
    await postJson(app, '/api/tags/logo', { id: 't-1', dataUrl: JPEG });
    const stored = db.data.get(TAG_LOGOS_COLLECTION);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      email: EMAIL,
      emailLower: EMAIL,
      tagId: 't-1',
      dataUrl: JPEG,
    });
  });

  it('refuse ce qui n’est pas une image PNG, JPEG ou WebP — SVG compris', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    for (const dataUrl of [
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:image/png;base64,PHNjcmlwdD4=', // annoncé PNG, contenu autre
      'data:text/html;base64,PGgxPg==',
      'https://exemple.fr/logo.png',
    ]) {
      const res = await postJson(app, '/api/tags/logo', { id: 't-1', dataUrl });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('logo_invalid');
    }
    expect(db.data.get(TAG_LOGOS_COLLECTION) || []).toHaveLength(0);
  });

  it(`400 au-delà de ${TAG_LOGO_MAX} caractères`, async () => {
    const { app } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    const big = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(TAG_LOGO_MAX)}`;
    const res = await postJson(app, '/api/tags/logo', { id: 't-1', dataUrl: big });
    expect(res.statusCode).toBe(400);
  });

  it('le tag d’un autre compte : 404, ni écriture ni lecture', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({
        userTags: [tagDoc(AUTRE, 't-2', 'À Bob')],
        [TAG_LOGOS_COLLECTION]: [{ email: AUTRE, emailLower: AUTRE, tagId: 't-2', dataUrl: PNG }],
      }),
    });
    expect((await postJson(app, '/api/tags/logo', { id: 't-2', dataUrl: JPEG })).statusCode).toBe(
      404,
    );
    expect((await getLogo(app, 't-2')).statusCode).toBe(404);
    expect(db.data.get(TAG_LOGOS_COLLECTION)[0].dataUrl).toBe(PNG);
  });

  it('retirer : plus d’annonce, plus de logo', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    await postJson(app, '/api/tags/logo', { id: 't-1', dataUrl: PNG });
    const res = await postJson(app, '/api/tags/logo/delete', { id: 't-1' });
    expect(res.json()).toEqual({ tag: { id: 't-1', logoAt: null } });
    expect((await getTags(app)).json().tags[0]).not.toHaveProperty('logoAt');
    expect(db.data.get(TAG_LOGOS_COLLECTION)).toHaveLength(0);
    expect((await getLogo(app, 't-1')).statusCode).toBe(404);
  });

  it('supprimer le tag emporte son logo', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'Projet Atlas')] }),
    });
    await postJson(app, '/api/tags/logo', { id: 't-1', dataUrl: PNG });
    await postJson(app, '/api/tags/delete', { id: 't-1' });
    expect(db.data.get(TAG_LOGOS_COLLECTION)).toHaveLength(0);
  });

  it('401 sans identité', async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await app.inject({ method: 'GET', url: '/api/tags/logo?id=t-1' });
    expect(res.statusCode).toBe(401);
  });

  it.each(['fr', 'en'])('chaque refus du logo a son message (%s)', (lang) => {
    const errors = uiTextData[lang].tagsPanel.errors;
    for (const slug of ['logo_invalid', 'logo_too_big', 'logo_unreadable']) {
      expect(errors[slug], slug).toBeTruthy();
    }
  });
});

describe('POST /api/tags/delete', () => {
  it('supprime le tag et détague les conversations qui le portaient', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({
        userTags: [tagDoc(EMAIL, 't-1', 'Client Dupont')],
        resume: [
          { ...ownerish(EMAIL), meetingId: 'm-1', tagId: 't-1' },
          { ...ownerish(EMAIL), meetingId: 'm-2', tagId: 't-1' },
          { ...ownerish(EMAIL), meetingId: 'm-3', tagId: 'autre' },
        ],
      }),
    });
    const res = await postJson(app, '/api/tags/delete', { id: 't-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, untagged: 2 });

    expect(db.data.get('userTags')).toHaveLength(0);
    const resumes = db.data.get('resume');
    expect(resumes.find((r) => r.meetingId === 'm-1')).not.toHaveProperty('tagId');
    expect(resumes.find((r) => r.meetingId === 'm-2')).not.toHaveProperty('tagId');
    // Une conversation taguée autrement n'est pas touchée.
    expect(resumes.find((r) => r.meetingId === 'm-3').tagId).toBe('autre');
  });

  it('détague AVANT de supprimer — l’ordre inverse laisserait des références mortes', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(EMAIL, 't-1', 'X')] }),
    });
    await postJson(app, '/api/tags/delete', { id: 't-1' });
    const unset = db.calls.findIndex((c) => c.collection === 'resume' && c.op === 'updateMany');
    const remove = db.calls.findIndex((c) => c.collection === 'userTags' && c.op === 'deleteMany');
    expect(unset).toBeGreaterThan(-1);
    expect(unset).toBeLessThan(remove);
  });

  it('ne détague que SES conversations', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({
        userTags: [tagDoc(EMAIL, 't-1', 'X')],
        resume: [
          { ...ownerish(EMAIL), meetingId: 'm-1', tagId: 't-1' },
          { ...ownerish(AUTRE), meetingId: 'm-9', tagId: 't-1' },
        ],
      }),
    });
    await postJson(app, '/api/tags/delete', { id: 't-1' });
    expect(db.data.get('resume').find((r) => r.meetingId === 'm-9').tagId).toBe('t-1');
  });

  it('404 sur un id inconnu', async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/delete', { id: 'jamais-vu' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('tag_not_found');
  });

  it('404 sur le tag d’un autre compte — et rien n’est supprimé', async () => {
    const { app, db } = buildTestApp({
      seed: seedUsers({ userTags: [tagDoc(AUTRE, 't-2', 'À Bob')] }),
    });
    const res = await postJson(app, '/api/tags/delete', { id: 't-2' });
    expect(res.statusCode).toBe(404);
    expect(db.data.get('userTags')).toHaveLength(1);
  });

  it('400 sans id', async () => {
    const { app } = buildTestApp({ seed: seedUsers() });
    const res = await postJson(app, '/api/tags/delete', {});
    expect(res.statusCode).toBe(400);
  });
});

/**
 * La palette vit des deux côtés : l'API admet les slugs, tokens.css les peint.
 * Un slug servi sans jeton passe tous les autres tests et s'affiche en
 * pastille TRANSPARENTE — le repli de `tagColorVars` ne joue que pour un slug
 * absent de la liste servie, pas pour un jeton manquant. De même, un slug à
 * motif sans jeton `-fill` s'afficherait uni, sans aucune erreur, et une forme
 * servie sans jeton `--tag-shape-*` découperait un rond.
 */
describe('Palette ↔ jetons CSS', () => {
  const tokens = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'src', 'styles', 'tokens.css'),
    'utf8',
  );
  // Noms déclarés, préfixe ôté : `--tag-blue-stripes-fill:` → `blue-stripes-fill`.
  const declared = new Set([...tokens.matchAll(/--tag-([a-z]+(?:-[a-z]+)*):/g)].map((m) => m[1]));
  // Trois familles sous le même préfixe : les couleurs (`<slug>`, `-soft`,
  // `-fill`), les formes (`shape-<slug>`) et la teinte libre (`hue-*` : clarté,
  // chroma et transparence du fond doux, communs à tous les angles).
  const colorTokens = [...declared].filter((n) => !n.startsWith('shape-') && !n.startsWith('hue-'));
  const shapeTokens = [...declared].filter((n) => n.startsWith('shape-')).map((n) => n.slice(6));
  const slugOf = (name) => name.replace(/-(soft|fill)$/, '');
  // Slug composé = pastille à motif (`couleur-motif`, ou deux couleurs).
  const patterned = TAG_COLORS.filter((color) => color.includes('-'));

  it.each(TAG_COLORS)('« %s » a sa teinte et son fond doux', (color) => {
    expect(declared).toContain(color);
    expect(declared).toContain(`${color}-soft`);
  });

  it.each(patterned)('« %s », à motif, a son jeton -fill', (color) => {
    expect(declared).toContain(`${color}-fill`);
  });

  it('aucun jeton de couleur sans slug servi — il serait inaccessible', () => {
    expect(colorTokens.filter((name) => !TAG_COLORS.includes(slugOf(name)))).toEqual([]);
  });

  it.each(TAG_SHAPES)('la forme « %s » a son clip-path', (shape) => {
    expect(declared).toContain(`shape-${shape}`);
  });

  it('aucun jeton de forme sans slug servi', () => {
    expect(shapeTokens.filter((shape) => !TAG_SHAPES.includes(shape))).toEqual([]);
  });

  it('la teinte libre a sa clarté, son chroma et la transparence de son fond doux', () => {
    expect(declared).toContain('hue-l');
    expect(declared).toContain('hue-c');
    expect(declared).toContain('hue-soft-alpha');
  });
});

/**
 * Troisième côté de la palette : le nom de chaque pastille, que lit un lecteur
 * d'écran. Sans lui, la pastille s'annonce par son slug anglais (« sky »), y
 * compris dans l'interface française. Même règle pour les formes.
 */
describe('Palette ↔ noms des pastilles', () => {
  it.each(['fr', 'en'])('chaque couleur a son nom, et seulement elles (%s)', (lang) => {
    const names = uiTextData[lang].tagsPanel.colorNames;
    expect(Object.keys(names).sort()).toEqual([...TAG_COLORS].sort());
    expect(Object.values(names).every((name) => name.trim().length > 0)).toBe(true);
  });

  it.each(['fr', 'en'])('chaque forme a son nom, et seulement elles (%s)', (lang) => {
    const names = uiTextData[lang].tagsPanel.shapeNames;
    expect(Object.keys(names).sort()).toEqual([...TAG_SHAPES].sort());
    expect(Object.values(names).every((name) => name.trim().length > 0)).toBe(true);
  });

  it.each(['fr', 'en'])('le refus d’une forme a son message (%s)', (lang) => {
    expect(uiTextData[lang].tagsPanel.errors.shape_invalid).toBeTruthy();
  });
});

/** Champs d'appartenance d'un document `resume` de test. */
function ownerish(email) {
  return { email, emailLower: email.toLowerCase() };
}
