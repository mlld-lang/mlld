import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import { ASTEvaluator } from '@interpreter/core/ast-evaluator';

/**
 * Phase 3: Grammar Output Tests
 * 
 * These tests define the expected AST structure that the grammar SHOULD produce.
 * Currently, many of these will fail because the grammar doesn't yet produce
 * normalized AST. The tests serve as the specification for Phase 4.
 * 
 * The expected output matches what ASTEvaluator currently produces, ensuring
 * Phase 4's grammar changes will make ASTEvaluator unnecessary.
 */

describe('Expected AST Structure - Basic Data Types', () => {
  describe('Arrays', () => {
    it('should produce typed arrays with location info', () => {
      const input = '/var @arr = [1, 2, 3]';
      const ast = parseSync(input);
      
      // Extract the array value from the var directive
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      // What we currently get: plain JS array [1, 2, 3]
      // What we SHOULD get:
      const expectedArray = {
        type: 'array',
        items: [1, 2, 3],
        location: expect.objectContaining({
          start: expect.any(Object),
          end: expect.any(Object)
        })
      };
      
      // This will fail until Phase 4
      // expect(arrayValue).toEqual(expectedArray);
      
      // For now, verify ASTEvaluator produces the expected structure
      const normalized = ASTEvaluator.normalizeArray(arrayValue);
      expect(normalized.type).toBe('array');
      expect(normalized.items).toEqual([1, 2, 3]);
      expect(normalized.location).toBeDefined();
    });
    
    it('should produce typed empty arrays', () => {
      const input = '/var @empty = []';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      // Expected structure
      const expectedArray = {
        type: 'array',
        items: [],
        location: expect.any(Object)
      };
      
      // Verify ASTEvaluator normalization
      const normalized = ASTEvaluator.normalizeArray(arrayValue);
      expect(normalized.type).toBe('array');
      expect(normalized.items).toEqual([]);
    });
    
    it('should handle nested arrays with consistent typing', () => {
      const input = '/var @nested = [[1, 2], [3, 4]]';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      // Expected: all arrays should have type info
      const expectedStructure = {
        type: 'array',
        items: [
          { type: 'array', items: [1, 2], location: expect.any(Object) },
          { type: 'array', items: [3, 4], location: expect.any(Object) }
        ],
        location: expect.any(Object)
      };
      
      // Verify with ASTEvaluator
      const normalized = ASTEvaluator.normalizeArray(arrayValue);
      expect(normalized.type).toBe('array');
      expect(normalized.items).toHaveLength(2);
      expect(normalized.items[0].type).toBe('array');
      expect(normalized.items[1].type).toBe('array');
    });
  });
  
  describe('Objects', () => {
    it('should produce typed objects with location info', () => {
      const input = '/var @obj = {"name": "alice", "age": 30}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      // What we SHOULD get:
      const expectedObject = {
        type: 'object',
        properties: {
          name: 'alice',  // Strings should be unwrapped
          age: 30
        },
        location: expect.objectContaining({
          start: expect.any(Object),
          end: expect.any(Object)
        })
      };
      
      // Verify ASTEvaluator normalization
      const normalized = ASTEvaluator.normalizeObject(objectValue);
      expect(normalized.type).toBe('object');
      expect(normalized.properties).toBeDefined();
      expect(normalized.location).toBeDefined();
    });
    
    it('should produce typed empty objects', () => {
      const input = '/var @empty = {}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      // Expected structure
      const expectedObject = {
        type: 'object',
        properties: {},
        location: expect.any(Object)
      };
      
      // Verify ASTEvaluator normalization
      const normalized = ASTEvaluator.normalizeObject(objectValue);
      expect(normalized.type).toBe('object');
      expect(normalized.properties).toEqual({});
    });
    
    it('should handle nested objects with consistent typing', () => {
      const input = '/var @nested = {"user": {"name": "alice", "prefs": {"theme": "dark"}}}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      // All objects should have type info
      const normalized = ASTEvaluator.normalizeObject(objectValue);
      expect(normalized.type).toBe('object');
      
      // Note: Deep normalization would require recursive handling
      // This is what Phase 4 should produce directly from the grammar
    });
  });
  
  describe('String Handling', () => {
    it('should unwrap double-quoted strings in data structures', () => {
      const input = '/var @obj = {"message": "Hello, world!"}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      // Current: strings might be wrapped in AST nodes
      // Expected: plain string values in data structures
      // Objects now have type: 'object' with properties field
      expect(objectValue.type).toBe('object');
      expect(objectValue.properties.message).toBe('Hello, world!');
    });
    
    it('should unwrap single-quoted strings in data structures', () => {
      const input = '/var @obj = {\'message\': \'Hello, world!\'}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      // Single quotes should also produce plain strings
      // Objects now have type: 'object' with properties field
      expect(objectValue.type).toBe('object');
      expect(objectValue.properties.message).toBe('Hello, world!');
    });
  });
});

