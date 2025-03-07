/**
 * TestServiceUtilities provides helper functions for working with services in tests.
 * These utilities make it easier to work with both DI and non-DI modes.
 */

import { InjectionToken } from 'tsyringe';
import { shouldUseDI } from '../../../core/ServiceProvider';
import { TestContextDI } from './TestContextDI';

/**
 * Gets a service from the test context, supporting both DI and non-DI modes
 * 
 * @param context The test context
 * @param token The service token to resolve
 * @param options Options for service resolution
 * @returns The resolved service
 */
export function getService<T>(
  context: TestContextDI,
  token: string | InjectionToken<T>,
  options: {
    /**
     * Fallback class to use if the token isn't registered (DI mode)
     * or if the service doesn't exist on the services object (non-DI mode)
     */
    fallbackClass?: new (...args: any[]) => T;
    
    /**
     * Constructor arguments to use when creating fallback
     */
    fallbackArgs?: any[];
    
    /**
     * Fallback value to use instead of creating an instance
     */
    fallback?: T;
    
    /**
     * Whether to throw an error if the service can't be resolved
     */
    required?: boolean;
  } = {}
): T | null {
  // Set default options
  const required = options.required !== false;
  
  try {
    // Try to resolve the service using the context's resolve method
    return context.resolve(token, options.fallback);
  } catch (error) {
    // If we have a fallback class, create an instance
    if (options.fallbackClass) {
      const instance = new options.fallbackClass(...(options.fallbackArgs || []));
      return instance;
    }
    
    // If we have a fallback value, use it
    if (options.fallback !== undefined) {
      return options.fallback;
    }
    
    // If the service is required, throw an error
    if (required) {
      throw new Error(
        `Failed to resolve service '${String(token)}': ${error.message}\n` +
        `Consider providing a fallback class or value.`
      );
    }
    
    // Otherwise return null
    return null;
  }
}

/**
 * Creates a mock for a service that works in both DI and non-DI modes
 * 
 * @param context The test context
 * @param token The service token to mock
 * @param implementation The mock implementation
 * @returns The registered mock
 */
export function createServiceMock<T>(
  context: TestContextDI,
  token: string | InjectionToken<T>,
  implementation: Partial<T>
): T {
  // Register the mock with the context
  context.registerMock(token, implementation as T);
  return implementation as T;
}

/**
 * Creates a container-aware service factory
 * Useful for creating services that need container resolution
 * 
 * @param context The test context
 * @param factory A factory function that receives the context and creates a service
 * @returns The created service
 */
export function createService<T>(
  context: TestContextDI,
  factory: (ctx: TestContextDI) => T
): T {
  // Create the service using the factory
  const service = factory(context);
  return service;
}

/**
 * Creates a diagnostic report for the test context
 * Useful for debugging test setup issues
 * 
 * @param context The test context
 * @param options Options for diagnostic reporting
 * @returns A formatted diagnostic string
 */
export function createDiagnosticReport(
  context: TestContextDI,
  options: {
    /**
     * Include full container state
     */
    includeContainerState?: boolean;
    
    /**
     * Include services object
     */
    includeServices?: boolean;
    
    /**
     * Include registered mocks
     */
    includeMocks?: boolean;
  } = {}
): string {
  // Get diagnostic info from context
  const report = context.createDiagnosticReport();
  
  // Format the report based on options
  let output = `Test Context Diagnostic Report\n`;
  output += `============================\n`;
  output += `DI Mode: ${report.useDI ? 'Enabled' : 'Disabled'}\n`;
  output += `Cleaned Up: ${report.isCleanedUp ? 'Yes' : 'No'}\n`;
  output += `Child Contexts: ${report.childContexts}\n`;
  
  // Include registered mocks if requested
  if (options.includeMocks !== false && report.registeredMocks.length > 0) {
    output += `\nRegistered Mocks (${report.registeredMocks.length}):\n`;
    report.registeredMocks.forEach(mock => {
      output += `  - ${mock}\n`;
    });
  }
  
  // Include services if requested
  if (options.includeServices && report.services.length > 0) {
    output += `\nServices (${report.services.length}):\n`;
    report.services.forEach(service => {
      output += `  - ${service}\n`;
    });
  }
  
  // Include container state if requested and available
  if (options.includeContainerState && report.containerState) {
    output += `\nContainer Tokens (${report.containerState.registeredTokens.length}):\n`;
    report.containerState.registeredTokens
      .sort() // Sort alphabetically for easier reading
      .forEach(token => {
        output += `  - ${token}\n`;
      });
  }
  
  return output;
}

/**
 * Creates a test setup helper for vitest tests
 * 
 * @returns A helper object with setup/teardown functions
 */
export function createTestSetup(options: {
  /**
   * Use DI mode for tests
   */
  useDI?: boolean;
  
  /**
   * Use isolated container (DI mode only)
   */
  isolatedContainer?: boolean;
}): {
  /**
   * Creates a test context
   */
  setup: () => TestContextDI;
  
  /**
   * Cleans up the test context
   */
  cleanup: (context: TestContextDI) => Promise<void>;
} {
  // Allow explicit setting, otherwise use environment variable
  const useDI = options.useDI !== undefined ? options.useDI : shouldUseDI();
  
  return {
    setup: () => {
      return new TestContextDI({
        useDI,
        isolatedContainer: options.isolatedContainer
      });
    },
    cleanup: async (context: TestContextDI) => {
      await context.cleanup();
    }
  };
}

/**
 * Tests a service in both DI and non-DI modes
 * This is useful for ensuring services work correctly in both modes
 * 
 * @param serviceName The name of the service being tested
 * @param testFn The test function to run
 */
export function testInBothModes(
  serviceName: string,
  testFn: (context: TestContextDI) => Promise<void> | void
): void {
  // Create test cases for both modes
  describe(serviceName, () => {
    describe.each([
      { useDI: true, name: 'with DI' },
      { useDI: false, name: 'without DI' },
    ])('$name', ({ useDI }) => {
      let context: TestContextDI;
      
      beforeEach(() => {
        context = new TestContextDI({ useDI });
      });
      
      afterEach(async () => {
        await context.cleanup();
      });
      
      // Run the test function
      it('should work correctly', async () => {
        await testFn(context);
      });
    });
  });
}

export default {
  getService,
  createServiceMock,
  createService,
  createDiagnosticReport,
  createTestSetup,
  testInBothModes
};