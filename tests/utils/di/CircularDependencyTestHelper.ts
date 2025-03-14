import { DependencyContainer, injectable, injectAll, inject, container } from 'tsyringe';
import TestContainerHelper from './TestContainerHelper';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';

/**
 * Creates a container with circular dependencies configured for testing
 * This is a convenience function for tests
 */
export function createTestContainerWithCircularDeps(): DependencyContainer {
  const testContainer = container.createChildContainer();
  
  // Register our test services for circular dependency testing
  testContainer.register('IServiceE', { useClass: ServiceE });
  testContainer.register('IServiceD', { useClass: ServiceD });
  
  return testContainer;
}

/**
 * Helper for testing circular dependencies in DI container
 * Provides utilities for creating and testing circular dependency scenarios
 */
@injectable()
export class CircularDependencyTestHelper {
  /**
   * Creates a container that will have circular dependencies
   * configured for testing
   */
  static createCircularContainer(): DependencyContainer {
    const containerHelper = TestContainerHelper.createTestContainer();
    const container = containerHelper.getContainer();

    // Register our circular test services
    containerHelper.registerMockClass('IServiceA', ServiceA);
    containerHelper.registerMockClass('IServiceB', ServiceB);
    containerHelper.registerMockClass('IServiceC', ServiceC);
    
    return container;
  }

  /**
   * Detects circular dependencies when resolving a service
   * @param serviceName The name of the service to resolve
   * @returns Object with cycle information and error
   */
  detectCircularDependencies(serviceName: string): { cycle: string[], error?: Error } {
    const container = CircularDependencyTestHelper.createCircularContainer();
    
    try {
      // This will trigger circular dependency detection
      const helper = new TestContainerHelper(container);
      helper.resolve(serviceName);
      
      // If we get here, no circular dependency was detected
      return { cycle: [] };
    } catch (error) {
      // Extract cycle information from the error
      const errorMessage = error.message || '';
      const cycleMatch = errorMessage.match(/Circular dependency detected: (.*)/);
      const cycle = cycleMatch ? cycleMatch[1].split(' -> ') : [];
      
      return { 
        cycle,
        error
      };
    }
  }

  /**
   * Creates a dependency cycle and attempts to resolve it
   * This will throw an error, which is useful for testing error handling
   */
  static createDependencyCycle(container: DependencyContainer): void {
    try {
      // This will trigger circular dependency detection
      const helper = new TestContainerHelper(container);
      helper.resolve<IServiceA>('IServiceA');
    } catch (error) {
      // Re-throw to caller
      throw error;
    }
  }

  /**
   * Creates a dependency cycle with lazy resolution
   * This simulates how circular dependencies can be safely resolved
   * with lazy initialization
   */
  static setupSafeLazyCircularDependencies(container: DependencyContainer): void {
    // Create a helper for registering
    const containerHelper = new TestContainerHelper(container);
    
    // Register with factory functions that use getters for lazy resolution
    containerHelper.registerMockClass('IServiceE', ServiceE);
    containerHelper.registerMockClass('IServiceD', ServiceD);
    
    // Register the resolver with a factory to ensure proper initialization order
    containerHelper.registerFactory('IDependencyHelper', () => {
      const serviceD = containerHelper.resolve<IServiceD>('IServiceD');
      const serviceE = containerHelper.resolve<IServiceE>('IServiceE');
      
      // Create the resolver and manually set up the circular reference
      const resolver = new CircularDependencyResolver(serviceD, serviceE);
      serviceE.useD(serviceD);
      
      return resolver;
    });
  }

