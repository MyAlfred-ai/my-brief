/**
 * Administration → Coûts → Consommation, sous l'identité de l'administratrice (administratrice.mjs) :
 * les chiffres des trente derniers jours et la santé de l'adoption — trois comptes réguliers,
 * deux occasionnels, une en sommeil, un jamais démarré (l'équipe de donnees-fictives.mjs).
 * Pour docs/user/admin/statistiques/index.md → docs/user/images/admin-consommation.png.
 */
import { ADMIN, ouvrirAdministration } from './administratrice.mjs';

export default {
  ...ADMIN,

  async preparer(page) {
    await ouvrirAdministration(page, 'Consommation');
    await page.getByText('Santé de l’adoption', { exact: true }).or(page.getByText("Santé de l'adoption", { exact: true })).waitFor();
    await page.getByText('7 comptes sur 7', { exact: true }).waitFor();
  },
};
