/**
 * mybrief-mobile-auth — sidecar d'authentification pour l'app mobile Capacitor.
 *
 * Pourquoi : l'auth MyBrief est un cookie de session posé par le plugin Traefik
 * traefikoidc, et Google interdit OAuth dans les WebViews embarquées. L'app
 * native fait donc son login dans le NAVIGATEUR SYSTÈME sur le flux OIDC web
 * existant, puis ce service convertit la session obtenue en jeton Bearer que
 * la WebView peut utiliser.
 *
 * Flux :
 *   1. L'app ouvre https://<domaine>/auth/mobile/start?cc=<sha256(verifier)>
 *      dans le navigateur système. Deux façons d'y connaître l'utilisateur,
 *      choisies par MOBILE_AUTH_IDENTITY — jamais devinées :
 *        - `headers` (défaut, historique) : la route est DERRIÈRE le middleware
 *          oidc, le plugin authentifie et injecte x-auth-request-user /
 *          x-user-email / x-user-name / x-user-picture ;
 *        - `session` : le plugin n'est plus devant. La route lit le cookie de
 *          session native `mybrief_sess` et le fait résoudre par l'API. Sans
 *          session, elle renvoie vers l'écran de connexion avec un `next` qui
 *          ramène ici.
 *      ⚠️ Le mode n'est PAS déduit de la présence des en-têtes : en mode
 *      `session`, un client qui forgerait x-user-email obtiendrait sinon un OTT
 *      pour le compte de son choix. En `session`, les en-têtes sont ignorés.
 *   2. On mint un OTT (one-time token, TTL court, usage unique, lié au
 *      code-challenge `cc` façon PKCE) et on renvoie une page 200 qui redirige
 *      vers mybrief://auth/callback?ott=… (deep link vers l'app). Un 302 vers
 *      un scheme custom serait bloqué par certaines Custom Tabs sans geste
 *      utilisateur ; une page + lien visible est fiable partout.
 *   3. L'app échange l'OTT + le verifier sur POST /auth/mobile/exchange
 *      (route publique + CORS) contre un JWT HS256 de longue durée.
 *   4. Chaque appel API part avec Authorization: Bearer <jwt>. Un routeur
 *      Traefik dédié (match sur l'en-tête Authorization) passe par le
 *      middleware ForwardAuth -> GET /auth/verify ici, qui valide le JWT et
 *      renvoie les MÊMES en-têtes d'identité que le plugin OIDC => zéro
 *      changement dans les workflows n8n.
 *
 * Sécurité :
 *   - OTT 32 octets aléatoires, usage unique, TTL court, lié au challenge PKCE
 *     (un OTT intercepté par une app squattant le scheme mybrief:// est
 *     inutilisable sans le verifier, jamais sorti de l'app légitime).
 *   - /auth/verify renvoie TOUJOURS les 4 en-têtes d'identité (même vides) :
 *     ForwardAuth les écrase donc systématiquement — un client ne peut pas
 *     forger x-auth-request-user.
 *   - JWT non révocable en V1 (stateless) : rotation de MOBILE_AUTH_JWT_SECRET
 *     pour invalider l'ensemble ; TTL par défaut 30 jours.
 *
 * Env :
 *   MOBILE_AUTH_JWT_SECRET  (requis, ex: openssl rand -hex 32)
 *   MOBILE_JWT_TTL_DAYS     (défaut 30)
 *   OTT_TTL_SECONDS         (défaut 60)
 *   APP_CALLBACK            (défaut mybrief://auth/callback)
 *   PORT                    (défaut 8080)
 *   MOBILE_AUTH_IDENTITY    (`headers` par défaut | `session`)
 *   MYBRIEF_API_URL         (mode session — défaut http://mybrief-api:3000)
 */

