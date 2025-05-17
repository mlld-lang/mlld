
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('run-exec-2 directive', () => {
  it('should parse correctly', () => {
    const directive = `@run @greetCommand`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('run');
    expect(result.subtype).toBe('runCommand');

    // Test values object structure
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "run",
  "subtype": "runCommand",
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
