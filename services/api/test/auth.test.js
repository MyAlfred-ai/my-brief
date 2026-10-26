import { describe, it, expect } from 'vitest';
import { buildTestApp, userDoc, identityHeaders, createFakeMailer } from './helpers.js';
import { hashPassword } from '../lib/auth/password.js';

const EMAIL = 'user@example.com';
const PASSWORD = 'un-mot-de-passe-solide';

async function seedWithPassword(extra = {}, docExtra = {}) {
  return {
    user: [
      userDoc(EMAIL, {
        passwordHash: await hashPassword(PASSWORD),
        authProviders: ['password'],
        ...docExtra,
      }),
    ],
    ...extra,
  };
}

function postJson(app, url, body, headers = {}) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** Extrait la valeur du cookie de session d'un en-tête Set-Cookie. */
function sessionToken(res) {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw.join(';') : String(raw || '');
  return /mybrief_sess=([^;]*)/.exec(header)?.[1] || '';
}

/** En-têtes d'une requête passée par le routeur natif (cf. middleware Traefik `noident`). */
function nativeHeaders(token, extra = {}) {
  return { cookie: `mybrief_sess=${token}`, 'x-mybrief-auth-path': 'native', ...extra };
}

async function login(app, password = PASSWORD, email = EMAIL) {
  return postJson(app, '/api/auth/login', { email, password });
}

describe('POST /api/auth/login', () => {
  it('pose un cookie de session HttpOnly SameSite=Lax et renvoie l identité', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const res = await login(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ email: EMAIL, role: 'user', authMode: 'password' });
    expect(res.json().user).not.toHaveProperty('passwordHash');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('mybrief_sess=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('la casse de l email est ignorée à la connexion', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const res = await login(app, PASSWORD, 'USER@Example.com');
    expect(res.statusCode).toBe(200);
  });

  it('mot de passe faux et compte inconnu donnent EXACTEMENT la même réponse', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const wrongPassword = await login(app, 'ce-nest-pas-le-bon');
    const unknownAccount = await login(app, PASSWORD, 'inconnu@example.com');
    // Toute différence de code ou de corps permettrait d'énumérer les comptes.
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual({ error: 'invalid_credentials' });
    expect(unknownAccount.json()).toEqual(wrongPassword.json());
  });

  it('un compte désactivé se voit refuser sans révéler qu il existe', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword({}, { disabled: true }) });
    const res = await login(app);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('un compte OIDC sans mot de passe ne peut pas se connecter par mot de passe', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(EMAIL)] } });
    const res = await login(app, 'nimporte-quoi-mais-long');
    expect(res.statusCode).toBe(401);
  });

  it('bloque le bourrinage sur un compte au bout de 5 essais', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const codes = [];
    for (let i = 0; i < 7; i += 1) codes.push((await login(app, 'faux-mot-de-passe')).statusCode);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes.at(-1)).toBe(429);
    const blocked = await login(app, 'faux-mot-de-passe');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('refuse un corps invalide avec le contrat d erreur des nouvelles routes', async () => {
    const { app } = buildTestApp();
    const res = await postJson(app, '/api/auth/login', { email: 'pas-un-email' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
  });

  it('refuse une requête venant d une autre origine', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const res = await postJson(
      app,
      '/api/auth/login',
      { email: EMAIL, password: PASSWORD },
      {
        origin: 'https://attaquant.example',
        host: 'mybrief.example',
      },
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('session native', () => {
  it('le cookie authentifie les routes applicatives', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const token = sessionToken(await login(app));
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: nativeHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: EMAIL, authMode: 'password' });
  });

  it('GET /api/auth/session sans cookie répond 200 {authenticated:false}, jamais 401', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/session' });
    // Un 401 ici déclencherait le gestionnaire d'échec du frontend au tout
    // premier chargement de la page.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: false });
  });

  it('logout détruit la session et purge le cookie', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const token = sessionToken(await login(app));

    const out = await postJson(app, '/api/auth/logout', {}, nativeHeaders(token));
    expect(out.statusCode).toBe(204);
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');

    const after = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: nativeHeaders(token),
    });
    expect(after.json()).toEqual({ authenticated: false });
  });

  it('un cookie mort est purgé pour éviter la boucle de routage', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: nativeHeaders('jeton-invalide'),
    });
    expect(res.statusCode).toBe(401);
    // Sans cette purge, Traefik continuerait d'aiguiller le navigateur vers le
    // routeur natif, qui répondrait 401 indéfiniment.
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
  });

  it('la session d un compte désactivé entre-temps ne vaut plus rien', async () => {
    const { app, db } = buildTestApp({ seed: await seedWithPassword() });
    const token = sessionToken(await login(app));
    db.data.get('user')[0].disabled = true;

    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: nativeHeaders(token),
    });
    expect(res.statusCode).toBe(401);
    expect(db.data.get('authSession')).toHaveLength(0);
  });
});

