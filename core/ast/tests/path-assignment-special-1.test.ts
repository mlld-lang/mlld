
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('path-assignment-special-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@path homeConfig = [@~/config]`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('path');
    expect(result.subtype).toBe('unknown');

    // Test values object structure
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "path",
  "subtype": "unknown",
  "values": {
    "identifier": [
      {
        "type": "string",
        "value": "homeConfig"
      }
    ],
    "content": [
      {
        "type": "string",
        "value": "["
      }
    ]
  },
  "raw": {
    "identifier": "homeConfig",
    "content": "["
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
