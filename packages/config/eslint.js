import { resolve } from 'node:path';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const repoRoot = resolve(import.meta.dirname, '../..');

const nodeFiles = [
  'apps/api/**/*.ts',
  'apps/worker/**/*.ts',
  'packages/{contracts,db,auth,observability,redis}/**/*.ts',
];
const reactFiles = [
  'apps/{guest,staff,panel,admin,web}/**/*.{ts,tsx}',
  'packages/ui/**/*.{ts,tsx}',
  'packages/menu-editor/**/*.{ts,tsx}',
];

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/dev-dist/**', '**/coverage/**', '**/.turbo/**', 'docs/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Plain JS config files are not part of any tsconfig.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: nodeFiles,
    languageOptions: { globals: globals.node },
  },

  {
    files: reactFiles,
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Modular monolith: a module in apps/api/src/modules/<name> may import another
  // module only through that module's index.ts (its public interface).
  {
    files: ['apps/api/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { project: resolve(repoRoot, 'apps/api/tsconfig.json') },
      },
      'boundaries/elements': [
        {
          type: 'module',
          // Matched against the path relative to where ESLint runs (repo root or apps/api).
          pattern: '**/src/modules/*',
          capture: ['name'],
        },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              // Imports inside the same module are not checked (plugin default).
              disallow: {
                to: { element: { type: 'module', fileInternalPath: '!index.ts' } },
              },
            },
          ],
        },
      ],
    },
  },

  prettier,
);
