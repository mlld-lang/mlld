
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('exec-code-3 directive', () => {
  it('should parse correctly', () => {
    const directive = `@exec sum (a, b) = javascript [console.log(Number(a) + Number(b));]`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('exec');
    expect(result.subtype).toBe('unknown');

    // Test values object structure
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "exec",
  "subtype": "unknown",
  "values": {
    "identifier": [],
    "content": [
      {
        "type": "string",
        "value": "javascript [console.log(Number(a) + Number(b));]"
      }
    ]
  },
  "raw": {
    "identifier": "",
    "content": "javascript [console.log(Number(a) + Number(b));]"
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
