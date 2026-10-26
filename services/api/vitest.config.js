/**
 * Config vitest LOCALE : permet `npm test` depuis services/api sans remonter
 * sur la config racine (qui définit les projets node+dom du monorepo — le
 * projet dom n'a aucun sens ici et ferait échouer le run).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
