
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('text-path-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@text content = "file.md"`;

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
        "value": "content"
      }
    ],
    "content": [
      {
        "type": "string",
        "value": "\"file.md\""
      }
    ]
  },
  "raw": {
    "identifier": "content",
    "content": "\"file.md\""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
