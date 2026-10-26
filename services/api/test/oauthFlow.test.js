/**
 * Contrôle anti-CSRF des flux OAuth (lib/auth/oauthFlow.js).
 *
 * Ce contrôle existait en deux copies (login et connexion Gmail). Une copie
 * peut être corrigée seule ; ces tests portent maintenant sur l'unique
 * implémentation, et décrivent l'attaque que chaque branche empêche.
 *
 * L'attaque de référence — le « login CSRF » : l'attaquant démarre un flux
 * chez l'IdP, récupère SON code d'autorisation, et amène la victime sur le
 * callback avec ce code. Sans le cookie d'état (qui n'existe que dans le
 * navigateur ayant DÉMARRÉ le flux), la victime se retrouverait connectée sur
 * le compte de l'attaquant — et lui livrerait ses réunions suivantes.
 *
 * S'y ajoute la lecture du profil : ce que l'id_token a le droit de compléter
 * dans la réponse `userinfo`, et ce qu'il n'a jamais le droit d'y changer.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeDb } from './helpers.js';
import { createOAuthStateStore } from '../lib/auth/oauthState.js';
import {
  createStateCookie,
  consumeState,
  startOAuth,
  mergeIdentityClaims,
} from '../lib/auth/oauthFlow.js';
import { readIdTokenClaims } from '../lib/auth/oidcClient.js';

const COOKIE = 'mybrief_oauth_test';

/** Reply minimale : seuls les en-têtes comptent ici. */
function fakeReply() {
  const headers = new Map();
  return {
    headers,
    getHeader: (name) => headers.get(name),
    header(name, value) {
      headers.set(name, value);
      return this;
    },
    /** Valeurs des Set-Cookie émis, dans l'ordre. */
    cookies() {
      const raw = headers.get('set-cookie');
      return raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    },
  };
}

const fakeReq = (cookieValue) => ({
  ip: '10.0.0.1',
  headers: cookieValue === undefined ? {} : { cookie: `${COOKIE}=${cookieValue}` },
});

let app;
let cookie;

beforeEach(() => {
  const db = createFakeDb();
  app = {
    config: { cookieSecure: true },
    oauthStates: createOAuthStateStore(db),
  };
  cookie = createStateCookie(app, COOKIE);
});

/** Démarre un flux et renvoie le `state` réellement émis. */
async function issue(flow = 'google') {
  const reply = fakeReply();
  await startOAuth(app, fakeReq(), reply, {
    cookie,
    flow,
    clientId: 'client-id',
    redirectUri: 'https://mybrief.test/oauth2/callback',
    endpoints: { authorization_endpoint: 'https://idp.test/auth' },
    scopes: 'openid email',
  });
  return /mybrief_oauth_test=([^;]+)/.exec(reply.cookies()[0])[1];
}

