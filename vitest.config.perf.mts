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
      NODE_ENV: 'production',
      MLLD_PERF: 'true'
    },
    globals: true,
    include: ['tests/performance/**/*.test.ts'],
    exclude: [
      '**/node_modules/**', 
      '**/dist/**'
    ]
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@core': resolve(__dirname, './core'),
      '@services': resolve(__dirname, './services'),
      // Use source grammar path; @grammar/parser re-exports generated parser correctly
      '@grammar': resolve(__dirname, './grammar'),
      '@interpreter': resolve(__dirname, './interpreter'),
      '@utils': resolve(__dirname, './utils')
    }
  }
});
