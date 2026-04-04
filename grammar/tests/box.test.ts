import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';

function firstNode(result: Awaited<ReturnType<typeof parse>>): any {
  return result.ast[0] as any;
}

describe('box grammar', () => {
  it('parses anonymous box blocks in strict mode', async () => {
    const source = 'box [ show "ok" ]';
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('box');
    expect(node.values.config).toBeUndefined();
    expect(node.values.withClause).toBeUndefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

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

  it('parses resolver shorthand box form', async () => {
    const source = '/box @workspace [\n  show "x"\n]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('box');
    expect(node.values.config).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('parses object config box form with fs field', async () => {
    const source = '/box { fs: @workspace, tools: ["Bash"] } [\n  show "x"\n]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('box');
    expect(node.values.config).toBeDefined();
    expect(node.values.block?.type).toBe('ExeBlock');
  });

  it('parses shelf config reads with aliased values', async () => {
    const source = '/box { shelf: { read: [@taskBrief as brief, @outreach.recipients] } } [\n  show "x"\n]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('box');
    expect(node.values.config).toBeDefined();
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

  it('parses box as exe RHS with anonymous form', async () => {
    const source = '/exe @fn() = box [ run cmd { echo ok } ]';
    const result = await parse(source, { mode: 'markdown' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeBox');
    expect(node.values.config).toBeUndefined();
    expect(node.values.boxWithClause).toBeUndefined();
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
