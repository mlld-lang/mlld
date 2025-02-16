import { beforeEach, afterEach, vi } from 'vitest';
import { TestContext } from '@tests/utils/index.js';

// Reset all mocks before each test
beforeEach(() => {
  vi.resetAllMocks();
});

// Clean up after each test
afterEach(async () => {
  vi.restoreAllMocks();
});

// Make test utilities available globally
declare global {
  // eslint-disable-next-line no-var
  var testContext: TestContext;
}

// Initialize test context
globalThis.testContext = new TestContext(); 