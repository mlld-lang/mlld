import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths()
  ],
  test: {
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    globals: true,
    include: [
      'tests/heredoc.e2e.test.ts',
      'tests/integration/heredoc-large-variable.test.ts'
    ],
    maxConcurrency: 2
  }
});
