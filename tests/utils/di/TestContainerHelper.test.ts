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
    it('should register a mock implementation', () => {
      // Create a mock implementation
      const mockService = new MockTestService();
      
      // Register it
      containerHelper.registerMock('TestService', mockService);
      
      // Resolve it
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBe(mockService); 
      expect(resolved.getValue()).toBe('mocked');
    });
    
    it('should always register mocks in Phase 5 (regardless of USE_DI setting)', () => {
      // Set USE_DI to false (though this doesn't affect shouldUseDI in Phase 5)
      process.env.USE_DI = 'false';
      
      // Create a mock implementation
      const mockService = new MockTestService();
      
      // Register it - should work because DI is always enabled in Phase 5
      containerHelper.registerMock('TestService', mockService);
      
      // Resolve it - should be registered
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBe(mockService);
      expect(resolved.getValue()).toBe('mocked');
      
      // Reset for other tests
      process.env.USE_DI = 'true';
    });
  });
  
  describe('registerMockClass', () => {
    it('should register a mock class', () => {
      // Register the mock class
      containerHelper.registerMockClass('TestService', MockTestService);
      
      // Resolve it
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBeInstanceOf(MockTestService);
      expect(resolved.getValue()).toBe('mocked');
    });
    
    it('should always register mock classes in Phase 5 (regardless of USE_DI setting)', () => {
      // Set USE_DI to false (though this doesn't affect shouldUseDI in Phase 5)
      process.env.USE_DI = 'false';
      
      // Register the mock class - should work because DI is always enabled in Phase 5
      containerHelper.registerMockClass('TestService', MockTestService);
      
      // Resolve it - should be registered
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBeInstanceOf(MockTestService);
      expect(resolved.getValue()).toBe('mocked');
      
      // Reset for other tests
      process.env.USE_DI = 'true';
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
    it('should resolve registered services', () => {
      // Register a mock service
      const mockService = new MockTestService();
      containerHelper.registerMock('TestService', mockService);
      
      // Resolve it
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBe(mockService);
    });
    
    it('should use fallback class if provided for unregistered token', () => {
      // Resolve a service that doesn't exist, with a fallback class
      const service = containerHelper.resolve<TestService>('UnregisteredService', {
        fallbackClass: MockTestService
      });
      
      // Should get an instance of the fallback class
      expect(service).toBeInstanceOf(MockTestService);
      expect(service.getValue()).toBe('mocked');
    });
    
    it('should always resolve services in Phase 5 (regardless of USE_DI setting)', () => {
      // Set USE_DI to false (though this doesn't affect shouldUseDI in Phase 5)
      process.env.USE_DI = 'false';
      
      // Register a mock service
      const mockService = new MockTestService();
      containerHelper.registerMock('TestService', mockService);
      
      // Should still be able to resolve the service because DI is always enabled in Phase 5
      const resolved = containerHelper.resolve<TestService>('TestService');
      expect(resolved).toBe(mockService);
      
      // Reset for other tests
      process.env.USE_DI = 'true';
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
    
    it('should always check registration in Phase 5 (regardless of USE_DI setting)', () => {
      // Set USE_DI to false (though this doesn't affect shouldUseDI in Phase 5)
      process.env.USE_DI = 'false';
      
      // Register a token
      containerHelper.registerMockClass('TestServiceForRegistrationCheck', TestService);
      
      // Should still be able to check registration because DI is always enabled in Phase 5
      expect(containerHelper.isRegistered('TestServiceForRegistrationCheck')).toBe(true);
      
      // Reset for other tests
      process.env.USE_DI = 'true';
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