describe('changement de mot de passe', () => {
  const NEW_PASSWORD = 'un-nouveau-mot-de-passe';

  it('change le mot de passe et invalide les autres sessions', async () => {
    const { app, db } = buildTestApp({ seed: await seedWithPassword() });
    const first = sessionToken(await login(app));
    const second = sessionToken(await login(app));
    expect(db.data.get('authSession')).toHaveLength(2);

    const res = await postJson(
      app,
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      nativeHeaders(second),
    );
    expect(res.statusCode).toBe(204);

    // L'auteur repart avec une session neuve, les autres appareils tombent.
    const reissued = sessionToken(res);
    expect(reissued).toBeTruthy();
    expect(reissued).not.toBe(second);
    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: nativeHeaders(first),
    });
    expect(oldSession.json()).toEqual({ authenticated: false });

    expect((await login(app, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await login(app, PASSWORD)).statusCode).toBe(401);
  });

  it('refuse un mot de passe actuel erroné', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const token = sessionToken(await login(app));
    const res = await postJson(
      app,
      '/api/auth/change-password',
      {
        currentPassword: 'pas-le-bon-du-tout',
        newPassword: NEW_PASSWORD,
      },
      nativeHeaders(token),
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('invalid_current_password');
  });

  it('refuse un nouveau mot de passe hors politique', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const token = sessionToken(await login(app));
    const res = await postJson(
      app,
      '/api/auth/change-password',
      {
        currentPassword: PASSWORD,
        newPassword: 'court',
      },
      nativeHeaders(token),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'weak_password', reason: 'too_short' });
  });
});

describe('verrou mustChangePassword', () => {
  it('n utilise jamais un code que le frontend prendrait pour une perte de session', async () => {
    const { app } = buildTestApp({
      seed: await seedWithPassword({}, { mustChangePassword: true }),
    });
    const token = sessionToken(await login(app));
    for (const url of [
      '/api/history',
      '/api/templates',
      '/api/user-config',
      '/api/user-templates',
    ]) {
      const res = await app.inject({ method: 'GET', url, headers: nativeHeaders(token) });
      expect([401, 403]).not.toContain(res.statusCode);
      expect(res.statusCode).toBe(428);
    }
  });

  it('bloque les routes applicatives mais laisse passer le changement de mot de passe', async () => {
    const { app } = buildTestApp({
      seed: await seedWithPassword({}, { mustChangePassword: true }),
    });
    const token = sessionToken(await login(app));

    // 428 et non 401/403 : ces deux codes signifient « session perdue » pour
    // l'intercepteur fetch du frontend, qui déconnecterait l'utilisateur au
    // lieu de lui ouvrir la modale de changement de mot de passe.
    const blocked = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: nativeHeaders(token),
    });
    expect(blocked.statusCode).toBe(428);
    expect(blocked.json()).toEqual({ error: 'password_change_required' });

    // Sinon le verrou serait indéboulonnable.
    const allowed = await postJson(
      app,
      '/api/auth/change-password',
      {
        currentPassword: PASSWORD,
        newPassword: 'mon-nouveau-mot-de-passe',
      },
      nativeHeaders(token),
    );
    expect(allowed.statusCode).toBe(204);
  });

  it('/api/ping et /api/init restent joignables', async () => {
    const { app } = buildTestApp({
      seed: await seedWithPassword({}, { mustChangePassword: true }),
    });
    const token = sessionToken(await login(app));
    expect(
      (await app.inject({ method: 'GET', url: '/api/ping', headers: nativeHeaders(token) }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/init', headers: nativeHeaders(token) }))
        .statusCode,
    ).toBe(200);
  });
});

