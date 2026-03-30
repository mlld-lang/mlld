import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Environment } from '@interpreter/env/Environment';
import type { SecurityDescriptor } from '@core/types/security';
import type { ExecutableVariable } from '@core/types/variable';
import { isExecutableVariable } from '@core/types/variable';
import { mlldNameToMCPName } from '@core/mcp/names';
import { createFunctionMcpBridge } from './function-mcp-bridge';
import { isStructuredValue, asData } from '@interpreter/utils/structured-value';
import { resolveEffectiveToolMetadata } from '@interpreter/eval/exec/tool-metadata';

const PROTOCOL_VERSION = '2024-11-05';
const FILTERED_VFS_SOCKET_ENV = 'MLLD_FILTERED_VFS_MCP_SOCKET';
const VFS_TOOL_NAMES = ['Read', 'Write', 'Bash', 'Glob', 'Grep'] as const;
const VFS_MCP_SERVER_NAME = 'mlld_vfs';
const FUNCTION_MCP_SERVER_NAME = 'mlld_tools';

type WorkspaceBridgeToolName = typeof VFS_TOOL_NAMES[number];

type McpConfigShape = {
  mcpServers?: Record<string, unknown>;
};

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export interface CallMcpConfigOptions {
  tools: unknown[];
  env: Environment;
  workingDirectory?: string;
  conversationDescriptor?: SecurityDescriptor;
}

export interface AvailableToolDescriptor {
  readonly name: string;
}

export interface CallMcpConfig {
  readonly sessionId: string;
  readonly mcpConfigPath: string;
  readonly toolsCsv: string;
  readonly mcpAllowedTools: string;
  readonly nativeAllowedTools: string;
  readonly unifiedAllowedTools: string;
  readonly availableTools: readonly AvailableToolDescriptor[];
  readonly inBox: boolean;
  cleanup(): Promise<void>;
}

export function normalizeToolsArg(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  let resolved = value;
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }

  if (Array.isArray(resolved)) {
    return resolved;
  }

  return [resolved];
}

class FilteredVfsBridgeServer {
  private server?: net.Server;

  constructor(
    private readonly socketPath: string,
    private readonly upstreamSocketPath: string,
    private readonly allowedTools: Set<WorkspaceBridgeToolName>,
    private readonly workingDirectory: string
  ) {}

  async start(): Promise<void> {
    await removeFileIfExists(this.socketPath);
    this.server = net.createServer(socket => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.socketPath, () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>(resolve => {
        this.server!.close(() => resolve());
      });
      this.server = undefined;
    }
    await removeFileIfExists(this.socketPath);
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = '';

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          const parsed = parseJsonRpcRequest(line);
          if ('error' in parsed) {
            socket.write(`${JSON.stringify(parsed.error)}\n`);
          } else {
            this.handleRequest(parsed.request)
              .then(response => {
                if (response) {
                  socket.write(`${JSON.stringify(response)}\n`);
                }
              })
              .catch(error => {
                if (parsed.request.id === undefined) {
                  return;
                }
                const message = error instanceof Error ? error.message : String(error);
                const fallback: JsonRpcResponse = {
                  jsonrpc: '2.0',
                  id: parsed.request.id,
                  error: {
                    code: -32603,
                    message
                  }
                };
                socket.write(`${JSON.stringify(fallback)}\n`);
              });
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  }

  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const hasRequestId = request.id !== undefined;
    const id = hasRequestId ? request.id : null;

    switch (request.method) {
      case 'initialize': {
        if (!hasRequestId) {
          return null;
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: {
              name: 'mlld-toolbridge-vfs',
              version: '1.0.0'
            }
          }
        };
      }
      case 'notifications/initialized': {
        return null;
      }
      case 'tools/list': {
        if (!hasRequestId) {
          return null;
        }
        const forwarded = await sendJsonRpc(this.upstreamSocketPath, {
          jsonrpc: '2.0',
          id,
          method: 'tools/list',
          params: {}
        });
        const upstreamTools = ((forwarded.result as any)?.tools ?? []) as Array<Record<string, unknown>>;
        const filtered = upstreamTools.filter(tool => this.allowedTools.has(String(tool.name) as WorkspaceBridgeToolName));
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: filtered
          }
        };
      }
      case 'tools/call': {
        if (!hasRequestId) {
          return null;
        }
        const toolName = String(request.params?.name ?? '');
        if (!this.allowedTools.has(toolName as WorkspaceBridgeToolName)) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Tool '${toolName}' not available` }],
              isError: true
            }
          };
        }

        const forwardedArgs =
          request.params && typeof request.params.arguments === 'object' && request.params.arguments
            ? rewriteToolArguments(
                toolName as WorkspaceBridgeToolName,
                request.params.arguments as Record<string, unknown>,
                this.workingDirectory
              )
            : {};

        return sendJsonRpc(this.upstreamSocketPath, {
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: forwardedArgs
          }
        });
      }
      default: {
        if (!hasRequestId) {
          return null;
        }
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method '${String(request.method)}' not found`
          }
        };
      }
    }
  }
}

