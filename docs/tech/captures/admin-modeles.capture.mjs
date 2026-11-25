/**
 * Administration → Modèles IA → Modèles, sous l'identité de l'administratrice (administratrice.mjs) :
 * les trois tuiles, et celle des comptes rendus dépliée — les modèles proposés, leur prix par
 * résumé, celui qui est en service. Les modèles Mistral portent un cadenas : le banc n'a aucune clé.
 * Pour docs/user/admin/ia/index.md → docs/user/images/admin-modeles.png.
 */
import { ADMIN, ouvrirAdministration } from './administratrice.mjs';

export default {
  ...ADMIN,

  async preparer(page) {
    await ouvrirAdministration(page, 'Modèles');
    await page.getByText('Comptes rendus', { exact: true }).first().click();
    await page.getByText('En service', { exact: true }).first().waitFor();
  },
};
