import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

function collectLetAssignments(value: unknown, out: any[] = []): any[] {
  if (Array.isArray(value)) {
    for (const item of value) collectLetAssignments(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') {
    return out;
  }

  const node = value as Record<string, unknown>;
  if (node.type === 'LetAssignment') {
    out.push(node);
  }

  for (const child of Object.values(node)) {
    collectLetAssignments(child, out);
  }

  return out;
}

function expectNullishBacktick(letNode: any) {
  const expr = letNode?.value?.[0];
  expect(expr?.type).toBe('BinaryExpression');
  expect(expr?.operator).toBe('??');
  expect(expr?.right?.wrapperType).toBe('backtick');
}

describe('Nullish backtick RHS in block contexts regression', () => {
  test('parses ?? with backtick RHS inside for, for parallel, loop, and if blocks', async () => {
    const input = [
      '/for @item in [1] [',
      '  let @x = @item.id ?? `fallback-@mx.for.index`',
      '  => @x',
      ']',
      '/for parallel(2) @item in [1] [',
      '  let @x = @item.id ?? `fallback-@mx.for.index`',
      '  => @x',
      ']',
      '/loop(2) [',
      '  let @x = @item.id ?? `fallback-@mx.loop.index`',
      ']',
      '/if @ok [',
      '  let @x = @item.id ?? `fallback-@mx.if.index`',
      ']',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const letAssignments = collectLetAssignments(result.ast);
    expect(letAssignments).toHaveLength(4);

    for (const letNode of letAssignments) {
      expectNullishBacktick(letNode);
    }
  });

  test('keeps ?? with string literal RHS behavior unchanged in for parallel blocks', async () => {
    const input = [
      '/for parallel(2) @item in [1] [',
      '  let @x = @item.id ?? "fallback"',
      '  => @x',
      ']',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const letAssignments = collectLetAssignments(result.ast);
    expect(letAssignments).toHaveLength(1);

    const expr = letAssignments[0]?.value?.[0];
    expect(expr?.type).toBe('BinaryExpression');
    expect(expr?.operator).toBe('??');
    expect(expr?.right?.type).toBe('Literal');
    expect(expr?.right?.value).toBe('fallback');
  });
});
