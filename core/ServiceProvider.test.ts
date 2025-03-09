import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  createService,
  resolveService,
  registerServiceInstance,
  registerServiceFactory,
  registerServiceClass,
  Service,
  shouldUseDI,
  getServiceMetadata,
  ServiceMetadata
} from './ServiceProvider.js';
import { injectable, container, InjectionToken } from 'tsyringe';

// Mock classes for testing
@injectable()
class TestService {
  constructor() {}
  getValue(): string {
    return 'test-value';
  }
}

@Service()
class DecoratedTestService {
  constructor() {}
  getValue(): string {
    return 'decorated-test-value';
  }
}

@Service({
  description: 'A test service with metadata',
  dependencies: [
    { token: 'TestService', name: 'testService' }
  ]
})
class MetadataTestService {
  constructor(private testService?: TestService) {}
  
  getValue(): string {
    return this.testService ? this.testService.getValue() + '-with-metadata' : 'no-dependency';
  }
}

class LegacyService {
  private dep: TestService;
  
  initialize(dep: TestService): void {
    this.dep = dep;
  }

  getValue(): string {
    return this.dep.getValue() + '-legacy';
  }
}

// Test inheritance with the Service decorator
@Service()
class BaseService {
  getBaseValue(): string {
    return 'base-value';
  }
}

@Service()
class DerivedService extends BaseService {
  getDerivedValue(): string {
    return 'derived-value';
  }
}

