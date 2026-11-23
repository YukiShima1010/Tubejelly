import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const browserGlobals = Object.fromEntries(
  [
    'chrome',
    'document',
    'window',
    'navigator',
    'fetch',
    'AbortController',
    'URL',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'console',
    'self',
    'HTMLElement',
    'Event',
    'requestAnimationFrame',
  ].map((name) => [name, 'readonly'])
);

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      // 型の解決はTypeScriptが行うため無効化（typescript-eslint推奨）
      'no-undef': 'off',
      'no-console': 'off',
      'preserve-caught-error': 'off'
    },
  },
  {
    // Chrome拡張機能（ビルド不要の素のJS）
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js'],
  },
];
