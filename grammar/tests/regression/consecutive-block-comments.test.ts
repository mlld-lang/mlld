import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Consecutive block comments regression', () => {
  test('parses consecutive comments before statements in /if blocks', async () => {
    const input = [
      '/if true [',
      '  >> first comment',
      '  >> second comment',
      '  show "hello"',
      ']',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directive: any = result.ast[0];
    expect(directive.kind).toBe('if');
    expect(directive.values.then[0].kind).toBe('show');
    expect(directive.values.then[0].meta?.leadingComments).toHaveLength(2);
    expect(directive.values.then[0].meta.leadingComments.map((c: any) => c.content)).toEqual([
      'first comment',
      'second comment',
    ]);
  });

  test('parses consecutive comments before statements in /for blocks', async () => {
    const input = [
      '/for @item in [1, 2] [',
      '  >> first comment',
      '  >> second comment',
      '  show @item',
      ']',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directive: any = result.ast[0];
    expect(directive.kind).toBe('for');
    expect(directive.values.action[0].kind).toBe('show');
    expect(directive.values.action[0].meta?.leadingComments).toHaveLength(2);
    expect(directive.values.action[0].meta.leadingComments.map((c: any) => c.content)).toEqual([
      'first comment',
      'second comment',
    ]);
  });
});
