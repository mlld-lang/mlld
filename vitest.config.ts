import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    globals: true,
    include: [
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
      'meld-spec': resolve(__dirname, './tests/__mocks__/meld-spec.ts'),
      'meld-ast': resolve(__dirname, 'node_modules/meld-ast/dist/esm/index.js')
    }
  }
}); 