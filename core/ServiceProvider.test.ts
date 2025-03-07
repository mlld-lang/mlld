import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  createService,
  resolveService,
  registerServiceInstance,
  registerServiceFactory,
  Service,
  shouldUseDI
} from './ServiceProvider';
import { injectable } from 'tsyringe';

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

class LegacyService {
  private dep: TestService;
  
  initialize(dep: TestService): void {
    this.dep = dep;
  }

  getValue(): string {
    return this.dep.getValue() + '-legacy';
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
    it('should return false when USE_DI is not set', () => {
      delete process.env.USE_DI;
      expect(shouldUseDI()).toBe(false);
    });

    it('should return true when USE_DI is set to "true"', () => {
      process.env.USE_DI = 'true';
      expect(shouldUseDI()).toBe(true);
    });

    it('should return false when USE_DI is set to any other value', () => {
      process.env.USE_DI = 'false';
      expect(shouldUseDI()).toBe(false);
      
      process.env.USE_DI = '1';
      expect(shouldUseDI()).toBe(false);
    });
  });

  describe('createService', () => {
    it('should create service instance directly when DI is disabled', () => {
      delete process.env.USE_DI;
      const service = createService(TestService);
      expect(service).toBeInstanceOf(TestService);
      expect(service.getValue()).toBe('test-value');
    });

    it('should create service instance through DI when DI is enabled', () => {
      process.env.USE_DI = 'true';
      const service = createService(TestService);
      expect(service).toBeInstanceOf(TestService);
      expect(service.getValue()).toBe('test-value');
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
    
    it('should not interfere with class when DI is disabled', () => {
      delete process.env.USE_DI;
      
      const service = createService(DecoratedTestService);
      expect(service).toBeInstanceOf(DecoratedTestService);
      expect(service.getValue()).toBe('decorated-test-value');
      
      // We should not be able to resolve it by token when DI is disabled
      expect(() => resolveService<DecoratedTestService>('DecoratedTestService'))
        .toThrow("Cannot resolve service by token 'DecoratedTestService' when DI is disabled");
    });
  });
  
  describe('registerServiceInstance', () => {
    it('should register an instance with the container when DI is enabled', () => {
      process.env.USE_DI = 'true';
      
      const testInstance = new TestService();
      registerServiceInstance('TestInstance', testInstance);
      
      const resolved = resolveService<TestService>('TestInstance');
      expect(resolved).toBe(testInstance); // Should be the exact same instance
    });
    
    it('should do nothing when DI is disabled', () => {
      delete process.env.USE_DI;
      
      const testInstance = new TestService();
      registerServiceInstance('TestInstance', testInstance);
      
      // Should throw since we can't resolve services by token when DI is disabled
      expect(() => resolveService<TestService>('TestInstance'))
        .toThrow("Cannot resolve service by token 'TestInstance' when DI is disabled");
    });
  });
  
  describe('registerServiceFactory', () => {
    it('should register a factory with the container when DI is enabled', () => {
      process.env.USE_DI = 'true';
      
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
    
    it('should do nothing when DI is disabled', () => {
      delete process.env.USE_DI;
      
      const factory = vi.fn().mockReturnValue(new TestService());
      registerServiceFactory('TestFactory', factory);
      
      // Factory should not be called
      expect(factory).not.toHaveBeenCalled();
      
      // Should throw since we can't resolve services by token when DI is disabled
      expect(() => resolveService<TestService>('TestFactory'))
        .toThrow("Cannot resolve service by token 'TestFactory' when DI is disabled");
    });
  });
});