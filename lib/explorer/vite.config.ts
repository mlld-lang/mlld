import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, '../../core'),
      '@grammar': resolve(__dirname, '..'),
    },
  },
});