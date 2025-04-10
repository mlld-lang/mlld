import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import enforceModuleImportsRule from './scripts/eslint-rules/enforce-module-imports.js'; // Assuming CJS require can be converted

// Mimic __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the custom plugin inline
const meldPlugin = {
  rules: {
    'enforce-module-imports': enforceModuleImportsRule
  }
};

export default tseslint.config(
  // Extends eslint:recommended
  eslint.configs.recommended,
  
  // Extends plugin:@typescript-eslint/recommended
  ...tseslint.configs.recommended,
  
  // Main configuration for all files (parser, plugins)
  {
    files: ['**/*.js', '**/*.ts', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module', // Default in flat config, but explicit
      globals: {
        // Replaces env: { node: true, es6: true } - CommonJS/Node globals might need more specific setup if recommended doesn't cover all cases
        // Consider using globals package if specific env globals are missing
        // globals: { ...globals.node, ...globals.es2020 } 
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'meld': meldPlugin, // Register the custom plugin
    },
    rules: {
      // Custom rules from old config
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      'no-unused-vars': 'off', // Disable base rule
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], // Enable TS version
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { 'allowTemplateLiterals': true }],
      // Apply custom rule to TS files specifically, mirroring 'overrides'
      // We can do this better by having a separate config object targeting TS files
    },
  },
  
  // Configuration specifically for TypeScript files (mirrors overrides)
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser, // Use TypeScript parser for TS files
      parserOptions: {
         project: true, // Assuming you want typed linting, might need './tsconfig.json'
         tsconfigRootDir: __dirname, 
      },
    },
    rules: {
       // Enable the custom rule specifically for TS files
       'meld/enforce-module-imports': 'warn', 
       
       // Add any other TS-specific rules here if needed
       // Example: Rules requiring type information
       // '@typescript-eslint/no-floating-promises': 'error', 
    }
  },
  
  // Ignore patterns (optional, add if needed)
  {
    ignores: [
        'dist/', 
        'node_modules/',
        'coverage/',
        '*.log' 
        // Add other directories/files to ignore
    ]
  }
); 