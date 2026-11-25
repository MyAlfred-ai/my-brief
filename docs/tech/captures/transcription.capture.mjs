/**
 * L'onglet « Transcription » de la réunion « Comité de pilotage » : une ligne par prise de
 * parole, au nom de chaque participant, et « Reprendre l'enregistrement » au pied.
 * Pour docs/user/fonctionnalites/transcription/index.md → docs/user/images/transcription.png.
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
    await page.getByRole('tab', { name: 'Transcription', exact: true }).click();
    await page.getByText('Merci à tous.', { exact: false }).waitFor();
  },

  masquer: ['.app-version-badge'],
};
