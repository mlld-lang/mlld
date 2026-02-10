import { describe, expect, it, vi } from 'vitest';
import {
  buildMcpArgs,
  buildMcpToolIndex,
  deriveMcpParamInfo,
  resolveMcpServerSpec,
  resolveMcpTool
} from './McpImportResolver';

describe('McpImportResolver', () => {
  it('resolves MCP tools by MCP name, mlld name, and converted name', () => {
    const tools = [
      { name: 'echo', inputSchema: { type: 'object', properties: {} } },
      { name: 'my_tool', inputSchema: { type: 'object', properties: {} } }
    ] as any[];

    const index = buildMcpToolIndex(tools, 'mcp://server');

    expect(resolveMcpTool('echo', index, 'mcp://server').tool.name).toBe('echo');
    expect(resolveMcpTool('myTool', index, 'mcp://server').tool.name).toBe('my_tool');
    expect(resolveMcpTool('my-tool', index, 'mcp://server').tool.name).toBe('my_tool');
  });

  it('preserves MCP tool collision semantics', () => {
    expect(() =>
      buildMcpToolIndex(
        [
          { name: 'my_tool', inputSchema: { type: 'object', properties: {} } },
          { name: 'my-tool', inputSchema: { type: 'object', properties: {} } }
        ] as any[],
        'mcp://server'
      )
    ).toThrow(/MCP tool name collision/);
  });

  it('preserves missing-tool error semantics', () => {
    const index = buildMcpToolIndex(
      [{ name: 'echo', inputSchema: { type: 'object', properties: {} } }] as any[],
      'mcp://server'
    );

    let thrown: unknown;
    try {
      resolveMcpTool('missing', index, 'mcp://server');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as any).code).toBe('IMPORT_EXPORT_MISSING');
    expect((thrown as Error).message).toContain("Import 'missing' not found in MCP server 'mcp://server'");
  });

  it('preserves MCP parameter inference and argument mapping behavior', () => {
    const paramInfo = deriveMcpParamInfo({
      name: 'echo',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string' },
          limit: { type: 'integer' },
          metadata: {}
        }
      }
    } as any);

    expect(paramInfo.paramNames).toEqual(['text', 'limit', 'metadata']);
    expect(paramInfo.paramTypes).toEqual({
      text: 'string',
      limit: 'integer',
      metadata: 'string'
    });

    expect(buildMcpArgs(paramInfo.paramNames, [])).toEqual({});
    expect(buildMcpArgs(paramInfo.paramNames, [{ text: 'hello', limit: 3 }])).toEqual({
      text: 'hello',
      limit: 3
    });
    expect(buildMcpArgs(paramInfo.paramNames, ['hello', undefined, { scope: 'all' }])).toEqual({
      text: 'hello',
      metadata: { scope: 'all' }
    });
    expect(buildMcpArgs(paramInfo.paramNames, [{ unknown: true }])).toEqual({
      text: { unknown: true }
    });
  });

  it('preserves MCP server spec resolution behavior', async () => {
    const resolvePath = vi.fn().mockResolvedValue('/resolved/server.mld');
    const env = { resolvePath } as any;

    await expect(resolveMcpServerSpec(' ./server.mld ', env)).resolves.toBe('/resolved/server.mld');
    expect(resolvePath).toHaveBeenCalledWith('./server.mld');

    await expect(resolveMcpServerSpec('stdio node fake-server.cjs', env)).resolves.toBe('stdio node fake-server.cjs');
    await expect(resolveMcpServerSpec('mcp://server', env)).resolves.toBe('mcp://server');
    await expect(resolveMcpServerSpec('   ', env)).rejects.toMatchObject({ code: 'IMPORT_PATH_EMPTY' });
  });
});
