import { beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { TestSetup } from './TestSetup';

/**
 * Global setup for Vitest security tests
 * Ensures proper initialization and cleanup of test environments
 */

// Global setup - run once before all tests
beforeAll(async () => {
  console.log('🔧 Setting up security testing framework...');
  await TestSetup.beforeAll();
});

// Setup before each test - creates isolated environment
beforeEach(async () => {
  // TestSetup.beforeEach will be called by individual tests
  // This is just for global state management
});

// Cleanup after each test
afterEach(async () => {
  await TestSetup.afterEach();
});

// Global cleanup - run once after all tests
afterAll(async () => {
  console.log('🧹 Cleaning up security testing framework...');
  await TestSetup.afterAll();
});

// Export test utilities for convenience
export { TestSetup };
export { EnvironmentFactory } from '../utils/EnvironmentFactory';
export { TestEnvironment } from '../utils/TestEnvironment';
export { TTLTestFramework } from '../utils/TTLTestFramework';
export { MockSecurityManager } from '../mocks/MockSecurityManager';
export { MockURLCache } from '../mocks/MockURLCache';
export { MockLockFile } from '../mocks/MockLockFile';