import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ['./tests/__mocks__/setup.ts'],
    environment: 'node',
    globals: true,
    alias: {
      'meld-ast': path.resolve(__dirname, './tests/__mocks__/meld-ast.ts'),
      'meld-spec': path.resolve(__dirname, './tests/__mocks__/meld-spec.ts')
    }
  }
}); 