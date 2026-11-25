/**
 * Administration → Capacités → Templates, sous l'identité de l'administratrice (administratrice.mjs) :
 * les six templates fournis, et « Standard » ouvert dans l'éditeur — son nom, ses directives à l'IA,
 * la mise en forme du résumé.
 * Aucun template d'organisation n'est ajouté au jeu de données : il paraîtrait aussi dans la carte
 * de génération de Camille, et changerait la capture `nouveau-resume`.
 * Pour docs/user/admin/templates/index.md → docs/user/images/admin-templates.png.
 */
import { ADMIN, ouvrirAdministration } from './administratrice.mjs';

export default {
  ...ADMIN,

  async preparer(page) {
    await ouvrirAdministration(page, 'Templates');
    await page.getByText('Standard', { exact: true }).first().click();
    await page.getByText('Directives à l’IA').or(page.getByText("Directives à l'IA")).first().waitFor();
  },
};