const http = require('node:http');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const SECRET = process.env.MOBILE_AUTH_JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error(
    '[mobile-auth] MOBILE_AUTH_JWT_SECRET manquant ou trop court (>= 32 caractères requis)',
  );
  process.exit(1);
}
const JWT_TTL_DAYS = parseInt(process.env.MOBILE_JWT_TTL_DAYS || '30', 10);
const OTT_TTL_MS = parseInt(process.env.OTT_TTL_SECONDS || '60', 10) * 1000;
const APP_CALLBACK = process.env.APP_CALLBACK || 'mybrief://auth/callback';
const PORT = parseInt(process.env.PORT || '8080', 10);
// `headers` = plugin OIDC devant la route (historique). `session` = cookie natif
// résolu par l'API. Toute autre valeur retombe sur `headers`, le mode le plus
// restrictif des deux : il exige un middleware d'authentification en amont.
const IDENTITY_MODE = process.env.MOBILE_AUTH_IDENTITY === 'session' ? 'session' : 'headers';
const API_URL = (process.env.MYBRIEF_API_URL || 'http://mybrief-api:3000').replace(/\/+$/, '');
const SESSION_COOKIE = 'mybrief_sess';

// Store OTT en mémoire (mono-réplica). Purge périodique des expirés.
const otts = new Map(); // ott -> { user, email, name, picture, cc, expiresAt }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otts) if (v.expiresAt < now) otts.delete(k);
}, 30 * 1000).unref();

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sha256b64url(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('base64url');
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':
      typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return '';
}

/**
 * Mode `session` : l'API est la seule à savoir résoudre un cookie de session.
 *
 * On lui transmet UNIQUEMENT le cookie — surtout pas les en-têtes du client,
 * qui pourraient contenir une identité forgée. L'appel est direct sur le réseau
 * interne : il ne repasse pas par Traefik, donc pas d'injection possible.
 *
 * @returns {Promise<{email: string, name: string}|null>}
 */
