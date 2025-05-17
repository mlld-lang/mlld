
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('text-template-multiline-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@text multiline = [[
This is a
multi-line template
with {{variable}}
]]`;

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
        "value": "multiline"
      }
    ],
    "content": []
  },
  "raw": {
    "identifier": "multiline",
    "content": ""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
