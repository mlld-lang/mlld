
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('run-exec-1 directive', () => {
  it('should parse correctly', () => {
    const directive = `@exec greetCommand = echo "Hello from predefined command"`;

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
        "value": "greetCommand"
      }
    ],
    "content": [
      {
        "type": "string",
        "value": "echo \"Hello from predefined command\""
      }
    ]
  },
  "raw": {
    "identifier": "greetCommand",
    "content": "echo \"Hello from predefined command\""
  },
  "meta": {
    "sourceType": "literal"
  }
});
  });
});
