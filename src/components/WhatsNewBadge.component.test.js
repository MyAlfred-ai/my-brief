/**
 * Badge de version et popup « Quoi de neuf ? ».
 *
 * Le badge est resté muet pendant des mois : ce qui est vérifié ici, c'est
 * qu'il OUVRE la liste, qu'elle contient bien les nouveautés publiées dans
 * src/whats-new.json (et pas un texte figé dans le composant), que chacune
 * dit son genre et son public, et que la pastille « non lu » s'éteint une
 * fois la popup ouverte.
 *
 * Sur téléphone, le badge du coin recouvrait « Terminer » : il y cède la
 * place à une entrée en pied du tiroir (`placement="drawer"`). Vérifié ici :
 * elle ouvre LA popup du coin (une seule, rendue au niveau d'App — le tiroir
 * a une transform qui enfermerait une popup fixe), et la pastille est
 * commune aux deux.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

const WhatsNewBadge = (await import('./WhatsNewBadge.svelte')).default;
const { uiText } = await import('../store.js');
const whatsNew = (await import('../whats-new.json')).default;
const appVersion = (await import('../version.json')).default;

describe('WhatsNewBadge', () => {
  beforeEach(() => localStorage.clear());

  it('affiche le numéro de version et le propose comme bouton', () => {
    render(WhatsNewBadge);
    const badge = screen.getByRole('button', { expanded: false });
    expect(badge.textContent.trim()).toBe(`v${appVersion.version}`);
  });

  it('ouvre la liste des nouveautés publiées, la plus récente en premier', async () => {
    render(WhatsNewBadge);
    await userEvent.click(screen.getByRole('button', { expanded: false }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();

    const titles = [...dialog.querySelectorAll('.wn-item-title')].map((n) => n.textContent.trim());
    expect(titles).toEqual(whatsNew.entries.slice(0, 10).map((e) => e.title));
    expect(titles.length).toBeLessThanOrEqual(10);
  });

  it('nomme le genre de chaque nouveauté et signale celles de l’administration', async () => {
    render(WhatsNewBadge);
    await userEvent.click(screen.getByRole('button', { expanded: false }));

    const texts = get(uiText).whatsNew;
    const items = [...screen.getByRole('dialog').querySelectorAll('.wn-item')];
    whatsNew.entries.slice(0, 10).forEach((entry, i) => {
      expect(items[i].querySelector('.wn-kind').textContent.trim()).toBe(texts[entry.kind]);
      const audience = items[i].querySelector('.wn-audience');
      expect(audience?.textContent.trim()).toBe(
        entry.audience === 'admins' ? texts.admins : undefined,
      );
    });
  });

  it('la touche Échap referme la popup', async () => {
    render(WhatsNewBadge);
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByRole('dialog')).toBeTruthy();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('la pastille « non lu » s’éteint après lecture, et le reste au montage suivant', async () => {
    const first = render(WhatsNewBadge);
    const badge = screen.getByRole('button', { expanded: false });
    expect(badge.classList.contains('has-unseen')).toBe(true);

    await userEvent.click(badge);
    expect(badge.classList.contains('has-unseen')).toBe(false);
    expect(localStorage.getItem('mybrief_whatsnew_seen')).toBe(whatsNew.entries[0].id);

    first.unmount();
    render(WhatsNewBadge);
    expect(screen.getByRole('button', { expanded: false }).classList.contains('has-unseen')).toBe(
      false,
    );
  });

  describe('entrée du tiroir (téléphone)', () => {
    const drawerEntry = () => screen.getByRole('button', { name: /version/i, expanded: false });

    it('dit « Quoi de neuf ? » et la version, sans popup à elle', async () => {
      render(WhatsNewBadge, { placement: 'drawer' });
      const texts = get(uiText).whatsNew;
      const entry = drawerEntry();
      expect(entry.textContent).toContain(texts.title);
      expect(entry.textContent).toContain(`v${appVersion.version}`);
      expect(document.querySelector('.app-version-badge')).toBeNull();

      await userEvent.click(entry);
      // Seule l'instance du coin rend la popup : rien ici.
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('ouvre la popup du coin, et éteint la pastille des deux côtés', async () => {
      render(WhatsNewBadge);
      render(WhatsNewBadge, { placement: 'drawer' });
      const corner = document.querySelector('.app-version-badge');
      const entry = document.querySelector('.wn-drawer-btn');
      expect(corner.classList.contains('has-unseen')).toBe(true);
      expect(entry.classList.contains('has-unseen')).toBe(true);

      await userEvent.click(entry);
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(corner.classList.contains('has-unseen')).toBe(false);
      expect(entry.classList.contains('has-unseen')).toBe(false);

      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
