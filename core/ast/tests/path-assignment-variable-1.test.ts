
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('path-assignment-variable-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@text username = "john"`;

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
        "value": "username"
      }
    ],
    "content": [
      {
        "type": "string",
        "value": "\"john\""
      }
    ]
  },
  "raw": {
    "identifier": "username",
    "content": "\"john\""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