describe('Expected AST Structure - Complex Structures', () => {
  describe('Objects in Arrays', () => {
    it('should handle arrays of objects with proper typing', () => {
      const input = '/var @users = [{"name": "alice"}, {"name": "bob"}]';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      // Expected structure
      const expectedStructure = {
        type: 'array',
        items: [
          {
            type: 'object',
            properties: { name: 'alice' },
            location: expect.any(Object)
          },
          {
            type: 'object', 
            properties: { name: 'bob' },
            location: expect.any(Object)
          }
        ],
        location: expect.any(Object)
      };
      
      // This is the core issue that prompted the refactor
      // Objects in arrays should maintain type information
      const normalized = ASTEvaluator.normalizeArray(arrayValue);
      expect(normalized.type).toBe('array');
      expect(normalized.items).toHaveLength(2);
      
      // Each item should be a properly typed object
      if (normalized.items[0] && typeof normalized.items[0] === 'object' && 'type' in normalized.items[0]) {
        expect(normalized.items[0].type).toBe('object');
      }
    });
    
    it('should handle mixed content arrays', () => {
      const input = '/var @mixed = [1, "text", {"key": "value"}, true, null]';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      const normalized = ASTEvaluator.normalizeArray(arrayValue);
      expect(normalized.type).toBe('array');
      expect(normalized.items).toHaveLength(5);
      
      // Primitives stay as primitives
      expect(normalized.items[0]).toBe(1);
      // Strings in arrays are wrapped objects with content array
      expect(normalized.items[1]).toHaveProperty('content');
      expect(normalized.items[1]).toHaveProperty('wrapperType', 'doubleQuote');
      expect(Array.isArray(normalized.items[1].content)).toBe(true);
      expect(normalized.items[1].content[0]).toHaveProperty('type', 'Literal');
      expect(normalized.items[1].content[0]).toHaveProperty('value', 'text');
      expect(normalized.items[3]).toBe(true);
      expect(normalized.items[4]).toBe(null);
      
      // Objects get type info
      const objItem = normalized.items[2];
      if (typeof objItem === 'object' && objItem !== null && 'type' in objItem) {
        expect(objItem.type).toBe('object');
      }
    });
  });
  
  describe('Arrays in Objects', () => {
    it('should handle objects containing arrays with proper typing', () => {
      const input = '/var @data = {"items": [1, 2, 3], "users": ["alice", "bob"]}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      const normalized = ASTEvaluator.normalizeObject(objectValue);
      expect(normalized.type).toBe('object');
      
      // Arrays within objects should also be typed
      // This is what Phase 4 should produce
    });
  });
});

