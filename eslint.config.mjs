import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Custom AST rules
import noRawFieldAccess from './eslint-rules/no-raw-field-access.js';
import noAstStringManipulation from './eslint-rules/no-ast-string-manipulation.js';
import requireAstTypeGuards from './eslint-rules/require-ast-type-guards.js';

// Mimic __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
        global: 'readonly',
        // ES6+ globals
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Symbol: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'mlld': {
        rules: {
          'no-raw-field-access': noRawFieldAccess,
          'no-ast-string-manipulation': noAstStringManipulation,
          'require-ast-type-guards': requireAstTypeGuards,
        }
      }
    },
    rules: {
      // Custom rules from old config
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      'no-unused-vars': 'off', // Disable base rule
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], // Enable TS version
      '@typescript-eslint/explicit-function-return-type': 'off', // Too strict for most code
      '@typescript-eslint/no-explicit-any': 'error', // Disallow any type
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
       // Type-aware rules that require TypeScript parser
       '@typescript-eslint/no-unsafe-assignment': 'error', // Disallow assignment of any to variables
       '@typescript-eslint/no-unsafe-member-access': 'error', // Disallow member access on any typed values
       '@typescript-eslint/no-unsafe-call': 'error', // Disallow calling any typed values
       '@typescript-eslint/no-unsafe-return': 'error', // Disallow returning any from functions
    }
  },
  
  // Strict AST rules for interpreter and core modules
  {
    files: [
      'interpreter/**/*.ts',
      'core/**/*.ts',
      'api/**/*.ts',
    ],
    rules: {
      // Enforce our custom AST rules
      'mlld/no-raw-field-access': 'error',
      'mlld/no-ast-string-manipulation': 'error',
      'mlld/require-ast-type-guards': 'warn', // Warning for now, can make error later
      
      // Extra strictness for core code
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
    }
  },
  
  // Disable type-aware rules for low-impact areas
  {
    files: [
      'grammar/**/*.ts',     // Generated parser code
      'tests/**/*.ts',       // Test utilities
      'cli/**/*.ts',         // CLI with yargs
      '**/*.test.ts',        // Test files
      '**/*.spec.ts',        // Spec files
      'scripts/**/*.js',     // Build scripts
      'scripts/**/*.mjs',    // Build scripts
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      
      // Also disable our custom AST rules in these areas
      'mlld/no-raw-field-access': 'off',
      'mlld/no-ast-string-manipulation': 'off',
      'mlld/require-ast-type-guards': 'off',
    }
  },
  
  // Files with legitimate string operations (not for AST manipulation)
  {
    files: [
      'core/registry/StatsCollector.ts',         // JSONL parsing for usage statistics
      'core/utils/sourceContextExtractor.ts',    // Error message formatting
      'interpreter/core/interpolation-context.ts', // Security escaping for execution contexts
      'interpreter/utils/frontmatter-parser.ts'   // YAML frontmatter preprocessing
    ],
    rules: {
      // These files legitimately manipulate strings for non-AST purposes
      'mlld/no-ast-string-manipulation': 'off'
    }
  },
  
  // Ignore patterns
  {
    ignores: [
        'dist/**', 
        'node_modules/**',
        'coverage/**',
        '*.log',
        'bin/**',  // Binary wrapper files
        'lib/**',  // External library
        'website/**',  // Website files
        'grammar/parser/parser.js',  // Generated parser
        'grammar/parser/parser.ts',  // Generated parser
        'grammar/parser/deps/**',  // Generated deps
        '**/*.d.ts',  // Type declaration files
        '_dev/**',  // Development files
        'logs/**'  // Log files
    ]
  }
); 