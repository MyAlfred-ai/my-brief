/**
 * Réglages, page « Préférences IA » : le sommaire en trois groupes dans la colonne de gauche,
 * et « Mon contexte » rempli (donnees-fictives.mjs).
 * Pour docs/user/fonctionnalites/configuration/index.md → docs/user/images/reglages.png.
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
    await page.getByRole('tab', { name: 'Préférences IA', exact: true }).click();
    // Le contexte est la VALEUR du champ, pas son texte : hasText ne la voit pas.
    await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some((t) => t.value.includes('projet Atlas')));
  },

  // .sp-whoami : l'adresse de l'identité simulée, à côté du titre — elle n'a pas sa place
  // dans une image publiée.
  masquer: ['.app-version-badge', '.sp-whoami'],
};
