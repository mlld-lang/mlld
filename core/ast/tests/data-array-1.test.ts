
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('data-array-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@data colors = ["red", "green", "blue"]`;

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
    "name": "colors",
    "value": [
      "red",
      "green",
      "blue"
    ]
  },
  "raw": {
    "name": "colors",
    "value": "[\"red\", \"green\", \"blue\"]"
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
