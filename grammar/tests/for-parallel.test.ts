import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

describe('Grammar - /for parallel options', () => {
  it('parses /for parallel with cap', async () => {
    const input = '/for 5 parallel @x in @arr => show @x';
    const { ast } = await parse(input);
    const node = ast[0] as DirectiveNode;
    expect(node.kind).toBe('for');
    expect(node.values).toHaveProperty('forOptions');
    const opts = (node.values as any).forOptions;
    expect(opts).toBeDefined();
    expect(opts.parallel).toBe(true);
    expect(opts.cap).toBe(5);
    expect(opts.rateMs).toBeUndefined();
  });

  it('parses for (n, wait) parallel in expressions with time units and spaces', async () => {
    const input = '/var @r = for ( 5 , 30s ) parallel @x in @arr => @x';
    const { ast } = await parse(input);
    const varDir = ast[0] as DirectiveNode;
    expect(varDir.kind).toBe('var');
    const valueNodes = (varDir.values as any).value as any[];
    const forExpr = valueNodes.find(n => n && n.type === 'ForExpression');
    expect(forExpr).toBeDefined();
    expect(forExpr.meta).toBeDefined();
    expect(forExpr.meta.forOptions).toBeDefined();
    expect(forExpr.meta.forOptions.parallel).toBe(true);
    expect(forExpr.meta.forOptions.cap).toBe(5);
    expect(forExpr.meta.forOptions.rateMs).toBe(30000);
  });
});

