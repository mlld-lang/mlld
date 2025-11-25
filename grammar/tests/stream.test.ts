import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Streaming grammar', () => {
  test('/stream directive adds stream withClause', async () => {
    const result = await parse('/stream @foo("hi")');
    expect(result.ast?.length).toBeGreaterThan(0);
    const directive = result.ast[0] as any;

    expect(directive.kind).toBe('stream');
    expect(directive.values?.withClause?.stream).toBe(true);
    expect(directive.values?.invocation?.withClause?.stream).toBe(true);
  });

  test('stream keyword on variable reference merges withClause', async () => {
    const { ast } = await parse('/var @out = stream @foo() with { pipeline: [@bar] }');
    expect(ast?.length).toBeGreaterThan(0);
    const directive = ast[0] as any;

    expect(directive.kind).toBe('var');
    const valueNode = directive.values?.value?.[0];
    const withClause = valueNode?.withClause;
    expect(withClause?.stream).toBe(true);
    expect(Array.isArray(withClause?.pipeline)).toBe(true);
  });

  test('stream prefix on code blocks desugars to withClause', async () => {
    const { ast } = await parse('/run stream js { 1 }');
    const directive = ast[0] as any;

    expect(directive.kind).toBe('run');
    expect(directive.subtype).toBe('runCode');
    expect(directive.values?.withClause?.stream).toBe(true);
  });
});
