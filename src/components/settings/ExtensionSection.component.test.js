/**
 * Section « Extension Chrome » de « Réglages ».
 *
 * Ce qui casserait sans ces tests : une extension installée depuis le .zip,
 * plus ancienne que celle que sert l'installation, affichée « au vert » —
 * personne n'apprendrait jamais qu'il faut la remplacer, puisqu'elle ne se met
 * pas à jour seule ; ou, à l'inverse, une mise à jour réclamée à une extension
 * à jour, ou sur une version illisible.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { uiTextData } from '../../config/uiText.js';
import { extensionInfo } from '../../stores/extensionBridge.js';
import { EXTENSION_VERSION } from '../../utils/extensionVersion.js';
import ExtensionSection from './ExtensionSection.svelte';

const t = uiTextData.fr.config;

afterEach(() => extensionInfo.set({ installed: false, version: '' }));

describe('ExtensionSection — version de l’extension', () => {
  it('plus ancienne que celle du .zip servi : annonce et propose la nouvelle version', () => {
    extensionInfo.set({ installed: true, version: '0.9.0' });
    render(ExtensionSection, { texts: t });
    expect(screen.getByText(t.extStateOutdated)).toBeTruthy();
    expect(screen.queryByText(t.extStateInstalled)).toBeNull();
    expect(
      screen.getByText(new RegExp(`Version 0\\.9\\.0 installée, ${EXTENSION_VERSION}`)),
    ).toBeTruthy();
    const link = screen.getByText(t.extUpdateZip).closest('a');
    expect(link?.getAttribute('href')).toBe('/mybrief-extension.zip');
    expect(screen.getByText(t.extUpdateHint)).toBeTruthy();
  });

  it('à jour : au vert, rien à télécharger de plus', () => {
    extensionInfo.set({ installed: true, version: EXTENSION_VERSION });
    render(ExtensionSection, { texts: t });
    expect(screen.getByText(t.extStateInstalled)).toBeTruthy();
    expect(screen.queryByText(t.extUpdateZip)).toBeNull();
  });

  it('version illisible : pas de mise à jour réclamée sur un doute', () => {
    extensionInfo.set({ installed: true, version: '' });
    render(ExtensionSection, { texts: t });
    expect(screen.getByText(t.extStateInstalled)).toBeTruthy();
    expect(screen.queryByText(t.extStateOutdated)).toBeNull();
  });
});