function parseJsonRpcRequest(line: string): { request: JsonRpcRequest } | { error: JsonRpcResponse } {
  try {
    return {
      request: JSON.parse(line) as JsonRpcRequest
    };
  } catch (error) {
    return {
      error: {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : String(error)
        }
      }
    };
  }
}

function resolveToolInput(tools: unknown[]): { builtinTools: string[]; functionTools: ExecutableVariable[] } {
  const builtinTools: string[] = [];
  const functionTools: ExecutableVariable[] = [];

  for (const tool of tools) {
    if (typeof tool === 'string') {
      const trimmed = tool.trim();
      if (trimmed.length > 0) {
        builtinTools.push(trimmed);
      }
      continue;
    }

    if (tool && isExecutableVariable(tool)) {
      functionTools.push(tool);
      continue;
    }

    throw new Error(`Unsupported tool entry: ${String(tool)}`);
  }

  return {
    builtinTools: uniquePreservingOrder(builtinTools),
    functionTools
  };
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function buildAvailableTools(names: readonly string[]): AvailableToolDescriptor[] {
  return uniquePreservingOrder(
    names
      .filter((name): name is string => typeof name === 'string')
      .map(name => name.trim())
      .filter(Boolean)
  ).map(name => ({ name }));
}

function ensureNoMcpCollisions(
  builtinTools: string[],
  functionTools: ExecutableVariable[]
): void {
  const owners = new Map<string, string[]>();

  for (const builtin of builtinTools) {
    const existing = owners.get(builtin) ?? [];
    existing.push(`builtin:${builtin}`);
    owners.set(builtin, existing);
  }

  for (const fn of functionTools) {
    const rawName = typeof fn.name === 'string' ? fn.name : '';
    if (!rawName) {
      throw new Error('Function tool is missing a name');
    }
    const mcpName = mlldNameToMCPName(rawName);
    const existing = owners.get(mcpName) ?? [];
    existing.push(`exe:@${rawName} -> ${mcpName}`);
    owners.set(mcpName, existing);
  }

  const conflicts = Array.from(owners.entries()).filter(([, sources]) => sources.length > 1);
  if (conflicts.length === 0) {
    return;
  }

  const details = conflicts
    .map(([name, sources]) => `'${name}' from ${sources.join(' and ')}`)
    .join('; ');
  throw new Error(`Tool name collisions detected: ${details}`);
}

function assertValidVfsTools(builtinTools: string[]): WorkspaceBridgeToolName[] {
  const allowed = new Set<string>(VFS_TOOL_NAMES);
  const invalid = builtinTools.filter(name => !allowed.has(name));
  if (invalid.length > 0) {
    throw new Error(`Unknown VFS tool(s): ${invalid.join(', ')}`);
  }
  return builtinTools as WorkspaceBridgeToolName[];
}

function resolvePath(input: string, workingDirectory: string): string {
  const normalized = input.replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) {
    return path.posix.normalize(normalized);
  }
  return path.resolve(workingDirectory, normalized);
}

function rewriteToolArguments(
  toolName: WorkspaceBridgeToolName,
  args: Record<string, unknown>,
  workingDirectory: string
): Record<string, unknown> {
  const rewritten: Record<string, unknown> = { ...args };

  const rewriteFirstStringField = (keys: string[]): void => {
    for (const key of keys) {
      const value = rewritten[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        rewritten[key] = resolvePath(value, workingDirectory);
        return;
      }
    }
  };

  if (toolName === 'Read' || toolName === 'Write') {
    rewriteFirstStringField(['file_path', 'path', 'filePath']);
  }

  if (toolName === 'Glob' || toolName === 'Grep') {
    rewriteFirstStringField(['path', 'cwd', 'base']);
  }

  return rewritten;
}

