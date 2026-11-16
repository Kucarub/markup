/**
 * 三端统一 ESLint 配置（ESLint 8 / eslintrc 格式）
 * - miniprogram: 原生小程序（微信 API 全局变量）
 * - server: Node + TypeScript
 * - admin: Vue 3 + TypeScript
 */
module.exports = {
  root: true,
  env: {
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: ['eslint:recommended', 'prettier'],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'miniprogram_npm/',
    'server/prisma/migrations/',
  ],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['miniprogram/**/*.js'],
      env: {
        browser: false,
        node: false,
        es2022: true,
      },
      globals: {
        wx: 'readonly',
        App: 'readonly',
        Page: 'readonly',
        Component: 'readonly',
        Behavior: 'readonly',
        getApp: 'readonly',
        getCurrentPages: 'readonly',
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
      parserOptions: {
        sourceType: 'script',
      },
    },
    {
      files: ['server/**/*.ts'],
      env: {
        node: true,
        es2022: true,
      },
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'warn',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['admin/**/*.{ts,vue}'],
      env: {
        browser: true,
        es2022: true,
      },
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      plugins: ['@typescript-eslint', 'vue'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:vue/vue3-recommended',
        'prettier',
      ],
    },
  ],
}
