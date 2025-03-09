import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TestContextDI } from './TestContextDI';

// Mock class for testing
class MockParser {
  parse(content: string) {
    return { type: 'mock', content };
  }
}

describe('TestContextDI', () => {
  let context: TestContextDI;

  afterEach(async () => {
    // Clean up the test context
    if (context) {
      await context.cleanup();
    }
  });

  describe('basic functionality', () => {
    beforeEach(() => {
      // Create context
      context = TestContextDI.create();
    });
    
    it('should create a test context with DI initialization', () => {
      // Verify services are initialized
      expect(context.services.parser).toBeDefined();
      expect(context.services.state).toBeDefined();
      expect(context.services.filesystem).toBeDefined();
    });
    
    it('should support registering mocks with the container', () => {
      // Create a mock parser
      const mockParser = new MockParser();
      
      // Register it with the container
      context.registerMock('IParserService', mockParser);
      
      // Get it from the container
      const parser = context.container.resolve('IParserService');
      
      // Verify it's our mock
      expect(parser).toBe(mockParser);
      
      // Test its functionality
      const result = parser.parse('test');
      expect(result).toEqual({ type: 'mock', content: 'test' });
    });

    it('should maintain service interface compatibility', () => {
      // Get a service from the context's services property
      const parser = context.services.parser;
      
      // Verify it exists and implements the expected interface
      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');
    });

    it('should support creating child contexts with custom container', () => {
      // Create a child context
      const child = context.createChildContext();
      
      // Verify the child has its own container
      expect(child.container).toBeDefined();
      expect(child.container).not.toBe(context.container);
      
      // Verify the child inherits services
      expect(child.services.parser).toBeDefined();
      
      // Register a mock in the parent
      const mockParser = new MockParser();
      context.registerMock('MockParser', mockParser);
      
      // Should not be accessible in the child
      expect(child.container.isRegistered('MockParser')).toBe(false);
      
      // Clean up the child
      child.cleanup();
    });
  });

  describe('static factory methods', () => {
    it('create should create a context with DI', () => {
      const context = TestContextDI.create();
      expect(context).toBeInstanceOf(TestContextDI);
      context.cleanup();
    });

    it('createIsolated should create a context with an isolated container', () => {
      const context = TestContextDI.createIsolated();
      expect(context).toBeInstanceOf(TestContextDI);
      
      // Isolated container shouldn't have parent registrations
      const container = require('tsyringe').container;
      container.register('IsolationTest', { useValue: 'test' });
      
      // Shouldn't be able to resolve it from the isolated container
      expect(context.container.isRegistered('IsolationTest')).toBe(false);
      
      context.cleanup();
    });
  });

  describe('child context creation', () => {
    beforeEach(() => {
      context = TestContextDI.create();
    });
    
    it('should create child contexts with DI container support', () => {
      // Create a child context
      const child = context.createChildContext();
      
      // Verify it has a container
      expect(child.container).toBeDefined();
      
      // Register something in the parent
      context.registerMock('ParentValue', 'parent');
      
      // Child should not have access to parent registrations
      expect(child.container.isRegistered('ParentValue')).toBe(false);
      
      // Clean up
      child.cleanup();
    });
    
    it('should create isolated child contexts', () => {
      // Create an isolated child context
      const isolated = context.createChildContext({ isolatedContainer: true });
      
      // Register something in the parent container
      context.registerMock('TestService', { value: 'parent' });
      
      // Register something different in the child
      isolated.registerMock('TestService', { value: 'child' });
      
      // Should have different values
      expect(context.resolveSync<any>('TestService').value).toBe('parent');
      expect(isolated.resolveSync<any>('TestService').value).toBe('child');
    });
  });

  afterEach(async () => {
    if (context) {
      await context.cleanup();
    }
  });
});