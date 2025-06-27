import { describe, it, expect, vi } from 'vitest';
import { ASTEvaluator } from '@interpreter/core/ast-evaluator';

// Mock the lazy-eval module
vi.mock('@interpreter/eval/lazy-eval', () => ({
  evaluateDataValue: vi.fn(async (value: any) => {
    // Simple mock that handles Text nodes
    if (value && typeof value === 'object' && value.type === 'Text' && 'content' in value) {
      return value.content;
    }
    
    // Handle objects recursively
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        if (val && typeof val === 'object' && val.type === 'Text' && 'content' in val) {
          result[key] = val.content;
        } else {
          result[key] = val;
        }
      }
      return result;
    }
    
    // Pass through other values
    return value;
  })
}));

describe('ASTEvaluator - Arrays', () => {
  // Mock environment for evaluateToRuntime tests
  const mockEnv = {} as any;
  
  describe('normalizeArray', () => {
    it('should normalize plain JavaScript arrays', () => {
      const plain = [1, 2, 3];
      const normalized = ASTEvaluator.normalizeArray(plain);
      
      expect(normalized).toEqual({
        type: 'array',
        items: [1, 2, 3],
        location: { synthetic: true }
      });
    });
    
    it('should handle already-normalized arrays', () => {
      const typed = { 
        type: 'array', 
        items: [1, 2, 3], 
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
      };
      const normalized = ASTEvaluator.normalizeArray(typed);
      
      // Should return the same reference
      expect(normalized).toBe(typed);
    });
    
    it('should normalize nested arrays', () => {
      const nested = [[1, 2], [3, 4]];
      const normalized = ASTEvaluator.normalizeArray(nested);
      
      expect(normalized.type).toBe('array');
      expect(normalized.items).toHaveLength(2);
      expect(normalized.items[0].type).toBe('array');
      expect(normalized.items[0].items).toEqual([1, 2]);
      expect(normalized.items[1].type).toBe('array');
      expect(normalized.items[1].items).toEqual([3, 4]);
    });
    
    it('should throw for non-array values', () => {
      expect(() => ASTEvaluator.normalizeArray('not an array')).toThrow('Expected array');
      expect(() => ASTEvaluator.normalizeArray(123)).toThrow('Expected array');
      expect(() => ASTEvaluator.normalizeArray({})).toThrow('Expected array');
    });
  });
  
  describe('evaluateToRuntime', () => {
    it('should convert AST arrays to plain JavaScript arrays', async () => {
      const astArray = {
        type: 'array',
        items: [
          { type: 'Text', content: 'hello' },
          { type: 'Text', content: 'world' }
        ]
      };
      
      const result = await ASTEvaluator.evaluateToRuntime(astArray, mockEnv);
      expect(result).toEqual(['hello', 'world']);
    });
    
    it('should handle arrays with objects containing string fields', async () => {
      const users = [
        { name: { type: 'Text', content: 'alice' }, dept: { type: 'Text', content: 'eng' } },
        { name: { type: 'Text', content: 'bob' }, dept: { type: 'Text', content: 'sales' } }
      ];
      
      const result = await ASTEvaluator.evaluateToRuntime(users, mockEnv);
      
      expect(result).toEqual([
        { name: 'alice', dept: 'eng' },
        { name: 'bob', dept: 'sales' }
      ]);
    });
    
    it('should fix filter with string comparison', async () => {
      // This simulates the issue where objects in arrays have AST nodes
      const users = [
        { 
          name: { type: 'Text', content: 'alice' }, 
          dept: { type: 'Text', content: 'eng' } 
        },
        { 
          name: { type: 'Text', content: 'bob' }, 
          dept: { type: 'Text', content: 'sales' } 
        }
      ];
      
      const result = await ASTEvaluator.evaluateToRuntime(users, mockEnv);
      
      // Result should be plain JS objects, not AST nodes
      expect(result[0].name).toBe('alice');
      expect(result[0].dept).toBe('eng');
      expect(result[1].name).toBe('bob');
      expect(result[1].dept).toBe('sales');
      
      // Should work with array filter
      const filtered = result.filter(user => user.dept === 'eng');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('alice');
    });
    
    it('should handle mixed content in arrays', async () => {
      const mixed = {
        type: 'array',
        items: [
          'plain string',
          123,
          { type: 'Text', content: 'ast text' },
          { key: 'value' },
          null
        ]
      };
      
      const result = await ASTEvaluator.evaluateToRuntime(mixed, mockEnv);
      
      expect(result).toEqual([
        'plain string',
        123,
        'ast text',
        { key: 'value' },
        null
      ]);
    });
    
    it('should handle null and undefined values', async () => {
      expect(await ASTEvaluator.evaluateToRuntime(null, mockEnv)).toBe(null);
      expect(await ASTEvaluator.evaluateToRuntime(undefined, mockEnv)).toBe(undefined);
    });
    
    it('should pass through non-array values unchanged', async () => {
      expect(await ASTEvaluator.evaluateToRuntime('hello', mockEnv)).toBe('hello');
      expect(await ASTEvaluator.evaluateToRuntime(42, mockEnv)).toBe(42);
      expect(await ASTEvaluator.evaluateToRuntime({ foo: 'bar' }, mockEnv)).toEqual({ foo: 'bar' });
    });
  });
  
  describe('integration with array functions', () => {
    it('should enable groupBy to work with normalized arrays', async () => {
      const users = {
        type: 'array',
        items: [
          { dept: { type: 'Text', content: 'eng' }, name: 'alice' },
          { dept: { type: 'Text', content: 'sales' }, name: 'bob' },
          { dept: { type: 'Text', content: 'eng' }, name: 'charlie' }
        ]
      };
      
      const normalized = await ASTEvaluator.evaluateToRuntime(users, mockEnv);
      
      // Simulate what groupBy would do
      const grouped = normalized.reduce((groups, item) => {
        const group = String(item.dept);
        if (!groups[group]) groups[group] = [];
        groups[group].push(item);
        return groups;
      }, {});
      
      expect(Object.keys(grouped)).toEqual(['eng', 'sales']);
      expect(grouped.eng).toHaveLength(2);
      expect(grouped.sales).toHaveLength(1);
    });
    
    it('should enable find to work with normalized arrays', async () => {
      const items = {
        type: 'array',
        items: [
          { id: 1, name: { type: 'Text', content: 'first' } },
          { id: 2, name: { type: 'Text', content: 'second' } },
          { id: 3, name: { type: 'Text', content: 'third' } }
        ]
      };
      
      const normalized = await ASTEvaluator.evaluateToRuntime(items, mockEnv);
      
      // Simulate what find would do
      const found = normalized.find(item => item.name === 'second');
      
      expect(found).toBeDefined();
      expect(found.id).toBe(2);
      expect(found.name).toBe('second');
    });
  });
});