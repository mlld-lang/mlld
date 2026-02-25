import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';

function firstNode(result: Awaited<ReturnType<typeof parse>>): any {
  return result.ast[0] as any;
}

describe('env grammar', () => {
  it('parses configless env with a with clause in strict mode', async () => {
    const source = 'env with { profile: "readonly" } [ show "ok" ]';
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('env');
    expect(node.values.config).toBeUndefined();
    expect(node.values.withClause).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('parses configless env with a with clause in markdown mode', async () => {
    const source = '/env with { tools: @myTools } [\n  show "ok"\n]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('env');
    expect(node.values.config).toBeUndefined();
    expect(node.values.withClause).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('errors when env has neither config nor with clause', async () => {
    const source = '/env [\n  /show "x"\n]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('env requires a config expression or with clause');
  });

  it('parses env as exe RHS with configless with-clause form', async () => {
    const source = 'exe @fn(tools, prompt) = env with { tools: @tools } [ run cmd { echo @prompt } ]';
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeEnv');
    expect(node.values.envWithClause).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('parses env as exe RHS with configless form in markdown mode', async () => {
    const source = '/exe @fn(tools, prompt) = env with { tools: @tools } [ run cmd { echo @prompt } ]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeEnv');
    expect(node.values.envWithClause).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('parses env as exe RHS with config reference form', async () => {
    const source = '/exe @fn(cfg) = env @cfg [ run cmd { echo ok } ]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeEnv');
    expect(node.values.config).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });
});
