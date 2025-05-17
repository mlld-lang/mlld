
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('data-object-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@data user = { "name": "John", "age": 30 }`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('data');
    expect(result.subtype).toBe('dataAssignment');

    // Test values object structure
    expect(result.values).toHaveProperty('name');
    expect(result.values).toHaveProperty('value');
    expect(result.raw).toHaveProperty('name');
    expect(result.raw).toHaveProperty('value');

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "data",
  "subtype": "dataAssignment",
  "values": {
    "name": "user",
    "value": {
      "name": "John",
      "age": 30
    }
  },
  "raw": {
    "name": "user",
    "value": "{ \"name\": \"John\", \"age\": 30 }"
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