describe('GET /api/auth/config', () => {
  it('annonce la réinitialisation désactivée quand aucun SMTP n est configuré', async () => {
    const { app } = buildTestApp({ mailer: createFakeMailer({ enabled: false }) });
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ passwordResetEnabled: false });
    expect(res.json().passwordPolicy.minLength).toBeGreaterThanOrEqual(8);
  });

  it('annonce la réinitialisation disponible quand un SMTP est configuré', async () => {
    const { app } = buildTestApp();
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/config' })).json().passwordResetEnabled,
    ).toBe(true);
  });
});

describe('mot de passe oublié', () => {
  it('répond 501 quand aucun SMTP n est configuré, sans planter', async () => {
    const { app } = buildTestApp({
      seed: await seedWithPassword(),
      mailer: createFakeMailer({ enabled: false }),
    });
    const res = await postJson(app, '/api/auth/forgot-password', { email: EMAIL });
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('password_reset_disabled');
  });

  it('répond 202 pour un compte inconnu comme pour un compte réel', async () => {
    const { app, mailer } = buildTestApp({ seed: await seedWithPassword() });
    const known = await postJson(app, '/api/auth/forgot-password', { email: EMAIL });
    const unknown = await postJson(app, '/api/auth/forgot-password', {
      email: 'personne@example.com',
    });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());
    // Un seul mail parti : celui du compte qui existe.
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe(EMAIL);
    expect(mailer.sent[0].link).toContain('/signin?reset=');
  });

  it('le lien de réinitialisation ne sert qu une fois', async () => {
    const { app, mailer } = buildTestApp({ seed: await seedWithPassword() });
    await postJson(app, '/api/auth/forgot-password', { email: EMAIL });
    const token = new URL(mailer.sent[0].link, 'https://x.test').searchParams.get('reset');

    const first = await postJson(app, '/api/auth/reset-password', {
      token,
      password: 'mot-de-passe-tout-neuf',
    });
    expect(first.statusCode).toBe(200);
    const second = await postJson(app, '/api/auth/reset-password', {
      token,
      password: 'encore-un-autre-mdp',
    });
    expect(second.statusCode).toBe(410);
    expect(second.json().error).toBe('invalid_or_expired_token');

    expect((await login(app, 'mot-de-passe-tout-neuf')).statusCode).toBe(200);
  });

  it('la réinitialisation révoque les sessions ouvertes', async () => {
    const { app, db, mailer } = buildTestApp({ seed: await seedWithPassword() });
    const token = sessionToken(await login(app));
    await postJson(app, '/api/auth/forgot-password', { email: EMAIL });
    const resetToken = new URL(mailer.sent[0].link, 'https://x.test').searchParams.get('reset');
    await postJson(app, '/api/auth/reset-password', {
      token: resetToken,
      password: 'mot-de-passe-tout-neuf',
    });

    expect(db.data.get('authSession')).toHaveLength(0);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: nativeHeaders(token),
    });
    expect(res.json()).toEqual({ authenticated: false });
  });

  it('refuse un jeton inventé', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const res = await postJson(app, '/api/auth/reset-password', {
      token: 'jeton-completement-invente',
      password: 'mot-de-passe-tout-neuf',
    });
    expect(res.statusCode).toBe(410);
  });
});

describe('cohabitation avec le chemin OIDC', () => {
  it('les en-têtes Traefik authentifient toujours quand il n y a pas de session native', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: identityHeaders('oidc@client.fr'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: 'oidc@client.fr', authMode: 'oidc' });
  });

  it('la session native l emporte sur les en-têtes quand les deux sont présents', async () => {
    const { app } = buildTestApp({ seed: await seedWithPassword() });
    const token = sessionToken(await login(app));
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: { ...identityHeaders('quelqun-dautre@client.fr'), cookie: `mybrief_sess=${token}` },
    });
    expect(res.json().email).toBe(EMAIL);
  });
});
