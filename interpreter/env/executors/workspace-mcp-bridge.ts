import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { minimatch } from 'minimatch';
import type { WorkspaceValue } from '@core/types/workspace';
import type { ShellSession } from '@services/fs/ShellSession';

const PROTOCOL_VERSION = '2024-11-05';

export type WorkspaceBridgeToolName = 'Read' | 'Write' | 'Bash' | 'Glob' | 'Grep';

const ALL_WORKSPACE_BRIDGE_TOOLS: readonly WorkspaceBridgeToolName[] = [
  'Read',
  'Write',
  'Bash',
  'Glob',
  'Grep'
];

const TOOL_SCHEMAS: Record<WorkspaceBridgeToolName, Record<string, unknown>> = {
  Read: {
    name: 'Read',
    description: 'Read a file from the active mlld workspace',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' }
      },
      required: ['file_path']
    }
  },
  Write: {
    name: 'Write',
    description: 'Write a file in the active mlld workspace',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['file_path', 'content']
    }
  },
  Bash: {
    name: 'Bash',
    description: 'Execute bash command in active mlld workspace shell session',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' }
      },
      required: ['command']
    }
  },
  Glob: {
    name: 'Glob',
    description: 'Glob files from active mlld workspace',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' }
      },
      required: ['pattern']
    }
  },
  Grep: {
    name: 'Grep',
    description: 'Search file contents in active mlld workspace',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' }
      },
      required: ['pattern']
    }
  }
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

export interface WorkspaceMcpBridgeOptions {
  workspace: WorkspaceValue;
  getShellSession: () => Promise<ShellSession>;
  isToolAllowed?: (toolName: WorkspaceBridgeToolName) => boolean;
}

export interface WorkspaceMcpBridge {
  readonly allowedTools: readonly WorkspaceBridgeToolName[];
  readonly mcpConfigPath: string;
  injectCommand(command: string): string;
  cleanup(): Promise<void>;
}

export function selectWorkspaceBridgeTools(
  isToolAllowed?: (toolName: WorkspaceBridgeToolName) => boolean
): WorkspaceBridgeToolName[] {
  if (!isToolAllowed) {
    return [...ALL_WORKSPACE_BRIDGE_TOOLS];
  }

  return ALL_WORKSPACE_BRIDGE_TOOLS.filter(toolName => {
    try {
      return isToolAllowed(toolName);
    } catch {
      return false;
    }
  });
}

class WorkspaceMcpBridgeServer {
  private server?: net.Server;

