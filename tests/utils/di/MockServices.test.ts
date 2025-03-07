/**
 * Tests for DI-compatible mock services
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { container } from 'tsyringe';
import { TestContainerHelper } from './TestContainerHelper';
import {
  MockValidationService,
  MockStateService,
  MockResolutionService,
  MockFileSystemService,
  MockCircularityService,
  MockParserService,
  MockInterpreterService,
  MockPathService,
} from './MockServices';

// Set up test environment
describe('MockServices', () => {
  let containerHelper: TestContainerHelper;

  beforeEach(() => {
    // Create a new container helper for each test
    containerHelper = TestContainerHelper.createTestContainer();
    
    // Set USE_DI environment variable
    process.env.USE_DI = 'true';
  });

  afterEach(() => {
    // Reset container after each test
    containerHelper.reset();
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.USE_DI;
  });

  describe('MockValidationService', () => {
    it('should be injectable', () => {
      // Register mock validation service
      containerHelper.registerMockClass('ValidationService', MockValidationService);
      
      // Resolve the service
      const service = containerHelper.resolve('ValidationService');
      
      // Verify it's an instance of MockValidationService
      expect(service).toBeInstanceOf(MockValidationService);
    });

    it('should have mock implementations for all methods', () => {
      const service = new MockValidationService();
      
      expect(service.validate).toBeDefined();
      expect(service.registerValidator).toBeDefined();
      expect(service.hasValidator).toBeDefined();
      
      // Test a method call
      service.validate({} as any, {} as any);
      expect(service.validate).toHaveBeenCalled();
    });
  });

  describe('MockStateService', () => {
    it('should be injectable', () => {
      // Register mock state service
      containerHelper.registerMockClass('StateService', MockStateService);
      
      // Resolve the service
      const service = containerHelper.resolve('StateService');
      
      // Verify it's an instance of MockStateService
      expect(service).toBeInstanceOf(MockStateService);
    });

    it('should have mock implementations for all methods', () => {
      const service = new MockStateService();
      
      expect(service.setTextVar).toBeDefined();
      expect(service.getTextVar).toBeDefined();
      expect(service.createChildState).toBeDefined();
      
      // Test method calls
      service.setTextVar('test', 'value');
      expect(service.setTextVar).toHaveBeenCalledWith('test', 'value');
      
      service.getTextVar('test');
      expect(service.getTextVar).toHaveBeenCalledWith('test');
    });
  });

  // Additional tests for other mock services
  describe('Multiple Service Registration', () => {
    it('should register and resolve multiple mock services', () => {
      // Register multiple mock services
      containerHelper.registerMockClass('ValidationService', MockValidationService);
      containerHelper.registerMockClass('StateService', MockStateService);
      containerHelper.registerMockClass('ResolutionService', MockResolutionService);
      
      // Resolve the services
      const validationService = containerHelper.resolve('ValidationService');
      const stateService = containerHelper.resolve('StateService');
      const resolutionService = containerHelper.resolve('ResolutionService');
      
      // Verify they're all the correct instances
      expect(validationService).toBeInstanceOf(MockValidationService);
      expect(stateService).toBeInstanceOf(MockStateService);
      expect(resolutionService).toBeInstanceOf(MockResolutionService);
    });
  });
  
  describe('Child Container Isolation', () => {
    it('should create isolated child containers', () => {
      // Register mock service in the parent container
      containerHelper.registerMockClass('ValidationService', MockValidationService);
      
      // Create a child container
      const childContainer = containerHelper.getContainer().createChildContainer();
      const childHelper = new TestContainerHelper();
      
      // Override the service in the child container
      const mockValidation = new MockValidationService();
      mockValidation.validate.mockImplementation(async () => { throw new Error('Child container error'); });
      
      childHelper.registerMock('ValidationService', mockValidation);
      
      // The parent container should have the original service
      const parentService = containerHelper.resolve('ValidationService');
      expect(parentService.validate).not.toThrow();
      
      // The child container should have the overridden service
      try {
        childHelper.resolve('ValidationService').validate({} as any, {} as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});