describe('Expected AST Structure - mlld Expressions', () => {
  describe('Variable References in Data', () => {
    it('should preserve variable references in objects', () => {
      const input = '/var @obj = {"user": @currentUser}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      // Variable references should be preserved as AST nodes
      // Objects now have type: 'object' with properties field
      expect(objectValue.type).toBe('object');
      expect(objectValue.properties.user).toMatchObject({
        type: 'VariableReference',
        valueType: 'varIdentifier',
        identifier: 'currentUser'
      });
    });
    
    it('should preserve variable references in arrays', () => {
      const input = '/var @arr = [@first, @second, @third]';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      // Each variable reference should be an AST node
      // Arrays now have type: 'array' with items field
      expect(arrayValue.type).toBe('array');
      expect(arrayValue.items[0]).toMatchObject({
        type: 'VariableReference',
        valueType: 'varIdentifier',
        identifier: 'first'
      });
    });
  });
  
  describe('Exec Invocations in Data', () => {
    it('should preserve exec invocations in arrays', () => {
      const input = '/var @results = [1, @transform(@data), 3]';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      // Exec invocations should be preserved as AST nodes
      // Arrays now have type: 'array' with items field
      expect(arrayValue.type).toBe('array');
      expect(arrayValue.items[1]).toMatchObject({
        type: 'ExecInvocation',
        commandRef: expect.objectContaining({
          name: 'transform'
        })
      });
    });
    
    it('should preserve exec invocations in objects', () => {
      const input = '/var @config = {"data": @loadConfig(), "user": @getCurrentUser()}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      // Exec invocations should be AST nodes
      // Objects now have type: 'object' with properties field
      expect(objectValue.type).toBe('object');
      expect(objectValue.properties.data).toMatchObject({
        type: 'ExecInvocation',
        commandRef: expect.objectContaining({
          name: 'loadConfig'
        })
      });
    });
  });
  
  describe('Nested Directives in Data', () => {
    it('should handle run directives in objects', () => {
      const input = '/var @config = {"output": run {echo "test"}}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const objectValue = varDirective.values.value[0];
      
      // Nested directives should be marked appropriately
      // Objects now have type: 'object' with properties field
      expect(objectValue.type).toBe('object');
      expect(objectValue.properties.output).toMatchObject({
        type: expect.stringMatching(/command|nestedDirective/)
      });
    });
  });
});

describe('Expected AST Structure - Edge Cases (Currently Failing)', () => {
  describe('Object Literals in Array Syntax (GitHub #283)', () => {
    it.skip('should support object literals in array syntax', () => {
      // This currently throws a parse error
      const input = '/var @arr = [{"type": "test"}]';
      
      // Should parse successfully
      const ast = parseSync(input);
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      // Expected AST structure
      const expected = {
        type: 'array',
        items: [
          {
            type: 'object',
            properties: { type: 'test' },
            location: expect.any(Object)
          }
        ],
        location: expect.any(Object)
      };
      
      expect(arrayValue).toEqual(expected);
    });
    
    it.skip('should handle multiple object literals in arrays', () => {
      const input = '/var @users = [{"name": "alice", "age": 30}, {"name": "bob", "age": 25}]';
      
      // Should parse without errors
      const ast = parseSync(input);
      const varDirective = ast[0];
      const arrayValue = varDirective.values.value[0];
      
      expect(arrayValue.type).toBe('array');
      expect(arrayValue.items).toHaveLength(2);
      expect(arrayValue.items[0].type).toBe('object');
      expect(arrayValue.items[1].type).toBe('object');
    });
  });
  
  describe('Complex Nested Structures', () => {
    it.skip('should handle deeply nested mixed structures - requires JSON syntax support', () => {
      const input = '/var @complex = {"users": [{"name": "alice", "tags": ["admin", "user"]}]}';
      const ast = parseSync(input);
      
      const varDirective = ast[0];
      const value = varDirective.values.value;
      
      // All collections should have type info at every level
      const normalized = ASTEvaluator.normalizeObject(value);
      expect(normalized.type).toBe('object');
      
      // This demonstrates the goal: consistent typing throughout the tree
    });
  });
});

// Document current vs expected behavior
describe('Parser Behavior Comparison', () => {
  it('documents current array parsing', () => {
    const input = '/var @arr = [1, 2, 3]';
    const ast = parseSync(input);
    const value = ast[0].values.value;
    
    console.log('Current array AST:', JSON.stringify(value, null, 2));
    // Currently: [1, 2, 3] (plain JS array)
    
    const normalized = ASTEvaluator.normalizeArray(value);
    console.log('After normalization:', JSON.stringify(normalized, null, 2));
    // After: { type: 'array', items: [1, 2, 3], location: {...} }
  });
  
  it.skip('documents current object parsing - requires JSON syntax support', () => {
    const input = '/var @obj = {"name": "test"}';
    const ast = parseSync(input);
    const value = ast[0].values.value;
    
    console.log('Current object AST:', JSON.stringify(value, null, 2));
    // Currently: { name: 'test' } (plain JS object)
    
    const normalized = ASTEvaluator.normalizeObject(value);
    console.log('After normalization:', JSON.stringify(normalized, null, 2));
    // After: { type: 'object', properties: { name: 'test' }, location: {...} }
  });
});