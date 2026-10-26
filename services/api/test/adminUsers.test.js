import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import { hashPassword, verifyPassword } from '../lib/auth/password.js';

const ADMIN = 'patron@client.fr';
const OTHER_ADMIN = 'copilote@client.fr';
const USER = 'simple@client.fr';

const baseSeed = () => ({ user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)] });

function asAdmin(app, url, body, email = ADMIN) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/users', () => {
  it('ne renvoie jamais le hash du mot de passe', async () => {
    const seed = baseSeed();
    seed.user[1].passwordHash = 'scrypt$secret';
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: identityHeaders(ADMIN),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toContain('scrypt$');
    expect(res.json().users.find((u) => u.email === USER).hasPassword).toBe(true);
  });

  it('filtre sur la recherche', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users?q=simple',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().total).toBe(1);
    expect(res.json().users[0].email).toBe(USER);
  });
});

describe('POST /api/admin/users/create', () => {
  it('crée un compte avec un mot de passe généré, renvoyé une seule fois', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/create', {
      email: 'Nouveau@Client.fr',
      name: 'Nouveau',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({
      email: 'Nouveau@Client.fr',
      role: 'user',
      hasPassword: true,
    });
    expect(res.json().generatedPassword).toBeTruthy();

    const created = db.data.get('user').find((u) => u.emailLower === 'nouveau@client.fr');
    // L'email est stocké BRUT (clé métier des réunions), emailLower ne sert
    // qu'à la recherche et à l'unicité.
    expect(created.email).toBe('Nouveau@Client.fr');
    expect(created.mustChangePassword).toBe(true);
    expect(await verifyPassword(res.json().generatedPassword, created.passwordHash)).toBe(true);
  });

  it('accepte un mot de passe fourni et ne le renvoie pas', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/create', {
      email: 'choisi@client.fr',
      password: 'saisi-par-administrateur',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).not.toHaveProperty('generatedPassword');
  });

  it('refuse un doublon', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/create', { email: 'SIMPLE@client.fr' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('email_taken');
  });

  it('refuse un mot de passe hors politique', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/create', {
      email: 'x@client.fr',
      password: 'court',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'weak_password', reason: 'too_short' });
  });
});

describe('POST /api/admin/users/update', () => {
  it('promeut un utilisateur et révoque ses sessions', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    await app.sessions.create(USER);
    const res = await asAdmin(app, '/api/admin/users/update', { email: USER, role: 'admin' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('admin');
    // Un changement de droits ne doit pas attendre la prochaine reconnexion.
    expect(db.data.get('authSession')).toHaveLength(0);
  });

  it('renomme sans toucher au rôle', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/update', {
      email: USER,
      name: 'Simple Utilisateur',
    });
    expect(res.json().user).toMatchObject({ name: 'Simple Utilisateur', role: 'user' });
  });

  it('refuse de rétrograder le dernier administrateur', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/update', { email: ADMIN, role: 'user' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('last_admin');
  });

  it('refuse de désactiver le dernier administrateur', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/update', { email: ADMIN, disabled: true });
    expect(res.statusCode).toBe(409);
  });

  it('accepte de rétrograder un admin s il en reste un autre', async () => {
    const seed = baseSeed();
    seed.user.push(userDoc(OTHER_ADMIN, { role: 'admin' }));
    const { app } = buildTestApp({ seed });
    expect(
      (await asAdmin(app, '/api/admin/users/update', { email: OTHER_ADMIN, role: 'user' }))
        .statusCode,
    ).toBe(200);
  });

  it('un admin ne peut pas se désactiver lui-même', async () => {
    const seed = baseSeed();
    seed.user.push(userDoc(OTHER_ADMIN, { role: 'admin' }));
    const { app } = buildTestApp({ seed });
    const res = await asAdmin(app, '/api/admin/users/update', { email: ADMIN, disabled: true });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('self_target');
  });

  it('404 sur un compte inexistant', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/update', {
      email: 'fantome@client.fr',
      name: 'x',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/admin/users/reset-password', () => {
  it('réinitialise, force le changement et révoque les sessions de la cible', async () => {
    const seed = baseSeed();
    seed.user[1].passwordHash = await hashPassword('ancien-mot-de-passe');
    const { app, db } = buildTestApp({ seed });
    await app.sessions.create(USER);
    await app.resetTokens.issue({ emailLower: USER });

    const res = await asAdmin(app, '/api/admin/users/reset-password', { email: USER });
    expect(res.statusCode).toBe(200);
    expect(res.json().generatedPassword).toBeTruthy();
    expect(res.json().user.mustChangePassword).toBe(true);
    expect(db.data.get('authSession')).toHaveLength(0);
    // Les liens de réinitialisation en vol tombent aussi.
    expect(db.data.get('authResetToken')).toHaveLength(0);

    const doc = db.data.get('user').find((u) => u.emailLower === USER);
    expect(await verifyPassword(res.json().generatedPassword, doc.passwordHash)).toBe(true);
  });

  it('donne un mot de passe à un compte OIDC qui n en avait pas', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/reset-password', { email: USER });
    expect(res.statusCode).toBe(200);
    const doc = db.data.get('user').find((u) => u.emailLower === USER);
    expect(doc.authProviders).toContain('password');
  });
});

