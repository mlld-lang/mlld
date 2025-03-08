import 'reflect-metadata';
import { beforeEach, afterEach, afterAll, vi } from 'vitest';
import { TestContext } from '@tests/utils/index.js';
import { container } from 'tsyringe';

// Ensure test environment is set
process.env.NODE_ENV = 'test';

// Set test timeout to a reasonable value (10 seconds by default)
vi.setConfig({ testTimeout: 10000 });

// Reset all mocks and container before each test
beforeEach(() => {
  vi.resetAllMocks();
  
  // Clear container instances to prevent test cross-contamination
  container.clearInstances();
});

// Clean up after each test
afterEach(async () => {
  // Clean up any test context resources
  if (globalThis.testContext) {
    // Explicitly nullify service references to break circular dependencies
    if (globalThis.testContext.services) {
      Object.keys(globalThis.testContext.services).forEach(key => {
        globalThis.testContext.services[key] = null;
      });
    }
    
    // Clean up context
    await globalThis.testContext.cleanup();
  }
  
  // Clear container instances again to ensure proper cleanup
  container.clearInstances();
  
  // Restore all mocks
  vi.restoreAllMocks();
  
  // Small delay to allow async cleanup
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Final cleanup after all tests complete
afterAll(() => {
  // Clear container instances one last time
  container.clearInstances();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Make test utilities available globally
declare global {
  // eslint-disable-next-line no-var
  var testContext: TestContext;
}

// Initialize test context
globalThis.testContext = new TestContext();