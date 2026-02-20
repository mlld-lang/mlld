import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Inline comment spacing regression', () => {
  test('rejects << without preceding whitespace', async () => {
    const result = await parse('/var @z = 3<<No space', { mode: 'strict' });
    expect(result.success).toBe(false);
    expect(result.error?.location?.start?.line).toBe(1);
  });

  test('rejects >> without preceding whitespace', async () => {
    const result = await parse('/var @z = 3>>No space', { mode: 'strict' });
    expect(result.success).toBe(false);
    expect(result.error?.location?.start?.line).toBe(1);
  });

  test('reports no-whitespace << failure on the same line in multiline input', async () => {
    const input = [
      '/var @z = 3<<No space',
      '>> follow-up comment',
      '/var @x = 1',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(false);
    expect(result.error?.location?.start?.line).toBe(1);
  });

  test('parses spaced inline comments with subsequent line-start comments', async () => {
    const input = [
      '/var @z = 3 << spaced',
      '>> follow-up comment',
      '/var @x = 1',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }
    const directives = result.ast.filter((node: any) => node.type === 'Directive');

    expect(directives).toHaveLength(2);
    expect(directives[0].kind).toBe('var');
    expect(directives[1].kind).toBe('var');
  });
});
