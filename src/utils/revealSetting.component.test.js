/**
 * Montrer un réglage trouvé par la recherche : le bon élément, déplié s'il
 * est replié, allumé un instant.
 *
 * Fichier `.component.test.js` pour le projet `dom` (jsdom) : la fonction ne
 * vit que dans un DOM.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { findSettingElement, revealSetting } from './revealSetting.js';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function mount(html) {
  document.body.innerHTML = `<div class="shell-panel">${html}</div>`;
  return document.querySelector('.shell-panel');
}

describe('findSettingElement', () => {
  it('préfère un titre à un même texte ailleurs', () => {
    const root = mount(`
      <div class="preview"><span>Envoyer par mail</span></div>
      <section class="sc"><h4>Envoyer par mail</h4></section>`);
    expect(findSettingElement(root, 'Envoyer par mail').tagName).toBe('H4');
  });

  it('préfère le libellé d’une tuile à un même texte dans un aperçu', () => {
    const root = mount(`
      <div class="preview"><span>Envoyer par mail</span></div>
      <button class="dt" aria-expanded="false"><span class="dt-label">Envoyer par mail</span><span>2</span></button>`);
    expect(findSettingElement(root, 'Envoyer par mail').closest('.dt')).not.toBeNull();
  });

  it('ignore l’en-tête du panneau et le déroulant mobile', () => {
    const root = mount(`
      <div class="shell-header"><h2>Audio</h2></div>
      <div class="pt"><button><span>Audio</span></button></div>`);
    expect(findSettingElement(root, 'Audio')).toBeNull();
  });

  it('compare le texte entier, espaces resserrés', () => {
    const root = mount(`<h4>  Mot de
      passe </h4><h4>Mot de passe oublié</h4>`);
    expect(findSettingElement(root, 'Mot de passe').textContent).toContain('Mot de');
    expect(findSettingElement(root, 'Mot')).toBeNull();
  });
});

describe('revealSetting', () => {
  it('allume la carte du titre trouvé, puis l’éteint', async () => {
    vi.useFakeTimers();
    mount(`<section class="sc"><h4>Langue</h4></section>`);
    const card = await revealSetting('Langue', { flashMs: 500 });
    expect(card.classList.contains('sc')).toBe(true);
    expect(card.classList.contains('settings-flash')).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(card.classList.contains('settings-flash')).toBe(false);
  });

  it('déplie une tuile repliée avant de montrer son panneau', async () => {
    const root = mount(`
      <button class="dt" aria-expanded="false"><span class="dt-label">Logo</span></button>
      <div id="slot"></div>`);
    const tile = root.querySelector('.dt');
    tile.addEventListener('click', () => {
      tile.setAttribute('aria-expanded', 'true');
      root.querySelector('#slot').innerHTML = '<section class="dc"><h5>Logo</h5></section>';
    });
    const shown = await revealSetting('Logo', { intervalMs: 5 });
    expect(shown.classList.contains('dc')).toBe(true);
    expect(tile.getAttribute('aria-expanded')).toBe('true');
  });

  it('attend un écran qui charge encore', async () => {
    const root = mount('');
    setTimeout(() => {
      root.innerHTML = '<section class="sc"><h4>Rythme</h4></section>';
    }, 20);
    const shown = await revealSetting('Rythme', { intervalMs: 5, timeoutMs: 500 });
    expect(shown?.querySelector('h4').textContent).toBe('Rythme');
  });

  it('renonce sans bruit quand le réglage n’est pas à l’écran', async () => {
    mount('<h4>Autre chose</h4>');
    expect(await revealSetting('Introuvable', { intervalMs: 5, timeoutMs: 30 })).toBeNull();
  });

  it('une nouvelle recherche annule la précédente', async () => {
    const root = mount('');
    const stale = revealSetting('Plus tard', { intervalMs: 5, timeoutMs: 500 });
    root.innerHTML = '<section><h4>Maintenant</h4></section>';
    const current = await revealSetting('Maintenant', { intervalMs: 5 });
    expect(await stale).toBeNull();
    expect(current).not.toBeNull();
  });
});
