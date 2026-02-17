import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as readline from 'readline';
import { version } from '@core/version';
import type { Environment } from '@interpreter/env/Environment';
import type { VariableSource } from '@core/types/variable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { NodeFunctionExecutable } from '@core/types/executable';
import type { JSONRPCRequest, JSONRPCResponse, MCPToolSchema } from './types';
import { MCPErrorCode } from './types';
import { FunctionRouter } from './FunctionRouter';
import { mcpNameToMlldName } from './SchemaGenerator';

export interface McpConfig {
  servers?: McpServerConfig[];
  lifecycle?: McpLifecycleConfigInput;
}

export interface McpServerConfig {
  module?: string;
  command?: string;
  args?: string[];
  npm?: string;
  tools?: string[] | '*';
  env?: Record<string, string>;
  name?: string;
}

export interface McpConnectionInfo {
  socketPath: string;
  env: Record<string, string>;
  servers: Array<{
    name: string;
    module?: string;
    command?: string;
    args?: string[];
    npm?: string;
    tools: string[];
    pid?: number;
  }>;
}

type PendingHandler = {
  resolve: (response: JSONRPCResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  onDone?: () => void;
};

class McpServerConnection {
  readonly name: string;
  readonly process: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<string | number, PendingHandler>();
  private closed = false;
  private closedReason?: 'idle' | 'exit' | 'manual';
  private readonly idleTimeoutMs?: number;
  private idleTimer?: NodeJS.Timeout;
  private inflightCount = 0;

  constructor(name: string, child: ChildProcessWithoutNullStreams, idleTimeoutMs?: number) {
    this.name = name;
    this.process = child;
    this.idleTimeoutMs = idleTimeoutMs;
    this.attachOutput();
    this.attachExitHandlers();
  }

  isClosed(): boolean {
    return this.closed;
  }

  getClosedReason(): 'idle' | 'exit' | 'manual' | undefined {
    return this.closedReason;
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

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const response = await this.request('tools/call', { name, arguments: args });
    if (response.error) {
      throw new Error(`MCP server '${this.name}' tools/call failed: ${response.error.message}`);
    }
    const result = response.result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean } | undefined;
    const content = Array.isArray(result?.content) ? result!.content : [];
    const text = content
      .filter(entry => entry?.type === 'text')
      .map(entry => entry?.text ?? '')
      .join('');
    if (result?.isError) {
      throw new Error(text || `MCP tool '${name}' failed`);
    }
    return text;
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
      this.touch();
      return { jsonrpc: '2.0', id: request.id ?? null, result: null };
    }

    return new Promise<JSONRPCResponse>((resolve, reject) => {
      this.inflightCount += 1;
      const onDone = () => {
        this.inflightCount = Math.max(0, this.inflightCount - 1);
        if (this.inflightCount === 0) {
          this.touch();
        }
      };
      const timeout = setTimeout(() => {
        this.pending.delete(request.id as string | number);
        onDone();
        reject(new Error(`MCP server '${this.name}' request timed out`));
      }, 30000);

      this.pending.set(request.id as string | number, { resolve, reject, timeout, onDone });

      this.process.stdin.write(`${JSON.stringify(request)}\n`, error => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(request.id as string | number);
        onDone();
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
      pending.onDone?.();
      pending.resolve(response);
    });
  }

  private attachExitHandlers(): void {
    this.process.on('exit', (code, signal) => {
      this.closed = true;
      if (!this.closedReason) {
        this.closedReason = 'exit';
      }
      this.clearIdleTimer();
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

  private touch(): void {
    if (!this.idleTimeoutMs || this.idleTimeoutMs <= 0) {
      return;
    }
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.closed) {
        return;
      }
      this.closed = true;
      this.closedReason = 'idle';
      this.process.kill('SIGTERM');
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) {
      return;
    }
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}

class McpProxyServer {
  private server?: net.Server;
  private readonly socketPath: string;
  private readonly tools: MCPToolSchema[];
  private readonly toolIndex: Map<string, McpServerConnection>;
  private readonly router?: FunctionRouter;

  constructor(
    socketPath: string,
    tools: MCPToolSchema[],
    toolIndex: Map<string, McpServerConnection>,
    router?: FunctionRouter
  ) {
    this.socketPath = socketPath;
    this.tools = tools;
    this.toolIndex = toolIndex;
    this.router = router;
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
        if (this.router) {
          const args = (request.params as any)?.arguments;
          try {
            const text = await this.router.executeFunction(toolName, args ?? {});
            return {
              jsonrpc: '2.0',
              id: request.id ?? null,
              result: {
                content: [{ type: 'text', text }]
              }
            };
          } catch (error) {
            return {
              jsonrpc: '2.0',
              id: request.id ?? null,
              result: {
                content: [
                  {
                    type: 'text',
                    text: error instanceof Error ? error.message : String(error)
                  }
                ],
                isError: true
              }
            };
          }
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
  private readonly environment?: Environment;
  private toolEnvironment?: Environment;
  private toolRouter?: FunctionRouter;
  private toolNames: string[] = [];
  private lifecycle?: McpLifecycleConfig;
  private pidFiles = new Map<string, string>();
  private serverConfigs = new Map<string, NormalizedServerConfig>();
  private serverHandles = new Map<string, { connection: McpServerConnection; restartAttempts: number }>();

  constructor(options?: { environment?: Environment }) {
    this.environment = options?.environment;
  }

  async start(config: McpConfig | null | undefined): Promise<McpConnectionInfo | null> {
    if (!config || !Array.isArray(config.servers) || config.servers.length === 0) {
      return null;
    }

    const normalized = normalizeServerConfigs(config.servers);
    if (normalized.length === 0) {
      return null;
    }
    const lifecycle = normalizeLifecycle(config.lifecycle);
    this.lifecycle = lifecycle;
    if (normalized.length > lifecycle.maxConcurrent) {
      throw new Error(`MCP server limit exceeded: ${normalized.length} > ${lifecycle.maxConcurrent}`);
    }

    const toolIndex = new Map<string, McpServerConnection>();
    const tools: MCPToolSchema[] = [];
    const serverInfos: McpConnectionInfo['servers'] = [];
    this.toolNames = [];
    this.toolEnvironment = this.environment ? this.environment.createChild() : undefined;
    this.serverConfigs.clear();
    this.serverHandles.clear();
    this.pidFiles.clear();

    for (const server of normalized) {
      this.serverConfigs.set(server.name, server);
      const connection = await this.spawnServer(server, lifecycle);
      this.serverHandles.set(server.name, { connection, restartAttempts: 0 });
      const listedTools = await connection.listTools();
      const filteredTools = filterTools(listedTools, server.tools, server.name);

      for (const tool of filteredTools) {
        if (toolIndex.has(tool.name)) {
          throw new Error(`MCP tool '${tool.name}' is provided by multiple servers`);
        }
        toolIndex.set(tool.name, connection);
        tools.push(tool);
        this.registerToolProxy(tool, server.name);
      }

      serverInfos.push({
        name: server.name,
        module: server.module,
        command: server.kind === 'command' ? server.command : undefined,
        npm: server.kind === 'npm' ? server.npm : undefined,
        args: server.kind === 'module' ? undefined : server.args,
        tools: filteredTools.map(tool => tool.name),
        pid: connection.process.pid ?? undefined
      });
    }

    if (tools.length === 0) {
      await this.cleanup();
      return null;
    }

    this.socketPath = buildSocketPath();
    if (this.toolEnvironment) {
      this.toolRouter = new FunctionRouter({
        environment: this.toolEnvironment,
        toolNames: this.toolNames,
        toolNamesAreMcp: true
      });
    }
    this.proxy = new McpProxyServer(this.socketPath, tools, toolIndex, this.toolRouter);
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

    for (const pidFile of this.pidFiles.values()) {
      await removePidFile(pidFile);
    }
    this.pidFiles.clear();

    this.toolEnvironment = undefined;
    this.toolRouter = undefined;
    this.toolNames = [];
    this.serverConfigs.clear();
    this.serverHandles.clear();
    this.lifecycle = undefined;
  }

  private registerToolProxy(tool: MCPToolSchema, serverName: string): void {
    if (!this.toolEnvironment) {
      return;
    }
    const mlldName = mcpNameToMlldName(tool.name);
    if (this.toolEnvironment.getVariable(mlldName)) {
      throw new Error(`MCP tool '${tool.name}' conflicts with existing variable '@${mlldName}'`);
    }

    const execDef: NodeFunctionExecutable = {
      type: 'nodeFunction',
      name: mlldName,
      fn: async (input?: Record<string, unknown>) => {
        const args = input && typeof input === 'object' && !Array.isArray(input)
          ? input
          : {};
        return this.callToolWithRetry(serverName, tool.name, args);
      },
      paramNames: ['input'],
      sourceDirective: 'exec'
    };

    const source: VariableSource = {
      directive: 'var',
      syntax: 'reference',
      hasInterpolation: false,
      isMultiLine: false
    };

    const execVar = createExecutableVariable(
      mlldName,
      'command',
      '',
      execDef.paramNames,
      undefined,
      source,
      {
        internal: {
          executableDef: execDef,
          mcpTool: {
            name: tool.name,
            argumentMode: 'object'
          }
        }
      }
    );
    if (tool.description) {
      execVar.description = tool.description;
    }
    this.toolEnvironment.setVariable(mlldName, execVar);
    this.toolNames.push(tool.name);
  }

  private async callToolWithRetry(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const handle = this.serverHandles.get(serverName);
    if (!handle) {
      throw new Error(`MCP server '${serverName}' is not available`);
    }

    try {
      return await handle.connection.callTool(toolName, args);
    } catch (error) {
      const reason = handle.connection.getClosedReason();
      if (!handle.connection.isClosed() || reason !== 'exit' || handle.restartAttempts >= 1) {
        throw error;
      }
      handle.restartAttempts += 1;
      const config = this.serverConfigs.get(serverName);
      const lifecycle = this.lifecycle ?? DEFAULT_LIFECYCLE;
      if (!config) {
        throw error;
      }
      const connection = await this.spawnServer(config, lifecycle);
      handle.connection = connection;
      return await connection.callTool(toolName, args);
    }
  }

  private async spawnServer(
    server: NormalizedServerConfig,
    lifecycle: McpLifecycleConfig
  ): Promise<McpServerConnection> {
    const child = spawn(server.command, server.args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...server.env }
    });

    const connection = new McpServerConnection(server.name, child, lifecycle.idleTimeoutMs);
    this.servers.set(server.name, connection);

    if (child.pid) {
      const pidFile = await writePidFile(server.name, child.pid);
      this.pidFiles.set(server.name, pidFile);
      child.once('exit', () => {
        removePidFile(pidFile);
        this.pidFiles.delete(server.name);
      });
    }

    try {
      await withTimeout(
        connection.initialize(),
        lifecycle.startupTimeoutMs,
        `MCP server '${server.name}' initialize`
      );
      return connection;
    } catch (error) {
      await stopProcess(child, server.name);
      const pidFile = this.pidFiles.get(server.name);
      if (pidFile) {
        await removePidFile(pidFile);
        this.pidFiles.delete(server.name);
      }
      throw error;
    }
  }
}

type NormalizedServerConfig = {
  name: string;
  kind: 'module' | 'command' | 'npm';
  module?: string;
  command: string;
  args: string[];
  tools?: string[];
  env: Record<string, string>;
  npm?: string;
};

type McpLifecycleConfigInput = {
  startupTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxConcurrent?: number;
};

type McpLifecycleConfig = {
  startupTimeoutMs: number;
  idleTimeoutMs: number;
  maxConcurrent: number;
};

const DEFAULT_LIFECYCLE: McpLifecycleConfig = {
  startupTimeoutMs: 10_000,
  idleTimeoutMs: 60_000,
  maxConcurrent: 5
};

function normalizeServerConfigs(servers: McpServerConfig[]): NormalizedServerConfig[] {
  const result: NormalizedServerConfig[] = [];
  const seenNames = new Set<string>();

  servers.forEach((server, index) => {
    if (!server || typeof server !== 'object') {
      throw new Error('MCP server config must be an object');
    }
    const hasModule = typeof server.module === 'string';
    const hasCommand = typeof server.command === 'string';
    const hasNpm = typeof server.npm === 'string';
    const kindCount = Number(hasModule) + Number(hasCommand) + Number(hasNpm);
    if (kindCount !== 1) {
      throw new Error('MCP server config requires exactly one of module, command, or npm');
    }

    const nameCandidate = server.name && typeof server.name === 'string'
      ? server.name
      : deriveServerName(server, index);
    const name = dedupeName(nameCandidate, seenNames);

    const tools = normalizeTools(server.tools);
    const env = normalizeEnv(server.env);
    const args = normalizeArgs(server.args);

    if (hasModule) {
      const moduleName = server.module!.trim();
      if (!moduleName) {
        throw new Error('MCP server module must be a non-empty string');
      }
      result.push({
        name,
        kind: 'module',
        module: moduleName,
        command: 'mlld',
        args: buildModuleArgs({ module: moduleName, tools }),
        tools,
        env,
      });
      return;
    }

    if (hasCommand) {
      const command = server.command!.trim();
      if (!command) {
        throw new Error('MCP server command must be a non-empty string');
      }
      result.push({
        name,
        kind: 'command',
        command,
        args,
        tools,
        env,
      });
      return;
    }

    const npmPackage = server.npm!.trim();
    if (!npmPackage) {
      throw new Error('MCP server npm package must be a non-empty string');
    }
    result.push({
      name,
      kind: 'npm',
      npm: npmPackage,
      command: 'npx',
      args: [npmPackage, ...args],
      tools,
      env,
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

function normalizeArgs(args: McpServerConfig['args']): string[] {
  if (args === undefined || args === null) {
    return [];
  }
  if (!Array.isArray(args)) {
    throw new Error('MCP server args must be an array');
  }
  return args.map(arg => String(arg));
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

function filterTools(
  listedTools: MCPToolSchema[],
  allowed: string[] | undefined,
  serverName: string
): MCPToolSchema[] {
  if (!allowed || allowed.length === 0) {
    return listedTools;
  }
  const allowedSet = new Set(allowed);
  const filtered = listedTools.filter(tool => allowedSet.has(tool.name));
  const missing = allowed.filter(name => !listedTools.some(tool => tool.name === name));
  if (missing.length > 0) {
    throw new Error(`MCP server '${serverName}' does not provide tools: ${missing.join(', ')}`);
  }
  return filtered;
}

function normalizeLifecycle(input?: McpLifecycleConfigInput): McpLifecycleConfig {
  const startupTimeoutMs = normalizePositiveNumber(
    input?.startupTimeoutMs,
    DEFAULT_LIFECYCLE.startupTimeoutMs
  );
  const idleTimeoutMs = normalizePositiveNumber(
    input?.idleTimeoutMs,
    DEFAULT_LIFECYCLE.idleTimeoutMs
  );
  const maxConcurrentRaw = normalizePositiveNumber(
    input?.maxConcurrent,
    DEFAULT_LIFECYCLE.maxConcurrent
  );
  return {
    startupTimeoutMs,
    idleTimeoutMs,
    maxConcurrent: Math.max(1, Math.floor(maxConcurrentRaw))
  };
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

async function writePidFile(serverName: string, pid: number): Promise<string> {
  const dir = await ensureRunDir();
  const filename = `mcp-${sanitizeName(serverName)}.pid`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, String(pid));
  return filePath;
}

async function removePidFile(pidFilePath: string): Promise<void> {
  try {
    await fs.unlink(pidFilePath);
  } catch {
    return;
  }
}

async function ensureRunDir(): Promise<string> {
  const dir = path.join(process.cwd(), '.mlld', 'run');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildModuleArgs(server: { module: string; tools?: string[] }): string[] {
  const args = ['mcp', server.module];
  if (server.tools && server.tools.length > 0) {
    args.push('--tools', server.tools.join(','));
  }
  return args;
}

function deriveServerName(server: McpServerConfig, index: number): string {
  const raw =
    (typeof server.module === 'string' && server.module.trim()) ||
    (typeof server.npm === 'string' && server.npm.trim()) ||
    (typeof server.command === 'string' && server.command.trim()) ||
    `server-${index + 1}`;
  const base = raw.split('/').filter(Boolean).pop() || `server-${index + 1}`;
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
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
