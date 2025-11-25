import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

describe('Grammar - /for parallel options', () => {
  it('parses /for parallel(cap, pacing) with new syntax', async () => {
    const input = '/for parallel(3, 1s) @x in @arr => show @x';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(0);
    const node = ast[0] as DirectiveNode;
    expect(node.kind).toBe('for');
    expect(node.values).toHaveProperty('forOptions');
    const opts = (node.values as any).forOptions;
    expect(opts).toBeDefined();
    expect(opts.parallel).toBe(true);
    expect(opts.cap).toBe(3);
    expect(opts.rateMs).toBe(1000);
  });

  it('parses for parallel(cap) in expressions with time units and spaces', async () => {
    const input = '/var @r = for parallel( 5 , 1s ) @x in @arr => @x';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(0);
    const varDir = ast[0] as DirectiveNode;
    expect(varDir.kind).toBe('var');
    const valueNodes = (varDir.values as any).value as any[];
    const forExpr = valueNodes.find(n => n && n.type === 'ForExpression');
    expect(forExpr).toBeDefined();
    expect(forExpr.meta).toBeDefined();
    expect(forExpr.meta.forOptions).toBeDefined();
    expect(forExpr.meta.forOptions.parallel).toBe(true);
    expect(forExpr.meta.forOptions.cap).toBe(5);
    expect(forExpr.meta.forOptions.rateMs).toBe(1000);
  });

  it('parses parallel() with default cap', async () => {
    const input = '/for parallel() @x in @arr => show @x';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(0);
    const node = ast[0] as DirectiveNode;
    expect(node.kind).toBe('for');
    const opts = (node.values as any).forOptions;
    expect(opts.parallel).toBe(true);
    expect(opts.cap).toBeUndefined();
    expect(opts.rateMs).toBeUndefined();
  });

  it('supports legacy syntax with warning', async () => {
    const input = '/for (2, 1s) parallel @x in @arr => show @x';
    const { ast, warnings } = await parse(input);
    expect(warnings).toHaveLength(1);
    const warning = warnings[0];
    expect(warning.message).toContain('Use parallel(cap, pacing) instead of (cap, pacing) parallel');
    expect(warning.code).toBe('for-parallel-deprecated');
    const node = ast[0] as DirectiveNode;
    expect(node.kind).toBe('for');
    expect(node.values).toHaveProperty('forOptions');
    const opts = (node.values as any).forOptions;
    expect(opts).toBeDefined();
    expect(opts.parallel).toBe(true);
    expect(opts.cap).toBe(2);
    expect(opts.rateMs).toBe(1000);
  });
});
