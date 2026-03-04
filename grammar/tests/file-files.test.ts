import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';

function firstNode(result: Awaited<ReturnType<typeof parse>>): any {
  return result.ast[0] as any;
}

describe('file/files grammar', () => {
  it('parses a file directive with a quoted path target', async () => {
    const source = 'file "task.md" = "hello"';
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('file');
    expect(node.subtype).toBe('file');
    expect(node.values.target?.type).toBe('path');
  });

  it('parses files with a resolver target', async () => {
    const source = 'files <@workspace/src/> = [{ "index.js": "ok", desc: "Entry point" }]';
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('files');
    expect(node.subtype).toBe('files');
    expect(node.values.target?.type).toBe('resolver');
    expect(node.values.target?.resolver).toBe('workspace');
    expect(node.values.target?.path).toBe('src/');
  });

  it('parses file/files directives inside box blocks', async () => {
    const source = `
box with { profile: "readonly" } [
  files "src/" = [{ "index.js": "ok" }]
  file "task.md" = "todo"
]
`.trim();
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('box');
    const statements = node.values.block?.values?.statements ?? [];
    const kinds = statements.map((statement: any) => statement.kind);
    expect(kinds).toContain('files');
    expect(kinds).toContain('file');
  });

  it('parses git source entries with option shorthands', async () => {
    const source = 'files <@workspace/src/> = git "https://github.com/user/repo" auth:@token branch:"main" path:"src/" depth:5';
    const result = await parse(source, { mode: 'strict' });

    expect(result.success).toBe(true);
    const node = firstNode(result);
    expect(node.kind).toBe('files');
    const entries = node.values.entries ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe('GitFilesSource');
    expect(entries[0]?.options?.auth?.[0]?.type).toBe('VariableReference');
    expect(entries[0]?.options?.branch?.[0]?.type).toBe('Literal');
    expect(entries[0]?.options?.path?.[0]?.type).toBe('Literal');
    expect(entries[0]?.options?.depth?.[0]?.type).toBe('Literal');
  });
});
