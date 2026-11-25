/**
 * Réglages → Usage & crédits : la jauge du crédit de temps du mois (quota du groupe par défaut,
 * posé par donnees-fictives.mjs), les chiffres du mois et la courbe « Au fil du mois ».
 * Pour docs/user/fonctionnalites/statistiques/index.md → docs/user/images/usage-et-credits.png.
 */
import { readFileSync } from 'node:fs';

const nouveautes = JSON.parse(readFileSync(new URL('../../../src/whats-new.json', import.meta.url), 'utf8'));

export default {
  adresse: 'http://localhost:5174/',
  // Plus haut que l'écran principal : à 800, « Se déconnecter », au pied du sommaire, passe sous
  // la carte du compte.
  hauteur: 880,
  localStorage: {
    mybrief_welcome_shown: 'true',
    mybrief_whatsnew_seen: nouveautes.entries[0].id,
    mybrief_language: 'fr',
  },

  async preparer(page) {
    await page.locator('.sb-user-name', { hasText: 'Camille Martin' }).waitFor();
    await page.getByRole('button', { name: 'Réglages', exact: true }).click();
    await page.getByRole('tab', { name: 'Usage & crédits', exact: true }).click();
    await page.getByText('Au fil du mois', { exact: true }).waitFor();
  },

  masquer: ['.app-version-badge', '.sp-whoami'],
};
