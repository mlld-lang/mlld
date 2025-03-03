/**
 * @package
 * Vitest test output setup.
 * 
 * This file configures the test output filter service and integrates it with Vitest.
 * It must be explicitly imported by tests that want to use it.
 */

import { beforeEach, afterEach } from 'vitest';
import { TestOutputOptions } from './TestOutputFilterService';
import { getOutputFilterInstance } from './TestOutputFilterService';

// Get the shared instance of the output filter
const outputFilter = getOutputFilterInstance();

// Reset filter between tests only if explicitly imported
afterEach(() => {
  outputFilter.reset();
});

// Export utility for configuring test output
export function withTestOutput(options: TestOutputOptions) {
  return (testFn: Function) => {
    return async (...args: any[]) => {
      // Set output configuration for this test
      if (globalThis.testOutputFilter) {
        globalThis.testOutputFilter.configureTestOutput(options);
      } else {
        // Use local instance if global isn't available
        outputFilter.configureTestOutput(options);
      }
      
      // Run the original test
      return await testFn(...args);
    };
  };
}

// Export hook registration function
export interface TestOutputHooks {
  // Before each test
  beforeTest?(testName: string, testPath: string): void;
  
  // After each test
  afterTest?(testName: string, testPath: string, success: boolean): void;
  
  // On test error
  onTestError?(testName: string, error: Error): void;
  
  // Before test suite
  beforeSuite?(suiteName: string): void;
  
  // After test suite
  afterSuite?(suiteName: string): void;
}

// Register hooks with test runner - must be explicitly called
export function registerTestOutputHooks(hooks: TestOutputHooks): void {
  // Implementation to integrate with Vitest
  if (hooks.beforeTest) {
    beforeEach((context) => {
      const testName = context.task.name;
      const testPath = context.task.file?.filepath || '';
      hooks.beforeTest!(testName, testPath);
    });
  }
  
  if (hooks.afterTest) {
    afterEach((context) => {
      const testName = context.task.name;
      const testPath = context.task.file?.filepath || '';
      const success = !context.task.result?.state || context.task.result.state === 'pass';
      hooks.afterTest!(testName, testPath, success);
    });
  }
}