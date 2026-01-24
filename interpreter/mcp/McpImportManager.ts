import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import { version } from '@core/version';
import type { Environment } from '@interpreter/env/Environment';

type JSONRPCId = string | number | null;

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: JSONRPCId;
  method: string;
  params?: unknown;
}

interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: JSONRPCId;
  result?: unknown;
  error?: JSONRPCError;
}

export interface MCPToolSchema {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type?: string; description?: string }>;
    required: string[];
  };
}

type McpSpawnSpec = {
  command: string;
  args: string[];
  displayName: string;
  cwd?: string;
};

const MCP_PROTOCOL_VERSION = '2024-11-05';

type McpImportLifecycle = {
  startupTimeoutMs: number;
  idleTimeoutMs: number;
  maxConcurrent: number;
};

const DEFAULT_LIFECYCLE: McpImportLifecycle = {
  startupTimeoutMs: 10_000,
  idleTimeoutMs: 60_000,
  maxConcurrent: 5
};

export class McpImportManager {
  private readonly env: Environment;
  private readonly servers = new Map<string, McpImportServer>();
  private readonly lifecycle: McpImportLifecycle;

  constructor(env: Environment) {
    this.env = env;
    this.lifecycle = readLifecycleFromEnv();
  }

  async listTools(spec: string): Promise<MCPToolSchema[]> {
    const server = await this.getServer(spec);
    return server.listTools();
  }

  async callTool(spec: string, name: string, args: Record<string, unknown>): Promise<string> {
    const server = await this.getServer(spec);
    return server.callTool(name, args);
  }

  closeAll(): void {
    for (const server of this.servers.values()) {
      server.close();
    }
    this.servers.clear();
  }

  private async getServer(spec: string): Promise<McpImportServer> {
    const trimmed = spec.trim();
    const existing = this.servers.get(trimmed);
    if (existing && !existing.isClosed()) {
      return existing;
    }

    this.pruneClosedServers();
    if (this.servers.size >= this.lifecycle.maxConcurrent) {
      throw new Error(`MCP import server limit exceeded: ${this.servers.size + 1} > ${this.lifecycle.maxConcurrent}`);
    }

    const spawnSpec = resolveMcpSpawnSpec(trimmed, this.env);
    const server = new McpImportServer(spawnSpec, this.lifecycle.idleTimeoutMs);
    try {
      await withTimeout(
        server.initialize(),
        this.lifecycle.startupTimeoutMs,
        `MCP server '${spawnSpec.displayName}' initialize`
      );
    } catch (error) {
      server.close();
      throw error;
    }
    this.servers.set(trimmed, server);
    return server;
  }

  private pruneClosedServers(): void {
    for (const [key, server] of this.servers.entries()) {
      if (server.isClosed()) {
        this.servers.delete(key);
      }
    }
  }
}

class McpImportServer {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly rl: readline.Interface;
  private readonly pending = new Map<
    number,
    { resolve: (value: JSONRPCResponse) => void; reject: (error: Error) => void; onDone?: () => void }
  >();
  private readonly stderrChunks: string[] = [];
  private toolsCache?: MCPToolSchema[];
  private nextId = 1;
  private closed = false;
  private closedReason?: 'idle' | 'exit' | 'manual';
  private readonly idleTimeoutMs?: number;
  private idleTimer?: NodeJS.Timeout;
  private inflightCount = 0;

