module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // Custom rules
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'warn',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'off',
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { 'allowTemplateLiterals': true }],
  },
  // Load custom rules
  overrides: [
    {
      files: ['**/*.ts'],
      rules: {
        // Load our custom module import rule
        'meld/enforce-module-imports': 'warn',
      },
    },
  ],
  // Register custom rules
  plugins: [
    {
      name: 'meld',
      rules: {
        'enforce-module-imports': require('./scripts/eslint-rules/enforce-module-imports'),
      },
    },
  ],
};