describe('consumeState', () => {
  it('accepte le retour nominal : URL == cookie == base', async () => {
    const state = await issue();
    const result = await consumeState(app, fakeReq(state), fakeReply(), {
      cookie,
      flow: 'google',
      state,
      code: 'code-idp',
    });
    expect(result.ok).toBe(true);
    expect(result.pending.redirectUri).toBe('https://mybrief.test/oauth2/callback');
    expect(result.pending.codeVerifier).toBeTruthy();
  });

  it('refuse un state valide présenté SANS le cookie (login CSRF)', async () => {
    // Le state est authentique — il a bien été émis, il est bien en base. Seul
    // le cookie manque : ce n'est pas ce navigateur qui a démarré le flux.
    const state = await issue();
    const result = await consumeState(app, fakeReq(undefined), fakeReply(), {
      cookie,
      flow: 'google',
      state,
      code: 'code-de-l-attaquant',
    });
    expect(result.ok).toBe(false);
  });

  it('refuse un cookie qui ne correspond pas au state de l URL', async () => {
    const state = await issue();
    const result = await consumeState(app, fakeReq('un-autre-state'), fakeReply(), {
      cookie,
      flow: 'google',
      state,
      code: 'code-idp',
    });
    expect(result.ok).toBe(false);
  });

  it('refuse un state jamais émis, même cohérent avec son cookie', async () => {
    const result = await consumeState(app, fakeReq('inventé'), fakeReply(), {
      cookie,
      flow: 'google',
      state: 'inventé',
      code: 'code-idp',
    });
    expect(result.ok).toBe(false);
  });

  it('refuse un retour sans code d autorisation', async () => {
    const state = await issue();
    const result = await consumeState(app, fakeReq(state), fakeReply(), {
      cookie,
      flow: 'google',
      state,
      code: undefined,
    });
    expect(result.ok).toBe(false);
  });

  it('refuse un state émis pour un AUTRE flux', async () => {
    // Un code obtenu sur le flux de connexion ne doit pas pouvoir être échangé
    // sur le flux d'autorisation Gmail, et réciproquement : les deux n'ont ni
    // les mêmes scopes ni les mêmes conséquences.
    const state = await issue('google');
    const result = await consumeState(app, fakeReq(state), fakeReply(), {
      cookie,
      flow: 'google-mail',
      state,
      code: 'code-idp',
    });
    expect(result.ok).toBe(false);
  });

  it('refuse le rejeu d un state déjà consommé', async () => {
    const state = await issue();
    const args = { cookie, flow: 'google', state, code: 'code-idp' };
    expect((await consumeState(app, fakeReq(state), fakeReply(), args)).ok).toBe(true);
    expect((await consumeState(app, fakeReq(state), fakeReply(), args)).ok).toBe(false);
  });

  it('purge le cookie d état même quand le contrôle échoue', async () => {
    const reply = fakeReply();
    await consumeState(app, fakeReq('quelconque'), reply, {
      cookie,
      flow: 'google',
      state: 'autre',
      code: 'x',
    });
    // Max-Age=0 : un state grillé ne doit pas rester en vol dans le navigateur.
    expect(reply.cookies()[0]).toContain(`${COOKIE}=;`);
    expect(reply.cookies()[0]).toContain('Max-Age=0');
  });
});

describe('startOAuth', () => {
  it('garde le code_verifier PKCE hors du navigateur', async () => {
    const reply = fakeReply();
    const url = await startOAuth(app, fakeReq(), reply, {
      cookie,
      flow: 'google',
      clientId: 'client-id',
      redirectUri: 'https://mybrief.test/oauth2/callback',
      endpoints: { authorization_endpoint: 'https://idp.test/auth' },
      scopes: 'openid email',
    });
    const state = /mybrief_oauth_test=([^;]+)/.exec(reply.cookies()[0])[1];
    const consumed = await app.oauthStates.consume(state);

    // Le challenge part chez l'IdP, le verifier reste en base : intercepter la
    // redirection ne permet pas de rejouer l'échange du code.
    expect(url).toContain('code_challenge=');
    expect(url).not.toContain(consumed.codeVerifier);
    expect(consumed.codeVerifier).toBeTruthy();
  });

  it('ajoute les paramètres propres au flux (refresh token Gmail)', async () => {
    const url = await startOAuth(app, fakeReq(), fakeReply(), {
      cookie,
      flow: 'google-mail',
      clientId: 'client-id',
      redirectUri: 'https://mybrief.test/api/mail/google/callback',
      endpoints: { authorization_endpoint: 'https://idp.test/auth' },
      scopes: 'openid email https://www.googleapis.com/auth/gmail.send',
      extraParams: { access_type: 'offline', prompt: 'consent' },
    });
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
  });

  it('pose un cookie d état HttpOnly, SameSite=Lax et Secure', async () => {
    const reply = fakeReply();
    await issue();
    await startOAuth(app, fakeReq(), reply, {
      cookie,
      flow: 'google',
      clientId: 'client-id',
      redirectUri: 'https://mybrief.test/oauth2/callback',
      endpoints: { authorization_endpoint: 'https://idp.test/auth' },
      scopes: 'openid email',
    });
    const raw = reply.cookies()[0];
    expect(raw).toContain('HttpOnly');
    // Lax et NON Strict : le retour de l'IdP est une navigation GET cross-site,
    // qu'un cookie Strict n'accompagnerait pas.
    expect(raw).toContain('SameSite=Lax');
    expect(raw).toContain('Secure');
  });
});

