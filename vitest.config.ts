import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    globals: true,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'services/**/*.test.ts',
      'core/**/*.test.ts',
      'cli/**/*.test.ts',
      'sdk/**/*.test.ts',
      'tests/utils/tests/*.test.ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      '_old',
      '_meld'
    ],
    alias: {
      '@core': resolve(__dirname, './core'),
      '@services': resolve(__dirname, './services'),
      '@parser': resolve(__dirname, './parser'),
      '@interpreter': resolve(__dirname, './interpreter'),
      '@output': resolve(__dirname, './output'),
      '@cli': resolve(__dirname, './cli'),
      '@sdk': resolve(__dirname, './sdk'),
      '@tests': resolve(__dirname, './tests'),
      'meld-ast': resolve(__dirname, './tests/__mocks__/meld-ast.ts'),
      'meld-spec': resolve(__dirname, './tests/__mocks__/meld-spec.ts')
    }
  }
}); 