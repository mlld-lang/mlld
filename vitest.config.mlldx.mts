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
    include: ['**/tests/ephemeral-mode.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**']
    }
  }
});