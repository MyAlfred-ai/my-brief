/**
 * Apparence de l'installation (logo, phrase d'accueil, couleurs primaire et
 * secondaire).
 *
 * Trois garanties : réservé aux administrateurs à l'écriture, servi à tout le
 * monde par la sonde publique /api/auth/config (l'écran de connexion porte le
 * logo et la couleur), et `updatedBy` — un email d'administrateur — ne sort
 * QUE par la route d'administration.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import { toPublicBrandingSettings } from '../lib/repositories/settings.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

const seed = () => ({ user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)] });

function post(app, url, body, email = ADMIN) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('projection publique', () => {
  it("ne divulgue pas l'email de l'administrateur sans withMeta", () => {
    const doc = { logo: LOGO, tagline: 'Bonjour', primaryColor: '#123abc', updatedBy: ADMIN };
    expect(JSON.stringify(toPublicBrandingSettings(doc))).not.toContain(ADMIN);
    expect(toPublicBrandingSettings(doc, { withMeta: true }).updatedBy).toBe(ADMIN);
  });
});

describe('GET /api/admin/settings/branding', () => {
  it('exige le rôle admin', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/branding',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rend les valeurs vides tant que rien n’est personnalisé', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/branding',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings).toMatchObject({
      logo: '',
      tagline: '',
      primaryColor: '',
      secondaryColor: '',
    });
  });
});

describe('POST /api/admin/settings/branding', () => {
  it('enregistre et normalise les deux couleurs en minuscules', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/branding', {
      logo: LOGO,
      tagline: 'Votre assistant de réunion',
      primaryColor: '#12ABEF',
      secondaryColor: '#AB12EF',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({
      logo: LOGO,
      tagline: 'Votre assistant de réunion',
      primaryColor: '#12abef',
      secondaryColor: '#ab12ef',
      updatedBy: ADMIN,
    });
    const doc = db.data.get('appSettings').find((d) => d.key === 'branding');
    expect(doc.primaryColor).toBe('#12abef');
    expect(doc.secondaryColor).toBe('#ab12ef');
  });

  it('refuse une couleur qui n’est pas un #rrggbb — primaire comme secondaire', async () => {
    const { app } = buildTestApp({ seed: seed() });
    expect(
      (await post(app, '/api/admin/settings/branding', { primaryColor: 'orange' })).statusCode,
    ).toBe(400);
    expect(
      (await post(app, '/api/admin/settings/branding', { secondaryColor: 'orange clair' }))
        .statusCode,
    ).toBe(400);
  });

  it('les deux couleurs sont indépendantes : régler l’une ne touche pas l’autre', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/branding', {
      primaryColor: '#123abc',
      secondaryColor: '#abc123',
    });
    await post(app, '/api/admin/settings/branding', { secondaryColor: '' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/branding',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings).toMatchObject({ primaryColor: '#123abc', secondaryColor: '' });
  });

  it('refuse un logo qui n’est pas une data-URL image', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/branding', {
      logo: 'https://exemple.fr/logo.png',
    });
    expect(res.statusCode).toBe(400);
  });

  it('champ absent = inchangé, champ vide = retour à la valeur intégrée', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/branding', {
      logo: LOGO,
      tagline: 'Bonjour',
      primaryColor: '#123abc',
    });
    // Ne touche que la couleur : le logo et la phrase restent.
    await post(app, '/api/admin/settings/branding', { primaryColor: '' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/branding',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings).toMatchObject({
      logo: LOGO,
      tagline: 'Bonjour',
      primaryColor: '',
    });
  });

  it('phrase anglaise : bornée comme la française, et indépendante d’elle', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/branding', {
      tagline: 'Assistant de réunion',
      taglineEn: '  Meeting assistant  ',
    });
    // Ne touche que la phrase anglaise : la française reste.
    await post(app, '/api/admin/settings/branding', { taglineEn: '' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/branding',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings).toMatchObject({ tagline: 'Assistant de réunion', taglineEn: '' });
    const tooLong = await post(app, '/api/admin/settings/branding', { taglineEn: 'x'.repeat(121) });
    expect(tooLong.statusCode).toBe(400);
  });

  it('refuse l’écriture à un compte non admin', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/branding', { tagline: 'X' }, USER);
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /api/auth/config', () => {
  it('sert l’apparence à tout le monde, sans l’email de l’administrateur', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/branding', {
      logo: LOGO,
      tagline: 'Bonjour',
      taglineEn: 'Hello',
      primaryColor: '#123abc',
      secondaryColor: '#abc123',
    });
    // Sonde publique : aucune identité.
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().branding).toEqual({
      logo: LOGO,
      tagline: 'Bonjour',
      taglineEn: 'Hello',
      primaryColor: '#123abc',
      secondaryColor: '#abc123',
    });
    expect(res.payload).not.toContain(ADMIN);
  });
});