  constructor(private readonly spec: McpSpawnSpec, idleTimeoutMs?: number) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.child = spawn(spec.command, spec.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: spec.cwd,
      env: { ...process.env }
    });

    this.rl = readline.createInterface({ input: this.child.stdout, terminal: false });
    this.rl.on('line', line => this.handleLine(line));
    this.child.stderr.on('data', chunk => {
      if (this.stderrChunks.length < 50) {
        this.stderrChunks.push(String(chunk));
      }
    });
    this.child.on('error', error => {
      this.closed = true;
      this.closedReason = this.closedReason ?? 'exit';
      this.rejectPending(error instanceof Error ? error : new Error(String(error)));
    });
    this.child.on('exit', (code, signal) => {
      this.closed = true;
      this.closedReason = this.closedReason ?? 'exit';
      this.clearIdleTimer();
      this.rl.close();
      const reason = `MCP server '${this.spec.displayName}' exited` +
        (typeof code === 'number' ? ` with code ${code}` : '') +
        (signal ? ` (signal ${signal})` : '');
      this.rejectPending(new Error(reason));
    });
  }

  isClosed(): boolean {
    return this.closed;
  }

  async initialize(): Promise<void> {
    const response = await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mlld', version }
    });
    if (response.error) {
      throw new Error(this.decorateError(`MCP server '${this.spec.displayName}' initialize failed: ${response.error.message}`));
    }
  }

  async listTools(): Promise<MCPToolSchema[]> {
    if (this.toolsCache) {
      return this.toolsCache;
    }
    const response = await this.request('tools/list');
    if (response.error) {
      throw new Error(this.decorateError(`MCP server '${this.spec.displayName}' tools/list failed: ${response.error.message}`));
    }
    const result = response.result as { tools?: MCPToolSchema[] } | undefined;
    const tools = Array.isArray(result?.tools) ? result!.tools : [];
    this.toolsCache = tools;
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const response = await this.request('tools/call', { name, arguments: args });
    if (response.error) {
      throw new Error(this.decorateError(`MCP server '${this.spec.displayName}' tools/call failed: ${response.error.message}`));
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

  close(): void {
    this.closeWithReason('manual');
  }

  private closeWithReason(reason: 'idle' | 'manual'): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closedReason = reason;
    this.clearIdleTimer();
    this.rl.close();
    this.child.stdin.end();
    this.child.kill('SIGTERM');
  }

  private async request(method: string, params?: Record<string, unknown>): Promise<JSONRPCResponse> {
    if (this.closed) {
      throw new Error(`MCP server '${this.spec.displayName}' is closed`);
    }
    const id = this.nextId++;
    const payload: JSONRPCRequest = { jsonrpc: '2.0', id, method, params };
    return await new Promise((resolve, reject) => {
      this.clearIdleTimer();
      this.inflightCount += 1;
      const onDone = () => {
        this.inflightCount = Math.max(0, this.inflightCount - 1);
        if (this.inflightCount === 0) {
          this.touch();
        }
      };
      this.pending.set(id, { resolve, reject, onDone });
      try {
        this.child.stdin.write(`${JSON.stringify(payload)}\n`);
      } catch (error) {
        this.pending.delete(id);
        onDone();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let response: JSONRPCResponse;
    try {
      response = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (response.id === null || response.id === undefined) {
      return;
    }
    const entry = this.pending.get(response.id as number);
    if (entry) {
      this.pending.delete(response.id as number);
      entry.onDone?.();
      entry.resolve(response);
    }
  }

  private rejectPending(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.onDone?.();
      entry.reject(error);
    }
    this.pending.clear();
  }

  private touch(): void {
    if (!this.idleTimeoutMs || this.idleTimeoutMs <= 0) {
      return;
    }
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.closed || this.inflightCount > 0) {
        return;
      }
      this.closeWithReason('idle');
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) {
      return;
    }
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private decorateError(message: string): string {
    const stderr = this.stderrChunks.join('');
    if (!stderr) {
      return message;
    }
    return `${message}\n${stderr.trim()}`;
  }
}

function resolveMcpSpawnSpec(spec: string, env: Environment): McpSpawnSpec {
  const trimmed = spec.trim();
  if (/\s/.test(trimmed)) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return {
      command: parts[0],
      args: parts.slice(1),
      displayName: parts[0],
      cwd: env.getProjectRoot()
    };
  }

  if (looksLikeMlldModule(trimmed) || looksLikePath(trimmed)) {
    return {
      command: 'mlld',
      args: ['mcp', trimmed],
      displayName: trimmed,
      cwd: env.getProjectRoot()
    };
  }

  return {
    command: 'npx',
    args: [trimmed],
    displayName: trimmed,
    cwd: env.getProjectRoot()
  };
}

function looksLikeMlldModule(value: string): boolean {
  return /^@[^/]+\/[^/]+/.test(value);
}

function looksLikePath(value: string): boolean {
  if (value.startsWith('.') || value.startsWith('/')) {
    return true;
  }
  return /\.(mld|mlld|md|mld\.md|mlld\.md)$/.test(value);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function readLifecycleFromEnv(): McpImportLifecycle {
  const startupTimeoutMs = parsePositiveInt(
    process.env.MLLD_MCP_IMPORT_STARTUP_TIMEOUT_MS,
    DEFAULT_LIFECYCLE.startupTimeoutMs
  );
  const idleTimeoutMs = parsePositiveInt(
    process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS,
    DEFAULT_LIFECYCLE.idleTimeoutMs
  );
  const maxConcurrent = parsePositiveInt(
    process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT,
    DEFAULT_LIFECYCLE.maxConcurrent
  );
  return {
    startupTimeoutMs,
    idleTimeoutMs,
    maxConcurrent: Math.max(1, maxConcurrent)
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
