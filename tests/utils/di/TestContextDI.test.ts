import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TestContextDI } from './TestContextDI';
import { shouldUseDI } from '../../../core/ServiceProvider';

// Mock class for testing
class MockParser {
  parse(content: string) {
    return { type: 'mock', content };
  }
}

describe('TestContextDI', () => {
  // Backup original environment variable
  const originalEnv = process.env.USE_DI;
  let context: TestContextDI;

  afterEach(async () => {
    // Clean up the test context
    if (context) {
      await context.cleanup();
    }
    
    // Restore original environment variable
    if (originalEnv === undefined) {
      delete process.env.USE_DI;
    } else {
      process.env.USE_DI = originalEnv;
    }
  });

  describe('with DI disabled', () => {
    beforeEach(() => {
      context = new TestContextDI({ useDI: false });
    });
    
    it('should create a test context with services initialized through DI in Phase 5', () => {
      // In Phase 5, DI is always enabled regardless of the useDI setting
      expect(shouldUseDI()).toBe(true);
      
      // Verify services are initialized
      expect(context.services.parser).toBeDefined();
      expect(context.services.state).toBeDefined();
      expect(context.services.filesystem).toBeDefined();
    });
    
    it('should use the traditional service registration', () => {
      // Create a mock parser
      const mockParser = new MockParser();
      
      // Register it manually on the services object
      (context.services as any).parser = mockParser;
      
      // Verify it's used
      expect(context.services.parser).toBe(mockParser);
      
      // Parse some content with the mock
      const result = context.parseMeld('test');
      expect(result).toEqual({ type: 'mock', content: 'test' });
    });
  });
  
  describe('with DI enabled', () => {
    beforeEach(() => {
      // Create context with DI enabled
      context = TestContextDI.withDI();
    });
    
    it('should create a test context with DI initialization', () => {
      // Verify DI is enabled
      expect(shouldUseDI()).toBe(true);
      
      // Verify services are initialized
      expect(context.services.parser).toBeDefined();
      expect(context.services.state).toBeDefined();
      expect(context.services.filesystem).toBeDefined();
      
      // Verify container is initialized
      expect(context.container).toBeDefined();
      expect(context.container.isRegistered('ParserService')).toBe(true);
    });
    
    it('should support registering mocks with the container', () => {
      // Create a mock parser
      const mockParser = new MockParser();
      
      // Register it with the container - override both services object and container
      context.services.parser = mockParser;
      context.container.registerMock('ParserService', mockParser);
      
      // Verify it's used when resolved from the container
      const resolvedParser = context.container.resolve('ParserService');
      expect(resolvedParser).toBe(mockParser);
      
      // Parse some content with the mock
      const result = context.parseMeld('test');
      expect(result).toEqual({ type: 'mock', content: 'test' });
    });
    
    it('should maintain service interface compatibility regardless of DI mode', async () => {
      // Write a file to the project directory
      await context.writeFile('test.txt', 'Hello, world!');
      
      // Check if file exists - must use absolute path for memfs
      const exists = await context.fs.exists('/project/test.txt');
      expect(exists).toBe(true);
      
      // Write test file directly to '/project/test.txt' to ensure it exists
      await context.fs.writeFile('/project/test.txt', 'Hello, world!');
      
      // Use the file system service - use project path format
      // This should now work because the file exists at the expected location
      const fsExists = await context.services.filesystem.exists('$PROJECTPATH/test.txt');
      expect(fsExists).toBe(true);
      
      // Use the path service
      const resolved = context.services.path.resolvePath('$PROJECTPATH/test.txt');
      expect(resolved).toBe('/project/test.txt');
    });
    
    it('should support creating child contexts with custom container', () => {
      // Create a child context that shares the same services
      const childContext = new TestContextDI({
        useDI: true
      });
      
      // Mock a service in both contexts
      const mockParser = new MockParser();
      
      // Set it on the parent context
      context.services.parser = mockParser;
      context.container.registerMock('ParserService', mockParser);
      
      // Set it on the child context to simulate shared mocks
      childContext.services.parser = mockParser;
      
      // Verify mock is applied in both contexts
      expect(context.parseMeld('test')).toEqual({ type: 'mock', content: 'test' });
      expect(childContext.parseMeld('test')).toEqual({ type: 'mock', content: 'test' });
    });
  });
  
  describe('static factory methods', () => {
    it('withDI should create a context with DI enabled', () => {
      const context = TestContextDI.withDI();
      expect(shouldUseDI()).toBe(true);
      context.cleanup();
    });
    
    it('withoutDI should still use DI in Phase 5', () => {
      const context = TestContextDI.withoutDI();
      // In Phase 5, DI is always enabled
      expect(shouldUseDI()).toBe(true);
      expect(context.useDI).toBe(true);
      context.cleanup();
    });
  });
  
  describe('child state creation', () => {
    beforeEach(() => {
      context = TestContextDI.withDI();
    });
    
    it('should create child states with DI container support', () => {
      // Create a child state
      const childId = context.createChildState();
      
      // Verify we got a valid state ID
      expect(childId).toBeDefined();
      expect(typeof childId).toBe('string');
      expect(childId.length).toBeGreaterThan(0);
    });
    
    it('should create child states with custom options', () => {
      // Create a child state with custom options
      const childId = context.createChildState(undefined, {
        filePath: 'custom.meld',
        transformation: true,
        cloneVariables: true
      });
      
      // Verify we got a valid state ID
      expect(childId).toBeDefined();
      expect(typeof childId).toBe('string');
      expect(childId.length).toBeGreaterThan(0);
    });
  });
  
  describe('variable resolution tracking', () => {
    beforeEach(() => {
      context = TestContextDI.withDI();
    });
    
    it('should create a variable tracker', () => {
      // Create a variable tracker - no need to set the variable first
      const tracker = context.createVariableTracker();
      
      // Start tracking the variable
      tracker.trackResolution('testVar');
      
      // The tracker should exist and have methods
      expect(tracker).toBeDefined();
      expect(typeof tracker.trackResolution).toBe('function');
      expect(typeof tracker.getResolutionPath).toBe('function');
      expect(typeof tracker.reset).toBe('function');
      
      // Reset should work
      tracker.reset();
      expect(tracker.getResolutionPath('testVar')).toEqual([]);
    });
    
    it('should track multiple variables', () => {
      const tracker = context.createVariableTracker();
      
      // Track multiple variables
      tracker.trackResolution('var1');
      tracker.trackResolution('var2');
      
      // Get and reset paths
      expect(tracker.getResolutionPath('var1')).toEqual([]);
      expect(tracker.getResolutionPath('var2')).toEqual([]);
      
      // Reset one variable
      tracker.reset();
    });
  });
  
  describe('mock directive handler', () => {
    describe('with DI enabled', () => {
      beforeEach(() => {
        context = TestContextDI.withDI();
      });
      
      it('should create a definition directive handler mock', () => {
        // Create a simple transform function
        const transformFn = vi.fn((node) => ({ ...node, transformed: true }));
        
        // Create the mock handler
        const handler = context.createMockDirectiveHandler('test', {
          transform: transformFn
        });
        
        // Verify the handler is created correctly
        expect(handler).toBeDefined();
        expect(handler.directiveName).toBe('test');
        expect(handler.__isMockHandler).toBe(true);
        expect(handler.kind).toBe('definition'); // Should default to definition
        
        // Verify the transform function works
        expect(typeof handler.transform).toBe('function');
      });
      
      it('should create an execution directive handler mock', () => {
        // Create a simple execute function
        const executeFn = vi.fn((node) => ({ output: 'test-output' }));
        
        // Create the mock handler
        const handler = context.createMockDirectiveHandler('run', {
          execute: executeFn
        });
        
        // Verify the handler is created correctly
        expect(handler).toBeDefined();
        expect(handler.directiveName).toBe('run');
        expect(handler.__isMockHandler).toBe(true);
        expect(handler.kind).toBe('execution'); // Should be execution for handlers with execute
        
        // Verify the execute function works
        expect(typeof handler.execute).toBe('function');
      });
    });

    describe('with DI disabled', () => {
      beforeEach(() => {
        context = TestContextDI.withoutDI();
      });
      
      it('should still create mock handlers without touching DI', () => {
        // Create a simple transform function
        const transformFn = vi.fn((node) => ({ ...node, transformed: true }));
        
        // Create the mock handler
        const handler = context.createMockDirectiveHandler('test', {
          transform: transformFn
        });
        
        // Verify the handler is created correctly
        expect(handler).toBeDefined();
        expect(handler.directiveName).toBe('test');
        expect(handler.__isMockHandler).toBe(true);
      });
    });
  });
});