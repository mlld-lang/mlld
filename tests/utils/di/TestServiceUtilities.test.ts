import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from './TestContextDI';
import { 
  getService, 
  getServiceSync,
  createServiceMock, 
  createService, 
  createServiceSync,
  createDiagnosticReport, 
  createTestSetup,
  testInBothModes 
} from './TestServiceUtilities';
import { MockValidationService } from './MockServices';

describe('TestServiceUtilities', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.create();
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  describe('getService', () => {
    it('should resolve a registered service', async () => {
      // Register a mock service
      const mockService = { test: vi.fn() };
      context.registerMock('TestService', mockService);
      
      // Resolve the service
      const resolved = await getService(context, 'TestService');
      
      // Verify it's the same instance
      expect(resolved).toBe(mockService);
    });
    
    it('should use fallback class when service is not found', async () => {
      // Create a fallback class
      class FallbackService {
        getValue() { return 'fallback'; }
      }
      
      // Try to resolve a non-existent service with fallback
      const service = await getService(context, 'NonExistentService', {
        fallbackClass: FallbackService
      });
      
      // Verify the fallback was used
      expect(service).toBeInstanceOf(FallbackService);
      expect((service as any).getValue()).toBe('fallback');
    });
    
    it('should use fallback value when service is not found', async () => {
      // Create a fallback value
      const fallback = { value: 'fallback' };
      
      // Try to resolve a non-existent service with fallback
      const service = await getService(context, 'NonExistentService', {
        fallback
      });
      
      // Verify the fallback was used
      expect(service).toBe(fallback);
    });
    
    it('should throw an error when required service is not found', async () => {
      // Try to resolve a non-existent service without fallback
      await expect(getService(context, 'RequiredService')).rejects.toThrow();
    });
    
    it('should return null when non-required service is not found', async () => {
      // Try to resolve a non-existent service that's not required
      const service = await getService(context, 'OptionalService', {
        required: false
      });
      
      // Verify null was returned
      expect(service).toBeNull();
    });
  });
  
  describe('createServiceMock', () => {
    it('should create and register a mock service', async () => {
      // Create a mock service
      const mockService = createServiceMock(context, 'MockService', {
        getValue: vi.fn().mockReturnValue('mocked')
      });
      
      // Verify the mock is registered
      const service = await getService(context, 'MockService');
      expect(service).toBe(mockService);
      expect((service as any).getValue()).toBe('mocked');
    });
  });
  
  describe('createService', () => {
    it('should create a service using a factory function', async () => {
      // Define a service creation factory
      const factory = (ctx: TestContextDI) => {
        return {
          ctx,
          getValue: vi.fn().mockReturnValue('factory')
        };
      };
      
      // Create the service
      const service = await createService(context, factory);
      
      // Verify the service was created correctly
      expect(service.ctx).toBe(context);
      expect(service.getValue()).toBe('factory');
    });
  });
  
  describe('createDiagnosticReport', () => {
    it('should create a diagnostic report', async () => {
      // Register some services for the report
      context.registerMock('Service1', {});
      context.registerMock('Service2', {});
      
      // Create a diagnostic report
      const report = await createDiagnosticReport(context);
      
      // Verify the report contains expected sections
      expect(report).toContain('--- DIAGNOSTIC REPORT ---');
      expect(report).toContain('DI Mode: enabled');
      expect(report).toContain('Registered Mocks');
      expect(report).toContain('Services');
    });
  });
  
  describe('createTestSetup', () => {
    it('should create a test setup helper', async () => {
      // Create a test setup
      const { setup, cleanup } = createTestSetup({});
      
      // Create a test context
      const testContext = setup();
      
      // Verify the context has the expected properties
      expect(testContext).toBeInstanceOf(TestContextDI);
      
      // Clean up
      await cleanup(testContext);
    });
  });
  
  describe('testInBothModes', () => {
    it('should create test cases for service testing', () => {
      // Create a spy on the describe function
      const describeSpy = vi.spyOn(global, 'describe');
      
      // Create a test function
      const testFn = vi.fn();
      
      // Call testInBothModes
      testInBothModes('TestService', testFn);
      
      // Verify describe was called with the correct arguments
      expect(describeSpy).toHaveBeenCalledWith('TestService', expect.any(Function));
      
      // Restore the spy
      describeSpy.mockRestore();
    });
  });
});