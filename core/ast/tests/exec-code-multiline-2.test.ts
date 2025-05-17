
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('exec-code-multiline-2 directive', () => {
  it('should parse correctly', () => {
    const directive = `@exec format (name) = javascript [
  // Format the name with title case
  const words = name.split(' ');
  const titled = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1).toUpperCase();
  });
  return titled.join(' ');
]
@run @format("bob smith")`;

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
    "identifier": [
      {
        "type": "string",
        "value": "words"
      }
    ],
    "content": []
  },
  "raw": {
    "identifier": "words",
    "content": ""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
