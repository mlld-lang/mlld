import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Optional var assignment marker regression', () => {
  test('parses var @name? = ... in strict mode', async () => {
    const input = [
      'var @item = {"title": "Hello"}',
      'var @subtitle? = @item.subtitle',
      'show `Title: @item.title @subtitle?`',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const subtitleDirective: any = result.ast[1];
    expect(subtitleDirective.kind).toBe('var');
    expect(subtitleDirective.values?.identifier?.[0]?.identifier).toBe('subtitle');
    expect(subtitleDirective.meta?.optionalAssignment).toBe(true);
  });
});
