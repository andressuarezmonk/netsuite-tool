import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier";

export default [
  // Base JS rules
  js.configs.recommended,

  // TypeScript + React files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        chrome: 'readonly',
        confirm: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        Promise: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        String: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Error: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks':        reactHooks,
      'react-refresh':      reactRefresh,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // TypeScript
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any':          'warn',
      '@typescript-eslint/no-unused-vars':           ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion':    'warn',
      '@typescript-eslint/consistent-type-imports':  ['warn', { prefer: 'type-imports' }],

      // React hooks
      ...reactHooks.configs.recommended.rules,

      // React refresh (Vite HMR)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // General
      'no-console':         ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars':     'off', // handled by @typescript-eslint/no-unused-vars
      'prefer-const':       'error',
      'no-var':             'error',
      'eqeqeq':             ['error', 'always'],
      'no-duplicate-imports': 'error',
    },
  },

  // Ignore built output and config files
  {
    ignores: ["dist/**", "node_modules/**", "eslint.config.js", "vite.config.ts"],
  },

  // Prettier last — disables ESLint rules that conflict with Prettier formatting
  prettierConfig,
];
