/**
 * Ce que « se déconnecter » doit fermer.
 *
 * Le bug que ces tests verrouillent : sur la recette, le plugin OIDC Traefik
 * garde encore `/api`. Fermer la seule session native laissait le plugin
 * ré-authentifier la requête suivante EN SILENCE — sa session et celle de l'IdP
 * dans le navigateur étant toujours vivantes. L'utilisateur voyait l'écran de
 * connexion une fraction de seconde et se retrouvait connecté sans rien saisir.
 */
import { describe, it, expect } from 'vitest';
import { resolveLogoutTarget, PLUGIN_LOGOUT_PATH } from './logoutTarget.js';

describe('resolveLogoutTarget', () => {
  it('ferme les DEUX quand une session native coexiste avec le plugin', () => {
    // LA régression. Connexion par le bouton Google (session native) sur une
    // installation où le plugin garde encore /api.
    expect(resolveLogoutTarget({ authMode: 'sso', oidcEnabled: true })).toBe('native+plugin');
    expect(resolveLogoutTarget({ authMode: 'password', oidcEnabled: true })).toBe('native+plugin');
  });

  it('ne touche PAS au plugin quand il n’est pas monté', () => {
    // Y naviguer tomberait sur un 404 nginx, et fermerait pour rien la session
    // Google ou Microsoft du navigateur.
    expect(resolveLogoutTarget({ authMode: 'sso', oidcEnabled: false })).toBe('native');
    expect(resolveLogoutTarget({ authMode: 'password', oidcEnabled: false })).toBe('native');
  });

  it('identité par en-tête : il n’y a que le plugin à fermer', () => {
    expect(resolveLogoutTarget({ authMode: 'oidc', oidcEnabled: true })).toBe('plugin');
    // Même sans le drapeau : `authMode: 'oidc'` PROUVE que le plugin
    // authentifie, puisque l'identité est arrivée par en-tête.
    expect(resolveLogoutTarget({ authMode: 'oidc', oidcEnabled: false })).toBe('plugin');
  });

  it('mobile : le JWT local, jamais une navigation', () => {
    // Le RP-logout concerne le navigateur SYSTÈME, pas la WebView.
    for (const authMode of ['sso', 'password', 'oidc']) {
      for (const oidcEnabled of [true, false]) {
        expect(resolveLogoutTarget({ authMode, isNative: true, oidcEnabled })).toBe('mobile');
      }
    }
  });

  it('sans contexte, ne se rabat jamais sur une navigation hasardeuse', () => {
    // `authMode` inconnu = pas d'identité par en-tête constatée : on ferme le
    // natif, et on ne part chez le plugin que s'il est déclaré monté.
    expect(resolveLogoutTarget()).toBe('native');
    expect(resolveLogoutTarget({})).toBe('native');
    expect(resolveLogoutTarget({ oidcEnabled: true })).toBe('native+plugin');
  });

  it('vise le chemin de déconnexion que le plugin expose réellement', () => {
    // `/oauth2/logout` n'est routé nulle part et tombe sur nginx en 404 : le
    // bouton semblerait simplement ne rien faire.
    expect(PLUGIN_LOGOUT_PATH).toBe('/oauth2/callback/logout');
  });
});
