import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    setupFiles: [
      'tests/__mocks__/setup.ts',
      'src/__tests__/setup.ts'
    ],
    environment: 'node',
    globals: true,
    alias: {
      'meld-ast': resolve(__dirname, './tests/__mocks__/meld-ast.ts'),
      'meld-spec': resolve(__dirname, './tests/__mocks__/meld-spec.ts')
    }
  }
}); 