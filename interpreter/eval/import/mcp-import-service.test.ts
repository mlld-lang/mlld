import { describe, expect, it, vi } from 'vitest';
import { ensureStructuredValue } from '@interpreter/utils/structured-value';
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

    expect((variable as any).internal?.mcpTool).toEqual({ name: 'echo', source: 'mcp://server' });
    expect((variable as any).internal?.executableDef?.paramNames).toEqual(['text', 'limit']);
    expect((variable as any).internal?.executableDef?.optionalParams).toEqual(['limit']);
    expect((variable as any).mx?.params).toEqual([
      { name: 'text', type: 'string' },
      { name: 'limit', type: 'integer', optional: true }
    ]);
    expect((variable as any).paramTypes).toEqual({ text: 'string', limit: 'integer' });
    expect((variable as any).description).toBe('Echo text');

    const execFn = (variable as any).internal?.executableDef?.fn as (...args: unknown[]) => Promise<unknown>;
    await expect(execFn('hello', 3)).resolves.toBe('ok');
    const manager = env.getMcpImportManager.mock.results[0]?.value ?? env.getMcpImportManager();
    expect(manager.callTool).toHaveBeenCalledWith('mcp://server', 'echo', { text: 'hello', limit: 3 });
  });

  it('unwraps StructuredValue MCP arguments before schema coercion and dispatch', async () => {
    const env = createEnvStub();
    const service = new McpImportService(env);

    const variable = service.createMcpToolVariable({
      alias: 'add_calendar_event_participants',
      tool: {
        name: 'add_calendar_event_participants',
        inputSchema: {
          type: 'object',
          required: ['event_id', 'participants'],
          properties: {
            event_id: { type: 'string' },
            retry_count: { type: 'integer' },
            participants: { type: 'array' },
            options: { type: 'object' }
          }
        }
      } as any,
      mcpName: 'add_calendar_event_participants',
      importPath: 'mcp://calendar'
    });

    const args = ensureStructuredValue({
      event_id: ensureStructuredValue('24'),
      retry_count: ensureStructuredValue('2'),
      participants: ensureStructuredValue([
        ensureStructuredValue('alice@example.com'),
        'bob@example.com'
      ]),
      options: {
        notify: ensureStructuredValue('true')
      }
    });

    const execFn = (variable as any).internal?.executableDef?.fn as (...args: unknown[]) => Promise<unknown>;
    await expect(execFn(args)).resolves.toBe('ok');

    const manager = env.getMcpImportManager.mock.results[0]?.value ?? env.getMcpImportManager();
    expect(manager.callTool).toHaveBeenCalledWith('mcp://calendar', 'add_calendar_event_participants', {
      event_id: '24',
      retry_count: 2,
      participants: ['alice@example.com', 'bob@example.com'],
      options: {
        notify: 'true'
      }
    });
  });

  it('unwraps positional StructuredValue MCP arguments before dispatch', async () => {
    const env = createEnvStub();
    const service = new McpImportService(env);

    const variable = service.createMcpToolVariable({
      alias: 'share_file',
      tool: {
        name: 'share_file',
        inputSchema: {
          type: 'object',
          required: ['file_id', 'target_user'],
          properties: {
            file_id: { type: 'string' },
            target_user: { type: 'string' }
          }
        }
      } as any,
      mcpName: 'share_file',
      importPath: 'mcp://workspace'
    });

    const execFn = (variable as any).internal?.executableDef?.fn as (...args: unknown[]) => Promise<unknown>;
    await expect(
      execFn(ensureStructuredValue('file_7'), ensureStructuredValue('bob@example.com'))
    ).resolves.toBe('ok');

    const manager = env.getMcpImportManager.mock.results[0]?.value ?? env.getMcpImportManager();
    expect(manager.callTool).toHaveBeenCalledWith('mcp://workspace', 'share_file', {
      file_id: 'file_7',
      target_user: 'bob@example.com'
    });
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
