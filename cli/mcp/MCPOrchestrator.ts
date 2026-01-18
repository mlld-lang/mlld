import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as readline from 'readline';
import { version } from '@core/version';
import type { JSONRPCRequest, JSONRPCResponse, MCPToolSchema } from './types';
import { MCPErrorCode } from './types';

export interface McpConfig {
  servers?: McpServerConfig[];
}

export interface McpServerConfig {
  module: string;
  tools?: string[] | '*';
  env?: Record<string, string>;
  config?: Record<string, unknown>;
  name?: string;
}

export interface McpConnectionInfo {
  socketPath: string;
  env: Record<string, string>;
  servers: Array<{
    name: string;
    module: string;
    tools: string[];
    config?: Record<string, unknown>;
    pid?: number;
  }>;
}

type PendingHandler = {
  resolve: (response: JSONRPCResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

class McpServerConnection {
  readonly name: string;
  readonly module: string;
  readonly process: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<string | number, PendingHandler>();
  private closed = false;

  constructor(name: string, module: string, child: ChildProcessWithoutNullStreams) {
    this.name = name;
    this.module = module;
    this.process = child;
    this.attachOutput();
    this.attachExitHandlers();
  }

  async initialize(): Promise<void> {
    const response = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mlld', version }
    });
    if (response.error) {
      throw new Error(`MCP server '${this.name}' initialize failed: ${response.error.message}`);
    }
  }

  async listTools(): Promise<MCPToolSchema[]> {
    const response = await this.request('tools/list');
    if (response.error) {
      throw new Error(`MCP server '${this.name}' tools/list failed: ${response.error.message}`);
    }
    const result = response.result as { tools?: MCPToolSchema[] } | undefined;
    return Array.isArray(result?.tools) ? result!.tools : [];
  }

  async forward(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return this.send(request);
  }

  private async request(method: string, params?: Record<string, unknown>): Promise<JSONRPCResponse> {
    const id = this.nextId++;
    return this.send({ jsonrpc: '2.0', id, method, params });
  }

  private async send(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (this.closed) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: MCPErrorCode.InternalError,
          message: `MCP server '${this.name}' is not running`
        }
      };
    }

    if (request.id === null || request.id === undefined) {
      this.process.stdin.write(`${JSON.stringify(request)}\n`);
      return { jsonrpc: '2.0', id: request.id ?? null, result: null };
    }

    return new Promise<JSONRPCResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id as string | number);
        reject(new Error(`MCP server '${this.name}' request timed out`));
      }, 30000);

      this.pending.set(request.id as string | number, { resolve, reject, timeout });

      this.process.stdin.write(`${JSON.stringify(request)}\n`, error => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(request.id as string | number);
        reject(error);
      });
    });
  }

  private attachOutput(): void {
    const rl = readline.createInterface({
      input: this.process.stdout,
      terminal: false
    });

    rl.on('line', line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let response: JSONRPCResponse;
      try {
        response = JSON.parse(trimmed) as JSONRPCResponse;
      } catch (error) {
        return;
      }

      if (response.id === undefined || response.id === null) {
        return;
      }

      const pending = this.pending.get(response.id as string | number);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      this.pending.delete(response.id as string | number);
      pending.resolve(response);
    });
  }

  private attachExitHandlers(): void {
    this.process.on('exit', (code, signal) => {
      this.closed = true;
      const message = signal
        ? `MCP server '${this.name}' exited with signal ${signal}`
        : `MCP server '${this.name}' exited with code ${code ?? 0}`;
      for (const [id, pending] of this.pending.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message));
        this.pending.delete(id);
      }
    });
  }
}

class McpProxyServer {
  private server?: net.Server;
  private readonly socketPath: string;
  private readonly tools: MCPToolSchema[];
  private readonly toolIndex: Map<string, McpServerConnection>;

  constructor(
    socketPath: string,
    tools: MCPToolSchema[],
    toolIndex: Map<string, McpServerConnection>
  ) {
    this.socketPath = socketPath;
    this.tools = tools;
    this.toolIndex = toolIndex;
  }

  async start(): Promise<void> {
    await removeSocket(this.socketPath);
    this.server = net.createServer(socket => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.socketPath, () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await new Promise<void>(resolve => this.server!.close(() => resolve()));
    this.server = undefined;
    await removeSocket(this.socketPath);
  }

  private handleConnection(socket: net.Socket): void {
    const rl = readline.createInterface({ input: socket, terminal: false });
    rl.on('line', async line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let request: JSONRPCRequest;
      try {
        request = JSON.parse(trimmed) as JSONRPCRequest;
      } catch (error) {
        socket.write(`${JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: MCPErrorCode.ParseError,
            message: error instanceof Error ? error.message : String(error)
          }
        })}\n`);
        return;
      }

      const response = await this.handleRequest(request);
      socket.write(`${JSON.stringify(response)}\n`);
    });
  }

  private async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    switch (request.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {
            protocolVersion: (request.params as any)?.protocolVersion ?? '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mlld-proxy', version }
          }
        };
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: { tools: this.tools }
        };
      case 'tools/call': {
        const toolName = (request.params as any)?.name;
        if (typeof toolName !== 'string') {
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: {
              code: MCPErrorCode.InvalidParams,
              message: 'tools/call requires a tool name'
            }
          };
        }
        const server = this.toolIndex.get(toolName);
        if (!server) {
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: {
              code: MCPErrorCode.MethodNotFound,
              message: `Tool '${toolName}' not found`
            }
          };
        }
        try {
          return await server.forward(request);
        } catch (error) {
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: {
              code: MCPErrorCode.InternalError,
              message: error instanceof Error ? error.message : String(error)
            }
          };
        }
      }
      default:
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          error: {
            code: MCPErrorCode.MethodNotFound,
            message: `Method '${request.method}' not found`
          }
        };
    }
  }
}