function buildSocketPath(prefix: string): string {
  if (process.platform === 'win32') {
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return `\\\\.\\pipe\\${prefix}-${process.pid}-${nonce}`;
  }
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return path.join(os.tmpdir(), `${prefix}-${process.pid}-${nonce}.sock`);
}

function buildProxyScript(socketEnvName: string): string {
  return [
    "const net = require('net');",
    `const socketPath = process.env.${socketEnvName};`,
    'if (!socketPath) {',
    `  process.stderr.write('${socketEnvName} is required\\n');`,
    '  process.exit(1);',
    '}',
    'const socket = net.createConnection(socketPath);',
    "socket.on('error', (error) => {",
    "  process.stderr.write(String(error?.message || error) + '\\n');",
    '  process.exit(1);',
    '});',
    'process.stdin.pipe(socket);',
    'socket.pipe(process.stdout);',
    "process.stdin.on('error', () => {});",
  ].join('\n');
}

async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore cleanup errors.
  }
}

async function sendJsonRpc(
  socketPath: string,
  payload: Record<string, unknown>
): Promise<JsonRpcResponse> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';

    socket.once('error', reject);
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }
      const line = buffer.slice(0, newlineIndex).trim();
      socket.end();
      if (!line) {
        reject(new Error('Empty JSON-RPC response'));
        return;
      }
      try {
        resolve(JSON.parse(line) as JsonRpcResponse);
      } catch (error) {
        reject(error);
      }
    });

    socket.once('connect', () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
  });
}

async function readMcpServers(configPath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as McpConfigShape;
  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
    return {};
  }
  return parsed.mcpServers;
}

async function createFilteredVfsBridge(options: {
  upstreamSocketPath: string;
  tools: WorkspaceBridgeToolName[];
  workingDirectory: string;
}): Promise<{ mcpConfigPath: string; cleanup: () => Promise<void> }> {
  if (options.tools.length === 0) {
    const emptyConfigPath = path.join(
      os.tmpdir(),
      `mlld-toolbridge-vfs-config-${process.pid}-${Date.now()}-${randomUUID()}.json`
    );
    await fs.writeFile(emptyConfigPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');
    return {
      mcpConfigPath: emptyConfigPath,
      cleanup: async () => {
        await removeFileIfExists(emptyConfigPath);
      }
    };
  }

  const socketPath = buildSocketPath('mlld-toolbridge-vfs');
  const proxyPath = path.join(
    os.tmpdir(),
    `mlld-toolbridge-vfs-proxy-${process.pid}-${Date.now()}-${randomUUID()}.cjs`
  );
  const configPath = path.join(
    os.tmpdir(),
    `mlld-toolbridge-vfs-config-${process.pid}-${Date.now()}-${randomUUID()}.json`
  );

  const server = new FilteredVfsBridgeServer(
    socketPath,
    options.upstreamSocketPath,
    new Set(options.tools),
    options.workingDirectory
  );
  await server.start();

  await fs.writeFile(proxyPath, buildProxyScript(FILTERED_VFS_SOCKET_ENV), 'utf8');

  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        mcpServers: {
          mlld_vfs: {
            command: process.execPath,
            args: [proxyPath],
            env: {
              [FILTERED_VFS_SOCKET_ENV]: socketPath
            }
          }
        }
      },
      null,
      2
    ),
    'utf8'
  );

  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    await server.stop();
    await removeFileIfExists(proxyPath);
    await removeFileIfExists(configPath);
  };

  return {
    mcpConfigPath: configPath,
    cleanup
  };
}

function isWriteToolWithControlArgs(
  env: Environment,
  executable: ExecutableVariable
): boolean {
  const metadata = resolveEffectiveToolMetadata({
    env,
    executable,
    operationName: executable.name
  });
  return (
    (metadata.controlArgs?.length ?? 0) > 0
    && metadata.labels.some(label => label === 'tool:w' || label.startsWith('tool:w:'))
  );
}

function resolveImplicitFyiKnownTool(env: Environment): ExecutableVariable | undefined {
  const fyi = env.getVariable('fyi');
  const known = fyi?.value && typeof fyi.value === 'object'
    ? (fyi.value as Record<string, unknown>).known
    : undefined;
  return isExecutableVariable(known) ? known : undefined;
}

