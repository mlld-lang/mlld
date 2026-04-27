import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Environment } from '@interpreter/env/Environment';
import type {
  AvailableToolDescriptor,
  CallMcpConfig
} from '@interpreter/env/executors/call-mcp-config';
import type { ToolDefinition } from '@core/types/tools';
import type { ExecutableVariable, Variable } from '@core/types/variable';
import type { SecurityDescriptor } from '@core/types/security';
import type { ToolCollection } from '@core/types/tools';
import { FunctionRouter } from '@cli/mcp/FunctionRouter';
import { generateToolSchema } from '@cli/mcp/SchemaGenerator';
import { deriveMcpParamInfo, coerceMcpArgs, type McpParamInfo } from '@core/mcp/coerce';
import { resolveToolCollectionEntryMetadata } from '@interpreter/eval/exec/tool-metadata';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv
} from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { ObjectReferenceResolver } from '@interpreter/eval/import/ObjectReferenceResolver';
import { renderToolDescriptionNotes } from '@interpreter/fyi/tool-docs';
import { traceMcpProgress, traceMcpRequest, traceMcpResponse } from '@interpreter/tracing/events';
import {
  createMcpRequestCancelledError,
  MCP_CANCELLATION_CONTEXT
} from '@interpreter/mcp/cancellation';

const PROTOCOL_VERSION = '2024-11-05';
const FUNCTION_SOCKET_ENV = 'MLLD_FUNCTION_MCP_SOCKET';
const DEFAULT_CLEANUP_GRACE_MS = 30_000;
const MCP_TRACE_PROGRESS_INTERVAL_MS = 30_000;

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

interface BridgeTraceContext {
  requestId: number;
  startedAt: number;
  method: string;
  jsonrpcId?: string | number | null;
  tool?: string;
  progressTimer?: NodeJS.Timeout;
}

interface BridgeRequestControl {
  socket: net.Socket;
  abortController: AbortController;
  abortActiveExecution?: () => void;
}

function cloneExecutableForToolBridge(
  env: Environment,
  executable: ExecutableVariable,
  tempName: string,
  displayName: string
): ExecutableVariable {
  const executableDef = (executable.internal?.executableDef ?? executable.value) as any;
  const capturedModuleEnv = normalizeCapturedModuleEnvForToolBridge(env, executable);
  const clonedInternal: Record<string, unknown> = {
    ...(executable.internal ?? {}),
    executableDef,
    importPath: 'let',
    isSystem: true,
    isToolbridgeWrapper: true,
    toolbridgeDisplayName: displayName
  };

  if (capturedModuleEnv !== undefined) {
    sealCapturedModuleEnv(clonedInternal, capturedModuleEnv);
  }

  const cloned: ExecutableVariable = {
    ...executable,
    name: tempName,
    mx: {
      ...(executable.mx ?? {}),
      name: tempName,
      importPath: 'let'
    },
    internal: clonedInternal as ExecutableVariable['internal']
  };

  if (capturedModuleEnv !== undefined) {
    sealCapturedModuleEnv(cloned, capturedModuleEnv);
  }

  return cloned;
}

function normalizeCapturedModuleEnvForToolBridge(
  env: Environment,
  executable: ExecutableVariable
): Map<string, Variable> | undefined {
  const capturedModuleEnv =
    getCapturedModuleEnv(executable.internal) ?? getCapturedModuleEnv(executable);
  if (!capturedModuleEnv) {
    return undefined;
  }
  if (capturedModuleEnv instanceof Map) {
    return capturedModuleEnv as Map<string, Variable>;
  }
  if (typeof capturedModuleEnv !== 'object') {
    return undefined;
  }

  const importer = new VariableImporter(new ObjectReferenceResolver());
  return importer.deserializeModuleEnv(capturedModuleEnv, env);
}

export interface FunctionMcpBridgeOptions {
  env: Environment;
  functions: Map<string, ExecutableVariable>; // key is exposed MCP tool name
  toolDefinitions?: ReadonlyMap<string, ToolDefinition>;
  sessionId: string;
  availableTools?: readonly AvailableToolDescriptor[];
  toolMetadata?: CallMcpConfig['toolMetadata'];
  authorizationRole?: string;
  authorizationNotes?: string;
  conversationDescriptor?: SecurityDescriptor;
  cleanupGraceMs?: number;
}

