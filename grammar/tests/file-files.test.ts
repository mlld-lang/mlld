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
});
