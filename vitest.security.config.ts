import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'security',
    root: '.',
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts'
    ],
    exclude: [
      'tests/fixtures/**',
      'tests/cases/**',
      'node_modules/**'
    ],
    environment: 'node',
    setupFiles: [
      './tests/setup/vitest-security-setup.ts'
    ],
    sequence: {
      hooks: 'stack' // Ensure proper cleanup order
    },
    pool: 'threads', // Use threads for better isolation
    poolOptions: {
      threads: {
        singleThread: true // Ensure SecurityManager singleton doesn't interfere
      }
    },
    testTimeout: 30000, // 30 seconds for complex security tests
    hookTimeout: 10000, // 10 seconds for setup/teardown
    teardownTimeout: 10000,
    isolate: true, // Ensure complete test isolation
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './test-results/security-tests.json'
    },
    coverage: {
      enabled: true,
      provider: 'v8',
      include: [
        'security/**/*.ts',
        'interpreter/**/*.ts',
        'tests/utils/**/*.ts',
        'tests/mocks/**/*.ts'
      ],
      exclude: [
        'tests/**/*.test.ts',
        'tests/**/*.spec.ts',
        '**/*.d.ts',
        'node_modules/**'
      ],
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './test-results/coverage'
    }
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, './core'),
      '@security': resolve(__dirname, './security'),
      '@interpreter': resolve(__dirname, './interpreter'),
      '@services': resolve(__dirname, './services'),
      '@tests': resolve(__dirname, './tests'),
      '@grammar': resolve(__dirname, './grammar')
    }
  },
  define: {
    // Test environment variables
    'process.env.NODE_ENV': '"test"',
    'process.env.VITEST': '"true"'
  }
});