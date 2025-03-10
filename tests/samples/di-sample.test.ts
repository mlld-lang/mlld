/**
 * Sample test file demonstrating the new DI-only approach
 * This shows how to use the TestHelpers for common test patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestHelpers, TestContextDI } from '@tests/utils/di';

// Mock service implementation
class MockService {
  process(data: string): string {
    return `processed: ${data}`;
  }
}

describe('DI-Only Testing Examples', () => {
  describe('Basic Setup', () => {
    let context: TestContextDI;
    
    beforeEach(async () => {
      // Create a simple test context
      context = TestHelpers.setup({ 
        isolatedContainer: true,
        leakDetection: true 
      });
    });
    
    afterEach(async () => {
      // Clean up resources
      await context?.cleanup();
    });
    
    it('should register and resolve services', async () => {
      // Register a mock service
      context.registerMock('IMockService', new MockService());
      
      // Resolve the service
      const service = await context.resolve<MockService>('IMockService');
      
      // Test the service
      expect(service).toBeDefined();
      expect(service.process('test')).toBe('processed: test');
    });
  });
  
  describe('Setup With Common Mocks', () => {
    let context: TestContextDI;
    
    beforeEach(async () => {
      // Create a context with common mocks
      context = TestHelpers.setupWithMocks({
        'IMockService': {
          process: vi.fn().mockReturnValue('mocked result')
        }
      });
    });
    
    afterEach(async () => {
      await context?.cleanup();
    });
    
    it('should use the provided mocks', async () => {
      // Resolve the mock service
      const mockService = await context.resolve<any>('IMockService');
      
      // Use the mock
      const result = mockService.process('test');
      
      // Verify expectations
      expect(result).toBe('mocked result');
      expect(mockService.process).toHaveBeenCalledWith('test');
    });
    
    it('should have default mocks for common services', async () => {
      // Resolve built-in mock services
      const stateService = await context.resolve<any>('IStateService');
      const fsService = await context.resolve<any>('IFileSystemService');
      
      // Verify they're defined
      expect(stateService).toBeDefined();
      expect(fsService).toBeDefined();
      
      // Use the mocks
      stateService.setVariable('key', 'value');
      expect(stateService.setVariable).toHaveBeenCalledWith('key', 'value');
    });
  });
  
  describe('BeforeEach/AfterEach Helper', () => {
    // Create test setup with the helper
    const testSetup = TestHelpers.createTestSetup({
      isolated: true,
      leakDetection: true,
      mocks: {
        'IMockService': {
          process: vi.fn().mockReturnValue('setup helper result')
        }
      }
    });
    
    let context: TestContextDI;
    
    beforeEach(async () => {
      // Setup for each test
      context = testSetup.setup();
      
      // Register the mock service with the correct implementation
      context.registerMock('IMockService', {
        process: vi.fn().mockReturnValue('setup helper result')
      });
    });
    
    afterEach(async () => {
      // Cleanup after each test
      await testSetup.cleanup();
    });
    
    it('should provide context with registered mocks', async () => {
      const mockService = await context.resolve<any>('IMockService');
      
      expect(mockService.process('test')).toBe('setup helper result');
      expect(mockService.process).toHaveBeenCalledWith('test');
    });
  });
  
  describe('Directive Handler Testing', () => {
    // Sample directive handler
    const directiveHandler = {
      execute: vi.fn().mockImplementation(async (node: any, state: any) => ({
        success: true,
        node,
        replacement: null
      }))
    };
    
    // Setup directive test
    const { 
      context, 
      validationService, 
      stateService, 
      resolutionService, 
      handler 
    } = TestHelpers.setupDirectiveTest(directiveHandler);
    
    afterEach(async () => {
      await context?.cleanup();
    });
    
    it('should provide all necessary services for directive testing', async () => {
      // Sample directive node
      const node = { kind: 'test', value: 'example' };
      
      // Execute handler
      await handler.execute(node, stateService);
      
      // Verify handler was called
      expect(handler.execute).toHaveBeenCalledWith(node, stateService);
      
      // Check mock services
      expect(validationService).toBeDefined();
      expect(stateService).toBeDefined();
      expect(resolutionService).toBeDefined();
    });
  });
  
  describe('Container Leak Detection', () => {
    it('should detect potential leaks', async () => {
      // Create context with leak detection
      const context = TestContextDI.create({ leakDetection: true });
      
      // Register some services
      context.registerMock('ILeakTest', { test: 'value' });
      
      // Get diagnostic information
      const report = context.createDiagnosticReport();
      
      // Verify the report contains leak detection info
      expect(report.leakDetection).toBeDefined();
      expect(report.leakDetection.enabled).toBe(true);
      
      // Clean up
      await context?.cleanup();
    });
  });
}); 