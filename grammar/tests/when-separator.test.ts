import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

describe('Grammar - when separators', () => {
  it('parses semicolons between /when arms', async () => {
    const input = '/when @x: [1 => show "one"; 2 => show "two"]';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(0);

    const whenDir = ast[0] as DirectiveNode;
    expect(whenDir.kind).toBe('when');
    expect((whenDir.values as any).conditions).toHaveLength(2);
  });

  it('parses semicolons inside value-returning when expressions', async () => {
    const input = '/var @res = when [ true => 1; none => 0 ]';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(0);

    const varDir = ast[0] as DirectiveNode;
    const valueNodes = (varDir.values as any).value as any[];
    const whenExpr = valueNodes.find((n) => n && n.type === 'WhenExpression');
    expect(whenExpr).toBeDefined();
    expect(whenExpr.conditions).toHaveLength(2);
  });
});