export class MCPOrchestrator {
  private readonly servers = new Map<string, McpServerConnection>();
  private proxy?: McpProxyServer;
  private socketPath?: string;

  async start(config: McpConfig | null | undefined): Promise<McpConnectionInfo | null> {
    if (!config || !Array.isArray(config.servers) || config.servers.length === 0) {
      return null;
    }

    const normalized = normalizeServerConfigs(config.servers);
    if (normalized.length === 0) {
      return null;
    }

    const toolIndex = new Map<string, McpServerConnection>();
    const tools: MCPToolSchema[] = [];
    const serverInfos: McpConnectionInfo['servers'] = [];

    for (const server of normalized) {
      const child = spawn('mlld', buildServerArgs(server), {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: { ...process.env, ...server.env }
      });

      const connection = new McpServerConnection(server.name, server.module, child);
      this.servers.set(server.name, connection);

      await connection.initialize();
      const listedTools = await connection.listTools();

      for (const tool of listedTools) {
        if (toolIndex.has(tool.name)) {
          throw new Error(`MCP tool '${tool.name}' is provided by multiple servers`);
        }
        toolIndex.set(tool.name, connection);
        tools.push(tool);
      }

      serverInfos.push({
        name: server.name,
        module: server.module,
        tools: listedTools.map(tool => tool.name),
        config: server.config,
        pid: child.pid ?? undefined
      });
    }

    if (tools.length === 0) {
      await this.cleanup();
      return null;
    }

    this.socketPath = buildSocketPath();
    this.proxy = new McpProxyServer(this.socketPath, tools, toolIndex);
    await this.proxy.start();

    const env = {
      MLLD_MCP_SOCKET: this.socketPath,
      MLLD_MCP_SERVERS: JSON.stringify({ servers: serverInfos })
    };

    return {
      socketPath: this.socketPath,
      env,
      servers: serverInfos
    };
  }

  async cleanup(): Promise<void> {
    if (this.proxy) {
      await this.proxy.stop();
      this.proxy = undefined;
    }

    const shutdowns: Array<Promise<void>> = [];
    for (const server of this.servers.values()) {
      shutdowns.push(stopProcess(server.process, server.name));
    }
    await Promise.all(shutdowns);
    this.servers.clear();

    if (this.socketPath) {
      await removeSocket(this.socketPath);
      this.socketPath = undefined;
    }
  }
}

function normalizeServerConfigs(servers: McpServerConfig[]): Array<{
  name: string;
  module: string;
  tools?: string[];
  env: Record<string, string>;
  config?: Record<string, unknown>;
}> {
  const result: Array<{
    name: string;
    module: string;
    tools?: string[];
    env: Record<string, string>;
    config?: Record<string, unknown>;
  }> = [];
  const seenNames = new Set<string>();

  servers.forEach((server, index) => {
    if (!server || typeof server !== 'object') {
      throw new Error('MCP server config must be an object');
    }
    if (!server.module || typeof server.module !== 'string') {
      throw new Error('MCP server config requires a module string');
    }

    const nameCandidate = server.name && typeof server.name === 'string'
      ? server.name
      : deriveServerName(server.module, index);
    const name = dedupeName(nameCandidate, seenNames);

    const tools = normalizeTools(server.tools);
    const env = normalizeEnv(server.env);

    result.push({
      name,
      module: server.module,
      tools,
      env,
      config: server.config && typeof server.config === 'object' && !Array.isArray(server.config)
        ? server.config
        : undefined
    });
  });

  return result;
}

function normalizeTools(tools: McpServerConfig['tools']): string[] | undefined {
  if (tools === undefined || tools === null || tools === '*') {
    return undefined;
  }
  if (!Array.isArray(tools)) {
    throw new Error('MCP server tools must be an array or "*"');
  }
  const normalized = tools.map(tool => String(tool).trim()).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error('MCP server tools list is empty');
  }
  return normalized;
}

function normalizeEnv(env: McpServerConfig['env']): Record<string, string> {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key) continue;
    normalized[key] = String(value ?? '');
  }
  return normalized;
}

function buildServerArgs(server: { module: string; tools?: string[] }): string[] {
  const args = ['mcp', server.module];
  if (server.tools && server.tools.length > 0) {
    args.push('--tools', server.tools.join(','));
  }
  return args;
}

function deriveServerName(modulePath: string, index: number): string {
  const base = modulePath.split('/').filter(Boolean).pop() || `server-${index + 1}`;
  const cleaned = base.replace(/\.(mld|mld\.md)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-');
  return cleaned || `server-${index + 1}`;
}

function dedupeName(candidate: string, seen: Set<string>): string {
  let name = candidate;
  let counter = 1;
  while (seen.has(name)) {
    counter += 1;
    name = `${candidate}-${counter}`;
  }
  seen.add(name);
  return name;
}

function buildSocketPath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\mlld-mcp-${process.pid}-${Date.now()}`;
  }
  const filename = `mlld-mcp-${process.pid}-${Date.now()}.sock`;
  return path.join(os.tmpdir(), filename);
}

async function removeSocket(socketPath: string): Promise<void> {
  try {
    await fs.unlink(socketPath);
  } catch {
    return;
  }
}

async function stopProcess(proc: ChildProcessWithoutNullStreams, name: string): Promise<void> {
  if (proc.killed) {
    return;
  }

  await new Promise<void>(resolve => {
    proc.once('exit', () => resolve());
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 5000);
  });
}
