import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

function getForExpression(ast: any): any {
  const varDir = ast[0] as DirectiveNode;
  const valueNodes = (varDir.values as any).value as any[];
  return valueNodes.find((n) => n && n.type === 'ForExpression');
}

describe('Grammar - for when filter sugar', () => {
  it('adds implicit none => skip to for...when expressions without none', async () => {
    const input = '/var @out = for @x in [-1, 0, 1, 5, 12] when [ @x > 0 => @x; @x > 10 => "big" ]';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(0);

    const forExpr = getForExpression(ast);
    expect(forExpr).toBeDefined();

    const whenExpr = (forExpr as any).expression[0];
    expect(whenExpr.conditions).toHaveLength(3);

    const lastCondition = whenExpr.conditions[whenExpr.conditions.length - 1];
    expect(lastCondition.condition[0].valueType).toBe('none');
    expect(lastCondition.action[0].valueType).toBe('skip');
  });

  it('keeps explicit none handlers when present', async () => {
    const input = '/var @out = for @x in @xs when [ none => @x ]';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(0);

    const forExpr = getForExpression(ast);
    expect(forExpr).toBeDefined();

    const whenExpr = (forExpr as any).expression[0];
    expect(whenExpr.conditions).toHaveLength(1);
    const onlyCondition = whenExpr.conditions[0];
    expect(onlyCondition.condition[0].valueType).toBe('none');
  });

  it('parses for...when guard with block body and appends none => skip', async () => {
    const input = '/var @out = for @x in [1, 2, 3] when @x > 1 [ => @x ]';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(0);

    const forExpr = getForExpression(ast);
    expect(forExpr).toBeDefined();

    const whenExpr = (forExpr as any).expression[0];
    expect(whenExpr.conditions).toHaveLength(2);
    expect(whenExpr.conditions[0].action.length).toBeGreaterThan(0);
    expect(whenExpr.conditions[1].condition[0].valueType).toBe('none');
    expect(whenExpr.conditions[1].action[0].valueType).toBe('skip');
  });
});
