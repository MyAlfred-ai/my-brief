/**
 * Vocabulaire et contexte de l'organisation — réglé dans l'onglet Configuration
 * de l'administration, joint à chaque génération de résumé.
 *
 * Quatre garanties : écriture réservée aux administrateurs ; le texte descend
 * AVEC les templates (le navigateur assemble le prompt de résumé, il lui faut
 * les deux) ; il ne passe JAMAIS par la sonde publique /api/auth/config ; et
 * une installation qui l'avait rempli du temps où il vivait dans les réglages
 * de détection ne le perd pas au déploiement.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, createFakeDb, identityHeaders, userDoc } from './helpers.js';
import { bootstrap } from '../lib/bootstrap.js';
import { toPublicOrgContextSettings } from '../lib/repositories/settings.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const CONTEXT = 'Nous fabriquons des pompes hydrauliques. « ADV » = administration des ventes.';

const SILENT = { info() {}, warn() {}, error() {} };
const bootConfig = {
  adminSeed: { enabled: false, email: '', password: '' },
  legacyAdminDomain: '',
  adminEmails: [],
  adminEmailDomains: [],
};

const seed = () => ({ user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)] });

const get = (app, url, email = ADMIN) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

const post = (app, url, body, email = ADMIN) =>
  app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('projection', () => {
  it("ne divulgue pas l'email de l'administrateur sans withMeta", () => {
    const doc = { context: CONTEXT, updatedBy: ADMIN };
    expect(JSON.stringify(toPublicOrgContextSettings(doc))).not.toContain(ADMIN);
    expect(toPublicOrgContextSettings(doc, { withMeta: true }).updatedBy).toBe(ADMIN);
  });

  it('borne le texte à la lecture, même écrit hors schéma', () => {
    const doc = { context: 'x'.repeat(5000) };
    expect(toPublicOrgContextSettings(doc).context).toHaveLength(2000);
  });
});

describe('/api/admin/settings/org-context', () => {
  it("refuse l'écriture à un compte non administrateur", async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/org-context', { context: CONTEXT }, USER);
    expect(res.statusCode).toBe(403);
  });

  it('rend un texte vide tant que rien n’est saisi', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app, '/api/admin/settings/org-context');
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({ context: '' });
  });

  it('enregistre, nettoie les espaces et trace son auteur', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/org-context', {
      context: `  ${CONTEXT}  `,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({ context: CONTEXT, updatedBy: ADMIN });
  });

  it('refuse un texte au-delà du plafond plutôt que de le rogner en silence', async () => {
    // Le schéma protège la saisie ; la lecture (`toPublicOrgContextSettings`)
    // protège d'un document écrit autrement. Deux barrières, deux rôles.
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/org-context', { context: 'y'.repeat(3000) });
    expect(res.statusCode).toBe(400);
    expect((await get(app, '/api/admin/settings/org-context')).json().settings.context).toBe('');
  });

  it('un texte vide efface le contexte — retour au comportement d’origine', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/org-context', { context: CONTEXT });
    await post(app, '/api/admin/settings/org-context', { context: '' });
    expect((await get(app, '/api/admin/settings/org-context')).json().settings.context).toBe('');
  });
});

describe('GET /api/templates', () => {
  it('joint le contexte aux templates : un seul appel, un seul moment d’échec', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/org-context', { context: CONTEXT });

    const res = await get(app, '/api/templates', USER);
    expect(res.statusCode).toBe(200);
    expect(res.json().orgContext).toBe(CONTEXT);
  });

  it("ne divulgue pas l'auteur du réglage", async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/org-context', { context: CONTEXT });
    expect((await get(app, '/api/templates', USER)).payload).not.toContain(ADMIN);
  });
});

describe('sonde publique /api/auth/config', () => {
  it("ne transporte JAMAIS le vocabulaire de l'organisation", async () => {
    // Cette route répond AVANT toute identité : elle dit ce que le serveur sait
    // faire, pas ce que l'organisation raconte à ses clients.
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/org-context', { context: CONTEXT });

    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain('hydrauliques');
    expect(res.json().orgContext).toBeUndefined();
  });
});

describe('bootstrap — reprise du contexte métier', () => {
  it('reprend le texte laissé dans les réglages de détection', async () => {
    const db = createFakeDb({
      user: [userDoc(ADMIN, { role: 'admin' })],
      appSettings: [{ key: 'actionDetection', businessContext: CONTEXT, updatedBy: ADMIN }],
    });
    await bootstrap(db, bootConfig, SILENT, {});

    const doc = db.data.get('appSettings').find((d) => d.key === 'orgContext');
    expect(doc).toMatchObject({ context: CONTEXT, updatedBy: ADMIN });
  });

  it('ne réécrit pas un contexte déjà réglé, même vidé exprès', async () => {
    const db = createFakeDb({
      appSettings: [
        { key: 'actionDetection', businessContext: CONTEXT },
        { key: 'orgContext', context: '' },
      ],
    });
    await bootstrap(db, bootConfig, SILENT, {});

    const doc = db.data.get('appSettings').find((d) => d.key === 'orgContext');
    expect(doc.context).toBe('');
  });

  it('ne crée rien quand il n’y a rien à reprendre', async () => {
    const db = createFakeDb({ appSettings: [{ key: 'actionDetection', businessContext: '  ' }] });
    await bootstrap(db, bootConfig, SILENT, {});

    expect(db.data.get('appSettings').find((d) => d.key === 'orgContext')).toBeUndefined();
  });
});
