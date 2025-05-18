
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('text-assignment-1 directive', () => {
  it('should parse correctly', async () => {
    const directive = `@text greeting = "Hello, world!"`;

    const result = (await parse(directive)).ast[0];
    
    // Debug output
    console.log('Parsed result nodeId:', result.nodeId);

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('text');
    expect(result.subtype).toBe('textAssignment');
    
    // Test that nodeId is generated
    expect(result.nodeId).toBeDefined();
    expect(result.nodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/); // UUID format

    // Test values object structure
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');
    
    // Test that child nodes also have nodeIds
    expect(result.values.identifier[0].nodeId).toBeDefined();
    expect(result.values.identifier[0].nodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(result.values.content[0].nodeId).toBeDefined();
    expect(result.values.content[0].nodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "text",
  "subtype": "textAssignment",
  "values": {
    "identifier": [
      {
        "type": "VariableReference",
        "valueType": "identifier",
        "isVariableReference": true,
        "identifier": "greeting"
      }
    ],
    "content": [
      {
        "type": "Text",
        "content": "Hello, world!"
      }
    ]
  },
  "raw": {
    "identifier": "greeting",
    "content": "Hello, world!"
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
