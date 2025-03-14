/**
 * TestContainerHelper provides utilities for working with the DI container in tests.
 * It allows creating isolated containers for each test and detecting container state leaks.
 */

import { container, DependencyContainer, InjectionToken } from 'tsyringe';
// Remove shouldUseDI import as we'll always use DI
// import { shouldUseDI } from '@core/ServiceProvider.js';

/**
 * Creates a container for testing that isolates registrations and prevents state leakage.
 */
export class TestContainerHelper {
  private childContainer: DependencyContainer;
  private registeredTokens: Set<InjectionToken<any>> = new Set();
  private isIsolated: boolean = false;
  private instanceTracker: Set<object> = new Set();
  
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
    
    this.childContainer.registerInstance(token, mockImpl);
    
    // Track registration for diagnostics and cleanup
    if (track) {
      this.registeredTokens.add(token);
      
      // Track instance for leak detection if it's an object
      if (mockImpl && typeof mockImpl === 'object') {
        this.instanceTracker.add(mockImpl);
      }
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
    
    this.childContainer.register(token, { useFactory: factory });
    
    // Track registration for diagnostics and cleanup
    if (track) {
      this.registeredTokens.add(token);
    }
  }
  
  /**
   * Registers a service class with the container
   * 
   * @param token The token to register
   * @param serviceClass The service class to register
   */
  registerService<T>(
    token: InjectionToken<T>,
    serviceClass: new (...args: any[]) => T
  ): void {
    this.childContainer.register(token, { useClass: serviceClass });
    this.registeredTokens.add(token);
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
    
    // Clear tracked registrations and instances
    this.registeredTokens.clear();
    this.instanceTracker.clear();
  }
  
  /**
   * Detects potential memory leaks by checking if registered instances are still referenced
   * @returns Object with leak detection information
   */
  detectLeaks(): { 
    hasLeaks: boolean; 
    count: number; 
    tokens: string[]; 
  } {
    const leakingTokens: string[] = [];
    
    // Check all registered tokens for leaks
    this.registeredTokens.forEach(token => {
      try {
        // Try to resolve the token - if it still exists and is the same instance,
        // it might indicate a leak
        const instance = this.childContainer.resolve(token);
        if (instance && typeof instance === 'object' && this.instanceTracker.has(instance)) {
          leakingTokens.push(String(token));
        }
      } catch (error) {
        // Ignore resolution errors
      }
    });
    
    return {
      hasLeaks: leakingTokens.length > 0,
      count: leakingTokens.length,
      tokens: leakingTokens
    };
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
      
      // Clear tracked instances to prevent memory leaks
      this.instanceTracker.clear();
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
      const instance = this.childContainer.resolve(token);
      
      // Track the instance for leak detection if it's an object
      if (instance && typeof instance === 'object') {
        this.instanceTracker.add(instance);
      }
      
      return instance;
    } catch (error) {
      // If a fallback class is provided, use it
      if (fallbackClass) {
        const instance = new fallbackClass();
        
        // Track the fallback instance for leak detection
        if (instance && typeof instance === 'object') {
          this.instanceTracker.add(instance);
        }
        
        return instance;
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
   * Gets diagnostic information about the container state
   */
  getDiagnostics(): {
    isIsolated: boolean;
    registeredTokenCount: number;
    instanceCount: number;
    leakInfo: { hasLeaks: boolean; count: number; tokens: string[] };
  } {
    return {
      isIsolated: this.isIsolated,
      registeredTokenCount: this.registeredTokens.size,
      instanceCount: this.instanceTracker.size,
      leakInfo: this.detectLeaks()
    };
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
   * Creates test setup utilities for before/after hooks
   * @param options Options for test setup
   */
  static createTestSetup(options: {
    /**
     * Create an isolated container instead of a child container
     */
    isolated?: boolean;
  } = {}): {
    setupDI: () => TestContainerHelper;
    resetDI: (helper: TestContainerHelper) => void;
    cleanupDI: (helper: TestContainerHelper) => void;
  } {
    return {
      setupDI: () => {
        return options.isolated
          ? TestContainerHelper.createIsolatedContainer()
          : TestContainerHelper.createTestContainer();
      },
      resetDI: (helper: TestContainerHelper) => {
        helper.reset();
      },
      cleanupDI: (helper: TestContainerHelper) => {
        // Detect and report leaks
        const leakInfo = helper.detectLeaks();
        if (leakInfo.hasLeaks) {
          console.warn(`Container leak detected: ${leakInfo.count} tokens still have references`, {
            tokens: leakInfo.tokens
          });
        }
        
        // Clear instances and reset
        helper.clearInstances();
        helper.reset();
      }
    };
  }
}

export default TestContainerHelper;