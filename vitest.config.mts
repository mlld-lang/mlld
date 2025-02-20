import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'production'
    },
    globals: true,
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
    alias: {
      '@core': resolve(__dirname, './core'),
      '@services': resolve(__dirname, './services'),
      '@tests': resolve(__dirname, './tests'),
      '@api': resolve(__dirname, './api')
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**']
    }
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      external: ['peggy'],
      output: {
        format: 'esm'
      }
    }
  }
}); 