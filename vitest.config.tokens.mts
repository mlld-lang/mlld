import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    tsconfigPaths()
  ],
  test: {
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'production'
    },
    globals: true,
    // Only include token-related tests
    include: [
      'tests/tokens/**/*.test.ts',
      'services/lsp/semantic-tokens*.test.ts',
      'services/lsp/embedded-language-tokens.test.ts',
      'services/lsp/as-modifier-tokens.test.ts'
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**']
    }
  }
});