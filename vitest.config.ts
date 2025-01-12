import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['src/interpreter/__tests__/setup.ts'],
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    alias: {
      'meld-spec': resolve(__dirname, './node_modules/meld-spec/dist/esm/index.js'),
      'meld-ast': resolve(__dirname, './src/interpreter/__tests__/__mocks__/meld-ast.ts')
    }
  }
}); 