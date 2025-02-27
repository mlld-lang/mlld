import 'reflect-metadata';
import { beforeEach, afterEach, vi } from 'vitest';
import { TestContext } from '@tests/utils/index.js';

// Ensure test environment is set
process.env.NODE_ENV = 'test';

// Reset all mocks before each test
beforeEach(() => {
  vi.resetAllMocks();
});

// Clean up after each test
afterEach(async () => {
  // Clean up any test context resources
  if (globalThis.testContext) {
    await globalThis.testContext.cleanup();
  }
  vi.restoreAllMocks();
});

// Make test utilities available globally
declare global {
  // eslint-disable-next-line no-var
  var testContext: TestContext;
}

// Initialize test context
globalThis.testContext = new TestContext();