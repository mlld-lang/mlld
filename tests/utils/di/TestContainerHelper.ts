/**
 * TestContainerHelper provides utilities for working with the DI container in tests.
 * It allows creating a child container for each test and resetting it between tests.
 */

import { container, DependencyContainer, InjectionToken } from 'tsyringe';
// Remove shouldUseDI import as we'll always use DI
// import { shouldUseDI } from '../../../core/ServiceProvider';

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
       * Whether to track this registration for reporting
       */
      track?: boolean;
    } = {}
  ): void {
    // Default options
    const track = options.track !== false;
    
    // Always register - no more conditional logic
    this.childContainer.registerInstance(token, mockImpl);
    
    // Track registration for diagnostics and cleanup
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
       * Whether to track this registration for reporting
       */
      track?: boolean;
    } = {}
  ): void {
    // Default options
    const track = options.track !== false;
    
    // Always register - no more conditional logic
    this.childContainer.register(token, { useClass: mockClass });
    
    // Track registration for diagnostics and cleanup
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
       * Whether to track this registration for reporting
       */
      track?: boolean;
    } = {}
  ): void {
    // Default options
    const track = options.track !== false;
    
    // Always register - no more conditional logic
    this.childContainer.register(token, { useFactory: factory });
    
    // Track registration for diagnostics and cleanup
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
   */
  registerParentService<T>(
    token: InjectionToken<T>,
    serviceClass: new (...args: any[]) => T
  ): void {
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
      return this.childContainer.resolve(token);
    } catch (error) {
      // If a fallback class is provided, use it
      if (fallbackClass) {
        return new fallbackClass();
      }
      
      // Otherwise, throw an error with the provided message
      throw new Error(errorMessage);
    }
  }
  
  /**
   * Checks if a token is registered in the container
   */
  isRegistered(token: InjectionToken<any>): boolean {
    return this.childContainer.isRegistered(token);
  }
  
  /**
   * Gets all registered tokens for this container
   */
  getRegisteredTokens(): InjectionToken<any>[] {
    return [...this.registeredTokens];
  }
  
  /**
   * Creates a new test container helper with a child container
   */
  static createTestContainer(): TestContainerHelper {
    return new TestContainerHelper(container.createChildContainer());
  }
  
  /**
   * Creates a new isolated test container that doesn't share parent registrations
   */
  static createIsolatedContainer(): TestContainerHelper {
    const helper = new TestContainerHelper(container.createChildContainer());
    helper.isIsolated = true;
    return helper;
  }
  
  /**
   * Creates a test setup with setup and teardown functions
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
    const isolated = options.isolated === true;
    
    return {
      setupDI: () => {
        return isolated 
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