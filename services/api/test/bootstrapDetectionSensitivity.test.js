/**
 * Remise unique de la sensibilité de détection au démarrage
 * (`resetDetectionSensitivity`, lib/bootstrap.js).
 *
 * Ce qui se vérifie : tout compte qui porte une sensibilité passe à la valeur
 * demandée, UNE fois — un choix fait après la reprise survit au redémarrage
 * suivant —, et une installation sans la variable n'est pas touchée.
 */
import { describe, it, expect } from 'vitest';
import {
  bootstrap,
  resetDetectionSensitivity,
  DETECTION_SENSITIVITY_RESET_KEY,
} from '../lib/bootstrap.js';
import { createFakeDb, userDoc } from './helpers.js';

const SILENT = { info() {}, warn() {}, error() {} };
const bootConfig = {
  adminSeed: { enabled: false, email: '', password: '' },
  legacyAdminDomain: '',
  adminEmails: [],
  adminEmailDomains: [],
};
const ENV = { ACTION_DETECTION_SENSITIVITY_RESET: 'explicit' };

const settingsDoc = (email, detection) => ({
  _id: `id-${email}`,
  email,
  emailLower: email,
  ...(detection ? { detection } : {}),
});

const seed = () =>
  createFakeDb({
    user: [userDoc('a@client.fr'), userDoc('b@client.fr'), userDoc('c@client.fr')],
    userActionSettings: [
      settingsDoc('a@client.fr', { sensitivity: 'balanced', windowSize: 12 }),
      settingsDoc('b@client.fr', { sensitivity: 'wide' }),
      // Destinataires réglés, détection jamais touchée : lit le défaut.
      settingsDoc('c@client.fr'),
    ],
  });

const detectionOf = (db, email) =>
  db.data.get('userActionSettings').find((d) => d.emailLower === email).detection;

describe('bootstrap — remise de la sensibilité de détection', () => {
  it('met tout le monde sur la valeur demandée, sans toucher au reste du réglage', async () => {
    const db = seed();
    await bootstrap(db, bootConfig, SILENT, ENV);

    expect(detectionOf(db, 'a@client.fr')).toEqual({ sensitivity: 'explicit', windowSize: 12 });
    expect(detectionOf(db, 'b@client.fr').sensitivity).toBe('explicit');
    // Pas de bloc partiel créé : le défaut est déjà « Stricte ».
    expect(detectionOf(db, 'c@client.fr')).toBeUndefined();
    const marker = db.data
      .get('appSettings')
      .find((d) => d.key === DETECTION_SENSITIVITY_RESET_KEY);
    expect(marker.value).toBe('explicit');
  });

  it('ne rejoue pas : un choix fait après la reprise survit au redémarrage', async () => {
    const db = seed();
    await bootstrap(db, bootConfig, SILENT, ENV);
    detectionOf(db, 'a@client.fr').sensitivity = 'wide';

    await bootstrap(db, bootConfig, SILENT, ENV);
    expect(detectionOf(db, 'a@client.fr').sensitivity).toBe('wide');
  });

  it('sans la variable, ou avec une valeur inconnue, rien ne bouge', async () => {
    for (const env of [{}, { ACTION_DETECTION_SENSITIVITY_RESET: 'maximale' }]) {
      const db = seed();
      await bootstrap(db, bootConfig, SILENT, env);
      expect(detectionOf(db, 'a@client.fr').sensitivity).toBe('balanced');
      expect(
        db.data.get('appSettings')?.some((d) => d.key === DETECTION_SENSITIVITY_RESET_KEY),
      ).toBeFalsy();
    }
  });

  it('une panne ne bloque pas le démarrage, et laisse la reprise à refaire', async () => {
    const db = seed();
    db.failNext('updateMany', new Error('mongo indisponible'));
    await expect(resetDetectionSensitivity(db, SILENT, 'explicit')).resolves.toBe(0);
    expect(
      db.data.get('appSettings')?.some((d) => d.key === DETECTION_SENSITIVITY_RESET_KEY),
    ).toBeFalsy();
  });
});
