
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('import-all-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@import {*} from [config.mld]`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('Directive');
    expect(result.kind).toBe('import');
    expect(result.subtype).toBe('importSelected');

    // Test values object structure
    expect(result.values).toHaveProperty('identifier');
    expect(result.values).toHaveProperty('content');
    expect(result.raw).toHaveProperty('identifier');
    expect(result.raw).toHaveProperty('content');

    // Full AST comparison
    expect(result).toMatchObject({
  "type": "Directive",
  "kind": "import",
  "subtype": "importSelected",
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