async function resolveSession(req) {
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return null;
  try {
    const res = await fetch(`${API_URL}/api/auth/session`, {
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.authenticated || !data.user?.email) return null;
    return { email: data.user.email, name: data.user.name || '' };
  } catch (e) {
    console.error('[mobile-auth] résolution de session impossible:', e && e.message);
    return null;
  }
}

/** Page de redirection vers l'app (200 + JS + lien visible — cf. en-tête). */
function callbackPage(deepLink) {
  const safe = String(deepLink).replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyBrief — connexion</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;display:flex;min-height:100vh;
       align-items:center;justify-content:center;margin:0;background:#FFFEFC;color:#1a1a1a}
  .card{text-align:center;padding:2rem}
  a.btn{display:inline-block;margin-top:1rem;padding:.9rem 1.6rem;border-radius:12px;
        background:#F38400;color:#fff;text-decoration:none;font-weight:600}
</style></head>
<body><div class="card">
  <h1>Connexion réussie ✓</h1>
  <p>Retour vers l'application…</p>
  <a class="btn" href="${safe}">Revenir dans MyBrief</a>
</div>
<script>location.href = "${safe}";</script>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/healthz') {
      return send(res, 200, { ok: true });
    }

    // ── 1. Départ du flux
    if (req.method === 'GET' && path === '/auth/mobile/start') {
      const cc = url.searchParams.get('cc') || '';
      // Contrôlé AVANT toute résolution d'identité : inutile d'envoyer
      // l'utilisateur se connecter pour lui refuser l'OTT au retour.
      if (!/^[A-Za-z0-9_-]{20,100}$/.test(cc)) {
        return send(
          res,
          400,
          '<h1>Requête invalide</h1><p>Paramètre cc (code challenge) manquant.</p>',
        );
      }

      let user = '';
      let email = '';
      let name = '';
      let picture = '';

      if (IDENTITY_MODE === 'session') {
        const session = await resolveSession(req);
        if (!session) {
          // Personne n'est connecté dans ce navigateur : on l'envoie sur
          // l'écran de connexion, qui ramènera ICI une fois la session ouverte.
          const back = `/auth/mobile/start?cc=${encodeURIComponent(cc)}`;
          return send(res, 302, '', { Location: `/signin?next=${encodeURIComponent(back)}` });
        }
        email = session.email;
        name = session.name;
        user = session.email;
      } else {
        // Node décode les en-têtes entrants en latin1 : les octets UTF-8 émis
        // par traefikoidc (noms accentués) arrivent en mojibake -> on les
        // re-décode pour stocker du VRAI UTF-8 dans le JWT et le JSON.
        const utf8Header = (h) =>
          Buffer.from(String(req.headers[h] || ''), 'latin1').toString('utf8');
        user = utf8Header('x-auth-request-user');
        email = utf8Header('x-user-email');
        name = utf8Header('x-user-name');
        picture = utf8Header('x-user-picture');

        if (!email && !user) {
          // Pas d'identité => la route n'est pas passée par le middleware OIDC
          // (mauvaise config Traefik). Ne JAMAIS minter d'OTT ici.
          console.error("[mobile-auth] /start sans en-têtes d'identité — middleware oidc absent ?");
          return send(
            res,
            503,
            '<h1>Configuration incomplète</h1><p>Middleware OIDC absent sur /auth/mobile/start.</p>',
          );
        }
      }

      const ott = b64url(crypto.randomBytes(32));
      otts.set(ott, { user, email, name, picture, cc, expiresAt: Date.now() + OTT_TTL_MS });
      console.log(`[mobile-auth] OTT émis pour ${email || user}`);
      return send(res, 200, callbackPage(`${APP_CALLBACK}?ott=${ott}`));
    }

    // ── 2. Échange OTT + verifier -> JWT (route publique + CORS côté Traefik)
    if (req.method === 'POST' && path === '/auth/mobile/exchange') {
      let payload = {};
      try {
        payload = JSON.parse(await readBody(req));
      } catch (_) {
        /* géré ci-dessous */
      }
      const { ott, verifier } = payload || {};
      const entry = ott && otts.get(ott);
      otts.delete(ott); // usage unique, même en cas d'échec de vérification

      if (!entry || entry.expiresAt < Date.now()) {
        return send(res, 401, { error: 'ott_invalid' });
      }
      if (!verifier || sha256b64url(verifier) !== entry.cc) {
        console.warn('[mobile-auth] échange refusé : verifier PKCE invalide');
        return send(res, 401, { error: 'verifier_mismatch' });
      }

      const user = {
        sub: entry.email || entry.user,
        user: entry.user,
        email: entry.email,
        name: entry.name,
        picture: entry.picture,
      };
      const token = jwt.sign(user, SECRET, {
        algorithm: 'HS256',
        expiresIn: `${JWT_TTL_DAYS}d`,
        issuer: 'mybrief-mobile-auth',
      });
      console.log(`[mobile-auth] JWT émis pour ${user.sub} (TTL ${JWT_TTL_DAYS} j)`);
      return send(res, 200, {
        token,
        user: { email: user.email, name: user.name, picture: user.picture },
      });
    }

    // ── 3. Cible ForwardAuth : valide le Bearer, renvoie les en-têtes identité
    if (req.method === 'GET' && path === '/auth/verify') {
      const auth = req.headers['authorization'] || '';
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (!m) return send(res, 401, { error: 'missing_bearer' });
      let claims;
      try {
        claims = jwt.verify(m[1], SECRET, { algorithms: ['HS256'], issuer: 'mybrief-mobile-auth' });
      } catch (e) {
        return send(res, 401, { error: 'invalid_token' });
      }
      // TOUJOURS les 4 en-têtes, même vides : ForwardAuth les copie vers la
      // requête upstream et écrase ainsi toute valeur forgée par le client.
      // X-User-Name : mêmes octets UTF-8 sur le fil que traefikoidc (Node
      // n'accepte que latin1 dans setHeader => on transpose les octets UTF-8).
      return send(
        res,
        200,
        { ok: true },
        {
          'X-Auth-Request-User': String(claims.user || claims.sub || ''),
          'X-User-Email': String(claims.email || ''),
          'X-User-Name': Buffer.from(String(claims.name || ''), 'utf8').toString('latin1'),
          'X-User-Picture': String(claims.picture || ''),
        },
      );
    }

    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error('[mobile-auth] erreur:', e && e.message);
    return send(res, 500, { error: 'internal' });
  }
});

server.listen(PORT, () => {
  console.log(
    `[mobile-auth] à l'écoute sur :${PORT} (OTT ${OTT_TTL_MS / 1000}s, JWT ${JWT_TTL_DAYS}j, identité: ${IDENTITY_MODE})`,
  );
});
