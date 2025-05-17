
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('data-object-nested-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@data config = {
  server: {
    port: 8080,
    host: "localhost"
  },
  debug: true
}`;

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
    "name": "config",
    "value": {}
  },
  "raw": {
    "name": "config",
    "value": ""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
