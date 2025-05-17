
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('add-template-multiline-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@text variable = "value"`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('text');
    expect(result.subtype).toBe('textAssignment');

    // Test values object structure
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "text",
  "subtype": "textAssignment",
  "values": {
    "identifier": [
      {
        "type": "string",
        "value": "variable"
      }
    ],
    "content": [
      {
        "type": "string",
        "value": "\"value\""
      }
    ]
  },
  "raw": {
    "identifier": "variable",
    "content": "\"value\""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
