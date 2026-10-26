/**
 * Vitest — deux projets :
 *
 *  - `node`  : les tests existants (utils front purs + services/api). Reprend
 *    exactement la découverte qu'avait `vitest run` sans config (src/** et
 *    services/**), environnement node.
 *  - `dom`   : tests de COMPOSANTS Svelte (*.component.test.js), jsdom +
 *    @testing-library/svelte. Premier harnais de test des .svelte du repo.
 *
 * `npm test` à la racine exécute les deux.
 */
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/**/*.test.js',
            'services/**/*.test.js',
            'scripts/**/*.test.mjs',
            // Fonctions pures de l'extension Chrome (extension/lib/core.js).
            'extension/**/*.test.js',
          ],
          exclude: ['**/node_modules/**', 'src/**/*.component.test.js'],
        },
      },
      {
        // svelteTesting : auto-cleanup du DOM entre les tests (sinon les rendus
        // s'accumulent et getByRole trouve des doublons).
        // Icons : même résolution `~icons/*` qu'en build — sans elle, tout
        // composant portant une icône (Sidebar, Dock…) est intestable.
        plugins: [svelte(), svelteTesting(), Icons({ compiler: 'svelte' })],
        resolve: {
          // Résolution navigateur pour que svelte s'importe côté client en test.
          conditions: ['browser'],
        },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.component.test.js'],
        },
      },
    ],
  },
});