export interface FunctionMcpBridge {
  readonly mcpConfigPath: string;
  readonly socketPath: string;
  cleanup(): Promise<void>;
}

class FunctionMcpBridgeServer {
  private server?: net.Server;
  private readonly activeSockets = new Set<net.Socket>();
  private deferredStopTimer?: NodeJS.Timeout;
  private stopPromise?: Promise<void>;
  private readonly toolEnv: Environment;
  private readonly toolCollection: ToolCollection;
  private readonly toolSchemas: Array<Record<string, unknown>>;
  private readonly toolParamInfo: Map<string, McpParamInfo>;
  private readonly router: FunctionRouter;
  private readonly socketRequestControls = new Map<net.Socket, Set<BridgeRequestControl>>();
  private requestSequence = 0;
  private toolCallQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly env: Environment,
    private readonly functions: Map<string, ExecutableVariable>,
    private readonly toolDefinitions: ReadonlyMap<string, ToolDefinition> | undefined,
    private readonly socketPath: string,
    private readonly sessionId: string,
    availableTools: readonly AvailableToolDescriptor[] | undefined,
    toolMetadata: CallMcpConfig['toolMetadata'],
    authorizationRole: string | undefined,
    authorizationNotes: string | undefined,
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
      authorizationRole,
      authorizationNotes,
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
      const cloned = cloneExecutableForToolBridge(this.toolEnv, executable, tempName, mcpName);
      this.toolEnv.setVariable(tempName, cloned as any);
      const clonedExecutableDef = (cloned.internal?.executableDef ?? cloned.value) as any;
      const providedDefinition = this.toolDefinitions?.get(mcpName);
      this.toolCollection[mcpName] = providedDefinition
        ? cloneToolDefinitionForBridge(providedDefinition, tempName)
        : {
            mlld: tempName,
            ...(Array.isArray(executable.mx?.labels) ? { labels: executable.mx.labels } : {}),
            ...(Array.isArray(clonedExecutableDef?.controlArgs) ? { controlArgs: clonedExecutableDef.controlArgs } : {}),
            ...(Array.isArray(clonedExecutableDef?.updateArgs) ? { updateArgs: clonedExecutableDef.updateArgs } : {}),
            ...(Array.isArray(clonedExecutableDef?.exactPayloadArgs) ? { exactPayloadArgs: clonedExecutableDef.exactPayloadArgs } : {}),
            ...(Array.isArray(clonedExecutableDef?.sourceArgs) ? { sourceArgs: clonedExecutableDef.sourceArgs } : {}),
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
      const metadata = resolveToolCollectionEntryMetadata(this.toolEnv, this.toolCollection, mcpName);
      const schema = generateToolSchema(mcpName, cloned, this.toolCollection[mcpName], metadata);
      const notes = metadata
        ? renderToolDescriptionNotes({
            env: this.toolEnv,
            entry: metadata
          })
        : undefined;
      if (notes) {
        const baseDescription = typeof schema.description === 'string' ? schema.description.trimEnd() : '';
        schema.description = baseDescription.length > 0
          ? `${baseDescription} ${notes}`
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
    if (this.deferredStopTimer) {
      clearTimeout(this.deferredStopTimer);
      this.deferredStopTimer = undefined;
    }

    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    this.stopPromise = this.stopInternal();
    await this.stopPromise;
  }

  scheduleDeferredStop(graceMs: number): void {
    if (this.deferredStopTimer || this.stopPromise) {
      return;
    }

    if (!this.server) {
      void this.stop();
      return;
    }

    this.server.unref();
    if (graceMs <= 0) {
      void this.stop();
      return;
    }

    this.deferredStopTimer = setTimeout(() => {
      this.deferredStopTimer = undefined;
      void this.stop();
    }, graceMs);
    this.deferredStopTimer.unref?.();
  }

  private handleConnection(socket: net.Socket): void {
    this.activeSockets.add(socket);
    socket.once('close', () => {
      this.activeSockets.delete(socket);
      this.abortSocketRequests(socket);
    });
    socket.on('error', () => {
      // Claude may drop and respawn the stdio proxy; do not treat socket churn as a bridge failure.
    });

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
            this.writeResponse(socket, parsed.error);
          } else {
            const requestControl = this.beginRequestControl(socket);
            const traceContext = this.beginRequestTrace(parsed.request, socket);
            this.handleRequest(parsed.request, requestControl)
              .then(response => {
                this.finishRequestTrace(traceContext, response, socket);
                if (response) {
                  this.writeResponse(socket, response);
                }
              })
              .catch(error => {
                if (parsed.request.id === undefined) {
                  this.finishRequestTrace(traceContext, null, socket, error);
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
                this.finishRequestTrace(traceContext, fallback, socket, error);
                this.writeResponse(socket, fallback);
              })
              .finally(() => {
                this.finishRequestControl(requestControl);
              });
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  }

  private beginRequestControl(socket: net.Socket): BridgeRequestControl {
    const control: BridgeRequestControl = {
      socket,
      abortController: new AbortController()
    };
    let controls = this.socketRequestControls.get(socket);
    if (!controls) {
      controls = new Set();
      this.socketRequestControls.set(socket, controls);
    }
    controls.add(control);
    if (isSocketClosed(socket)) {
      this.abortRequestControl(control);
    }
    return control;
  }

  private finishRequestControl(control: BridgeRequestControl): void {
    const controls = this.socketRequestControls.get(control.socket);
    if (controls) {
      controls.delete(control);
      if (controls.size === 0) {
        this.socketRequestControls.delete(control.socket);
      }
    }
    control.abortActiveExecution = undefined;
  }

  private abortSocketRequests(socket: net.Socket): void {
    const controls = this.socketRequestControls.get(socket);
    if (!controls) {
      return;
    }
    for (const control of Array.from(controls)) {
      this.abortRequestControl(control);
    }
  }

  private abortRequestControl(control: BridgeRequestControl): void {
    if (control.abortController.signal.aborted) {
      return;
    }
    control.abortController.abort(createMcpRequestCancelledError());
    control.abortActiveExecution?.();
  }

  private throwIfRequestCancelled(control: BridgeRequestControl): void {
    if (control.abortController.signal.aborted || isSocketClosed(control.socket)) {
      if (!control.abortController.signal.aborted) {
        this.abortRequestControl(control);
      }
      throw createMcpRequestCancelledError(control.abortController.signal.reason);
    }
  }

  private async handleRequest(
    request: JsonRpcRequest,
    control: BridgeRequestControl
  ): Promise<JsonRpcResponse | null> {
    if (request.method === 'tools/call') {
      return this.enqueueToolCall(request, control);
    }
    return this.dispatchRequest(request, control);
  }

  private enqueueToolCall(
    request: JsonRpcRequest,
    control: BridgeRequestControl
  ): Promise<JsonRpcResponse | null> {
    const run = this.toolCallQueue.then(() => {
      this.throwIfRequestCancelled(control);
      return this.dispatchRequest(request, control);
    });
    this.toolCallQueue = run.catch(() => undefined);
    return run;
  }

  private async dispatchRequest(
    request: JsonRpcRequest,
    control: BridgeRequestControl
  ): Promise<JsonRpcResponse | null> {
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
          this.throwIfRequestCancelled(control);
          const paramInfo = this.toolParamInfo.get(toolName);
          const coercedArgs = paramInfo ? coerceMcpArgs(args, paramInfo) : args;
          const text = await this.executeToolCall(toolName, coercedArgs, control);
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

  private async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    control: BridgeRequestControl
  ): Promise<string> {
    this.throwIfRequestCancelled(control);
    const abortActiveExecution = () => this.toolEnv.cleanup();
    control.abortActiveExecution = abortActiveExecution;
    try {
      return await this.raceWithRequestCancellation(
        control,
        () => this.toolEnv.withExecutionContext(
          MCP_CANCELLATION_CONTEXT,
          { signal: control.abortController.signal },
          () => this.router.executeFunction(toolName, args)
        )
      );
    } finally {
      if (control.abortActiveExecution === abortActiveExecution) {
        control.abortActiveExecution = undefined;
      }
    }
  }

  private async raceWithRequestCancellation<T>(
    control: BridgeRequestControl,
    run: () => Promise<T>
  ): Promise<T> {
    this.throwIfRequestCancelled(control);
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        control.abortController.signal.removeEventListener('abort', onAbort);
        callback();
      };
      const onAbort = () => {
        finish(() => reject(createMcpRequestCancelledError(control.abortController.signal.reason)));
      };
      control.abortController.signal.addEventListener('abort', onAbort, { once: true });
      if (control.abortController.signal.aborted || isSocketClosed(control.socket)) {
        this.abortRequestControl(control);
        onAbort();
        return;
      }
      run().then(
        value => finish(() => resolve(value)),
        error => finish(() => reject(error))
      );
    });
  }

  private beginRequestTrace(request: JsonRpcRequest, socket: net.Socket): BridgeTraceContext {
    const requestId = ++this.requestSequence;
    const method = typeof request.method === 'string' && request.method.length > 0
      ? request.method
      : '<missing>';
    const tool = method === 'tools/call'
      ? String(request.params?.name ?? '')
      : undefined;
    const args = method === 'tools/call'
      && request.params
      && typeof request.params.arguments === 'object'
      && request.params.arguments
        ? request.params.arguments as Record<string, unknown>
        : undefined;
    const argBytes = args !== undefined ? safeJsonByteLength(args) : undefined;

    const context: BridgeTraceContext = {
      requestId,
      startedAt: Date.now(),
      method,
      ...(request.id !== undefined ? { jsonrpcId: request.id } : {}),
      ...(tool ? { tool } : {})
    };

    this.toolEnv.emitRuntimeTraceEvent(traceMcpRequest({
      bridge: 'function',
      sessionId: this.sessionId,
      requestId,
      ...(request.id !== undefined ? { jsonrpcId: request.id } : {}),
      method,
      ...(tool ? { tool } : {}),
      ...(args !== undefined ? { args: this.toolEnv.summarizeTraceValue(args) } : {}),
      ...(argBytes !== undefined ? { argBytes } : {})
    }));

    if (this.toolEnv.shouldEmitRuntimeTrace('verbose', 'mcp')) {
      const progressTimer = setInterval(() => {
        this.emitProgressTrace(context, socket);
      }, MCP_TRACE_PROGRESS_INTERVAL_MS);
      progressTimer.unref?.();
      context.progressTimer = progressTimer;
    }

    return context;
  }

  private emitProgressTrace(context: BridgeTraceContext, socket: net.Socket): void {
    this.toolEnv.emitRuntimeTraceEvent(traceMcpProgress({
      bridge: 'function',
      sessionId: this.sessionId,
      requestId: context.requestId,
      ...(context.jsonrpcId !== undefined ? { jsonrpcId: context.jsonrpcId } : {}),
      method: context.method,
      ...(context.tool ? { tool: context.tool } : {}),
      durationMs: Math.max(0, Date.now() - context.startedAt),
      clientClosed: isSocketClosed(socket)
    }));
  }

  private finishRequestTrace(
    context: BridgeTraceContext,
    response: JsonRpcResponse | null,
    socket: net.Socket,
    thrownError?: unknown
  ): void {
    if (context.progressTimer) {
      clearInterval(context.progressTimer);
      context.progressTimer = undefined;
    }
    const responseText = response ? `${JSON.stringify(response)}\n` : undefined;
    const outcome = describeMcpResponse(response, thrownError);
    const contentTrace = describeMcpResponseContent(response);
    this.toolEnv.emitRuntimeTraceEvent(traceMcpResponse({
      bridge: 'function',
      sessionId: this.sessionId,
      requestId: context.requestId,
      ...(context.jsonrpcId !== undefined ? { jsonrpcId: context.jsonrpcId } : {}),
      method: context.method,
      ...(context.tool ? { tool: context.tool } : {}),
      ok: outcome.ok,
      ...(outcome.isError !== undefined ? { isError: outcome.isError } : {}),
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(outcome.errorCode !== undefined ? { errorCode: outcome.errorCode } : {}),
      durationMs: Math.max(0, Date.now() - context.startedAt),
      ...(responseText !== undefined ? { responseBytes: Buffer.byteLength(responseText, 'utf8') } : {}),
      ...contentTrace,
      clientClosed: isSocketClosed(socket)
    }));
  }

  private writeResponse(socket: net.Socket, response: JsonRpcResponse): void {
    if (isSocketClosed(socket)) {
      return;
    }
    socket.write(`${JSON.stringify(response)}\n`);
  }

  private async stopInternal(): Promise<void> {
    if (this.server) {
      const server = this.server;
      this.server = undefined;
      await new Promise<void>(resolve => {
        server.close(() => resolve());
        for (const socket of this.activeSockets) {
          socket.destroy();
        }
      });
    }
    await removeFileIfExists(this.socketPath);
    this.toolEnv.cleanup();
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

function describeMcpResponse(
  response: JsonRpcResponse | null,
  thrownError?: unknown
): { ok: boolean; isError?: boolean; error?: string; errorCode?: number } {
  if (thrownError !== undefined) {
    return {
      ok: false,
      error: thrownError instanceof Error ? thrownError.message : String(thrownError)
    };
  }
  if (!response) {
    return { ok: true };
  }
  if (response.error) {
    return {
      ok: false,
      errorCode: response.error.code,
      error: response.error.message
    };
  }

  const result = response.result as Record<string, unknown> | undefined;
  if (result?.isError === true) {
    return {
      ok: false,
      isError: true,
      error: firstTextContent(result) ?? 'MCP tool returned isError'
    };
  }

  return { ok: true };
}

function firstTextContent(result: Record<string, unknown>): string | undefined {
  const content = result.content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  const first = content[0];
  if (!first || typeof first !== 'object') {
    return undefined;
  }
  const text = (first as Record<string, unknown>).text;
  return typeof text === 'string' ? text : undefined;
}

function describeMcpResponseContent(response: JsonRpcResponse | null): {
  contentTextKind?: 'missing' | 'empty' | 'literal_null' | 'json_object' | 'json_array' | 'json_string' | 'json_number' | 'json_boolean' | 'json_null' | 'non_json';
  contentTextBytes?: number;
  contentTextHash?: string;
  contentTextPreview?: string;
} {
  if (!response || response.error) {
    return {};
  }
  const result = response.result as Record<string, unknown> | undefined;
  if (!result || typeof result !== 'object') {
    return {};
  }
  const text = firstTextContent(result);
  if (text === undefined) {
    return { contentTextKind: 'missing' };
  }

  const trimmed = text.trim();
  const contentTextBytes = Buffer.byteLength(text, 'utf8');
  const contentTextHash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  const base = {
    contentTextBytes,
    contentTextHash
  };

  if (text.length === 0) {
    return { ...base, contentTextKind: 'empty', contentTextPreview: '' };
  }
  if (trimmed === 'null') {
    return { ...base, contentTextKind: 'literal_null', contentTextPreview: trimmed };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null) {
      return { ...base, contentTextKind: 'json_null', contentTextPreview: trimmed.slice(0, 160) };
    }
    if (Array.isArray(parsed)) {
      return { ...base, contentTextKind: 'json_array' };
    }
    switch (typeof parsed) {
      case 'object':
        return { ...base, contentTextKind: 'json_object' };
      case 'string':
        return { ...base, contentTextKind: 'json_string' };
      case 'number':
        return { ...base, contentTextKind: 'json_number' };
      case 'boolean':
        return { ...base, contentTextKind: 'json_boolean' };
      default:
        return { ...base, contentTextKind: 'non_json', contentTextPreview: trimmed.slice(0, 160) };
    }
  } catch {
    return { ...base, contentTextKind: 'non_json', contentTextPreview: trimmed.slice(0, 160) };
  }
}

