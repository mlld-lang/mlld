import { describe, expect, it, vi } from 'vitest';
import { McpImportService } from './McpImportService';

function createEnvStub(overrides: Record<string, unknown> = {}) {
  const callTool = vi.fn().mockResolvedValue('ok');
  return {
    getMcpImportManager: vi.fn(() => ({ callTool })),
    getImportBinding: vi.fn(() => undefined),
    hasVariable: vi.fn(() => false),
    ...overrides
  } as any;
}

describe('McpImportService', () => {
  it('creates MCP executable variables with stable metadata and argument mapping', async () => {
    const env = createEnvStub();
    const service = new McpImportService(env);

    const variable = service.createMcpToolVariable({
      alias: 'echo',
      tool: {
        name: 'echo',
        description: 'Echo text',
        inputSchema: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string' },
            limit: { type: 'integer' }
          }
        }
      } as any,
      mcpName: 'echo',
      importPath: 'mcp://server'
    });

    expect((variable as any).internal?.mcpTool).toEqual({ name: 'echo' });
    expect((variable as any).internal?.executableDef?.paramNames).toEqual(['text', 'limit']);
    expect((variable as any).paramTypes).toEqual({ text: 'string', limit: 'integer' });
    expect((variable as any).description).toBe('Echo text');

    const execFn = (variable as any).internal?.executableDef?.fn as (...args: unknown[]) => Promise<unknown>;
    await expect(execFn('hello', 3)).resolves.toBe('ok');
    const manager = env.getMcpImportManager.mock.results[0]?.value ?? env.getMcpImportManager();
    expect(manager.callTool).toHaveBeenCalledWith('mcp://server', 'echo', { text: 'hello', limit: 3 });
  });

  it('preserves import-binding collision behavior for existing import bindings', () => {
    const env = createEnvStub({
      getImportBinding: vi.fn(() => ({
        source: 'mcp://existing',
        location: { filePath: '/project/other.mld' }
      }))
    });
    const service = new McpImportService(env);

    let thrown: unknown;
    try {
      service.ensureImportBindingAvailable('echo', 'mcp://new', { filePath: '/project/main.mld' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as any).code).toBe('IMPORT_NAME_CONFLICT');
    expect((thrown as Error).message).toContain("Import collision - 'echo' already imported from mcp://existing");
  });

  it('preserves import-binding collision behavior for existing variables', () => {
    const env = createEnvStub({
      hasVariable: vi.fn(() => true)
    });
    const service = new McpImportService(env);

    expect(() =>
      service.ensureImportBindingAvailable('echo', 'mcp://new', { filePath: '/project/main.mld' })
    ).toThrow(/Import collision - 'echo' already defined/);
  });
});
