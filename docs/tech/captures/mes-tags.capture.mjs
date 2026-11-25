/**
 * Réglages → Mes tags, le tag « Projet Atlas » ouvert : la liste des tags à gauche, et à droite
 * son nom, sa couleur et « Où ranger ses comptes rendus ? ».
 * Pour docs/user/fonctionnalites/tags/index.md → docs/user/images/mes-tags.png.
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
    await page.getByRole('tab', { name: 'Mes tags', exact: true }).click();
    await page.getByText('Projet Atlas', { exact: true }).first().click();
    await page.getByText('Où ranger ses comptes rendus ?').waitFor();
  },

  masquer: ['.app-version-badge', '.sp-whoami'],
};
