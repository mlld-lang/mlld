# AST Refactor Phase 3: Grammar Output Tests

## Goal

Define exactly what the grammar should produce for all data types through comprehensive tests. These tests will guide the grammar implementation in Phase 4.

## Scope

- Create test suite defining expected AST structure
- Cover all data types and edge cases
- Document the complete type system
- Ensure compatibility with ASTEvaluator output

## Test Structure

### Basic Data Types

```typescript
describe('Grammar Data Type Output', () => {
  describe('Primitive Types', () => {
    it('should parse numbers with type info', () => {
      expect(parse('42')).toEqual({
        type: 'number',
        value: 42,
        location: { line: 1, column: 1, offset: 0 }
      });
      
      expect(parse('3.14')).toEqual({
        type: 'number',
        value: 3.14,
        location: { line: 1, column: 1, offset: 0 }
      });
    });
    
    it('should parse booleans with type info', () => {
      expect(parse('true')).toEqual({
        type: 'boolean',
        value: true,
        location: { line: 1, column: 1, offset: 0 }
      });
    });
    
    it('should parse null with type info', () => {
      expect(parse('null')).toEqual({
        type: 'null',
        value: null,
        location: { line: 1, column: 1, offset: 0 }
      });
    });
    
    it('should parse strings with wrapper info', () => {
      expect(parse('"hello"')).toEqual({
        type: 'string',
        value: 'hello',
        wrapperType: 'doubleQuote',
        location: { line: 1, column: 1, offset: 0 }
      });
    });
  });
  
  describe('Complex Types', () => {
    it('should parse arrays with typed items', () => {
      expect(parse('[1, "two", true]')).toEqual({
        type: 'array',
        items: [
          { type: 'number', value: 1, location: {...} },
          { type: 'string', value: 'two', wrapperType: 'doubleQuote', location: {...} },
          { type: 'boolean', value: true, location: {...} }
        ],
        location: { line: 1, column: 1, offset: 0 }
      });
    });
    
    it('should parse objects with typed properties', () => {
      expect(parse('{"name": "alice", "age": 30}')).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string', value: 'alice', wrapperType: 'doubleQuote', location: {...} },
          age: { type: 'number', value: 30, location: {...} }
        },
        location: { line: 1, column: 1, offset: 0 }
      });
    });
  });
  
  describe('mlld Expressions in Data', () => {
    it('should preserve variable references', () => {
      expect(parse('{"user": @currentUser}')).toEqual({
        type: 'object',
        properties: {
          user: {
            type: 'VariableReference',
            identifier: 'currentUser',
            location: {...}
          }
        },
        location: {...}
      });
    });
    
    it('should preserve exec invocations', () => {
      expect(parse('[1, @transform(@data), 3]')).toEqual({
        type: 'array',
        items: [
          { type: 'number', value: 1, location: {...} },
          {
            type: 'ExecInvocation',
            name: 'transform',
            args: [{ type: 'VariableReference', identifier: 'data', location: {...} }],
            location: {...}
          },
          { type: 'number', value: 3, location: {...} }
        ],
        location: {...}
      });
    });
  });
});
```

## Next Steps

These tests define the contract for Phase 4 (Grammar Update).