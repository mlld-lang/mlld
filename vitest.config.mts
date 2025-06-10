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
      NODE_ENV: 'test'
    },
    globals: true,
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**', '**/mlld-ast/**', '**/lib/**'],
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