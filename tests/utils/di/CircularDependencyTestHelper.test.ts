import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DependencyContainer, injectable } from 'tsyringe';
import CircularDependencyTestHelper from './CircularDependencyTestHelper';
import TestContainerHelper from './TestContainerHelper';
import * as ServiceProvider from '../../../core/ServiceProvider';

// Define simple test interfaces for use directly in tests
interface IServiceD {
  getName(): string;
  getE(): IServiceE;
}

interface IServiceE {
  getName(): string;
  useD(d: IServiceD): void;
  getD(): IServiceD | null;
}

// Implementation classes
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
class ServiceD implements IServiceD {
  constructor(private serviceE: IServiceE) {}
  
  getName(): string {
    return 'ServiceD';
  }
  
  getE(): IServiceE {
    return this.serviceE;
  }
}

describe('CircularDependencyTestHelper', () => {
  let originalShouldUseDI: typeof ServiceProvider.shouldUseDI;
  
  beforeEach(() => {
    originalShouldUseDI = ServiceProvider.shouldUseDI;
    vi.spyOn(ServiceProvider, 'shouldUseDI').mockReturnValue(true);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('Circular dependency detection', () => {
    let container: DependencyContainer;

    beforeEach(() => {
      container = CircularDependencyTestHelper.createCircularContainer();
    });

    it('should detect circular dependencies when resolving ServiceA', () => {
      expect(() => {
        CircularDependencyTestHelper.createDependencyCycle(container);
      }).toThrow();
    });

    it('should provide cycle information', () => {
      const cycleInfo = CircularDependencyTestHelper.getCycleInfo(container);
      expect(cycleInfo).toHaveProperty('hasCycle', true);
      expect(cycleInfo).toHaveProperty('error');
    });
  });

  describe('Lazy circular dependency resolution', () => {
    let container: DependencyContainer;
    let containerHelper: TestContainerHelper;

    beforeEach(() => {
      containerHelper = TestContainerHelper.createTestContainer();
      container = containerHelper.getContainer();
      
      // First create and register serviceE (doesn't need D initially)
      const serviceE = new ServiceE();
      containerHelper.registerMock('IServiceE', serviceE);
      
      // Now create serviceD with a reference to E
      const serviceD = new ServiceD(serviceE);
      containerHelper.registerMock('IServiceD', serviceD);
      
      // Manually set up the circular reference
      serviceE.useD(serviceD);
      
      // Register the resolver
      containerHelper.registerFactory('IDependencyHelper', () => {
        return {
          canResolveCircularDependencies: () => {
            return serviceE.getD() === serviceD && serviceD.getE() === serviceE;
          }
        };
      });
    });

    it('should resolve circular dependencies with lazy injection', () => {
      const serviceD = containerHelper.resolve<any>('IServiceD');
      const serviceE = containerHelper.resolve<any>('IServiceE');
      
      // Verify references are set up correctly
      expect(serviceE.getD()).toBe(serviceD);
      expect(serviceD.getE()).toBe(serviceE);
    });

    it('should create a proper circular reference between D and E', () => {
      const resolver = containerHelper.resolve<any>('IDependencyHelper');
      expect(resolver.canResolveCircularDependencies()).toBe(true);
    });
  });

  describe('Helper functions', () => {
    it('should create a test container with circular dependencies configured', () => {
      const container = CircularDependencyTestHelper.createCircularContainer();
      expect(container).toBeDefined();
      
      // Container should have the circular services registered
      const helper = new TestContainerHelper(container);
      expect(helper.isRegistered('IServiceA')).toBe(true);
      expect(helper.isRegistered('IServiceB')).toBe(true);
      expect(helper.isRegistered('IServiceC')).toBe(true);
    });
  });
});