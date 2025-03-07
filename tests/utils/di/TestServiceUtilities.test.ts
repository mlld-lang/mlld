import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from './TestContextDI';
import { 
  getService, 
  createServiceMock, 
  createService, 
  createDiagnosticReport, 
  createTestSetup,
  testInBothModes 
} from './TestServiceUtilities';
import { MockValidationService } from './MockServices';

describe('TestServiceUtilities', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.create({ useDI: true });
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  describe('getService', () => {
    it('should resolve a registered service', () => {
      // Register a mock service
      const mockService = { test: vi.fn() };
      context.registerMock('TestService', mockService);
      
      // Resolve the service
      const resolved = getService(context, 'TestService');
      
      // Verify it's the same instance
      expect(resolved).toBe(mockService);
    });
    
    it('should use fallback class when service is not found', () => {
      // Create a fallback class
      class FallbackService {
        getValue() { return 'fallback'; }
      }
      
      // Try to resolve a non-existent service with fallback
      const service = getService(context, 'NonExistentService', {
        fallbackClass: FallbackService
      });
      
      // Verify the fallback was used
      expect(service).toBeInstanceOf(FallbackService);
      expect(service.getValue()).toBe('fallback');
    });
    
    it('should use fallback value when service is not found', () => {
      // Create a fallback value
      const fallback = { getValue: () => 'fallback value' };
      
      // Try to resolve a non-existent service with fallback
      const service = getService(context, 'NonExistentService', {
        fallback
      });
      
      // Verify the fallback was used
      expect(service).toBe(fallback);
      expect(service.getValue()).toBe('fallback value');
    });
    
    it('should throw an error when required service is not found', () => {
      // Try to resolve a non-existent service without fallback
      expect(() => getService(context, 'NonExistentService', {
        required: true
      })).toThrow();
    });
    
    it('should return null when non-required service is not found', () => {
      // Try to resolve a non-existent service that's not required
      const service = getService(context, 'NonExistentService', {
        required: false
      });
      
      // Verify null was returned
      expect(service).toBeNull();
    });
  });
  
  describe('createServiceMock', () => {
    it('should create and register a mock service', () => {
      // Create a mock service
      const mockService = createServiceMock(context, 'MockService', {
        test: vi.fn().mockReturnValue('test value'),
        value: 42
      });
      
      // Verify the mock was registered
      const resolved = getService(context, 'MockService');
      expect(resolved).toBe(mockService);
      
      // Verify the mock implementation works
      expect(mockService.test()).toBe('test value');
      expect(mockService.value).toBe(42);
    });
  });
  
  describe('createService', () => {
    it('should create a service using a factory function', () => {
      // Create a service with a factory that uses the context
      const service = createService(context, (ctx) => {
        // Create an object that uses the context
        return {
          getState: () => ctx.services.state,
          getContext: () => ctx
        };
      });
      
      // Verify the service was created correctly
      expect(service.getContext()).toBe(context);
      expect(service.getState()).toBe(context.services.state);
    });
  });
  
  describe('createDiagnosticReport', () => {
    it('should create a diagnostic report', () => {
      // Register some mocks to make the report more interesting
      context.registerMock('Service1', {});
      context.registerMock('Service2', {});
      
      // Create a diagnostic report
      const report = createDiagnosticReport(context, {
        includeServices: true,
        includeMocks: true,
        includeContainerState: true
      });
      
      // Verify the report contains expected sections
      expect(report).toContain('Test Context Diagnostic Report');
      expect(report).toContain('DI Mode: Enabled');
      expect(report).toContain('Registered Mocks');
      expect(report).toContain('Services');
    });
  });
  
  describe('createTestSetup', () => {
    it('should create a test setup helper', () => {
      // Create a test setup helper
      const setup = createTestSetup({
        useDI: true,
        isolatedContainer: true
      });
      
      // Verify the helper has the expected methods
      expect(setup.setup).toBeTypeOf('function');
      expect(setup.cleanup).toBeTypeOf('function');
      
      // Create a context with the helper
      const testContext = setup.setup();
      
      // Verify the context has the expected properties
      expect(testContext).toBeInstanceOf(TestContextDI);
      expect(testContext.useDI).toBe(true);
      
      // Clean up
      setup.cleanup(testContext);
    });
  });
  
  describe('testInBothModes', () => {
    // We'll create a separate describe block to test this function
    // without actually using it to avoid infinite nesting
    it('should create test cases for both DI modes', () => {
      // Spy on describe to verify it's called correctly
      const describeSpy = vi.spyOn(global, 'describe');
      
      // Call testInBothModes
      testInBothModes('TestService', async (ctx) => {
        // Simple test function
        expect(ctx).toBeInstanceOf(TestContextDI);
      });
      
      // Verify describe was called with the correct arguments
      expect(describeSpy).toHaveBeenCalledWith('TestService', expect.any(Function));
      
      // Restore the spy
      describeSpy.mockRestore();
    });
  });
});