function safeJsonByteLength(value: unknown): number | undefined {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return undefined;
  }
}

function isSocketClosed(socket: net.Socket): boolean {
  return socket.destroyed || socket.writableEnded || !socket.writable;
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
    ...(Array.isArray(definition.controlArgs) ? { controlArgs: [...definition.controlArgs] } : {}),
    ...(Array.isArray(definition.updateArgs) ? { updateArgs: [...definition.updateArgs] } : {}),
    ...(Array.isArray(definition.exactPayloadArgs) ? { exactPayloadArgs: [...definition.exactPayloadArgs] } : {}),
    ...(Array.isArray(definition.sourceArgs) ? { sourceArgs: [...definition.sourceArgs] } : {})
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
    options.authorizationRole,
    options.authorizationNotes,
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

  const cleanupGraceMs = Math.max(
    0,
    typeof options.cleanupGraceMs === 'number'
      ? options.cleanupGraceMs
      : DEFAULT_CLEANUP_GRACE_MS
  );
  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    await removeFileIfExists(configPath);
    // Keep the transport restartable briefly after config teardown so Claude can
    // respawn the stdio proxy if the MCP child churns during shutdown.
    server.scheduleDeferredStop(cleanupGraceMs);
    const removeProxy = setTimeout(() => {
      void removeFileIfExists(proxyPath);
    }, cleanupGraceMs);
    removeProxy.unref?.();
  };

  return {
    mcpConfigPath: configPath,
    socketPath,
    cleanup
  };
}
