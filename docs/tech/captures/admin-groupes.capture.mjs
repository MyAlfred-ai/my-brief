/**
 * Administration → Personnes → Groupes, sous l'identité de l'administratrice (administratrice.mjs) :
 * les sept comptes de l'équipe à gauche, les groupes Défaut, Admin et Commerciaux, leurs quotas
 * et le droit aux infographies.
 * Pour docs/user/admin/utilisateurs/index.md → docs/user/images/admin-groupes.png.
 */
import { ADMIN, ouvrirAdministration } from './administratrice.mjs';

export default {
  ...ADMIN,

  async preparer(page) {
    await ouvrirAdministration(page, 'Groupes');
    await page.getByText('Commerciaux', { exact: true }).first().waitFor();
    await page.getByText('Thomas Petit', { exact: true }).waitFor();
  },
};