  /**
   * Tests if lazy resolution properly handles circular dependencies
   */
  static testLazyCircularDependencies(container: DependencyContainer): boolean {
    try {
      const helper = new TestContainerHelper(container);
      
      // Get all the services explicitly to make sure they're created properly
      const serviceD = helper.resolve<IServiceD>('IServiceD');
      const serviceE = helper.resolve<IServiceE>('IServiceE');
      
      // Make sure E knows about D
      if (!serviceE.getD()) {
        console.error('ServiceE does not have a reference to ServiceD');
        return false;
      }
      
      // Make sure D knows about E
      if (serviceD.getE() !== serviceE) {
        console.error('ServiceD does not have the correct reference to ServiceE');
        return false;
      }
      
      // Now resolve the helper and check
      const resolver = helper.resolve<CircularDependencyResolver>('IDependencyHelper');
      return resolver.canResolveCircularDependencies();
    } catch (error) {
      console.error('Failed to resolve dependency helper:', error);
      return false;
    }
  }

  /**
   * Gets detailed cycle information for testing or debugging
   */
  static getCycleInfo(container: DependencyContainer): object {
    const helper = new TestContainerHelper(container);
    const circularityService = helper.resolve<ICircularityService>('ICircularityService');
    
    try {
      this.createDependencyCycle(container);
      return { 
        hasCycle: false, 
        stack: circularityService.getImportStack() 
      };
    } catch (error) {
      return {
        hasCycle: true,
        error: error.message,
        stack: circularityService.getImportStack()
      };
    } finally {
      circularityService.reset();
    }
  }
}

// Default export
export default CircularDependencyTestHelper;

// Test interfaces for circular dependencies

interface IServiceA {
  getName(): string;
  getB(): IServiceB;
}

interface IServiceB {
  getName(): string;
  getC(): IServiceC;
}

interface IServiceC {
  getName(): string;
  getA(): IServiceA;
}

// Implementation with circular dependencies - will fail
@injectable()
class ServiceA implements IServiceA {
  constructor(@inject('IServiceB') private serviceB: IServiceB) {}
  
  getName(): string {
    return 'ServiceA';
  }
  
  getB(): IServiceB {
    return this.serviceB;
  }
}

@injectable()
class ServiceB implements IServiceB {
  constructor(@inject('IServiceC') private serviceC: IServiceC) {}
  
  getName(): string {
    return 'ServiceB';
  }
  
  getC(): IServiceC {
    return this.serviceC;
  }
}

@injectable()
class ServiceC implements IServiceC {
  constructor(@inject('IServiceA') private serviceA: IServiceA) {}
  
  getName(): string {
    return 'ServiceC';
  }
  
  getA(): IServiceA {
    return this.serviceA;
  }
}

// Implementation with lazy resolution - will work

interface IServiceD {
  getName(): string;
  getE(): IServiceE;
}

interface IServiceE {
  getName(): string;
  // Notice we don't directly inject D
  useD(d: IServiceD): void;
  getD(): IServiceD | null;
}

@injectable()
class ServiceD implements IServiceD {
  constructor(@inject('IServiceE') private serviceE: IServiceE) {}
  
  getName(): string {
    return 'ServiceD';
  }
  
  getE(): IServiceE {
    return this.serviceE;
  }
}

@injectable()
class ServiceE implements IServiceE {
  private serviceD: IServiceD | null = null;
  
  getName(): string {
    return 'ServiceE';
  }
  
  useD(d: IServiceD): void {
    this.serviceD = d;
  }
  
  getD(): IServiceD | null {
    return this.serviceD;
  }
}

@injectable()
class CircularDependencyResolver {
  constructor(
    private serviceD: IServiceD,
    private serviceE: IServiceE
  ) {
    // The circular reference should be set up by the factory
  }
  
  canResolveCircularDependencies(): boolean {
    try {
      // Check if we successfully created a circular reference
      const eFromD = this.serviceD.getE();
      const dFromE = this.serviceE.getD();
      
      console.log('Circular dependency test:', {
        eFromD: !!eFromD,
        dFromE: !!dFromE,
        eFromDMatch: eFromD === this.serviceE,
        dFromEMatch: dFromE === this.serviceD
      });
      
      return (
        !!eFromD && 
        !!dFromE && 
        eFromD === this.serviceE && 
        dFromE === this.serviceD
      );
    } catch (error) {
      console.error('Failed in canResolveCircularDependencies:', error);
      return false;
    }
  }
}