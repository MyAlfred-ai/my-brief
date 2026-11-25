/**
 * L'administratrice fictive des captures d'administration : Léa Robert, rôle Administrateur.
 *
 * L'identité simulée de vite.config.local.js est Camille Martin, simple utilisatrice : c'est elle
 * que montrent les captures de la documentation utilisateur, sans bouton Admin. Les captures
 * d'administration (`admin-*.capture.mjs`) basculent sur Léa Robert par un cookie, que lit le
 * proxy de vite.config.mjs : même Vite, même passage de l'outil.
 */
import { readFileSync } from 'node:fs';

export const ADMINISTRATRICE = { email: 'lea.robert@conseil.example', nom: 'Léa Robert' };
export const COOKIE = 'mybrief_capture_admin';

const nouveautes = JSON.parse(readFileSync(new URL('../../../src/whats-new.json', import.meta.url), 'utf8'));

/** Ce que partagent les captures d'administration : l'écran, et ce qu'on y masque. */
export const ADMIN = {
  adresse: 'http://localhost:5174/',
  // La hauteur des captures de Réglages : la colonne de l'administration est plus longue encore.
  hauteur: 880,
  localStorage: {
    mybrief_welcome_shown: 'true',
    mybrief_whatsnew_seen: nouveautes.entries[0].id,
    mybrief_language: 'fr',
  },
  masquer: [
    // Le numéro de version change à chaque commit : la capture vieillirait avec lui.
    '.app-version-badge',
    // Les adresses, fictives mais à leur place nulle part dans une image publiée : à côté du titre
    // « Administration », sous le nom sur la carte du compte (l'administratrice n'a pas de quota,
    // la carte affiche son adresse), et dans les listes de comptes.
    '.ap-whoami', '.sb-user-line', '.gp-email', '.au-email', '.ut-mail', '.uf-mail',
    // Les pastilles du diagnostic : elles disent ce qui manque au banc — aucune clé d'IA, exprès —,
    // pas à une installation réglée.
    '.cad',
  ],
};

/** Rouvre la page sous l'identité de l'administratrice, puis ouvre la page d'administration dite. */
export async function ouvrirAdministration(page, rubrique) {
  await page.context().addCookies([{ name: COOKIE, value: '1', url: page.url() }]);
  await page.reload();
  await page.locator('.sb-user-name', { hasText: ADMINISTRATRICE.nom }).waitFor();
  await page.getByRole('button', { name: 'Administration', exact: true }).click();
  await page.locator('aside').getByRole('button', { name: rubrique, exact: true }).click();
}
