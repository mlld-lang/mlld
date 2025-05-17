
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('add-path directive', () => {
  it('should parse correctly', () => {
    const directive = `@add [file.md]`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('add');
    expect(result.subtype).toBe('addTemplate');

    // Test values object structure
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "add",
  "subtype": "addTemplate",
  "values": {
    "identifier": [],
    "content": []
  },
  "raw": {
    "identifier": "",
    "content": ""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
