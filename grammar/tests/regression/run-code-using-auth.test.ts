import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('run code using auth regression', () => {
  test('parses using auth on run sh code blocks and keeps withClause auth', async () => {
    const result = await parse('/run sh { echo "$KEY" } using auth:testkey', { mode: 'strict' });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directive: any = result.ast[0];
    expect(directive.kind).toBe('run');
    expect(directive.subtype).toBe('runCode');
    expect(directive.values?.withClause).toMatchObject({ auth: 'testkey' });
  });

  test('parses using auth on run js code blocks with args', async () => {
    const result = await parse(
      '/run js (@payload) { return process.env.KEY } using auth:testkey',
      { mode: 'strict' }
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directive: any = result.ast[0];
    expect(directive.kind).toBe('run');
    expect(directive.subtype).toBe('runCode');
    expect(directive.values?.args).toHaveLength(1);
    expect(directive.values?.args?.[0]?.identifier).toBe('payload');
    expect(directive.values?.withClause).toMatchObject({ auth: 'testkey' });
  });
});
