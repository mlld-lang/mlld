/**
 * TestContainerHelper provides utilities for working with the DI container in tests.
 * It allows creating a child container for each test and resetting it between tests.
 */

import { container, DependencyContainer, InjectionToken } from 'tsyringe';
import { shouldUseDI } from '../../../core/ServiceProvider';

/**
 * Creates a child container for testing that isolates registrations from the global container.
 * This is important for test isolation to prevent state leakage between tests.
 */
export class TestContainerHelper {
  private childContainer: DependencyContainer;
  private registeredTokens: Set<InjectionToken<any>> = new Set();
  private isIsolated: boolean = false;
  
  /**
   * Create a new TestContainerHelper
   * @param existingContainer Optional existing container to use
   */
  constructor(existingContainer?: DependencyContainer) {
    // Use existing container or create a child container for test isolation
    this.childContainer = existingContainer || container.createChildContainer();
  }
  
  /**
   * Gets the test container instance
   * @returns The DependencyContainer for this helper
   */
  getContainer(): DependencyContainer {
    return this.childContainer;
  }
  
  /**
   * Registers a mock service implementation in the container
   * 
   * @param token The token to register (class, string, or symbol)
   * @param mockImpl The mock implementation to use
   * @param options Additional registration options
   */
  registerMock<T>(
    token: InjectionToken<T>, 
    mockImpl: T, 
    options: {
      /**
       * Force registration 
       * @deprecated No longer needed in Phase 5 as DI is always enabled
       */
      force?: boolean;
      
      /**
       * Whether to track this registration for reporting
       */
      track?: boolean;
    } = {}
  ): void {
    // Default options
    const track = options.track !== false;
    
    // In Phase 5, DI is always enabled, so we always register
    this.childContainer.registerInstance(token, mockImpl);
    
    // Track this registration if needed
    if (track) {
      this.registeredTokens.add(token);
    }
  }
  
  /**
   * Registers a mock service class in the container
   * 
   * @param token The token to register
   * @param mockClass The mock class to register
   * @param options Additional registration options
   */
  registerMockClass<T>(
    token: InjectionToken<T>, 
    mockClass: new (...args: any[]) => T,
    options: {
      /**
       * Force registration
       * @deprecated No longer needed in Phase 5 as DI is always enabled
       */
      force?: boolean;
      
      /**
       * Whether to track this registration for reporting
       */
      track?: boolean;
    } = {}
  ): void {
    // Default options
    const track = options.track !== false;
    
    // In Phase 5, DI is always enabled, so we always register
    this.childContainer.register(token, { useClass: mockClass });
    
    // Track this registration if needed
    if (track) {
      this.registeredTokens.add(token);
    }
  }
  
  /**
   * Registers a factory function to create a service
   * 
   * @param token The token to register
   * @param factory The factory function to use
   * @param options Additional registration options
   */
  registerFactory<T>(
    token: InjectionToken<T>,
    factory: () => T,
    options: {
      /**
       * Force registration
       * @deprecated No longer needed in Phase 5 as DI is always enabled
       */
      force?: boolean;
      
      /**
       * Whether to track this registration for reporting
       */
      track?: boolean;
    } = {}
  ): void {
    // Default options
    const track = options.track !== false;
    
    // In Phase 5, DI is always enabled, so we always register
    this.childContainer.register(token, { useFactory: factory });
    
    // Track this registration if needed
    if (track) {
      this.registeredTokens.add(token);
    }
  }
  
  /**
   * Registers a service class with a parent container
   * This is used for registering real services that should be available to all child containers
   * 
   * @param token The token to register
   * @param serviceClass The service class to register
   * @param options Additional registration options
   */
  registerParentService<T>(
    token: InjectionToken<T>,
    serviceClass: new (...args: any[]) => T,
    options: {
      /**
       * Force registration
       * @deprecated No longer needed in Phase 5 as DI is always enabled
       */
      force?: boolean;
    } = {}
  ): void {
    // In Phase 5, DI is always enabled, so we always register
    // Don't register with parent if this is an isolated container
    if (this.isIsolated) {
      this.childContainer.register(token, { useClass: serviceClass });
      this.registeredTokens.add(token);
    } else {
      // Register with the parent container to ensure it's available to all child containers
      container.register(token, { useClass: serviceClass });
    }
  }
  
