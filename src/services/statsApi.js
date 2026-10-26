/**
 * « Mes statistiques » — transport seul (cf. services/api/routes/stats.js et
 * routes/admin/stats.js). `range` : 'month' | '90' | '365' | 'all'.
 */
import { get, post } from './apiClient.js';

/** Usage du compte courant sur la période, et son crédit du mois. */
export const fetchMyStats = (range = 'month') => get(`/stats/me?range=${range}`);

/** Administrateurs : le crédit du mois de chaque compte, par urgence. */
export const fetchTeamCredits = () => get('/admin/stats/credits');

/** Administrateurs : la page d'un collègue, telle qu'il la voit (adresse dans le corps). */
export const fetchAccountStats = (email, range = 'month') =>
  post('/admin/stats/account', { email, range });
