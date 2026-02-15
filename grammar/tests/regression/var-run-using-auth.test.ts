import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('var run command using auth regression', () => {
  test('parses using auth on var-assigned run commands and keeps using info in AST', async () => {
    const result = await parse(
      'var @result = run cmd { echo "$KEY" } using auth:testkey',
      { mode: 'strict' }
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directive: any = result.ast[0];
    expect(directive.kind).toBe('var');

    const valueNode = directive.values?.value?.[0];
    expect(valueNode?.type).toBe('command');
    expect(valueNode?.using).toEqual({ auth: 'testkey' });
  });
});
