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
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/mlld-ast/**',
      '**/lib/**',
      '**/tests/ast-perf.test.ts',
      '**/tests/ephemeral-mode.test.ts',
      // Exclude performance benchmarks from default test run
      'tests/performance/**',
      // Exclude token edge case tests - run with npm run test:tokens
      'tests/tokens/**/*.test.ts',
      'services/lsp/semantic-tokens*.test.ts',
      'services/lsp/embedded-language-tokens.test.ts',
      'services/lsp/as-modifier-tokens.test.ts',
      // Exclude heredoc e2e tests - they need low concurrency, run with npm run test:heredoc
      'tests/heredoc.e2e.test.ts',
      'tests/integration/heredoc-large-variable.test.ts'
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**']
    }
  },
  /* // COMMENT OUT build section
  build: {
    target: 'esnext',
    rollupOptions: {
      external: ['peggy'],
      output: {
        format: 'esm'
      }
    }
  }
  */
}); 