  constructor(
    private readonly workspace: WorkspaceValue,
    private readonly allowedTools: readonly WorkspaceBridgeToolName[],
    private readonly getShellSession: () => Promise<ShellSession>,
    private readonly socketPath: string
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
          this.handleLine(line)
            .then(response => {
              socket.write(`${JSON.stringify(response)}\n`);
            })
            .catch(error => {
              const message = error instanceof Error ? error.message : String(error);
              const fallback: JsonRpcResponse = {
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32603,
                  message
                }
              };
              socket.write(`${JSON.stringify(fallback)}\n`);
            });
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  }

  private async handleLine(line: string): Promise<JsonRpcResponse> {
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }

    const id = request.id ?? null;

    switch (request.method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: {
              name: 'mlld-workspace-vfs',
              version: '1.0.0'
            }
          }
        };
      }
      case 'notifications/initialized': {
        return {
          jsonrpc: '2.0',
          id,
          result: null
        };
      }
      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: this.allowedTools.map(toolName => TOOL_SCHEMAS[toolName])
          }
        };
      }
      case 'tools/call': {
        const toolName = String(request.params?.name ?? '');
        const args =
          request.params && typeof request.params.arguments === 'object' && request.params.arguments
            ? (request.params.arguments as Record<string, unknown>)
            : {};
        if (!this.allowedTools.includes(toolName as WorkspaceBridgeToolName)) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Tool '${toolName}' not available` }],
              isError: true
            }
          };
        }

        try {
          const text = await this.callTool(toolName as WorkspaceBridgeToolName, args);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text }]
            }
          };
        } catch (error) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: error instanceof Error ? error.message : String(error)
              }],
              isError: true
            }
          };
        }
      }
      default: {
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

  private async callTool(
    toolName: WorkspaceBridgeToolName,
    args: Record<string, unknown>
  ): Promise<string> {
    switch (toolName) {
      case 'Read':
        return await this.handleRead(args);
      case 'Write':
        return await this.handleWrite(args);
      case 'Bash':
        return await this.handleBash(args);
      case 'Glob':
        return await this.handleGlob(args);
      case 'Grep':
        return await this.handleGrep(args);
      default:
        throw new Error(`Unsupported tool '${toolName}'`);
    }
  }

  private async handleRead(args: Record<string, unknown>): Promise<string> {
    const filePath = normalizeWorkspacePath(extractStringArg(args, ['file_path', 'path', 'filePath']));
    return await this.workspace.fs.readFile(filePath);
  }

  private async handleWrite(args: Record<string, unknown>): Promise<string> {
    const filePath = normalizeWorkspacePath(extractStringArg(args, ['file_path', 'path', 'filePath']));
    const content = extractStringArg(args, ['content', 'text', 'value']);
    await this.workspace.fs.writeFile(filePath, content);
    return `Wrote ${filePath}`;
  }

  private async handleBash(args: Record<string, unknown>): Promise<string> {
    const command = extractStringArg(args, ['command', 'cmd']);
    const shell = await this.getShellSession();
    const result = await shell.exec(command);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `bash exited with ${result.exitCode}`);
    }

    if (result.stderr && result.stdout) {
      return `${result.stdout}\n${result.stderr}`.trim();
    }

    return (result.stdout || result.stderr || '').trimEnd();
  }

  private async handleGlob(args: Record<string, unknown>): Promise<string> {
    const pattern = extractStringArg(args, ['pattern']);
    const scopePathRaw = extractOptionalStringArg(args, ['path', 'cwd', 'base']) || '/';
    const scopePath = normalizeWorkspacePath(scopePathRaw);

    const files = await collectWorkspaceFiles(this.workspace, scopePath);
    const matches = files.filter(filePath => {
      const relative = path.posix.relative(scopePath, filePath);
      const absolutePattern = pattern.startsWith('/') ? pattern : path.posix.join(scopePath, pattern);
      return (
        minimatch(filePath, absolutePattern, { dot: true, nocase: false }) ||
        minimatch(relative, pattern, { dot: true, nocase: false })
      );
    });

    return matches.join('\n');
  }

  private async handleGrep(args: Record<string, unknown>): Promise<string> {
    const pattern = extractStringArg(args, ['pattern']);
    const scopePathRaw = extractOptionalStringArg(args, ['path', 'cwd', 'base']) || '/';
    const scopePath = normalizeWorkspacePath(scopePathRaw);
    const matcher = compileGrepPattern(pattern);

    const files = await collectWorkspaceFiles(this.workspace, scopePath);
    const output: string[] = [];

    for (const filePath of files) {
      let content: string;
      try {
        content = await this.workspace.fs.readFile(filePath);
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        if (matcher(line)) {
          output.push(`${filePath}:${lineIndex + 1}:${line}`);
        }
      }
    }

    return output.join('\n');
  }
}

function extractStringArg(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  throw new Error(`Missing required argument: ${keys[0]}`);
}

function extractOptionalStringArg(args: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function normalizeWorkspacePath(input: string): string {
  const withForwardSlashes = input.replace(/\\/g, '/');
  const normalized = withForwardSlashes.startsWith('/')
    ? path.posix.normalize(withForwardSlashes)
    : path.posix.normalize(path.posix.join('/', withForwardSlashes));
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

async function collectWorkspaceFiles(
  workspace: WorkspaceValue,
  rootPath: string
): Promise<string[]> {
  const files: string[] = [];
  const queue = [rootPath];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    let entries: string[];
    try {
      entries = await workspace.fs.readdir(current);
    } catch {
      try {
        const exists = await workspace.fs.exists(current);
        if (!exists) {
          continue;
        }
        const isDirectory = await workspace.fs.isDirectory(current);
        if (!isDirectory) {
          files.push(current);
        }
      } catch {
        // Ignore path resolution errors.
      }
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.posix.join(current, entry);
      try {
        if (await workspace.fs.isDirectory(fullPath)) {
          queue.push(fullPath);
        } else {
          files.push(fullPath);
        }
      } catch {
        // Ignore entries that disappear during traversal.
      }
    }
  }

  files.sort();
  return files;
}

function compileGrepPattern(pattern: string): (line: string) => boolean {
  try {
    const regex = new RegExp(pattern);
    return (line: string) => regex.test(line);
  } catch {
    return (line: string) => line.includes(pattern);
  }
}

function buildSocketPath(): string {
  if (process.platform === 'win32') {
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return `\\\\.\\pipe\\mlld-vfs-${process.pid}-${nonce}`;
  }
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return path.join(
    os.tmpdir(),
    `mlld-vfs-${process.pid}-${nonce}.sock`
  );
}

function buildProxyScript(): string {
  return [
    "const net = require('net');",
    "const socketPath = process.env.MLLD_VFS_MCP_SOCKET;",
    "if (!socketPath) {",
    "  process.stderr.write('MLLD_VFS_MCP_SOCKET is required\\n');",
    '  process.exit(1);',
    '}',
    "const socket = net.createConnection(socketPath);",
    'socket.on(\'error\', (error) => {',
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

export async function createWorkspaceMcpBridge(
  options: WorkspaceMcpBridgeOptions
): Promise<WorkspaceMcpBridge> {
  const allowedTools = selectWorkspaceBridgeTools(options.isToolAllowed);

  if (allowedTools.length === 0) {
    const configPath = path.join(
      os.tmpdir(),
      `mlld-vfs-mcp-config-${process.pid}-${Date.now()}-${randomUUID()}.json`
    );
    await fs.writeFile(configPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');
    return {
      allowedTools,
      mcpConfigPath: configPath,
      injectCommand(command: string): string {
        return appendMcpConfigFlag(command, configPath);
      },
      async cleanup(): Promise<void> {
        await removeFileIfExists(configPath);
      }
    };
  }

  const socketPath = buildSocketPath();
  const proxyPath = path.join(
    os.tmpdir(),
    `mlld-vfs-mcp-proxy-${process.pid}-${Date.now()}-${randomUUID()}.cjs`
  );
  const configPath = path.join(
    os.tmpdir(),
    `mlld-vfs-mcp-config-${process.pid}-${Date.now()}-${randomUUID()}.json`
  );

  const server = new WorkspaceMcpBridgeServer(
    options.workspace,
    allowedTools,
    options.getShellSession,
    socketPath
  );
  await server.start();

  await fs.writeFile(proxyPath, buildProxyScript(), 'utf8');

  const config = {
    mcpServers: {
      mlld_vfs: {
        command: process.execPath,
        args: [proxyPath],
        env: {
          MLLD_VFS_MCP_SOCKET: socketPath
        }
      }
    }
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

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
    allowedTools,
    mcpConfigPath: configPath,
    injectCommand(command: string): string {
      return appendMcpConfigFlag(command, configPath);
    },
    cleanup
  };
}

function appendMcpConfigFlag(command: string, configPath: string): string {
  if (/\s--mcp-config(=|\s)/.test(` ${command}`)) {
    return command;
  }
  return `${command} --mcp-config ${quoteShellArg(configPath)}`;
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
