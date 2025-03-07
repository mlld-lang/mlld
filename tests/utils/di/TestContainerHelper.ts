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
  
  constructor() {
    // Create a child container for test isolation
    this.childContainer = container.createChildContainer();
  }
  
  /**
   * Gets the test container instance
   */
  getContainer(): DependencyContainer {
    return this.childContainer;
  }
  
  /**
   * Registers a mock service implementation in the container
   * 
   * @param token The token to register (class, string, or symbol)
   * @param mockImpl The mock implementation to use
   */
  registerMock<T>(token: InjectionToken<T>, mockImpl: T): void {
    // Only register if DI is enabled
    if (shouldUseDI()) {
      this.childContainer.registerInstance(token, mockImpl);
    }
  }
  
  /**
   * Registers a mock service class in the container
   * 
   * @param token The token to register
   * @param mockClass The mock class to register
   */
  registerMockClass<T>(token: InjectionToken<T>, mockClass: new (...args: any[]) => T): void {
    // Only register if DI is enabled
    if (shouldUseDI()) {
      this.childContainer.register(token, { useClass: mockClass });
    }
  }
  
  /**
   * Registers a service class with a parent container
   * This is used for registering real services that should be available in the child container
   * 
   * @param token The token to register
   * @param serviceClass The service class to register
   */
  registerParentService<T>(
    token: InjectionToken<T>,
    serviceClass: new (...args: any[]) => T
  ): void {
    if (shouldUseDI()) {
      // Register with the parent container to ensure it's available to all child containers
      container.register(token, { useClass: serviceClass });
    }
  }
  
  /**
   * Resets all registrations in this test container
   */
  reset(): void {
    // Create a new child container to reset all registrations
    this.childContainer = container.createChildContainer();
  }
  
  /**
   * Resolves a service from the container
   * 
   * @param token The token to resolve
   * @param fallbackClass Optional fallback class to use if the token is not registered
   * @returns The resolved service
   */
  resolve<T>(token: InjectionToken<T>, fallbackClass?: new (...args: any[]) => T): T {
    if (!shouldUseDI()) {
      throw new Error(`Cannot resolve services in tests when DI is disabled`);
    }
    
    try {
      return this.childContainer.resolve<T>(token);
    } catch (error) {
      // If we have a fallback class and the error is about an unregistered token, use the fallback
      if (fallbackClass && error instanceof Error && 
          error.message.includes('unregistered dependency token')) {
        this.registerMockClass(token, fallbackClass);
        return this.childContainer.resolve<T>(token);
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
    if (!shouldUseDI()) {
      return false;
    }
    return this.childContainer.isRegistered(token);
  }
  
  /**
   * Creates a factory function for creating a TestContainerHelper
   * This is useful for beforeEach/afterEach test setup
   */
  static createTestContainer(): TestContainerHelper {
    return new TestContainerHelper();
  }
  
  /**
   * Creates a setup helper for vitest tests
   */
  static createTestSetup(): {
    setupDI: () => TestContainerHelper;
    resetDI: (helper: TestContainerHelper) => void;
  } {
    return {
      setupDI: () => {
        return TestContainerHelper.createTestContainer();
      },
      resetDI: (helper: TestContainerHelper) => {
        helper.reset();
      }
    };
  }
}

export default TestContainerHelper;