export async function createCallMcpConfig(options: CallMcpConfigOptions): Promise<CallMcpConfig> {
  const { builtinTools, functionTools } = resolveToolInput(options.tools);
  const implicitKnownTool = resolveImplicitFyiKnownTool(options.env);
  if (
    implicitKnownTool
    && !functionTools.some(tool => tool.name === implicitKnownTool.name)
    && functionTools.some(tool => isWriteToolWithControlArgs(options.env, tool))
  ) {
    functionTools.push(implicitKnownTool);
  }
  const inBox = Boolean(options.env.getActiveBridge());
  const workingDirectory = options.workingDirectory ?? options.env.getExecutionDirectory();

  let vfsTools: WorkspaceBridgeToolName[] = [];
  if (inBox) {
    vfsTools = assertValidVfsTools(builtinTools);
  }

  ensureNoMcpCollisions(inBox ? vfsTools : builtinTools, functionTools);

  const toolsCsv = uniquePreservingOrder([
    ...(inBox ? vfsTools : builtinTools),
    ...functionTools.map(tool => tool.name).filter((name): name is string => typeof name === 'string' && name.length > 0)
  ]).join(',');

  const cleanupFns: Array<() => Promise<void>> = [];
  const sessionId = randomUUID();
  const mcpServers: Record<string, unknown> = {};
  const mcpAllowedToolNames: string[] = [];
  const availableTools = buildAvailableTools([
    ...(inBox ? vfsTools : builtinTools),
    ...functionTools
      .map(tool => (typeof tool.name === 'string' ? mlldNameToMCPName(tool.name) : ''))
      .filter(Boolean)
  ]);

  if (inBox && vfsTools.length > 0) {
    const activeBridge = options.env.getActiveBridge();
    if (!activeBridge || !activeBridge.socketPath) {
      throw new Error('Active box bridge is unavailable');
    }
    const filteredVfsBridge = await createFilteredVfsBridge({
      upstreamSocketPath: activeBridge.socketPath,
      tools: vfsTools,
      workingDirectory
    });
    cleanupFns.push(filteredVfsBridge.cleanup);
    Object.assign(mcpServers, await readMcpServers(filteredVfsBridge.mcpConfigPath));
    for (const tool of vfsTools) {
      mcpAllowedToolNames.push(`mcp__${VFS_MCP_SERVER_NAME}__${tool}`);
    }
  }

  if (functionTools.length > 0) {
    const functionMap = new Map<string, ExecutableVariable>();
    for (const tool of functionTools) {
      const rawName = typeof tool.name === 'string' ? tool.name : '';
      if (!rawName) {
        throw new Error('Function tool is missing a name');
      }
      const mcpName = mlldNameToMCPName(rawName);
      functionMap.set(mcpName, tool);
    }

    const functionBridge = await createFunctionMcpBridge({
      env: options.env,
      functions: functionMap,
      sessionId,
      availableTools,
      conversationDescriptor: options.conversationDescriptor
    });
    cleanupFns.push(functionBridge.cleanup);
    Object.assign(mcpServers, await readMcpServers(functionBridge.mcpConfigPath));
    for (const [mcpName] of functionMap) {
      mcpAllowedToolNames.push(`mcp__${FUNCTION_MCP_SERVER_NAME}__${mcpName}`);
    }
  }

  const nativeAllowedTools = inBox ? '' : builtinTools.join(',');

  if (Object.keys(mcpServers).length === 0) {
    return {
      sessionId,
      mcpConfigPath: '',
      toolsCsv,
      mcpAllowedTools: '',
      nativeAllowedTools,
      unifiedAllowedTools: nativeAllowedTools,
      availableTools,
      inBox,
      async cleanup(): Promise<void> {
        // No-op
      }
    };
  }

  const configPath = path.join(
    os.tmpdir(),
    `mlld-toolbridge-call-config-${process.pid}-${Date.now()}-${randomUUID()}.json`
  );
  await fs.writeFile(configPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');

  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    for (const fn of cleanupFns) {
      try {
        await fn();
      } catch {
        // Best-effort cleanup.
      }
    }
    await removeFileIfExists(configPath);
  };

  const mcpAllowedTools = mcpAllowedToolNames.join(',');
  const unifiedAllowedTools = [mcpAllowedTools, nativeAllowedTools].filter(Boolean).join(',');

  return {
    sessionId,
    mcpConfigPath: configPath,
    toolsCsv,
    mcpAllowedTools,
    nativeAllowedTools,
    unifiedAllowedTools,
    availableTools,
    inBox,
    cleanup
  };
}
