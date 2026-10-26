/**
 * Client Gmail (lib/gmail.js) — surtout : ce qui compte comme une révocation.
 *
 * L'enjeu de ces tests est une décision de produit, pas un détail HTTP. Quand
 * l'appelant reçoit une GmailAuthError, il SUPPRIME la connexion de
 * l'utilisateur (routes/actions.js) : celui-ci doit alors refaire tout le flux
 * d'autorisation Google. Confondre un dépassement de quota — transitoire, qui
 * se résout tout seul en quelques minutes — avec un accès retiré infligeait
 * cette reconnexion pour rien.
 */
import { describe, it, expect, vi } from 'vitest';
import { sendViaGmail, revokeGmailToken, GmailAuthError } from '../lib/gmail.js';

const CREDENTIALS = {
  clientId: 'client-abc.apps.googleusercontent.com',
  clientSecret: 'GOCSPX-secret',
  refreshToken: 'rt-123',
  from: 'perso@gmail.com',
  to: 'perso@gmail.com',
  subject: 'Compte rendu',
  text: 'texte',
  html: '<p>html</p>',
};

/** Corps d'erreur Gmail tel que l'API le renvoie réellement. */
const gmailError = (code, reason, domain = 'usageLimits') => ({
  error: { code, message: 'refusé', errors: [{ domain, reason, message: 'refusé' }] },
});

/**
 * Google factice : le rafraîchissement réussit toujours, l'envoi répond ce que
 * le test demande. Le refresh doit réussir pour que le test porte bien sur la
 * réponse d'ENVOI — c'est là que le 403 ambigu se produit.
 */
function mockGoogle(sendResponse) {
  return vi.fn(async (url) => {
    if (String(url).includes('/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'at-frais' }) };
    }
    return sendResponse;
  });
}

describe('sendViaGmail — ce qui vaut révocation', () => {
  it('403 de quota ne révoque PAS la connexion', async () => {
    for (const reason of [
      'rateLimitExceeded',
      'userRateLimitExceeded',
      'dailyLimitExceeded',
      'quotaExceeded',
    ]) {
      const fetchImpl = mockGoogle({
        ok: false,
        status: 403,
        json: async () => gmailError(403, reason),
      });
      const err = await sendViaGmail({ ...CREDENTIALS, fetchImpl }).catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      // LE point du test : l'appelant ne doit pas purger la connexion.
      expect(err).not.toBeInstanceOf(GmailAuthError);
      expect(err.message).toBe('gmail_rate_limited');
    }
  });

  it('403 non identifié ne révoque pas non plus — le doute profite à la connexion', async () => {
    const fetchImpl = mockGoogle({
      ok: false,
      status: 403,
      json: async () => gmailError(403, 'forbidden', 'global'),
    });
    const err = await sendViaGmail({ ...CREDENTIALS, fetchImpl }).catch((e) => e);

    expect(err).not.toBeInstanceOf(GmailAuthError);
    expect(err.message).toBe('gmail_send_failed_403');
  });

  it('403 au corps illisible ne révoque pas', async () => {
    const fetchImpl = mockGoogle({
      ok: false,
      status: 403,
      json: async () => {
        throw new Error('pas du JSON');
      },
    });
    const err = await sendViaGmail({ ...CREDENTIALS, fetchImpl }).catch((e) => e);

    expect(err).not.toBeInstanceOf(GmailAuthError);
    expect(err.message).toBe('gmail_send_failed_403');
  });

  it("401 révoque : l'access token venait d'être émis", async () => {
    const fetchImpl = mockGoogle({ ok: false, status: 401, json: async () => ({}) });
    await expect(sendViaGmail({ ...CREDENTIALS, fetchImpl })).rejects.toBeInstanceOf(
      GmailAuthError,
    );
  });

  it("invalid_grant au rafraîchissement révoque, sans jamais tenter l'envoi", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    }));
    await expect(sendViaGmail({ ...CREDENTIALS, fetchImpl })).rejects.toBeInstanceOf(
      GmailAuthError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('500 est transitoire', async () => {
    const fetchImpl = mockGoogle({ ok: false, status: 500, json: async () => ({}) });
    const err = await sendViaGmail({ ...CREDENTIALS, fetchImpl }).catch((e) => e);

    expect(err).not.toBeInstanceOf(GmailAuthError);
    expect(err.message).toBe('gmail_send_failed_500');
  });

  it('envoi réussi : un rafraîchissement puis un POST, jamais rejoué', async () => {
    const fetchImpl = mockGoogle({ ok: true, status: 200, json: async () => ({ id: 'msg-1' }) });
    await expect(sendViaGmail({ ...CREDENTIALS, fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('revokeGmailToken', () => {
  it('révoque un refresh token', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await expect(revokeGmailToken({ refreshToken: 'rt-123', fetchImpl })).resolves.toBe(true);
    expect(fetchImpl.mock.calls[0][1].body).toContain('token=rt-123');
  });

  it("révoque un access token quand aucun refresh token n'est revenu", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await expect(revokeGmailToken({ accessToken: 'at-456', fetchImpl })).resolves.toBe(true);
    expect(fetchImpl.mock.calls[0][1].body).toContain('token=at-456');
  });

  it("sans jeton : n'appelle pas Google", async () => {
    const fetchImpl = vi.fn();
    await expect(revokeGmailToken({ fetchImpl })).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('meilleur effort : une révocation en échec ne lève pas', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(revokeGmailToken({ refreshToken: 'rt-123', fetchImpl })).resolves.toBe(false);
  });
});