  /**
   * Resets all registrations in this test container
   */
  reset(): void {
    // Create a new child container to reset all registrations
    if (this.isIsolated) {
      // For isolated containers, create a new isolated container
      this.childContainer = TestContainerHelper.createIsolatedContainer().getContainer();
    } else {
      // For normal containers, create a new child container
      this.childContainer = container.createChildContainer();
    }
    
    // Clear tracked registrations
    this.registeredTokens.clear();
  }
  
  /**
   * Clears all instances in the container without creating a new container
   * This is used for test cleanup and is less destructive than reset()
   */
  clearInstances(): void {
    try {
      // For DI containers, we can clear registrations by creating a new container
      if (this.isIsolated) {
        // For isolated containers, create a new isolated container
        this.childContainer = TestContainerHelper.createIsolatedContainer().getContainer();
      } else {
        // For normal containers, create a new child container
        this.childContainer = container.createChildContainer();
      }
      
      // Don't clear tracked registrations since we want to preserve registration info
    } catch (error) {
      console.warn('Failed to clear container instances:', error);
    }
  }
  
  /**
   * Resolves a service from the container
   * 
   * @param token The token to resolve
   * @param options Options for resolution
   * @returns The resolved service
   */
  resolve<T>(
    token: InjectionToken<T>, 
    options: {
      /**
       * Fallback class to use if the token is not registered
       */
      fallbackClass?: new (...args: any[]) => T;
      
      /**
       * Whether to throw an error if DI is disabled
       * @deprecated No longer needed in Phase 5 as DI is always enabled
       */
      throwIfDisabled?: boolean;
      
      /**
       * Error message to show if resolution fails
       */
      errorMessage?: string;
    } = {}
  ): T {
    // Default options
    const fallbackClass = options.fallbackClass;
    const errorMessage = options.errorMessage || 
      `Cannot resolve service '${String(token)}' from container`;
    
    try {
      return this.childContainer.resolve<T>(token);
    } catch (error) {
      // If we have a fallback class and the error is about an unregistered token, use the fallback
      if (fallbackClass && error instanceof Error && 
          error.message.includes('unregistered dependency token')) {
        this.registerMockClass(token, fallbackClass);
        return this.childContainer.resolve<T>(token);
      }
      
      // Provide a more descriptive error message
      if (error instanceof Error) {
        throw new Error(`${errorMessage}: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Determines if a token is registered in the container
   * 
   * @param token The token to check
   * @returns True if the token is registered
   */
  isRegistered(token: InjectionToken<any>): boolean {
    // In Phase 5, DI is always enabled
    return this.childContainer.isRegistered(token);
  }
  
  /**
   * Gets all registered tokens for diagnostic purposes
   * 
   * @returns Array of registered tokens
   */
  getRegisteredTokens(): InjectionToken<any>[] {
    return Array.from(this.registeredTokens);
  }
  
  /**
   * Creates a factory function for creating a TestContainerHelper
   * This is useful for beforeEach/afterEach test setup
   */
  static createTestContainer(): TestContainerHelper {
    return new TestContainerHelper();
  }
  
  /**
   * Creates an isolated container that doesn't inherit from the global container
   * This is useful for tests that need complete isolation
   */
  static createIsolatedContainer(): TestContainerHelper {
    // Create a new container that doesn't inherit from the global one
    const isolatedContainer = new TestContainerHelper();
    isolatedContainer.isIsolated = true;
    return isolatedContainer;
  }
  
  /**
   * Creates a setup helper for vitest tests
   * @param options Options for the test setup
   */
  static createTestSetup(options: {
    /**
     * Create an isolated container instead of a child container
     */
    isolated?: boolean;
  } = {}): {
    setupDI: () => TestContainerHelper;
    resetDI: (helper: TestContainerHelper) => void;
  } {
    return {
      setupDI: () => {
        return options.isolated 
          ? TestContainerHelper.createIsolatedContainer()
          : TestContainerHelper.createTestContainer();
      },
      resetDI: (helper: TestContainerHelper) => {
        helper.reset();
      }
    };
  }
}

export default TestContainerHelper;