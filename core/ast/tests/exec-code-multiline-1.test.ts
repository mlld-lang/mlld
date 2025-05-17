
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('exec-code-multiline-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@text name = "bob smith"`;

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
        "value": "name"
      }
    ],
    "content": [
      {
        "type": "string",
        "value": "\"bob smith\""
      }
    ]
  },
  "raw": {
    "identifier": "name",
    "content": "\"bob smith\""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
