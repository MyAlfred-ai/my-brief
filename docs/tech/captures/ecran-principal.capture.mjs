/**
 * L'écran principal de myBrief, pour la section « Se repérer dans myBrief » de
 * docs/user/premiers-pas.md → docs/user/images/ecran-principal.png.
 *
 * Les numéros suivent l'ordre du tableau de la page : un repère ajouté, retiré ou
 * renuméroté change la ligne du tableau dans le même commit.
 */
import { readFileSync } from 'node:fs';

// Sans l'identifiant de la dernière nouveauté, un point orange marque le numéro de version.
const nouveautes = JSON.parse(readFileSync(new URL('../../../src/whats-new.json', import.meta.url), 'utf8'));

export default {
  adresse: 'http://localhost:5174/',
  localStorage: {
    mybrief_welcome_shown: 'true',
    mybrief_whatsnew_seen: nouveautes.entries[0].id,
    mybrief_language: 'fr',
  },

  // Une réunion passée, ouverte depuis l'historique : l'écran qui montre le plus de myBrief.
  async preparer(page) {
    await page.locator('.sb-user-name', { hasText: 'Camille Martin' }).waitFor();
    await page.locator('aside.sb .sb-item', { hasText: 'Comité de pilotage' }).click();
    await page.locator('.resume-text-area', { hasText: 'Informations' }).waitFor();
  },

  // Le numéro de version change à chaque commit : la capture vieillirait avec lui.
  masquer: ['.app-version-badge'],

  reperes: [
    // 1. Nouvelle réunion
    { n: 1, ou: 'droite', cible: (p) => p.getByRole('button', { name: 'Nouvelle réunion', exact: true }) },
    // 2. L'historique
    { n: 2, ou: 'droite', cible: (p) => p.locator('aside.sb .sb-week-label').first() },
    // 3. Les onglets Transcription / Résumé
    { n: 3, ou: 'coin', cible: (p) => p.getByRole('tab', { name: 'Transcription', exact: true }) },
    // 4. Le template
    { n: 4, ou: 'droite', cible: (p) => p.locator('.resume-template-tag') },
    // 5. Le résumé
    { n: 5, ou: 'gauche', cible: (p) => p.locator('.resume-text-area h2').first() },
    // 6. Le tag
    { n: 6, ou: 'bas', cible: (p) => p.locator('button.ts-btn') },
    // 7. Partager (Télécharger le PDF, Envoyer par mail, Entreposer)
    { n: 7, ou: 'bas', cible: (p) => p.locator('button.pa-share') },
    // 8. Les actions détectées
    { n: 8, ou: 'coin', cible: (p) => p.locator('.actions-panel-new') },
    // 9. Les notes de réunion
    { n: 9, ou: 'coin', cible: (p) => p.locator('.notes-panel') },
    // 10. Votre compte et Ma configuration
    { n: 10, ou: 'haut', cible: (p) => p.getByRole('button', { name: 'Configuration', exact: true }) },
  ],
};
