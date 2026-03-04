import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';

function firstNode(result: Awaited<ReturnType<typeof parse>>): any {
  return result.ast[0] as any;
}

describe('box grammar', () => {
  it('parses configless box with a with clause in strict mode', async () => {
    const source = 'box with { profile: "readonly" } [ show "ok" ]';
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('box');
    expect(node.values.config).toBeUndefined();
    expect(node.values.withClause).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('parses configless box with a with clause in markdown mode', async () => {
    const source = '/box with { tools: @myTools } [\n  show "ok"\n]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('box');
    expect(node.values.config).toBeUndefined();
    expect(node.values.withClause).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('errors when box has neither config nor with clause', async () => {
    const source = '/box [\n  /show "x"\n]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('box requires a config expression or with clause');
  });

  it('parses box as exe RHS with configless with-clause form', async () => {
    const source = 'exe @fn(tools, prompt) = box with { tools: @tools } [ run cmd { echo @prompt } ]';
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeBox');
    expect(node.values.boxWithClause).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('parses box as exe RHS with configless form in markdown mode', async () => {
    const source = '/exe @fn(tools, prompt) = box with { tools: @tools } [ run cmd { echo @prompt } ]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeBox');
    expect(node.values.boxWithClause).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('parses box as exe RHS with config reference form', async () => {
    const source = '/exe @fn(cfg) = box @cfg [ run cmd { echo ok } ]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeBox');
    expect(node.values.config).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });
});
