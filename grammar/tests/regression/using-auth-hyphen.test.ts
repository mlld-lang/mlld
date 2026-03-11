import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Using auth hyphenated names regression', () => {
  test('parses hyphenated auth names in box blocks', async () => {
    const input = [
      'var @cfg = { auth: "claude-alt" }',
      'box @cfg [',
      '  run cmd { echo "ok" } using auth:claude-alt',
      '  => "done"',
      ']',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const boxDirective: any = result.ast[1];
    expect(boxDirective.kind).toBe('box');
  });
});
