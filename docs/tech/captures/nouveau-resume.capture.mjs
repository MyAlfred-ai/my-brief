/**
 * La carte de génération d'un compte rendu, ouverte par « Nouveau résumé » sur la réunion
 * « Comité de pilotage » : templates, Pagimètre, ce qui s'ajoute au compte rendu, « Générer ».
 * Pour docs/user/fonctionnalites/resumes/index.md et templates/index.md
 * → docs/user/images/nouveau-resume.png.
 */
import { readFileSync } from 'node:fs';

const nouveautes = JSON.parse(readFileSync(new URL('../../../src/whats-new.json', import.meta.url), 'utf8'));

export default {
  adresse: 'http://localhost:5174/',
  localStorage: {
    mybrief_welcome_shown: 'true',
    mybrief_whatsnew_seen: nouveautes.entries[0].id,
    mybrief_language: 'fr',
  },

  async preparer(page) {
    await page.locator('.sb-user-name', { hasText: 'Camille Martin' }).waitFor();
    await page.locator('aside.sb .sb-item', { hasText: 'Comité de pilotage' }).click();
    await page.locator('.resume-text-area', { hasText: 'Informations' }).waitFor();
    await page.getByRole('button', { name: 'Nouveau résumé' }).click();
    await page.getByRole('button', { name: /Générer/ }).waitFor();
    // La rangée d'onglets défile jusqu'à l'onglet actif : on la ramène au début, comme sur
    // l'écran principal, pour que « Transcription » se lise en entier.
    await page.getByRole('tab', { name: 'Transcription', exact: true }).evaluate((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollWidth > p.clientWidth) { p.scrollLeft = 0; return; }
    });
  },

  masquer: ['.app-version-badge'],
};
