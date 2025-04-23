/**
 * TestServiceUtilities provides helper functions for working with services in tests.
 * These utilities make it easier to work with services in the DI container.
 */

import { InjectionToken } from 'tsyringe';
import { TestContextDI } from '@tests/utils/di/TestContextDI';

/**
 * Gets a service from the test context
 * 
 * @param context The test context
 * @param token The service token to resolve
 * @param options Options for service resolution
 * @returns The resolved service
 */
export async function getService<T>(
  context: TestContextDI,
  token: string | InjectionToken<T>,
  options: {
    /**
     * Fallback class to use if the token isn't registered
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
): Promise<T | null> {
  // Set default options
  const required = options.required !== false;
  
  try {
    // Try to resolve the service using the context's resolve method
    return await context.resolve(token, options.fallback);
  } catch (error) {
    // If we have a fallback class, use it
    if (options.fallbackClass) {
      const args = options.fallbackArgs || [];
      return new options.fallbackClass(...args);
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
 * Gets a service from the test context (synchronous version)
 * 
 * @param context The test context
 * @param token The service token to resolve
 * @param options Options for service resolution
 * @returns The resolved service
 */
export function getServiceSync<T>(
  context: TestContextDI,
  token: string | InjectionToken<T>,
  options: {
    fallbackClass?: new (...args: any[]) => T;
    fallbackArgs?: any[];
    fallback?: T;
    required?: boolean;
  } = {}
): T | null {
  // Set default options
  const required = options.required !== false;
  
  try {
    // Try to resolve the service using the context's resolveSync method
    return context.resolveSync(token, options.fallback);
  } catch (error) {
    // If we have a fallback class, use it
    if (options.fallbackClass) {
      const args = options.fallbackArgs || [];
      return new options.fallbackClass(...args);
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
 * Creates a mock service and registers it with the container
 * 
 * @param context The test context
 * @param token The service token to mock
 * @param implementation The mock implementation
 * @returns The mock service
 */
export function createServiceMock<T>(
  context: TestContextDI,
  token: string | InjectionToken<T>,
  implementation: Partial<T>
): T {
  // Register the mock with the container
  context.registerMock(token, implementation as T);
  
  // Return the mock
  return implementation as T;
}

/**
 * Creates a service using a factory function
 * 
 * @param context The test context
 * @param factory The factory function to create the service
 * @returns The created service
 */
export async function createService<T>(
  context: TestContextDI,
  factory: (ctx: TestContextDI) => T | Promise<T>
): Promise<T> {
  return await factory(context);
}

/**
 * Creates a service using a factory function (synchronous version)
 * 
 * @param context The test context
 * @param factory The factory function to create the service
 * @returns The created service
 */
export function createServiceSync<T>(
  context: TestContextDI,
  factory: (ctx: TestContextDI) => T
): T {
  return factory(context);
}

/**
 * Creates a diagnostic report for the test context
 * 
 * @param context The test context
 * @param options Options for the report
 * @returns A string containing the diagnostic report
 */
export async function createDiagnosticReport(
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
): Promise<string> {
  // Set default options
  const includeContainerState = options.includeContainerState !== false;
  const includeServices = options.includeServices !== false;
  const includeMocks = options.includeMocks !== false;
  
  // Create the report
  let report = '--- DIAGNOSTIC REPORT ---\n\n';
  
  // Add DI mode
  report += `DI Mode: enabled\n`;
  report += `Context Type: ${context.constructor.name}\n\n`;
  
  // Add services object
  if (includeServices) {
    report += 'Services Object:\n';
    const services = Object.entries(context.services);
    report += `Services (${services.length}):\n`;
    
    for (const [name, service] of services) {
      const type = service?.constructor?.name || typeof service;
      report += `- ${name}: ${type}\n`;
    }
    
    report += '\n';
  }
  
  // Add registered mocks
  if (includeMocks) {
    report += 'Registered Mocks:\n';
    const mocks = Array.from(context.registeredMocks.entries());
    report += `Mocks (${mocks.length}):\n`;
    
    for (const [token, mock] of mocks) {
      report += `- ${token},${mock}\n`;
    }
    
    report += '\n';
  }
  
  // Add container state
  if (includeContainerState) {
    report += 'Container State:\n';
    
    try {
      const containerHelper = context.container;
      const registeredTokens = containerHelper.getRegisteredTokens();
      
      report += `Registered Tokens (${registeredTokens.length}):\n`;
      
      for (const token of registeredTokens) {
        report += `- ${String(token)}\n`;
      }
      
      report += '\n';
    } catch (error) {
      report += `Error getting container state: ${error.message}\n\n`;
    }
  }
  
  return report;
}

/**
 * Creates a test setup helper for use in beforeEach/afterEach
 * 
 * @param options Options for the test setup
 * @returns An object with setup and cleanup functions
 */
export function createTestSetup(options: {
  /**
   * Use isolated container
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
  // Set default options
  const isolatedContainer = options.isolatedContainer === true;
  
  return {
    setup: () => {
      // Create a test context with the specified options
      return isolatedContainer
        ? TestContextDI.createIsolated()
        : TestContextDI.create();
    },
    cleanup: async (context: TestContextDI) => {
      // Clean up the context
      await context.cleanup();
    }
  };
}

/**
 * Tests a service with dependency injection
 * 
 * @param serviceName The name of the service being tested
 * @param testFn The test function to run
 */
export function testService(
  serviceName: string,
  testFn: (context: TestContextDI) => Promise<void> | void
): void {
  describe(serviceName, () => {
    let context: TestContextDI;
    
    beforeEach(() => {
      context = TestContextDI.create();
    });
    
    afterEach(async () => {
      await context?.cleanup();
    });
    
    it('should work correctly', async () => {
      await testFn(context);
    });
  });
}

export default {
  getService,
  getServiceSync,
  createServiceMock,
  createService,
  createServiceSync,
  createDiagnosticReport,
  createTestSetup,
  testService
};