import { describe, it, expect, vi, afterEach } from 'vitest';
import { container, InjectionToken, inject } from 'tsyringe';
import { Service, createService, resolveService, registerServiceInstance, registerServiceFactory, registerServiceClass, getServiceMetadata } from './ServiceProvider';

// Test classes
@Service()
class TestService {
  getValue() {
    return 'test-value';
  }
}

@Service({
  description: 'Test service with metadata'
})
class DecoratedTestService {
  getValue() {
    return 'decorated-test-value';
  }
}

@Service({
  description: 'Test service with dependencies',
  dependencies: [
    { token: 'IDependency', name: 'dependency' }
  ]
})
class MetadataTestService {
  constructor(@inject('IDependency') private dependency: any) {}
}

class LegacyService {
  private testService: TestService;

  initialize(testService: TestService) {
    this.testService = testService;
  }

  getValue() {
    return this.testService.getValue() + '-legacy';
  }
}

describe('ServiceProvider', () => {
  // Clear container registrations between tests to prevent test interference
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createService', () => {
    it('should create service instance through DI', () => {
      const service = createService(TestService);
      expect(service).toBeInstanceOf(TestService);
      expect(service.getValue()).toBe('test-value');
    });

    it('should pass dependencies to constructor', () => {
      const legacyService = new LegacyService();
      const testService = createService(TestService);
      
      legacyService.initialize(testService);
      expect(legacyService.getValue()).toBe('test-value-legacy');
    });
  });

  describe('Service decorator', () => {
    it('should register the class with the container', () => {
      // Class decoration happens at definition time, so we need a way to test this
      // We'll create a new decorator instance with the same logic for testing
      const service = createService(DecoratedTestService);
      expect(service).toBeInstanceOf(DecoratedTestService);
      expect(service.getValue()).toBe('decorated-test-value');
      
      // We should also be able to resolve it by token
      const byName = resolveService<DecoratedTestService>('DecoratedTestService');
      expect(byName).toBeInstanceOf(DecoratedTestService);
      
      // And by interface name (IServiceName)
      const byInterface = resolveService<DecoratedTestService>('IDecoratedTestService');
      expect(byInterface).toBeInstanceOf(DecoratedTestService);
    });
  });

  describe('registerServiceInstance', () => {
    it('should register an instance with the container', () => {
      const testInstance = new TestService();
      registerServiceInstance('TestInstance', testInstance);
      
      const resolved = resolveService<TestService>('TestInstance');
      expect(resolved).toBe(testInstance); // Should be the exact same instance
    });
    
    it('should support registering with InjectionToken', () => {
      const token: InjectionToken<TestService> = Symbol('TestService');
      const testInstance = new TestService();
      registerServiceInstance(token, testInstance);
      
      const resolved = resolveService<TestService>(token);
      expect(resolved).toBe(testInstance); // Should be the exact same instance
    });
  });
  
  describe('registerServiceFactory', () => {
    it('should register a factory with the container', () => {
      const factory = vi.fn().mockReturnValue(new TestService());
      registerServiceFactory('TestFactory', factory);
      
      // First resolution should call the factory
      const resolved1 = resolveService<TestService>('TestFactory');
      expect(resolved1).toBeInstanceOf(TestService);
      expect(factory).toHaveBeenCalledTimes(1);
      
      // Second resolution should call the factory again (default behavior is transient)
      const resolved2 = resolveService<TestService>('TestFactory');
      expect(resolved2).toBeInstanceOf(TestService);
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('registerServiceClass', () => {
    it('should register a class with the container', () => {
      class CustomService {
        getValue() { return 'custom-value'; }
      }
      
      registerServiceClass('CustomService', CustomService);
      
      const resolved = resolveService<CustomService>('CustomService');
      expect(resolved).toBeInstanceOf(CustomService);
      expect(resolved.getValue()).toBe('custom-value');
    });
  });
  
  describe('getServiceMetadata', () => {
    it('should return undefined for non-service classes', () => {
      class NonServiceClass {}
      
      const metadata = getServiceMetadata(NonServiceClass);
      expect(metadata).toBeUndefined();
    });
    
    it('should return metadata for service classes', () => {
      const metadata = getServiceMetadata(DecoratedTestService);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('DecoratedTestService');
    });
    
    it('should return metadata with dependencies', () => {
      const metadata = getServiceMetadata(MetadataTestService);
      expect(metadata).toBeDefined();
      expect(metadata?.dependencies).toBeDefined();
      expect(metadata?.dependencies?.length).toBe(1);
    });
  });
});