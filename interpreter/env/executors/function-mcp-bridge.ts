import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Environment } from '@interpreter/env/Environment';
import type {
  AvailableToolDescriptor,
  CallMcpConfig
} from '@interpreter/env/executors/call-mcp-config';
import type { ToolDefinition } from '@core/types/tools';
import type { ExecutableVariable } from '@core/types/variable';
import type { SecurityDescriptor } from '@core/types/security';
import type { ToolCollection } from '@core/types/tools';
import { FunctionRouter } from '@cli/mcp/FunctionRouter';
import { generateToolSchema } from '@cli/mcp/SchemaGenerator';
import { deriveMcpParamInfo, coerceMcpArgs, type McpParamInfo } from '@core/mcp/coerce';
import { resolveToolCollectionEntryMetadata } from '@interpreter/eval/exec/tool-metadata';
import { renderToolDescriptionNotes } from '@interpreter/fyi/tool-docs';

const PROTOCOL_VERSION = '2024-11-05';
const FUNCTION_SOCKET_ENV = 'MLLD_FUNCTION_MCP_SOCKET';

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

export interface FunctionMcpBridgeOptions {
  env: Environment;
  functions: Map<string, ExecutableVariable>; // key is exposed MCP tool name
  toolDefinitions?: ReadonlyMap<string, ToolDefinition>;
  sessionId: string;
  availableTools?: readonly AvailableToolDescriptor[];
  toolMetadata?: CallMcpConfig['toolMetadata'];
  conversationDescriptor?: SecurityDescriptor;
}

export interface FunctionMcpBridge {
  readonly mcpConfigPath: string;
  readonly socketPath: string;
  cleanup(): Promise<void>;
}

class FunctionMcpBridgeServer {
  private server?: net.Server;
  private readonly toolEnv: Environment;
  private readonly toolCollection: ToolCollection;
  private readonly toolSchemas: Array<Record<string, unknown>>;
  private readonly toolParamInfo: Map<string, McpParamInfo>;
  private readonly router: FunctionRouter;

