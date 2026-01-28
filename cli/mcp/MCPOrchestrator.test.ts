import { describe, expect, it } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as net from 'net';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';
import * as os from 'os';

const fakeServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/fake-server.cjs', import.meta.url)
);
const hangServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/hang-server.cjs', import.meta.url)
);
const crashServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/crash-server.cjs', import.meta.url)
);

class McpTestClient {
  private readonly socket: net.Socket;
  private readonly rl: readline.Interface;
  private readonly pending = new Map<number, (response: any) => void>();
  private nextId = 1;

  private constructor(socket: net.Socket) {
    this.socket = socket;
    this.rl = readline.createInterface({ input: socket, terminal: false });
    this.rl.on('line', line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let response: any;
      try {
        response = JSON.parse(trimmed);
      } catch {
        return;
      }
      const resolver = this.pending.get(response.id);
      if (resolver) {
        this.pending.delete(response.id);
        resolver(response);
      }
    });
  }

  static async connect(socketPath: string): Promise<McpTestClient> {
    return await new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      socket.once('error', reject);
      socket.once('connect', () => {
        resolve(new McpTestClient(socket));
      });
    });
  }

  async request(method: string, params?: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return await new Promise(resolve => {
      this.pending.set(id, resolve);
      this.socket.write(`${JSON.stringify(payload)}\n`);
    });
  }

  close(): void {
    this.rl.close();
    this.socket.destroy();
  }
}

async function createEnvironment(source: string): Promise<Environment> {
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
    throw new Error('Failed to capture environment for MCP orchestrator test');
  }

  return environment;
}

describe('MCPOrchestrator', () => {
  it('spawns external MCP servers and applies tool filters', async () => {
    const { MCPOrchestrator } = await import('./MCPOrchestrator');
    const environment = await createEnvironment(`
      /guard @blockEcho before op:exe = when [
        @mx.taint.includes("src:mcp") && @mx.sources.includes("mcp:echo") => deny "Blocked"
        * => allow
      ]
    `);

    const orchestrator = new MCPOrchestrator({ environment });
    const connection = await orchestrator.start({
      servers: [
        {
          command: process.execPath,
          args: [fakeServerPath],
          tools: ['echo']
        }
      ]
    });

    expect(connection?.socketPath).toBeTruthy();
    if (!connection) {
      throw new Error('MCP orchestrator did not return connection info');
    }

    const client = await McpTestClient.connect(connection.socketPath);
    await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    });
    const listResponse = await client.request('tools/list');
    expect(listResponse.result.tools.map((tool: any) => tool.name)).toEqual(['echo']);

    const callResponse = await client.request('tools/call', {
      name: 'echo',
      arguments: { text: 'hi' }
    });
    expect(callResponse.result.isError).toBe(true);
    expect(callResponse.result.content[0].text).toContain('Blocked');

    client.close();
    await orchestrator.cleanup();
  });

  it('forwards external tool calls when allowed', async () => {
    const { MCPOrchestrator } = await import('./MCPOrchestrator');
    const environment = await createEnvironment('');

    const orchestrator = new MCPOrchestrator({ environment });
    const connection = await orchestrator.start({
      servers: [
        {
          command: process.execPath,
          args: [fakeServerPath],
          tools: ['echo']
        }
      ]
    });

    if (!connection) {
      throw new Error('MCP orchestrator did not return connection info');
    }

    const client = await McpTestClient.connect(connection.socketPath);
    await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    });
    const callResponse = await client.request('tools/call', {
      name: 'echo',
      arguments: { text: 'hello' }
    });
    expect(callResponse.result.isError).toBeUndefined();
    expect(callResponse.result.content[0].text).toBe('hello');

    client.close();
    await orchestrator.cleanup();
  });

  it('enforces startup timeout', async () => {
    const { MCPOrchestrator } = await import('./MCPOrchestrator');
    const environment = await createEnvironment('');
    const orchestrator = new MCPOrchestrator({ environment });

    await expect(orchestrator.start({
      lifecycle: { startupTimeoutMs: 50 },
      servers: [
        {
          command: process.execPath,
          args: [hangServerPath]
        }
      ]
    })).rejects.toThrow(/timed out/);

    await orchestrator.cleanup();
  });

  it('shuts down idle servers', async () => {
    const { MCPOrchestrator } = await import('./MCPOrchestrator');
    const environment = await createEnvironment('');
    const orchestrator = new MCPOrchestrator({ environment });

    const connection = await orchestrator.start({
      lifecycle: { idleTimeoutMs: 50 },
      servers: [
        {
          command: process.execPath,
          args: [fakeServerPath],
          tools: ['echo']
        }
      ]
    });

    if (!connection) {
      throw new Error('MCP orchestrator did not return connection info');
    }

    const client = await McpTestClient.connect(connection.socketPath);
    await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    });

    await new Promise(resolve => setTimeout(resolve, 75));

    const callResponse = await client.request('tools/call', {
      name: 'echo',
      arguments: { text: 'late' }
    });
    expect(callResponse.result.isError).toBe(true);
    expect(callResponse.result.content[0].text).toContain('tools/call failed');

    client.close();
    await orchestrator.cleanup();
  });

  it('restarts once after a crash during call', async () => {
    const { MCPOrchestrator } = await import('./MCPOrchestrator');
    const environment = await createEnvironment('');
    const markerDir = await fs.mkdtemp(`${os.tmpdir()}/mlld-mcp-crash-`);
    const markerPath = `${markerDir}/marker`;

    const orchestrator = new MCPOrchestrator({ environment });
    const connection = await orchestrator.start({
      servers: [
        {
          command: process.execPath,
          args: [crashServerPath],
          env: { MLLD_MCP_CRASH_MARKER: markerPath },
          tools: ['echo']
        }
      ]
    });

    if (!connection) {
      throw new Error('MCP orchestrator did not return connection info');
    }

    const client = await McpTestClient.connect(connection.socketPath);
    await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    });
    const callResponse = await client.request('tools/call', {
      name: 'echo',
      arguments: { text: 'retry' }
    });
    expect(callResponse.result.isError).toBeUndefined();
    expect(callResponse.result.content[0].text).toBe('retry');

    client.close();
    await orchestrator.cleanup();
  });

  it('enforces max concurrent servers', async () => {
    const { MCPOrchestrator } = await import('./MCPOrchestrator');
    const environment = await createEnvironment('');
    const orchestrator = new MCPOrchestrator({ environment });

    await expect(orchestrator.start({
      lifecycle: { maxConcurrent: 1 },
      servers: [
        { command: process.execPath, args: [fakeServerPath] },
        { command: process.execPath, args: [fakeServerPath] }
      ]
    })).rejects.toThrow(/limit exceeded/);

    await orchestrator.cleanup();
  });
});
