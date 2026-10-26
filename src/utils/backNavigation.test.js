// @vitest-environment jsdom
/**
 * Bouton retour d'Android : un appui ferme le calque du DESSUS, un seul ;
 * sans calque, l'app passe en arrière-plan ; et deux décisions ne sont jamais
 * tranchées par le retour (« Toujours en réunion ? », « Réunion interrompue »).
 *
 * jsdom ne calcule pas de mise en page : la visibilité est injectée.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BACK_LAYERS, resolveBackAction, performBackAction } from './backNavigation.js';

const visible = () => true;
const decide = () => resolveBackAction(document, { isVisible: visible });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resolveBackAction — quoi fermer', () => {
  it('rien d’ouvert : l’app passe en arrière-plan (jamais fermée)', () => {
    expect(decide()).toEqual({ action: 'minimize' });
  });

  it('une fenêtre de confirmation : son fond, qui vaut « Annuler »', () => {
    document.body.innerHTML = '<div class="delete-modal-backdrop"></div>';
    const d = decide();
    expect(d.action).toBe('click');
    expect(d.target.className).toBe('delete-modal-backdrop');
  });

  it('« Toujours en réunion ? » : ignoré — le fermer ARRÊTERAIT la réunion', () => {
    // Même avec un menu ouvert dessous : la décision passe avant tout.
    document.body.innerHTML =
      '<div class="pa-menu"></div><div class="continue-prompt-backdrop"></div>';
    expect(decide()).toEqual({ action: 'ignore' });
  });

  it('« Réunion interrompue » : ignoré, bien qu’elle partage la classe des confirmations', () => {
    document.body.innerHTML =
      '<div class="delete-modal-backdrop" aria-labelledby="resume-session-modal-title"></div>';
    expect(decide()).toEqual({ action: 'ignore' });
  });

  it('mot de passe imposé : ignoré ; changement volontaire : fermé', () => {
    document.body.innerHTML = '<div class="cp-backdrop cp-backdrop-locked"></div>';
    expect(decide()).toEqual({ action: 'ignore' });
    document.body.innerHTML = '<button class="cp-backdrop"></button>';
    expect(decide().action).toBe('click');
  });

  it('un menu du tiroir passe avant le tiroir, malgré l’ordre du DOM', () => {
    document.body.innerHTML = '<div class="ctx-menu"></div><div class="sidebar-backdrop"></div>';
    expect(decide()).toEqual({ action: 'outside' });
  });

  it('panneaux emboîtés : c’est le « Fermer » du dernier (celui du dessus) qui est touché', () => {
    document.body.innerHTML = `
      <div class="shell-overlay"><button class="shell-close" id="config"></button>
        <div class="shell-overlay"><button class="shell-close" id="editeur"></button></div>
      </div>`;
    expect(decide().target.id).toBe('editeur');
  });

  it('une fenêtre DANS « Ma configuration » se ferme seule, sans Échap qui fermerait le panneau', () => {
    document.body.innerHTML = `
      <div class="shell-overlay"><button class="shell-close"></button>
        <div class="trd-backdrop"></div>
      </div>`;
    const d = decide();
    expect(d.action).toBe('click');
    expect(d.target.className).toBe('trd-backdrop');
  });

  it('écran de connexion de l’app : arrière-plan, même avec une fenêtre dessous', () => {
    document.body.innerHTML =
      '<div class="delete-modal-backdrop"></div><div class="native-login-gate"></div>';
    expect(decide()).toEqual({ action: 'minimize' });
  });

  it('un calque masqué (media query) ne compte pas', () => {
    document.body.innerHTML = '<div class="sidebar-backdrop"></div>';
    expect(resolveBackAction(document, { isVisible: () => false })).toEqual({
      action: 'minimize',
    });
  });

  it('bouton de fermeture introuvable : Échap plutôt qu’un retour muet', () => {
    document.body.innerHTML = '<div class="shell-overlay"></div>';
    expect(decide()).toEqual({ action: 'escape' });
  });
});

describe('performBackAction — le geste', () => {
  it('toucher le fond déclenche son propre gestionnaire', () => {
    const onCancel = vi.fn();
    const backdrop = document.createElement('div');
    backdrop.addEventListener('click', (e) => e.target === e.currentTarget && onCancel());
    document.body.append(backdrop);
    performBackAction({ action: 'click', target: backdrop }, { minimize: vi.fn() });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('« hors du menu » : un clic qui remonte jusqu’à window, où les menus écoutent', () => {
    const onWindowClick = vi.fn();
    window.addEventListener('click', onWindowClick);
    performBackAction({ action: 'outside' }, { minimize: vi.fn() });
    window.removeEventListener('click', onWindowClick);
    expect(onWindowClick).toHaveBeenCalledTimes(1);
  });

  it('Échap part du champ qui a le focus et remonte jusqu’à window', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const seen = [];
    input.addEventListener('keydown', (e) => seen.push(`champ:${e.key}`));
    const onWindow = (e) => seen.push(`window:${e.key}`);
    window.addEventListener('keydown', onWindow);
    performBackAction({ action: 'escape' }, { minimize: vi.fn() });
    window.removeEventListener('keydown', onWindow);
    expect(seen).toEqual(['champ:Escape', 'window:Escape']);
  });

  it('arrière-plan : minimize, et rien d’autre ; ignore : rien du tout', () => {
    const minimize = vi.fn();
    performBackAction({ action: 'minimize' }, { minimize });
    performBackAction({ action: 'ignore' }, { minimize });
    expect(minimize).toHaveBeenCalledTimes(1);
  });
});

describe('BACK_LAYERS — la table suit le markup', () => {
  // Renommer une classe sans mettre la table à jour rendrait le retour muet
  // sur ce calque, sans qu'aucun test d'écran ne le voie.
  function svelteSources(dir) {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return svelteSources(path);
      return path.endsWith('.svelte') ? [readFileSync(path, 'utf8')] : [];
    });
  }
  const markup = [
    ...svelteSources(join(__dirname, '..', 'components')),
    readFileSync(join(__dirname, '..', 'App.svelte'), 'utf8'),
  ].join('\n');

  const tokensOf = (selector) => [
    ...[...selector.matchAll(/\.([a-z][\w-]*)/gi)].map((m) => m[1]),
    ...[...selector.matchAll(/="([^"]+)"/g)].map((m) => m[1]),
  ];

  it.each(BACK_LAYERS.map((l) => [l.selector, l]))('%s existe dans les composants', (_, layer) => {
    const selectors = [layer.selector, typeof layer.action === 'object' ? layer.action.click : ''];
    for (const token of selectors.flatMap(tokensOf)) {
      expect(markup, `« ${token} » introuvable dans src/`).toContain(token);
    }
  });
});
