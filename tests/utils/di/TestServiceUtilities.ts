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
export async function getService<T>(
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
): Promise<T | null> {
  // Set default options
  const required = options.required !== false;
  
  try {
    // Try to resolve the service using the context's resolve method
    return await context.resolve(token, options.fallback);
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
 * Synchronous version of getService for backward compatibility
 * DEPRECATED: Use async getService instead for new code
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
    // Use the synchronous resolve method
    return context.resolveSync(token, options.fallback);
  } catch (error) {
    // Handle fallbacks same as async version
    if (options.fallbackClass) {
      const instance = new options.fallbackClass(...(options.fallbackArgs || []));
      return instance;
    }
    
    if (options.fallback !== undefined) {
      return options.fallback;
    }
    
    if (required) {
      throw new Error(
        `Failed to resolve service '${String(token)}': ${error.message}\n` +
        `Consider providing a fallback class or value.`
      );
    }
    
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
export async function createService<T>(
  context: TestContextDI,
  factory: (ctx: TestContextDI) => T | Promise<T>
): Promise<T> {
  return await factory(context);
}

/**
 * Synchronous version of createService for backward compatibility
 * DEPRECATED: Use async createService instead for new code
 */
export function createServiceSync<T>(
  context: TestContextDI,
  factory: (ctx: TestContextDI) => T
): T {
  return factory(context);
}

/**
 * Creates a diagnostic report for troubleshooting test issues
 * 
 * @param context The test context
 * @param options Options for the report
 * @returns A string with diagnostic information
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
  // Default options
  const includeContainerState = options.includeContainerState !== false;
  const includeServices = options.includeServices !== false;
  const includeMocks = options.includeMocks !== false;
  
  // Build report
  let report = '--- DIAGNOSTIC REPORT ---\n\n';
  
  // Basic info
  report += `DI Mode: ${shouldUseDI() ? 'enabled' : 'disabled'}\n`;
  report += `Context Type: ${context.constructor.name}\n`;
  
  // Container state (for DI mode)
  if (includeContainerState && context.useDI) {
    report += '\nContainer State:\n';
    
    // Get registered tokens
    const tokens = context.container.getRegisteredTokens();
    
    report += `Registered Tokens (${tokens.length}):\n`;
    
    for (const token of tokens) {
      const tokenName = typeof token === 'string' ? token : token.toString();
      report += `- ${tokenName}\n`;
      
      try {
        // Try to resolve the service to check if it's available
        const service = await context.resolve(token);
        report += `  ✓ Resolved: ${service.constructor.name}\n`;
      } catch (error) {
        report += `  ✗ Resolution Failed: ${error.message}\n`;
      }
    }
  }
  
  // Services object (for non-DI mode or diagnostics)
  if (includeServices) {
    report += '\nServices Object:\n';
    
    // Get all property names of the services object
    const serviceNames = Object.keys(context.services);
    
    report += `Services (${serviceNames.length}):\n`;
    
    for (const name of serviceNames) {
      const service = (context.services as any)[name];
      report += `- ${name}: ${service ? service.constructor.name : 'undefined'}\n`;
    }
  }
  
  // Registered mocks
  if (includeMocks && context.registeredMocks && context.registeredMocks.size > 0) {
    report += '\nRegistered Mocks:\n';
    
    // Try to access registered mocks if available
    const mocks = [...context.registeredMocks];
    
    report += `Mocks (${mocks.length}):\n`;
    
    for (const mock of mocks) {
      report += `- ${mock}\n`;
    }
  }
  
  return report;
}

/**
 * Creates a test setup helper
 * 
 * @param options Options for the test setup
 * @returns An object with setup and cleanup functions
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
  return {
    setup: () => {
      // Save current environment
      const originalDI = process.env.USE_DI;
      
      // Set environment based on options
      if (options.useDI !== undefined) {
        process.env.USE_DI = options.useDI ? 'true' : 'false';
      }
      
      // Create context
      const context = new TestContextDI({
        useDI: options.useDI,
        isolatedContainer: options.isolatedContainer
      });
      
      // Restore environment
      process.env.USE_DI = originalDI;
      
      return context;
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
  getServiceSync,
  createServiceMock,
  createService,
  createServiceSync,
  createDiagnosticReport,
  createTestSetup,
  testInBothModes
};