describe('POST /api/admin/users/delete', () => {
  it('supprime le compte sans toucher aux données quand purgeData est absent', async () => {
    const seed = baseSeed();
    seed.resume = [{ meetingId: 'm1', email: USER }];
    const { app, db } = buildTestApp({ seed });
    const res = await asAdmin(app, '/api/admin/users/delete', { email: USER });
    expect(res.statusCode).toBe(204);
    expect(db.data.get('user').map((u) => u.emailLower)).toEqual([ADMIN]);
    expect(db.data.get('resume')).toHaveLength(1);
  });

  it('purge les données métier quand purgeData est demandé', async () => {
    const seed = baseSeed();
    seed.resume = [
      { meetingId: 'm1', email: USER },
      { meetingId: 'm2', email: ADMIN },
    ];
    seed.userTemplates = [{ email: USER, value: 'perso' }];
    seed.userConfig = [{ email: USER, context: 'mon contexte' }];
    seed.userTags = [
      { email: USER, id: 't-1', label: 'Client Dupont' },
      { email: ADMIN, id: 't-2', label: 'À moi' },
    ];
    seed.infographics = [
      { email: USER, emailLower: USER, meetingId: 'm1', image: 'aGVsbG8=' },
      { email: ADMIN, emailLower: ADMIN, meetingId: 'm2', image: 'aGVsbG8=' },
    ];
    const { app, db } = buildTestApp({ seed });

    const res = await asAdmin(app, '/api/admin/users/delete', { email: USER, purgeData: true });
    expect(res.statusCode).toBe(204);
    expect(db.data.get('resume').map((r) => r.email)).toEqual([ADMIN]);
    expect(db.data.get('userTemplates')).toHaveLength(0);
    expect(db.data.get('userConfig')).toHaveLength(0);
    // Toute collection par utilisateur doit figurer dans OWNED_COLLECTIONS :
    // l'oublier laisse des données derrière une purge annoncée complète.
    expect(db.data.get('userTags').map((t) => t.id)).toEqual(['t-2']);
    // L'image d'une réunion dit ce qui s'y est dit : elle part avec le compte.
    expect(db.data.get('infographics').map((i) => i.meetingId)).toEqual(['m2']);
  });

  it('révoque et supprime la connexion au compte externe même SANS purgeData', async () => {
    // Un refresh token est un accès vivant au compte Google de l'utilisateur,
    // pas une donnée métier : il part avec le compte, comme les sessions et les
    // jetons de réinitialisation. L'y laisser survivre à la suppression donnait
    // à myBrief un accès permanent à une boîte dont plus personne ne répond.
    const seed = baseSeed();
    seed.userConnections = [
      { emailLower: USER, provider: 'google', account: 'perso@gmail.com', refreshToken: 'rt-vif' },
    ];
    const { app, db, gmailRevoke } = buildTestApp({ seed });

    const res = await asAdmin(app, '/api/admin/users/delete', { email: USER });
    expect(res.statusCode).toBe(204);
    expect(gmailRevoke.calls).toHaveLength(1);
    expect(gmailRevoke.calls[0].refreshToken).toBe('rt-vif');
    expect(db.data.get('userConnections')).toHaveLength(0);
  });

  it('purge aussi les documents dont la casse de l email diffère du compte', async () => {
    // Le cas réel : le compte est enregistré en minuscules, mais les réunions
    // ont été écrites avec l'email tel que l'annuaire le renvoie
    // (`Prenom.Nom@societe.fr`). Un filtre en égalité exacte laisserait ces
    // documents derrière lui — purge annoncée complète, mais partielle.
    // Même compte que USER, à la casse près — c'est tout l'objet du test.
    const mixed = 'Simple@Client.FR';
    const seed = baseSeed();
    seed.resume = [{ meetingId: 'm1', email: mixed }];
    seed.userTemplates = [{ email: mixed, value: 'perso' }];
    seed.userConfig = [{ email: mixed, context: 'mon contexte' }];
    const { app, db } = buildTestApp({ seed });

    const res = await asAdmin(app, '/api/admin/users/delete', { email: USER, purgeData: true });
    expect(res.statusCode).toBe(204);
    expect(db.data.get('resume')).toHaveLength(0);
    expect(db.data.get('userTemplates')).toHaveLength(0);
    expect(db.data.get('userConfig')).toHaveLength(0);
  });

  it('refuse de supprimer le dernier administrateur', async () => {
    const seed = baseSeed();
    seed.user.push(userDoc(OTHER_ADMIN, { role: 'admin' }));
    const { app } = buildTestApp({ seed });
    // Le compte courant est bloqué par self_target ; on cible l'autre admin
    // après avoir rétrogradé celui qui agit pour ne laisser qu'un seul admin.
    await asAdmin(app, '/api/admin/users/update', { email: ADMIN, role: 'user' }, OTHER_ADMIN);
    const res = await asAdmin(app, '/api/admin/users/delete', { email: OTHER_ADMIN }, OTHER_ADMIN);
    expect(res.statusCode).toBe(409);
  });

  it('un admin ne peut pas se supprimer lui-même', async () => {
    const seed = baseSeed();
    seed.user.push(userDoc(OTHER_ADMIN, { role: 'admin' }));
    const { app } = buildTestApp({ seed });
    const res = await asAdmin(app, '/api/admin/users/delete', { email: ADMIN });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('self_target');
  });
});
