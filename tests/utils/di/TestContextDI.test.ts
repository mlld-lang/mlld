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
      // Create context with DI disabled
      context = TestContextDI.withoutDI();
    });
    
    it('should create a test context with manual initialization', () => {
      // Verify DI is disabled
      expect(shouldUseDI()).toBe(false);
      
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
      // Write a file
      await context.writeFile('test.txt', 'Hello, world!');
      
      // Use the file system service - use project path format
      const exists = await context.services.filesystem.exists('$PROJECTPATH/test.txt');
      expect(exists).toBe(true);
      
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
    
    it('withoutDI should create a context with DI disabled', () => {
      const context = TestContextDI.withoutDI();
      expect(shouldUseDI()).toBe(false);
      context.cleanup();
    });
  });
});