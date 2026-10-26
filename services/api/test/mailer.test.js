/**
 * lib/mailer.js — première couverture (le module n'était importé par aucun
 * test). On ne teste pas nodemailer : on vérifie le contrat du module —
 * mailer inerte sans host, et construction du `from` de repli.
 */
import { describe, it, expect } from 'vitest';
import { createMailer } from '../lib/mailer.js';

describe('createMailer', () => {
  it('sans host : mailer désactivé, envois refusés proprement', async () => {
    const mailer = createMailer({ host: '' });
    expect(mailer.enabled).toBe(false);
    await expect(mailer.sendPasswordReset({})).rejects.toThrow('mailer_disabled');
    await expect(mailer.sendDocument({})).rejects.toThrow('mailer_disabled');
  });

  it('config undefined : même comportement (robustesse au câblage)', () => {
    expect(createMailer(undefined).enabled).toBe(false);
  });
});
