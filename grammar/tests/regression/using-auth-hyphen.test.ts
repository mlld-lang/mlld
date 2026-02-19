import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Using auth hyphenated names regression', () => {
  test('parses hyphenated auth names in env blocks', async () => {
    const input = [
      'var @cfg = { auth: "claude-alt" }',
      'env @cfg [',
      '  run cmd { echo "ok" } using auth:claude-alt',
      '  => "done"',
      ']',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const envDirective: any = result.ast[1];
    expect(envDirective.kind).toBe('env');
  });
});
