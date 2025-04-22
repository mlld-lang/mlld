import 'reflect-metadata';
import { beforeEach, afterEach, afterAll, vi } from 'vitest';
import { container } from 'tsyringe';
import { EventEmitter } from 'events';

// Increase the default max listeners to prevent warnings
EventEmitter.defaultMaxListeners = 20;

// Ensure test environment is set
process.env.NODE_ENV = 'test';

// Set test timeout to a reasonable value (10 seconds by default)
vi.setConfig({ testTimeout: 10000 });

// Simplified beforeEach: Just reset mocks
beforeEach(() => {
  vi.resetAllMocks();
});

// Clean up after each test
afterEach(async () => {
  // Keep container clearing for now, though ideally tests clean themselves up
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