import { describe, expect, it } from 'vitest';
import { MCPServer } from './MCPServer';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { ExecutableVariable } from '@core/types/variable';
import type { JSONRPCRequest } from './types';

async function createEnvironmentWithExports(source: string, names: string[]): Promise<{
  environment: Environment;
  exports: Map<string, ExecutableVariable>;
}> {
  const fileSystem = new MemoryFileSystem();
  const pathService = new PathService();
  const filePath = '/module.mld.md';

  await fileSystem.writeFile(filePath, source);

  const pathContext = {
    projectRoot: '/',
    fileDirectory: '/',
    filePath,
    executionDirectory: '/',
    invocationDirectory: '/',
  } as const;

  let environment: Environment | null = null;

  await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath,
    format: 'markdown',
    normalizeBlankLines: true,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment for MCP server test');
  }
  const exports = new Map<string, ExecutableVariable>();

  for (const name of names) {
    const variable = environment.getVariable(name);
    if (variable && variable.type === 'executable') {
      exports.set(name, variable as ExecutableVariable);
    }
  }

  return { environment, exports };
}

describe('MCPServer', () => {
  it('responds to initialize request', async () => {
    const { environment, exports } = await createEnvironmentWithExports(`
      /exe @noop() = js { return 'ok'; }
      /export { @noop }
    `, ['noop']);

    const server = new MCPServer({ environment, exportedFunctions: exports });
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    } satisfies JSONRPCRequest);

    expect(response.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'mlld' },
    });
  });

  it('lists exported tools after initialization', async () => {
    const { environment, exports } = await createEnvironmentWithExports(`
      /exe @greet(name: string, times: number) = js { return 'Hello ' + name; } with { description: "Greet a user by name" }
      /exe @getData() = js { return { ok: true }; }
      /export { @greet, @getData }
    `, ['greet', 'getData']);

    const server = new MCPServer({ environment, exportedFunctions: exports });

    await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    } satisfies JSONRPCRequest);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    } satisfies JSONRPCRequest);

    expect(response.result).toHaveProperty('tools');
    const tools = (response.result as any).tools;
    expect(tools).toEqual([
      {
        name: 'greet',
        description: 'Greet a user by name',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            times: { type: 'number' },
          },
          required: ['name', 'times'],
        },
      },
      {
        name: 'get_data',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ]);
  });

  it('executes tool calls via FunctionRouter', async () => {
    const { environment, exports } = await createEnvironmentWithExports(`
      /exe @greet(name) = js { return 'Hi ' + name; }
      /export { @greet }
    `, ['greet']);

    const server = new MCPServer({ environment, exportedFunctions: exports });
    await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    } satisfies JSONRPCRequest);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'greet',
        arguments: { name: 'Ada' },
      },
    } satisfies JSONRPCRequest);

    expect(response.result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Hi Ada',
        },
      ],
    });
  });

  it('surfaces tool labels in guard context', async () => {
    const { environment, exports } = await createEnvironmentWithExports(`
      /guard @blockDestructive before op:exe = when [
        @mx.op.labels[0] == "destructive" => deny "Destructive tool blocked"
        * => allow
      ]
      /exe @destroy(id: string) = js { return 'deleted ' + id; }
      /var tools @agentTools = {
        destroy: { mlld: @destroy, labels: ["destructive"] }
      }
      /export { @destroy }
    `, ['destroy']);

    const toolsVar = environment.getVariable('agentTools');
    const toolCollection = toolsVar?.internal?.toolCollection;
    if (!toolCollection) {
      throw new Error('Tool collection missing from environment');
    }

    const server = new MCPServer({ environment, exportedFunctions: exports, toolCollection });
    await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    } satisfies JSONRPCRequest);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'destroy',
        arguments: { id: '123' },
      },
    } satisfies JSONRPCRequest);

    expect(response.result).toMatchObject({ isError: true });
    const text = (response.result as any)?.content?.[0]?.text ?? '';
    expect(text).toContain('Destructive tool blocked');
  });

  it('filters tools when tool collection is provided', async () => {
    const { environment, exports } = await createEnvironmentWithExports(`
      /exe @alpha() = js { return 'a'; }
      /exe @beta() = js { return 'b'; }
      /var tools @agentTools = {
        alphaTool: { mlld: @alpha }
      }
      /export { @alpha, @beta }
    `, ['alpha', 'beta']);

    const toolsVar = environment.getVariable('agentTools');
    const toolCollection = toolsVar?.internal?.toolCollection;
    if (!toolCollection) {
      throw new Error('Tool collection missing from environment');
    }

    const server = new MCPServer({ environment, exportedFunctions: exports, toolCollection });
    await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    } satisfies JSONRPCRequest);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    } satisfies JSONRPCRequest);

    expect((response.result as any).tools).toEqual([
      {
        name: 'alpha_tool',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ]);
  });

  it('rejects tool collections that reference unknown executables', async () => {
    const { environment, exports } = await createEnvironmentWithExports(`
      /exe @alpha() = js { return 'a'; }
      /var tools @agentTools = {
        alphaTool: { mlld: @alpha }
      }
      /export { @alpha }
    `, ['alpha']);

    const toolsVar = environment.getVariable('agentTools');
    const toolCollection = toolsVar?.internal?.toolCollection;
    if (!toolCollection) {
      throw new Error('Tool collection missing from environment');
    }

    const filteredExports = new Map<string, ExecutableVariable>();

    expect(() => {
      new MCPServer({ environment, exportedFunctions: filteredExports, toolCollection });
    }).toThrow(/unknown executable/i);
  });

  it('returns error when not initialized', async () => {
    const { environment, exports } = await createEnvironmentWithExports(`
      /exe @noop() = js { return 'ok'; }
      /export { @noop }
    `, ['noop']);

    const server = new MCPServer({ environment, exportedFunctions: exports });
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    } satisfies JSONRPCRequest);

    expect(response.error).toMatchObject({
      code: -32002,
      message: 'Server not initialized',
    });
  });

  it('returns method not found for unknown methods', async () => {
    const { environment, exports } = await createEnvironmentWithExports(`
      /export { }
    `, []);

    const server = new MCPServer({ environment, exportedFunctions: exports });

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown/method',
    } satisfies JSONRPCRequest);

    expect(response.error).toMatchObject({
      code: -32601,
    });
  });
});
