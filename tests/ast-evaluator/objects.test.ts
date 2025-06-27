import { describe, it, expect, vi } from 'vitest';
import { ASTEvaluator } from '@interpreter/core/ast-evaluator';

// Mock the interpreter module for interpolation
vi.mock('@interpreter/core/interpreter', () => ({
  interpolate: vi.fn(async (content: any[]) => {
    // Simple mock that extracts text content
    if (Array.isArray(content) && content.length > 0 && content[0].type === 'Text') {
      return content[0].content;
    }
    return '';
  })
}));

describe('ASTEvaluator - Objects', () => {
  // Mock environment for evaluateToRuntime tests
  const mockEnv = {} as any;
  
  describe('normalizeObject', () => {
    it('should normalize plain JavaScript objects', () => {
      const plain = { name: 'alice', count: 42 };
      const normalized = ASTEvaluator.normalizeObject(plain);
      
      expect(normalized).toEqual({
        type: 'object',
        properties: { name: 'alice', count: 42 },
        location: { synthetic: true }
      });
    });
    
    it('should handle already-normalized objects', () => {
      const typed = { 
        type: 'object', 
        properties: { name: 'alice', count: 42 }, 
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
      };
      const normalized = ASTEvaluator.normalizeObject(typed);
      
      // Should return the same reference
      expect(normalized).toBe(typed);
    });
    
    it('should skip internal properties', () => {
      const withInternal = { 
        name: 'alice',
        wrapperType: 'doubleQuote',
        nodeId: '123',
        location: { line: 1 }
      };
      const normalized = ASTEvaluator.normalizeObject(withInternal);
      
      expect(normalized.properties).toEqual({ name: 'alice' });
      expect(normalized.properties.wrapperType).toBeUndefined();
      expect(normalized.properties.nodeId).toBeUndefined();
      expect(normalized.properties.location).toBeUndefined();
    });
    
    it('should throw for non-object values', () => {
      expect(() => ASTEvaluator.normalizeObject('not an object')).toThrow('Expected object');
      expect(() => ASTEvaluator.normalizeObject(123)).toThrow('Expected object');
      expect(() => ASTEvaluator.normalizeObject([])).toThrow('Expected object');
      expect(() => ASTEvaluator.normalizeObject(null)).toThrow('Expected object');
    });
  });
  
  describe('normalizeValue with objects', () => {
    it('should handle wrapped strings in objects', () => {
      const wrapped = {
        content: [{ type: 'Text', content: 'hello world' }],
        wrapperType: 'doubleQuote'
      };
      
      const normalized = ASTEvaluator.normalizeValue(wrapped);
      expect(normalized).toBe('hello world');
    });
    
    it('should normalize nested structures', () => {
      const nested = {
        user: { name: 'alice', age: 30 },
        items: [1, 2, 3],
        enabled: true
      };
      
      const normalized = ASTEvaluator.normalizeValue(nested);
      expect(normalized.type).toBe('object');
      expect(normalized.properties.user.type).toBe('object');
      expect(normalized.properties.user.properties).toEqual({ name: 'alice', age: 30 });
      expect(normalized.properties.items.type).toBe('array');
      expect(normalized.properties.items.items).toEqual([1, 2, 3]);
      expect(normalized.properties.enabled).toBe(true);
    });
    
    it('should handle objects with wrapped content properties', () => {
      const objectWithWrapped = {
        name: {
          content: [{ type: 'Text', content: 'alice' }],
          wrapperType: 'doubleQuote'
        },
        role: {
          content: [{ type: 'Text', content: 'admin' }],
          wrapperType: 'doubleQuote'
        }
      };
      
      const normalized = ASTEvaluator.normalizeValue(objectWithWrapped);
      expect(normalized.type).toBe('object');
      expect(normalized.properties.name).toBe('alice');
      expect(normalized.properties.role).toBe('admin');
    });
  });
  
  describe('evaluateToRuntime with objects', () => {
    it('should convert AST objects to plain JavaScript objects', async () => {
      const astObject = {
        type: 'object',
        properties: {
          name: 'alice',
          count: 42,
          active: true
        }
      };
      
      const result = await ASTEvaluator.evaluateToRuntime(astObject, mockEnv);
      expect(result).toEqual({
        name: 'alice',
        count: 42,
        active: true
      });
    });
    
    it('should handle objects in arrays', async () => {
      const arrayWithObjects = {
        type: 'array',
        items: [
          {
            type: 'object',
            properties: {
              name: 'alice',
              role: 'admin'
            }
          },
          {
            type: 'object',
            properties: {
              name: 'bob',
              role: 'user'
            }
          }
        ]
      };
      
      const result = await ASTEvaluator.evaluateToRuntime(arrayWithObjects, mockEnv);
      expect(result).toEqual([
        { name: 'alice', role: 'admin' },
        { name: 'bob', role: 'user' }
      ]);
    });
    
    it('should handle the data-string-in-nested-structures case', async () => {
      // This replicates the exact structure from the failing test
      const complex = {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: [
              {
                name: {
                  content: [{ type: 'Text', content: 'alice' }],
                  wrapperType: 'doubleQuote'
                },
                role: {
                  content: [{ type: 'Text', content: 'admin' }],
                  wrapperType: 'doubleQuote'
                }
              },
              {
                name: {
                  content: [{ type: 'Text', content: 'bob' }],
                  wrapperType: 'doubleQuote'
                },
                role: {
                  content: [{ type: 'Text', content: 'user' }],
                  wrapperType: 'doubleQuote'
                }
              }
            ]
          },
          config: {
            type: 'object',
            properties: {
              theme: 'dark',
              settings: {
                type: 'array',
                items: ['option1', 'option2']
              }
            }
          }
        }
      };
      
      const result = await ASTEvaluator.evaluateToRuntime(complex, mockEnv);
      expect(result).toEqual({
        users: [
          { name: 'alice', role: 'admin' },
          { name: 'bob', role: 'user' }
        ],
        config: {
          theme: 'dark',
          settings: ['option1', 'option2']
        }
      });
    });
  });
  
  describe('namespace handling', () => {
    it('should preserve namespace metadata', async () => {
      const namespaceObj = {
        type: 'object',
        properties: {
          myFunc: {
            __executable: true,
            paramNames: ['x', 'y'],
            value: 'function body'
          },
          myVar: 'hello'
        }
      };
      
      const result = await ASTEvaluator.evaluateToRuntime(namespaceObj, mockEnv);
      
      // Should preserve the executable structure
      expect(result.myFunc.__executable).toBe(true);
      expect(result.myFunc.paramNames).toEqual(['x', 'y']);
      expect(result.myVar).toBe('hello');
    });
  });
  
  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const empty = {};
      const normalized = ASTEvaluator.normalizeObject(empty);
      expect(normalized).toEqual({
        type: 'object',
        properties: {},
        location: { synthetic: true }
      });
    });
    
    it('should handle complex nested content with interpolation needs', async () => {
      const complexWrapped = {
        content: [
          { type: 'Text', content: 'Hello ' },
          { type: 'Variable', name: 'name' },
          { type: 'Text', content: '!' }
        ],
        wrapperType: 'backtick'
      };
      
      const result = await ASTEvaluator.evaluateToRuntime(complexWrapped, mockEnv);
      // With our simple mock, interpolate only handles simple Text nodes
      // So this returns the first Text node's content
      expect(result).toBe('Hello ');
    });
  });
});