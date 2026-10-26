/**
 * ESLint (flat config) — règles volontairement HIGH-SIGNAL uniquement.
 *
 * Pas de règles stylistiques : Prettier s'en charge. Chaque règle ici attrape
 * une vraie classe de bug (variable inconnue, import mort, == laxiste,
 * compilation Svelte invalide).
 *
 * Cliquet anti-regonflement : `max-lines` sur src/App.svelte, fixé à sa taille
 * courante et ABAISSÉ à chaque phase de décomposition (cf. plan refactoring).
 * Un refactor précédent avait ramené App.svelte à ~2 300 lignes ; il est
 * remonté à ~6 400 faute de garde-fou. Ne JAMAIS remonter cette valeur.
 */
import sveltePlugin from 'eslint-plugin-svelte';
import globals from 'globals';

const highSignalRules = {
  'no-undef': 'error',
  // caughtErrors:'none' — `catch (e) {}` muet est un idiome assumé ici (best-effort
  // nombreux : wake-lock, storage, revoke…). Une variable morte hors catch reste une erreur.
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none',
      // const { exclu, ...rest } = obj — idiome d'exclusion de champ (cf. offlineGaps.js)
      ignoreRestSiblings: true,
    },
  ],
  eqeqeq: ['error', 'smart'],
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'www/**',
      'public/**',
      'docs/**',
      'documentations/**',
      'dev-dist/**',
      '**/*.min.js',
    ],
  },

  // Frontend (navigateur)
  {
    files: ['src/**/*.js', 'vite.config.js', 'vite.config.local.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: highSignalRules,
  },

  // Composants Svelte — parser dédié via flat/base, + valid-compile.
  ...sveltePlugin.configs['flat/base'].map((c) => ({
    ...c,
    files: ['src/**/*.svelte'],
  })),
  {
    files: ['src/**/*.svelte'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...highSignalRules,
      // ignoreWarnings : seules les vraies ERREURS de compilation Svelte bloquent.
      // Les warnings compilateur (A11y, CSS inutilisé — ~50 aujourd'hui) sont un
      // chantier de fond séparé, pas un garde-fou CI.
      'svelte/valid-compile': ['error', { ignoreWarnings: true }],
    },
  },

  // Cliquet : tout appel /api passe par services/apiClient.js — un fetch()
  // brut dans un composant/store réintroduirait les options divergentes
  // (credentials, redirect:'manual', en-tête XHR, jeton mobile) qui ont déjà
  // produit des bugs réels. App.svelte est inclus depuis la Phase 8 : ses 9
  // derniers fetch bruts sont migrés, dont trois via apiClient.raw (les seuls
  // qui inspectent le corps verbatim). utils/ et lib/ le sont aussi, sauf trois
  // exceptions documentées dans leurs en-têtes : l'intercepteur
  // (httpErrorHandler.js), l'import audio multipart (audioProcessing.js) et la
  // police du PDF, un fichier statique (lib/pdf/fonts.js). platform/ (auth
  // native, envoi hors ligne) reste hors périmètre.
  {
    files: [
      'src/App.svelte',
      'src/components/**/*.svelte',
      'src/components/**/*.js',
      'src/services/**/*.js',
      'src/stores/**/*.js',
      'src/utils/**/*.js',
      'src/lib/**/*.js',
    ],
    ignores: [
      'src/services/apiClient.js',
      'src/utils/httpErrorHandler.js',
      'src/utils/audioProcessing.js',
      'src/lib/pdf/fonts.js',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Passer par services/apiClient.js — contrat {ok,status,data}, credentials et redirect garantis.',
        },
      ],
    },
  },

  // Cliquet : App.svelte ne peut plus grossir. Abaisser à chaque extraction.
  {
    files: ['src/App.svelte'],
    rules: {
      'max-lines': ['error', { max: 4515, skipBlankLines: false, skipComments: false }],
    },
  },

  // Backend + scripts (Node)
  {
    files: ['services/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: highSignalRules,
  },

  // Extension Chrome (MV3) : navigateur + l'objet global `chrome`. Pas de
  // cliquet apiClient ici — elle parle à l'API depuis une AUTRE origine, avec
  // ses propres règles (credentials, redirect:'error', sonde sans cookie).
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, chrome: 'readonly' },
    },
    rules: highSignalRules,
  },

  // mobile-auth est encore en CommonJS (fusion dans l'API prévue en Phase 7).
  {
    files: ['services/mobile-auth/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
];