/** id_token tel que le rend un token endpoint — non signé, c'est sans effet ici. */
const jwt = (claims) =>
  [{ alg: 'none' }, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .concat('')
    .join('.');

describe('readIdTokenClaims', () => {
  it('lit les claims d un jeton émis pour cette application', () => {
    const claims = { aud: 'client-id', sub: 'oid-1', preferred_username: 'jean@client.fr' };
    expect(readIdTokenClaims(jwt(claims), 'client-id')).toEqual(claims);
    // `aud` peut être une liste.
    expect(
      readIdTokenClaims(jwt({ ...claims, aud: ['autre', 'client-id'] }), 'client-id').sub,
    ).toBe('oid-1');
  });

  it('ne rend rien d un jeton destiné à une autre application', () => {
    expect(readIdTokenClaims(jwt({ aud: 'autre', sub: 'oid-1' }), 'client-id')).toEqual({});
    expect(readIdTokenClaims(jwt({ sub: 'oid-1' }), 'client-id')).toEqual({});
  });

  it('ne lève jamais sur un jeton absent ou illisible', () => {
    expect(readIdTokenClaims(undefined, 'client-id')).toEqual({});
    expect(readIdTokenClaims('pas.un.jwt', 'client-id')).toEqual({});
    expect(readIdTokenClaims('a.b', 'client-id')).toEqual({});
    // Jeton chiffré (JWE, cinq segments) : rien de lisible sans la clé.
    expect(readIdTokenClaims('a.b.c.d.e', 'client-id')).toEqual({});
    expect(readIdTokenClaims(jwt(['tableau']), 'client-id')).toEqual({});
    expect(readIdTokenClaims(jwt({ aud: 'client-id' }), '')).toEqual({});
  });
});

describe('mergeIdentityClaims', () => {
  it('complète userinfo par l identifiant de connexion de l id_token', () => {
    // Le cas Entra : `userinfo` ne porte jamais preferred_username ni upn.
    const merged = mergeIdentityClaims(
      { sub: 'oid-1', name: 'Jean' },
      { sub: 'oid-1', preferred_username: 'jean@client.fr', upn: 'jean@client.fr', name: 'J.' },
    );
    expect(merged).toEqual({
      sub: 'oid-1',
      name: 'Jean',
      preferred_username: 'jean@client.fr',
      upn: 'jean@client.fr',
    });
  });

  it('n emprunte jamais l adresse ni son attestation', () => {
    const merged = mergeIdentityClaims(
      { sub: 'u-1', email: 'a@client.fr', email_verified: false },
      { sub: 'u-1', email: 'b@client.fr', email_verified: true },
    );
    expect(merged).toEqual({ sub: 'u-1', email: 'a@client.fr', email_verified: false });
    expect(mergeIdentityClaims({ sub: 'u-1' }, { sub: 'u-1', email: 'b@client.fr' })).toEqual({
      sub: 'u-1',
    });
  });

  it('ne mélange pas deux personnes', () => {
    const userinfo = { sub: 'oid-1' };
    expect(
      mergeIdentityClaims(userinfo, { sub: 'oid-2', preferred_username: 'autre@client.fr' }),
    ).toEqual({ sub: 'oid-1' });
    // Sans sujet, l'id_token ne prouve rien.
    expect(mergeIdentityClaims(userinfo, { preferred_username: 'x@client.fr' })).toEqual(userinfo);
    expect(mergeIdentityClaims(userinfo, {})).toEqual(userinfo);
  });
});
