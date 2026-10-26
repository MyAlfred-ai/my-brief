import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  checkPasswordPolicy,
  generatePassword,
  burnVerify,
  MIN_PASSWORD_LENGTH,
} from '../lib/auth/password.js';
import { createRateLimiter } from '../lib/auth/rateLimit.js';
import { serializeCookie, readCookie, SESSION_COOKIE } from '../lib/auth/cookies.js';

describe('hachage de mot de passe', () => {
  it('round-trip hash → verify', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$N=16384,r=8,p=1$')).toBe(true);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batteries', hash)).toBe(false);
  });

  it('deux hachages du même mot de passe diffèrent (sel aléatoire)', async () => {
    const [a, b] = await Promise.all([
      hashPassword('même-mot-de-passe'),
      hashPassword('même-mot-de-passe'),
    ]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('même-mot-de-passe', a)).toBe(true);
    expect(await verifyPassword('même-mot-de-passe', b)).toBe(true);
  });

  it('un hash malformé refuse la connexion au lieu de jeter', async () => {
    for (const bad of [
      '',
      'pas-un-hash',
      'scrypt$$$',
      'bcrypt$N=1$a$b',
      null,
      undefined,
      42,
      'scrypt$N=0,r=8,p=1$aa$bb',
    ]) {
      expect(await verifyPassword('x', bad)).toBe(false);
    }
  });

  it('burnVerify renvoie toujours false (égalisation du temps de réponse)', async () => {
    expect(await burnVerify('nimporte')).toBe(false);
    expect(await burnVerify(undefined)).toBe(false);
  });
});

describe('politique de mot de passe', () => {
  it('accepte un mot de passe conforme', () => {
    expect(checkPasswordPolicy('un-mot-de-passe-correct')).toEqual({ ok: true });
  });

  it('refuse trop court', () => {
    expect(checkPasswordPolicy('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toEqual({
      ok: false,
      reason: 'too_short',
    });
  });

  it('refuse trop long (borne le coût scrypt)', () => {
    expect(checkPasswordPolicy('a'.repeat(201))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('refuse un classique absolu', () => {
    expect(checkPasswordPolicy('Password123')).toEqual({ ok: false, reason: 'too_common' });
  });

  it("refuse un mot de passe contenant la partie locale de l'email", () => {
    expect(checkPasswordPolicy('alex-est-le-plus-fort', { email: 'alex@myalfred.ai' })).toEqual({
      ok: false,
      reason: 'contains_email',
    });
    // partie locale trop courte (< 3) : pas de faux positif
    expect(checkPasswordPolicy('abcdefghijkl', { email: 'ab@x.fr' })).toEqual({ ok: true });
  });

  it('refuse une valeur vide ou non-chaîne', () => {
    expect(checkPasswordPolicy('')).toEqual({ ok: false, reason: 'required' });
    expect(checkPasswordPolicy(null)).toEqual({ ok: false, reason: 'required' });
  });

  it('generatePassword produit un mot de passe conforme à la politique', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(checkPasswordPolicy(generatePassword())).toEqual({ ok: true });
    }
  });
});

describe('limiteur de débit', () => {
  it('autorise jusqu à max puis refuse avec un Retry-After', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(true);
    const blocked = limiter.hit('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    limiter.stop();
  });

  it('compte par clé, pas globalement', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
    limiter.stop();
  });

  it('reset() efface le compteur (succès de connexion)', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    limiter.hit('k');
    expect(limiter.hit('k').allowed).toBe(false);
    limiter.reset('k');
    expect(limiter.hit('k').allowed).toBe(true);
    limiter.stop();
  });

  it('oublie les tentatives sorties de la fenêtre', async () => {
    const limiter = createRateLimiter({ windowMs: 20, max: 1 });
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(false);
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
    expect(limiter.hit('k').allowed).toBe(true);
    limiter.stop();
  });
});

describe('cookie de session', () => {
  it('sérialise les attributs de sécurité attendus', () => {
    const c = serializeCookie(SESSION_COOKIE, 'jeton', { maxAgeSec: 3600, secure: true });
    expect(c).toContain('mybrief_sess=jeton');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=3600');
    expect(c).not.toContain('Domain='); // host-only
  });

  it('omet Secure en dev http', () => {
    expect(serializeCookie(SESSION_COOKIE, 'x', { secure: false })).not.toContain('Secure');
  });

  it('relit le cookie parmi plusieurs, sans faux positif de préfixe', () => {
    const req = { headers: { cookie: 'autre=1; xx_mybrief_sess=piege; mybrief_sess=bon; z=2' } };
    expect(readCookie(req, SESSION_COOKIE)).toBe('bon');
    expect(readCookie(req, 'absent')).toBe('');
    expect(readCookie({ headers: {} }, SESSION_COOKIE)).toBe('');
  });
});