  constructor(
    private readonly env: Environment,
    private readonly functions: Map<string, ExecutableVariable>,
    private readonly toolDefinitions: ReadonlyMap<string, ToolDefinition> | undefined,
    private readonly socketPath: string,
    sessionId: string,
    availableTools: readonly AvailableToolDescriptor[] | undefined,
    toolMetadata: CallMcpConfig['toolMetadata'],
    conversationDescriptor?: SecurityDescriptor
  ) {
    this.toolEnv = env.createChild();
    this.toolEnv.setLlmToolConfig({
      sessionId,
      mcpConfigPath: '',
      toolsCsv: '',
      mcpAllowedTools: '',
      nativeAllowedTools: '',
      unifiedAllowedTools: '',
      availableTools: availableTools ?? [],
      toolMetadata: toolMetadata ?? [],
      inBox: false,
      cleanup: async () => {}
    });
    this.toolCollection = {};
    this.toolSchemas = [];
    this.toolParamInfo = new Map();
    const clonedExecutables = new Map<string, ExecutableVariable>();

    let index = 0;
    for (const [mcpName, executable] of this.functions.entries()) {
      index += 1;
      const tempName = `__toolbridge_fn_${sanitizeIdentifier(mcpName)}_${index}`;
      const executableDef = (executable.internal?.executableDef ?? executable.value) as any;
      const cloned: ExecutableVariable = {
        ...executable,
        name: tempName,
        mx: {
          ...(executable.mx ?? {}),
          name: tempName,
          importPath: 'let'
        },
        internal: {
          ...(executable.internal ?? {}),
          executableDef,
          importPath: 'let',
          isSystem: true
        }
      };
      this.toolEnv.setVariable(tempName, cloned as any);
      const clonedExecutableDef = (cloned.internal?.executableDef ?? cloned.value) as any;
      const providedDefinition = this.toolDefinitions?.get(mcpName);
      this.toolCollection[mcpName] = providedDefinition
        ? cloneToolDefinitionForBridge(providedDefinition, tempName)
        : {
            mlld: tempName,
            ...(Array.isArray(executable.mx?.labels) ? { labels: executable.mx.labels } : {}),
            ...(Array.isArray(clonedExecutableDef?.controlArgs) ? { controlArgs: clonedExecutableDef.controlArgs } : {}),
            ...(clonedExecutableDef?.correlateControlArgs === true ? { correlateControlArgs: true } : {}),
            ...(Array.isArray(clonedExecutableDef?.optionalParams) ? { optional: clonedExecutableDef.optionalParams } : {}),
            ...(typeof executable.description === 'string'
              ? { description: executable.description }
              : typeof clonedExecutableDef?.description === 'string'
                ? { description: clonedExecutableDef.description }
                : {})
          };
      clonedExecutables.set(mcpName, cloned);
    }

    const inheritedScopedConfig = this.toolEnv.getScopedEnvironmentConfig();
    this.toolEnv.setScopedEnvironmentConfig({
      ...(inheritedScopedConfig ?? {}),
      tools: this.toolCollection
    });

    for (const [mcpName, cloned] of clonedExecutables.entries()) {
      const schema = generateToolSchema(mcpName, cloned, this.toolCollection[mcpName]);
      const metadata = resolveToolCollectionEntryMetadata(this.toolEnv, this.toolCollection, mcpName);
      const notes = metadata
        ? renderToolDescriptionNotes({
            env: this.toolEnv,
            entry: metadata
          })
        : undefined;
      if (notes) {
        const baseDescription = typeof schema.description === 'string' ? schema.description.trimEnd() : '';
        schema.description = baseDescription.length > 0
          ? `${baseDescription}\n\n${notes}`
          : notes;
      }
      this.toolSchemas.push(schema);
      this.toolParamInfo.set(mcpName, deriveMcpParamInfo(schema.inputSchema));
    }

    this.router = new FunctionRouter({
      environment: this.toolEnv,
      toolCollection: this.toolCollection,
      conversationDescriptor
    });
  }

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
    this.toolEnv.cleanup();
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
              name: 'mlld-toolbridge-functions',
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
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: this.toolSchemas
          }
        };
      }
      case 'tools/call': {
        if (!hasRequestId) {
          return null;
        }
        const toolName = String(request.params?.name ?? '');
        const args =
          request.params && typeof request.params.arguments === 'object' && request.params.arguments
            ? (request.params.arguments as Record<string, unknown>)
            : {};

        if (!this.toolCollection[toolName]) {
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
          const paramInfo = this.toolParamInfo.get(toolName);
          const coercedArgs = paramInfo ? coerceMcpArgs(args, paramInfo) : args;
          const text = await this.router.executeFunction(toolName, coercedArgs);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text }]
            }
          };
        } catch (error) {
          this.env.recordGuardDenialFromError(error);
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

function sanitizeIdentifier(input: string): string {
  const normalized = input.replace(/[^a-zA-Z0-9_]+/g, '_');
  if (!normalized) {
    return 'tool';
  }
  if (!/^[a-zA-Z_]/.test(normalized)) {
    return `_${normalized}`;
  }
  return normalized;
}

function cloneToolDefinitionForBridge(definition: ToolDefinition, mlldName: string): ToolDefinition {
  return {
    ...definition,
    mlld: mlldName,
    ...(Array.isArray(definition.labels) ? { labels: [...definition.labels] } : {}),
    ...(definition.bind && typeof definition.bind === 'object' ? { bind: { ...definition.bind } } : {}),
    ...(Array.isArray(definition.expose) ? { expose: [...definition.expose] } : {}),
    ...(Array.isArray(definition.optional) ? { optional: [...definition.optional] } : {}),
    ...(Array.isArray(definition.controlArgs) ? { controlArgs: [...definition.controlArgs] } : {})
  };
}

function buildSocketPath(): string {
  if (process.platform === 'win32') {
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return `\\\\.\\pipe\\mlld-toolbridge-fn-${process.pid}-${nonce}`;
  }
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return path.join(
    os.tmpdir(),
    `mlld-toolbridge-fn-${process.pid}-${nonce}.sock`
  );
}

function buildProxyScript(): string {
  return [
    "const net = require('net');",
    `const socketPath = process.env.${FUNCTION_SOCKET_ENV};`,
    'if (!socketPath) {',
    `  process.stderr.write('${FUNCTION_SOCKET_ENV} is required\\n');`,
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

export async function createFunctionMcpBridge(
  options: FunctionMcpBridgeOptions
): Promise<FunctionMcpBridge> {
  if (options.functions.size === 0) {
    const configPath = path.join(
      os.tmpdir(),
      `mlld-toolbridge-fn-config-${process.pid}-${Date.now()}-${randomUUID()}.json`
    );
    await fs.writeFile(configPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');
    return {
      mcpConfigPath: configPath,
      socketPath: '',
      async cleanup(): Promise<void> {
        await removeFileIfExists(configPath);
      }
    };
  }

  const socketPath = buildSocketPath();
  const proxyPath = path.join(
    os.tmpdir(),
    `mlld-toolbridge-fn-proxy-${process.pid}-${Date.now()}-${randomUUID()}.cjs`
  );
  const configPath = path.join(
    os.tmpdir(),
    `mlld-toolbridge-fn-config-${process.pid}-${Date.now()}-${randomUUID()}.json`
  );

  const server = new FunctionMcpBridgeServer(
    options.env,
    options.functions,
    options.toolDefinitions,
    socketPath,
    options.sessionId,
    options.availableTools,
    options.toolMetadata,
    options.conversationDescriptor
  );
  await server.start();

  await fs.writeFile(proxyPath, buildProxyScript(), 'utf8');

  const config = {
    mcpServers: {
      mlld_tools: {
        command: process.execPath,
        args: [proxyPath],
        env: {
          [FUNCTION_SOCKET_ENV]: socketPath
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
    mcpConfigPath: configPath,
    socketPath,
    cleanup
  };
}
