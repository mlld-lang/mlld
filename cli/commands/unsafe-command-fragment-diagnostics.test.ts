import { describe, expect, it } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { parse } from '@grammar/parser';
import { collectUnsafeCommandFragmentDiagnostics } from './unsafe-command-fragment-diagnostics';

async function parseDocument(source: string): Promise<any[]> {
  const result = await parse(source, { mode: 'markdown', startRule: 'Start' });
  if (!result.success) {
    throw result.error;
  }
  return result.ast;
}

describe('unsafe command fragment diagnostics', () => {
  it('warns when /run cmd reuses a quoted interpolated template fragment', async () => {
    const ast = await parseDocument([
      '/var @path = "/tmp/a b"',
      '/var @flags = `--mcp-config "@path"`',
      '/run cmd { echo @flags }'
    ].join('\n'));

    const diagnostics = collectUnsafeCommandFragmentDiagnostics(ast);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
    expect(diagnostics[0].message).toContain('@flags');
    expect(diagnostics[0].message).toContain('Unsafe cmd fragment interpolation');
    expect(diagnostics[0].range.start.line).toBe(2);
  });

  it('warns when cmd executables reuse a quoted interpolated template fragment', async () => {
    const ast = await parseDocument([
      '/var @path = "/tmp/a b"',
      '/var @flags = `--mcp-config "@path"`',
      '/exe @run() = cmd { echo @flags }'
    ].join('\n'));

    const diagnostics = collectUnsafeCommandFragmentDiagnostics(ast);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('@flags');
    expect(diagnostics[0].range.start.line).toBe(2);
  });

  it('warns when a prebuilt quoted command string is re-interpolated into /run cmd', async () => {
    const ast = await parseDocument([
      '/var @cmd = `node script "@arg1" "@arg2"`',
      '/run cmd { @cmd }'
    ].join('\n'));

    const diagnostics = collectUnsafeCommandFragmentDiagnostics(ast);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('@cmd');
  });

  it('does not warn for inline quoting of a normal variable', async () => {
    const ast = await parseDocument([
      '/var @path = "/tmp/a b"',
      '/run cmd { echo "@path" }'
    ].join('\n'));

    const diagnostics = collectUnsafeCommandFragmentDiagnostics(ast);

    expect(diagnostics).toHaveLength(0);
  });

  it('does not warn for plain variable interpolation without quoted fragment reuse', async () => {
    const ast = await parseDocument([
      '/var @path = "/tmp/a b"',
      '/run cmd { echo @path }'
    ].join('\n'));

    const diagnostics = collectUnsafeCommandFragmentDiagnostics(ast);

    expect(diagnostics).toHaveLength(0);
  });
});
