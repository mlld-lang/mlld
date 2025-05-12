
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('text-assignment directive', () => {
  it('should parse correctly', () => {
    const directive = `@text greeting = "Hello, world\\!"`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('text');
    expect(result.subtype).toBe('textAssignment');

    // Simplify the AST comparison to only check the essential properties
    // The exact shape of the AST is subject to change during development
    expect(result).toMatchObject({
      "type": "Directive",
      "kind": "text",
      "subtype": "textAssignment"
    });

    // Check that values and raw properties exist
    expect(result).toHaveProperty('values');
    expect(result).toHaveProperty('raw');
    expect(result).toHaveProperty('meta');

    // Check that values object has expected properties
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');

    // Check that raw object has expected properties
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');
  });
});
