import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('auth directive regression', () => {
  test('parses standalone auth short form in strict mode', async () => {
    const result = await parse('auth @brave = "BRAVE_API_KEY"', { mode: 'strict' });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directive: any = result.ast[0];
    expect(directive.kind).toBe('auth');
    expect(directive.subtype).toBe('auth');
    expect(directive.values?.name?.[0]?.content).toBe('brave');
    expect(directive.values?.expr).toBe('BRAVE_API_KEY');
  });

  test('parses standalone auth object form', async () => {
    const result = await parse('/auth @brave = { from: "keychain", as: "BRAVE_API_KEY" }', {
      mode: 'strict'
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directive: any = result.ast[0];
    expect(directive.kind).toBe('auth');
    expect(directive.subtype).toBe('auth');
    expect(directive.values?.expr?.type).toBe('object');
  });
});
