import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';
import { TestContainerHelper } from '@tests/utils/di/TestContainerHelper.js';
import { Service } from '@core/ServiceProvider.js';

// Test classes for dependency injection
@Service()
class TestService {
  getValue(): string {
    return 'original';
  }

  getType(): string {
    return 'TestService';
  }
}

@Service()
class MockTestService {
  getValue(): string {
    return 'mock';
  }

  getType(): string {
    return 'MockTestService';
  }
}

@Service()
class TestDependency {
  getName(): string {
    return 'dependency';
  }
}

@Service()
class TestServiceWithDependency {
  constructor(private dependency: TestDependency) {}

  getDependencyName(): string {
    return this.dependency.getName();
  }
}

describe('TestContainerHelper', () => {
  let containerHelper: TestContainerHelper;

  beforeEach(() => {
    containerHelper = new TestContainerHelper();
  });

  afterEach(() => {
    // Reset container to make sure tests don't affect each other
    containerHelper.reset();
  });

  describe('registerMock', () => {
    it('should register a mock implementation for a service', () => {
      // Create a mock service
      const mockService = new MockTestService();

      // Register it with the container
      containerHelper.registerMock('TestService', mockService);

      // Should be able to resolve the mock
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBe(mockService);
      expect(resolved.getValue()).toBe('mock');
    });

    it('should not affect the global container', () => {
      // Create a mock service
      const mockService = new MockTestService();

      // Register it with the container
      containerHelper.registerMock('TestService', mockService);

      // Create another container that doesn't inherit from this one
      const newHelper = TestContainerHelper.createIsolatedContainer();
      
      // The new container shouldn't have access to the registered mock
      const result = newHelper.isRegistered('TestService');
      expect(result).toBe(false);
    });
  });

  describe('registerMockClass', () => {
    it('should register a mock class for a service', () => {
      // Register mock class with the container
      containerHelper.registerMockClass('TestService', MockTestService);

      // Should instantiate the mock class
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBeInstanceOf(MockTestService);
      expect(resolved.getValue()).toBe('mock');
    });
  });

  describe('registerService', () => {
    it('should register a service in the parent container', () => {
      // Register a parent service
      containerHelper.registerService('ParentService', TestService);

      // Should be able to resolve from the child container
      expect(containerHelper.resolve('ParentService')).toBeInstanceOf(TestService);
    });
  });

  describe('reset', () => {
    it('should clear mock registrations', () => {
      // Register a mock
      containerHelper.registerMock('TestService', new MockTestService());
      
      // Verify it's registered
      expect(containerHelper.isRegistered('TestService')).toBe(true);

      // Reset the container
      containerHelper.reset();

      // Should no longer be registered
      expect(containerHelper.isRegistered('TestService')).toBe(false);
      
      // Should use fallback if we try to resolve it
      const fallback = new TestService();
      const resolved = containerHelper.resolve('TestService', { 
        fallbackClass: TestService,
        errorMessage: 'Custom error'
      });
      expect(resolved).not.toBeInstanceOf(MockTestService);
      expect(resolved).toBeInstanceOf(TestService);
    });
  });

  describe('resolve', () => {
    it('should resolve services from the container', () => {
      // Register a mock service
      const mockService = new MockTestService();
      containerHelper.registerMock('TestService', mockService);

      // Should be able to resolve it
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBe(mockService);
    });

    it('should use fallback class if provided and token is not registered', () => {
      // Resolve with fallback
      const resolved = containerHelper.resolve<TestService>('UnknownService', {
        fallbackClass: TestService
      });

      // Should use the fallback class
      expect(resolved).toBeInstanceOf(TestService);
      expect(resolved.getValue()).toBe('original');
    });
  });

  describe('isRegistered', () => {
    it('should return true for registered tokens', () => {
      // Register a service
      containerHelper.registerMock('TestService', new TestService());

      // Should return true
      expect(containerHelper.isRegistered('TestService')).toBe(true);
    });

    it('should return false for unregistered tokens', () => {
      // Should return false for unregistered tokens
      expect(containerHelper.isRegistered('UnknownService')).toBe(false);
    });

    it('should return false for unknown services', () => {
      // Just check that unregistered tokens return false
      expect(containerHelper.isRegistered('AnotherUnknownService')).toBe(false);
    });
  });

  describe('static methods', () => {
    it('createTestContainer should create a new TestContainerHelper', () => {
      // Should create a new helper
      const helper = TestContainerHelper.createTestContainer();
      expect(helper).toBeInstanceOf(TestContainerHelper);
    });

    it('createTestSetup should return setup and reset functions', () => {
      // Should return setup and reset functions
      const { setupDI, resetDI } = TestContainerHelper.createTestSetup();
      expect(typeof setupDI).toBe('function');
      expect(typeof resetDI).toBe('function');

      // Setup should create a new helper
      const helper = setupDI();
      expect(helper).toBeInstanceOf(TestContainerHelper);

      // Register a mock
      helper.registerMock('TestService', new MockTestService());
      expect(helper.isRegistered('TestService')).toBe(true);
      
      // Reset should clear registrations
      resetDI(helper);
      expect(helper.isRegistered('TestService')).toBe(false);
    });
  });
});