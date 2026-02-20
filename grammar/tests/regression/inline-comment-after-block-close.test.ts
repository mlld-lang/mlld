import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Inline comment after closing block bracket regression', () => {
  test('parses >> after ] for /when block forms in strict mode', async () => {
    const input = [
      '/when [',
      '  @x => show "ok"',
      '] >> end phase 1',
      '/when @state [',
      '  "ready" => show "go"',
      '] >> end phase 2',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directives = result.ast.filter((node: any) => node.type === 'Directive');
    expect(directives).toHaveLength(2);
    expect(directives[0].kind).toBe('when');
    expect(directives[1].kind).toBe('when');
    expect(directives[0].meta?.comment?.marker).toBe('>>');
    expect(directives[0].meta?.comment?.content).toBe('end phase 1');
    expect(directives[1].meta?.comment?.marker).toBe('>>');
    expect(directives[1].meta?.comment?.content).toBe('end phase 2');
  });

  test('parses >> after ] for /if block forms in strict mode', async () => {
    const input = [
      '/if @ok [',
      '  show "ok"',
      '] >> done',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directive: any = result.ast[0];
    expect(directive.kind).toBe('if');
    expect(directive.meta?.comment?.marker).toBe('>>');
    expect(directive.meta?.comment?.content).toBe('done');
  });
});
