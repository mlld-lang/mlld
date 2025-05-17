
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('data-primitive-number-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@data number.count = 42`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('data');
    expect(result.subtype).toBe('dataAssignment');

    // Test values object structure
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "data",
  "subtype": "dataAssignment",
  "values": {
    "identifier": [],
    "content": [
      {
        "type": "string",
        "value": "42"
      }
    ]
  },
  "raw": {
    "identifier": "",
    "content": "42"
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