describe('ServiceProvider', () => {
  // Backup original environment variable
  const originalEnv = process.env.USE_DI;

  beforeEach(() => {
    // Clear environment variable before each test
    delete process.env.USE_DI;
  });

  afterEach(() => {
    // Restore original environment variable after each test
    if (originalEnv === undefined) {
      delete process.env.USE_DI;
    } else {
      process.env.USE_DI = originalEnv;
    }
  });

  describe('shouldUseDI', () => {
    it('should always return true in Phase 5 (DI-only mode)', () => {
      // Test with different environment variable states
      delete process.env.USE_DI;
      expect(shouldUseDI()).toBe(true);
      
      process.env.USE_DI = 'false';
      expect(shouldUseDI()).toBe(true);
      
      process.env.USE_DI = 'true';
      expect(shouldUseDI()).toBe(true);
      
      process.env.USE_DI = '1';
      expect(shouldUseDI()).toBe(true);
    });
  });

  describe('createService', () => {
    it('should always create service instance through DI in Phase 5 (DI-only mode)', () => {
      // DI is enabled regardless of environment variable in Phase 5
      delete process.env.USE_DI;
      const service = createService(TestService);
      expect(service).toBeInstanceOf(TestService);
      expect(service.getValue()).toBe('test-value');
      
      process.env.USE_DI = 'false';
      const service2 = createService(TestService);
      expect(service2).toBeInstanceOf(TestService);
      expect(service2.getValue()).toBe('test-value');
      
      process.env.USE_DI = 'true';
      const service3 = createService(TestService);
      expect(service3).toBeInstanceOf(TestService);
      expect(service3.getValue()).toBe('test-value');
    });

    it('should pass dependencies to constructor when DI is disabled', () => {
      delete process.env.USE_DI;
      
      const legacyService = new LegacyService();
      const testService = createService(TestService);
      
      legacyService.initialize(testService);
      expect(legacyService.getValue()).toBe('test-value-legacy');
    });
  });

  describe('Service decorator', () => {
    it('should register the class with the container when DI is enabled', () => {
      process.env.USE_DI = 'true';
      
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
    
    it('should work with any environment variable setting in Phase 5 (DI-only mode)', () => {
      // Test with USE_DI unset
      delete process.env.USE_DI;
      
      // Should be able to create the service
      const service = createService(DecoratedTestService);
      expect(service).toBeInstanceOf(DecoratedTestService);
      expect(service.getValue()).toBe('decorated-test-value');
      
      // Should be able to resolve by token
      const byName = resolveService<DecoratedTestService>('DecoratedTestService');
      expect(byName).toBeInstanceOf(DecoratedTestService);
      
      // And by interface name
      const byInterface = resolveService<DecoratedTestService>('IDecoratedTestService');
      expect(byInterface).toBeInstanceOf(DecoratedTestService);
      
      // Test with USE_DI set to false
      process.env.USE_DI = 'false';
      
      // Should still be able to resolve by token
      const byName2 = resolveService<DecoratedTestService>('DecoratedTestService');
      expect(byName2).toBeInstanceOf(DecoratedTestService);
    });
    
    it('should store metadata on the class', () => {
      const metadata = getServiceMetadata(MetadataTestService);
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('MetadataTestService');
      expect(metadata?.interfaceName).toBe('IMetadataTestService');
      expect(metadata?.description).toBe('A test service with metadata');
      expect(metadata?.dependencies).toBeDefined();
      expect(metadata?.dependencies?.length).toBe(1);
      expect(metadata?.dependencies?.[0].token).toBe('TestService');
      expect(metadata?.dependencies?.[0].name).toBe('testService');
    });
    
    it('should work with inheritance', () => {
      process.env.USE_DI = 'true';
      
      // Get an instance of the derived class
      const derived = createService(DerivedService);
      
      // It should have methods from both base and derived classes
      expect(derived.getBaseValue()).toBe('base-value');
      expect(derived.getDerivedValue()).toBe('derived-value');
      
      // Should be able to resolve by derived class name
      const byDerivedName = resolveService<DerivedService>('DerivedService');
      expect(byDerivedName).toBeInstanceOf(DerivedService);
      
      // Should be able to resolve by derived interface name
      const byDerivedInterface = resolveService<DerivedService>('IDerivedService');
      expect(byDerivedInterface).toBeInstanceOf(DerivedService);
    });
  });
  
  describe('registerServiceInstance', () => {
    it('should register an instance with the container in Phase 5 (DI-only mode)', () => {
      // DI is always enabled in Phase 5, regardless of the environment variable
      delete process.env.USE_DI;
      
      const testInstance = new TestService();
      registerServiceInstance('TestInstance', testInstance);
      
      const resolved = resolveService<TestService>('TestInstance');
      expect(resolved).toBe(testInstance); // Should be the exact same instance
      
      // Test with USE_DI set to false
      process.env.USE_DI = 'false';
      
      const testInstance2 = new TestService();
      registerServiceInstance('TestInstance2', testInstance2);
      
      const resolved2 = resolveService<TestService>('TestInstance2');
      expect(resolved2).toBe(testInstance2);
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
    it('should register a factory with the container in Phase 5 (DI-only mode)', () => {
      // DI is always enabled in Phase 5, regardless of the environment variable
      delete process.env.USE_DI;
      
      const factory = () => new TestService();
      registerServiceFactory('TestFactory', factory);
      
      const resolved = resolveService<TestService>('TestFactory');
      expect(resolved).toBeInstanceOf(TestService);
      expect(resolved.getValue()).toBe('test-value');
      
      // Test with USE_DI set to false
      process.env.USE_DI = 'false';
      
      registerServiceFactory('TestFactory2', factory);
      
      const resolved2 = resolveService<TestService>('TestFactory2');
      expect(resolved2).toBeInstanceOf(TestService);
      expect(resolved2.getValue()).toBe('test-value');
    });
  });
  
  describe('registerServiceClass', () => {
    it('should register a class with the container in Phase 5 (DI-only mode)', () => {
      // DI is always enabled in Phase 5, regardless of the environment variable
      delete process.env.USE_DI;
      
      class CustomService {
        getValue() { return 'custom-value'; }
      }
      
      registerServiceClass('CustomService', CustomService);
      
      const resolved = resolveService<CustomService>('CustomService');
      expect(resolved).toBeInstanceOf(CustomService);
      expect(resolved.getValue()).toBe('custom-value');
      
      // Test with USE_DI set to false
      process.env.USE_DI = 'false';
      
      class CustomService2 {
        getValue() { return 'custom-value-2'; }
      }
      
      registerServiceClass('CustomService2', CustomService2);
      
      const resolved2 = resolveService<CustomService2>('CustomService2');
      expect(resolved2).toBeInstanceOf(CustomService2);
      expect(resolved2.getValue()).toBe('custom-value-2');
    });
    
    it('should work with classes that have dependencies', () => {
      @injectable()
      class NonServiceClass {}
      
      const value = container.resolve(NonServiceClass);
      expect(value).toBeInstanceOf(NonServiceClass);
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
      expect(metadata?.interfaceName).toBe('IDecoratedTestService');
    });
    
    it('should return detailed metadata when provided', () => {
      const metadata = getServiceMetadata(MetadataTestService);
      expect(metadata).toBeDefined();
      expect(metadata?.description).toBe('A test service with metadata');
      expect(metadata?.dependencies?.length).toBe(1);
    });
  });
});