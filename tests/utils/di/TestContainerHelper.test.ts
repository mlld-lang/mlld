import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TestContainerHelper } from './TestContainerHelper';
import { Service, shouldUseDI } from '../../../core/ServiceProvider';
import { injectable, container } from 'tsyringe';

// Mock services for testing
@injectable()
class TestService {
  getValue(): string {
    return 'original';
  }
}

@Service()
class DecoratedService {
  getValue(): string {
    return 'decorated';
  }
}

// Mock implementation for testing
class MockTestService {
  getValue(): string {
    return 'mocked';
  }
}

describe('TestContainerHelper', () => {
  // Backup original environment variable
  const originalEnv = process.env.USE_DI;
  let containerHelper: TestContainerHelper;

  beforeEach(() => {
    // Enable DI for tests
    process.env.USE_DI = 'true';
    containerHelper = new TestContainerHelper();
    
    // Register test services in the parent container
    containerHelper.registerParentService('TestService', TestService);
    container.register(DecoratedService, { useClass: DecoratedService });
  });

  afterEach(() => {
    // Reset the container to clear test registrations
    containerHelper.reset();
    
    // Restore original environment variable after each test
    if (originalEnv === undefined) {
      delete process.env.USE_DI;
    } else {
      process.env.USE_DI = originalEnv;
    }
  });

  describe('registerMock', () => {
    it('should register a mock implementation for a service', () => {
      // Create a mock implementation
      const mockService = new MockTestService();
      
      // Register it with the container
      containerHelper.registerMock('TestService', mockService);
      
      // Resolve it from the container
      const resolved = containerHelper.resolve<MockTestService>('TestService');
      
      // Verify it's the same instance we registered
      expect(resolved).toBe(mockService);
      expect(resolved.getValue()).toBe('mocked');
    });
    
    it('should not affect the global container', () => {
      // Create a mock implementation
      const mockService = new MockTestService();
      
      // Register it with the test container
      containerHelper.registerMock('TestService', mockService);
      
      // Create a new container helper (which uses a new child container)
      const anotherHelper = new TestContainerHelper();
      
      // Resolve the service from the new container
      const resolved = anotherHelper.resolve<TestService>('TestService');
      
      // Should get the original service, not our mock
      expect(resolved).not.toBe(mockService);
      expect(resolved).toBeInstanceOf(TestService);
      expect(resolved.getValue()).toBe('original');
    });
    
    it('should do nothing when DI is disabled', () => {
      // Disable DI
      process.env.USE_DI = 'false';
      
      // Create a mock implementation
      const mockService = new MockTestService();
      
      // Try to register it
      containerHelper.registerMock('TestService', mockService);
      
      // Enable DI again for verification
      process.env.USE_DI = 'true';
      
      // Should not have registered the mock
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).not.toBe(mockService);
      expect(resolved).toBeInstanceOf(TestService);
      expect(resolved.getValue()).toBe('original');
    });
  });
  
  describe('registerMockClass', () => {
    it('should register a mock class for a service', () => {
      // Register a mock class
      containerHelper.registerMockClass('TestService', MockTestService);
      
      // Resolve the service from the container
      const resolved = containerHelper.resolve<MockTestService>('TestService');
      
      // Should get an instance of our mock class
      expect(resolved).toBeInstanceOf(MockTestService);
      expect(resolved.getValue()).toBe('mocked');
    });
    
    it('should do nothing when DI is disabled', () => {
      // Disable DI
      process.env.USE_DI = 'false';
      
      // Try to register a mock class
      containerHelper.registerMockClass('TestService', MockTestService);
      
      // Enable DI again for verification
      process.env.USE_DI = 'true';
      
      // Should not have registered the mock
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).not.toBeInstanceOf(MockTestService);
      expect(resolved).toBeInstanceOf(TestService);
      expect(resolved.getValue()).toBe('original');
    });
  });
  
  describe('registerParentService', () => {
    it('should register a service in the parent container', () => {
      // Create a new service
      class ParentService {
        getValue() { return 'parent'; }
      }
      
      // Register it with the parent container
      containerHelper.registerParentService('ParentService', ParentService);
      
      // Create a new container helper
      const anotherHelper = new TestContainerHelper();
      
      // Should be able to resolve the service from the new container
      const resolved = anotherHelper.resolve<ParentService>('ParentService');
      expect(resolved).toBeInstanceOf(ParentService);
      expect(resolved.getValue()).toBe('parent');
    });
  });
  
  describe('reset', () => {
    it('should clear mock registrations', () => {
      // Register a mock
      containerHelper.registerMock('TestService', new MockTestService());
      
      // Reset the container
      containerHelper.reset();
      
      // Should get the original service, not our mock
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBeInstanceOf(TestService);
      expect(resolved.getValue()).toBe('original');
    });
  });
  
  describe('resolve', () => {
    it('should resolve services from the container', () => {
      // Resolve a service
      const service = containerHelper.resolve<DecoratedService>(DecoratedService);
      
      // Should get an instance of the service
      expect(service).toBeInstanceOf(DecoratedService);
      expect(service.getValue()).toBe('decorated');
    });
    
    it('should use fallback class if provided and token is not registered', () => {
      // Try to resolve a service that isn't registered
      const service = containerHelper.resolve<MockTestService>('UnregisteredService', MockTestService);
      
      // Should get an instance of the fallback class
      expect(service).toBeInstanceOf(MockTestService);
      expect(service.getValue()).toBe('mocked');
    });
    
    it('should throw an error when DI is disabled', () => {
      // Disable DI
      process.env.USE_DI = 'false';
      
      // Should throw an error
      expect(() => containerHelper.resolve<TestService>('TestService'))
        .toThrow('Cannot resolve services in tests when DI is disabled');
    });
  });
  
  describe('isRegistered', () => {
    it('should return true for registered tokens', () => {
      // Directly register in the child container to test isRegistered
      containerHelper.registerMockClass('TestServiceDirect', TestService);
      expect(containerHelper.isRegistered('TestServiceDirect')).toBe(true);
    });
    
    it('should return false for unregistered tokens', () => {
      expect(containerHelper.isRegistered('UnregisteredService')).toBe(false);
    });
    
    it('should return false when DI is disabled', () => {
      process.env.USE_DI = 'false';
      expect(containerHelper.isRegistered('TestService')).toBe(false);
    });
  });
  
  describe('static methods', () => {
    it('createTestContainer should create a new TestContainerHelper', () => {
      const helper = TestContainerHelper.createTestContainer();
      expect(helper).toBeInstanceOf(TestContainerHelper);
    });
    
    it('createTestSetup should return setup and reset functions', () => {
      const { setupDI, resetDI } = TestContainerHelper.createTestSetup();
      
      // setupDI should create a new TestContainerHelper
      const helper = setupDI();
      expect(helper).toBeInstanceOf(TestContainerHelper);
      
      // Register a mock
      helper.registerMock('TestService', new MockTestService());
      
      // resetDI should reset the container
      resetDI(helper);
      
      // Should get the original service if we register it first
      helper.registerMockClass('TestService', TestService);
      const resolved = helper.resolve<TestService>('TestService');
      expect(resolved).toBeInstanceOf(TestService);
      expect(resolved.getValue()).toBe('original');
    });
  });
});