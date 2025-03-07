import { DependencyContainer, injectable, injectAll, inject } from 'tsyringe';
import TestContainerHelper from './TestContainerHelper';
import { ICircularityService } from '../../../services/resolution/CircularityService/ICircularityService';

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
    containerHelper.registerMockClass('IServiceD', ServiceD);
    containerHelper.registerMockClass('IServiceE', ServiceE);
    containerHelper.registerMockClass('IDependencyHelper', CircularDependencyResolver);
  }

  /**
   * Tests if lazy resolution properly handles circular dependencies
   */
  static testLazyCircularDependencies(container: DependencyContainer): boolean {
    try {
      const helper = new TestContainerHelper(container);
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
    @inject('IServiceD') private serviceD: IServiceD,
    @inject('IServiceE') private serviceE: IServiceE
  ) {
    // Set up the circular reference after construction
    this.serviceE.useD(this.serviceD);
  }
  
  canResolveCircularDependencies(): boolean {
    try {
      // Check if we successfully created a circular reference
      const eFromD = this.serviceD.getE();
      const dFromE = this.serviceE.getD();
      
      return (
        eFromD === this.serviceE &&
        dFromE === this.serviceD
      );
    } catch (error) {
      console.error('Failed in canResolveCircularDependencies:', error);
      return false;
    }
  }
}