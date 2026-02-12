import * as readline from 'readline';
import { analyzeModule } from '@sdk/analyze';
import { execute, type ExecuteOptions } from '@sdk/execute';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { PathContextBuilder } from '@core/services/PathContextService';
import { resolveMlldMode } from '@core/utils/mode';
import type { MlldMode } from '@core/types/mode';
import { interpret } from '@interpreter/index';
import type { SDKEvent, StreamExecution, StructuredResult } from '@sdk/types';

type RequestId = string | number;

interface LiveRequest {
  method: string;
  id?: RequestId | null;
  params?: unknown;
}

interface LiveErrorPayload {
  code: string;
  message: string;
  name?: string;
  filePath?: string;
  stack?: string;
}

interface LiveStdioServerDependencies {
  interpret: typeof interpret;
  executeFile: typeof execute;
  analyze: typeof analyzeModule;
  makeFileSystem: () => IFileSystemService;
  makePathService: () => IPathService;
}

interface LiveStdioServerIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

interface ActiveExecution {
  abort: () => void;
}

interface ProcessRequestParams {
  script: string;
  filePath?: string;
  mode?: MlldMode;
  payload?: unknown;
  state?: Record<string, unknown>;
  dynamicModules?: Record<string, string | Record<string, unknown>>;
  dynamicModuleSource?: string;
  dynamicModuleMode?: MlldMode;
  allowAbsolutePaths?: boolean;
}

interface ExecuteRequestParams {
  filepath: string;
  payload?: unknown;
  state?: Record<string, unknown>;
  dynamicModules?: Record<string, string | Record<string, unknown>>;
  dynamicModuleSource?: string;
  timeoutMs?: number;
  allowAbsolutePaths?: boolean;
  mode?: MlldMode;
}

interface AnalyzeRequestParams {
  filepath: string;
}

const SDK_EVENT_TYPES: SDKEvent['type'][] = [
  'effect',
  'command:start',
  'command:complete',
  'stream:chunk',
  'stream:progress',
  'execution:complete',
  'state:write',
  'debug:directive:start',
  'debug:directive:complete',
  'debug:variable:create',
  'debug:variable:access',
  'debug:guard:before',
  'debug:guard:after',
  'debug:export:registered',
  'debug:import:dynamic',
  'streaming:thinking',
  'streaming:message',
  'streaming:tool-use',
  'streaming:tool-result',
  'streaming:error',
  'streaming:metadata'
];

const defaultDependencies: LiveStdioServerDependencies = {
  interpret,
  executeFile: execute,
  analyze: analyzeModule,
  makeFileSystem: () => new NodeFileSystem(),
  makePathService: () => new PathService()
};

const defaultIO: LiveStdioServerIO = {
  input: process.stdin,
  output: process.stdout
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const text = JSON.stringify(value, (_key, candidate) => {
    if (typeof candidate === 'function') {
      return undefined;
    }

    if (typeof candidate === 'bigint') {
      return candidate.toString();
    }

    if (candidate instanceof Map) {
      return Object.fromEntries(candidate);
    }

    if (candidate instanceof Set) {
      return Array.from(candidate);
    }

    if (candidate instanceof Error) {
      const errorObject: Record<string, unknown> = {
        name: candidate.name,
        message: candidate.message
      };
      if (candidate.stack) {
        errorObject.stack = candidate.stack;
      }
      const withMeta = candidate as Error & { code?: unknown; filePath?: unknown; cause?: unknown };
      if (typeof withMeta.code === 'string') {
        errorObject.code = withMeta.code;
      }
      if (typeof withMeta.filePath === 'string') {
        errorObject.filePath = withMeta.filePath;
      }
      if (withMeta.cause !== undefined) {
        errorObject.cause = withMeta.cause;
      }
      return errorObject;
    }

    if (candidate && typeof candidate === 'object') {
      if (seen.has(candidate as object)) {
        return '[Circular]';
      }
      seen.add(candidate as object);
    }

    return candidate;
  });

  return text ?? 'null';
}

export class LiveStdioServer {
  private readonly io: LiveStdioServerIO;
  private readonly deps: LiveStdioServerDependencies;
  private readonly active = new Map<RequestId, ActiveExecution>();
  private readonly done: Promise<void>;
  private doneResolve!: () => void;
  private rl: readline.Interface | null = null;
  private stopping = false;
  private writeChain: Promise<void> = Promise.resolve();
  private signalHandlers: Array<[NodeJS.Signals, () => void]> = [];
  private previousNoStreaming: string | undefined;
  private appliedNoStreaming = false;

  constructor(io: LiveStdioServerIO = defaultIO, deps: LiveStdioServerDependencies = defaultDependencies) {
    this.io = io;
    this.deps = deps;
    this.done = new Promise((resolve) => {
      this.doneResolve = resolve;
    });
  }

  async start(): Promise<void> {
    this.enableProtocolSafeOutputMode();
    this.installSignalHandlers();

    this.rl = readline.createInterface({
      input: this.io.input,
      crlfDelay: Infinity,
      terminal: false
    });

    this.rl.on('line', (line) => {
      void this.onLine(line);
    });

    this.rl.on('close', () => {
      void this.shutdown();
    });

    this.io.input.on('error', () => {
      void this.shutdown();
    });

    await this.done;
  }

  async shutdown(): Promise<void> {
    if (this.stopping) {
      return this.done;
    }
    this.stopping = true;

    for (const execution of this.active.values()) {
      try {
        execution.abort();
      } catch {
        // Ignore abort errors during shutdown.
      }
    }
    this.active.clear();

    this.uninstallSignalHandlers();

    if (this.rl) {
      const localRl = this.rl;
      this.rl = null;
      localRl.removeAllListeners();
      localRl.close();
    }

    const inputWithPause = this.io.input as NodeJS.ReadableStream & { pause?: () => void };
    if (typeof inputWithPause.pause === 'function') {
      inputWithPause.pause();
    }

    await this.writeChain.catch(() => undefined);
    this.restoreProtocolSafeOutputMode();
    this.doneResolve();
    return this.done;
  }

  private enableProtocolSafeOutputMode(): void {
    this.previousNoStreaming = process.env.MLLD_NO_STREAMING;
    if (process.env.MLLD_NO_STREAMING !== 'true') {
      process.env.MLLD_NO_STREAMING = 'true';
      this.appliedNoStreaming = true;
    }
  }

  private restoreProtocolSafeOutputMode(): void {
    if (!this.appliedNoStreaming) {
      return;
    }

    if (this.previousNoStreaming === undefined) {
      delete process.env.MLLD_NO_STREAMING;
    } else {
      process.env.MLLD_NO_STREAMING = this.previousNoStreaming;
    }

    this.appliedNoStreaming = false;
  }

  private installSignalHandlers(): void {
    const onSignal = () => {
      void this.shutdown();
    };

    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);

    this.signalHandlers = [
      ['SIGTERM', onSignal],
      ['SIGINT', onSignal]
    ];
  }

  private uninstallSignalHandlers(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }
    this.signalHandlers = [];
  }

  private async onLine(rawLine: string): Promise<void> {
    if (this.stopping) {
      return;
    }

    const line = rawLine.trim();
    if (!line) {
      return;
    }

    let request: LiveRequest;
    try {
      request = JSON.parse(line) as LiveRequest;
    } catch (error) {
      await this.writeResult(null, {
        error: this.buildError(
          'INVALID_JSON',
          error instanceof Error ? error.message : 'Invalid JSON request'
        )
      });
      return;
    }

    await this.dispatch(request);
  }

  private async dispatch(request: LiveRequest): Promise<void> {
    const method = typeof request.method === 'string' ? request.method : '';
    const requestId = this.normalizeId(request.id);

    if (!method) {
      await this.writeResult(requestId, {
        error: this.buildError('INVALID_REQUEST', 'Request method is required')
      });
      return;
    }

    if (method === 'cancel') {
      await this.handleCancel(requestId);
      return;
    }

    if (requestId === null) {
      await this.writeResult(null, {
        error: this.buildError('INVALID_REQUEST', 'Request id is required')
      });
      return;
    }

    if (this.active.has(requestId)) {
      await this.writeResult(requestId, {
        error: this.buildError('REQUEST_IN_PROGRESS', `Request ${String(requestId)} is already active`)
      });
      return;
    }

    void this.runRequest(requestId, method, request.params);
  }

  private async handleCancel(requestId: RequestId | null): Promise<void> {
    if (requestId === null) {
      await this.writeResult(null, {
        error: this.buildError('INVALID_REQUEST', 'Cancel id is required')
      });
      return;
    }

    const active = this.active.get(requestId);
    if (!active) {
      await this.writeResult(requestId, {
        error: this.buildError('REQUEST_NOT_FOUND', `No active request for id ${String(requestId)}`)
      });
      return;
    }

    active.abort();
  }

  private async runRequest(requestId: RequestId, method: string, params: unknown): Promise<void> {
    try {
      switch (method) {
        case 'process':
          await this.runProcess(requestId, params);
          break;
        case 'execute':
          await this.runExecute(requestId, params);
          break;
        case 'analyze':
          await this.runAnalyze(requestId, params);
          break;
        default:
          await this.writeResult(requestId, {
            error: this.buildError('METHOD_NOT_FOUND', `Method '${method}' is not supported`)
          });
          break;
      }
    } catch (error) {
      await this.writeResult(requestId, {
        error: this.normalizeError(error)
      });
    }
  }

  private async runProcess(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseProcessParams(params);
    const fileSystem = this.deps.makeFileSystem();
    const pathService = this.deps.makePathService();
    const dynamicModules = this.mergeDynamicModules(parsed.dynamicModules, parsed.payload, parsed.state);

    const pathContext = parsed.filePath
      ? await PathContextBuilder.fromFile(parsed.filePath, fileSystem, {
          invocationDirectory: process.cwd()
        })
      : undefined;

    const streamHandle = (await this.deps.interpret(parsed.script, {
      mode: 'stream',
      filePath: parsed.filePath,
      pathContext,
      fileSystem,
      pathService,
      mlldMode: resolveMlldMode(
        parsed.mode,
        parsed.filePath,
        parsed.filePath ? 'markdown' : 'strict'
      ),
      dynamicModules: Object.keys(dynamicModules).length > 0 ? dynamicModules : undefined,
      dynamicModuleSource: parsed.dynamicModuleSource,
      dynamicModuleMode: parsed.dynamicModuleMode,
      allowAbsolutePaths: parsed.allowAbsolutePaths
    })) as StreamExecution;

    await this.streamExecution(requestId, streamHandle);
  }

  private async runExecute(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseExecuteParams(params);

    const options: ExecuteOptions = {
      state: parsed.state,
      dynamicModules: parsed.dynamicModules,
      dynamicModuleSource: parsed.dynamicModuleSource,
      timeoutMs: parsed.timeoutMs,
      allowAbsolutePaths: parsed.allowAbsolutePaths,
      mode: parsed.mode,
      fileSystem: this.deps.makeFileSystem(),
      pathService: this.deps.makePathService(),
      stream: true
    };

    const streamHandle = (await this.deps.executeFile(parsed.filepath, parsed.payload, options)) as StreamExecution;
    await this.streamExecution(requestId, streamHandle);
  }

  private async runAnalyze(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseAnalyzeParams(params);
    const result = await this.deps.analyze(parsed.filepath);
    await this.writeResult(requestId, this.toResultPayload(result));
  }

  private async streamExecution(requestId: RequestId, execution: StreamExecution): Promise<void> {
    const listeners: Array<[SDKEvent['type'], (event: SDKEvent) => void]> = [];

    const attach = (type: SDKEvent['type']) => {
      const handler = (event: SDKEvent) => {
        void this.writeEvent(requestId, this.normalizeEvent(event));
      };
      listeners.push([type, handler]);
      execution.on(type, handler);
    };

    for (const type of SDK_EVENT_TYPES) {
      attach(type);
    }

    this.active.set(requestId, {
      abort: () => execution.abort?.()
    });

    try {
      const result = await execution.result();
      await this.writeResult(requestId, this.toResultPayload(this.normalizeStructuredResult(result)));
    } catch (error) {
      await this.writeResult(requestId, {
        error: this.normalizeError(error)
      });
    } finally {
      for (const [type, handler] of listeners) {
        execution.off(type, handler);
      }
      this.active.delete(requestId);
    }
  }

  private normalizeId(value: unknown): RequestId | null {
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    return null;
  }

  private parseProcessParams(params: unknown): ProcessRequestParams {
    if (typeof params === 'string') {
      return { script: params };
    }

    if (!isRecord(params)) {
      throw new Error('process params must be a script string or object');
    }

    if (typeof params.script !== 'string') {
      throw new Error('process params.script must be a string');
    }

    return {
      script: params.script,
      filePath: typeof params.filePath === 'string' ? params.filePath : undefined,
      mode: this.parseMode(params.mode),
      payload: params.payload,
      state: isRecord(params.state) ? (params.state as Record<string, unknown>) : undefined,
      dynamicModules: this.parseDynamicModules(params.dynamicModules),
      dynamicModuleSource:
        typeof params.dynamicModuleSource === 'string' ? params.dynamicModuleSource : undefined,
      dynamicModuleMode: this.parseMode(params.dynamicModuleMode),
      allowAbsolutePaths:
        typeof params.allowAbsolutePaths === 'boolean' ? params.allowAbsolutePaths : undefined
    };
  }

  private parseExecuteParams(params: unknown): ExecuteRequestParams {
    if (!isRecord(params)) {
      throw new Error('execute params must be an object');
    }

    if (typeof params.filepath !== 'string') {
      throw new Error('execute params.filepath must be a string');
    }

    return {
      filepath: params.filepath,
      payload: params.payload,
      state: isRecord(params.state) ? (params.state as Record<string, unknown>) : undefined,
      dynamicModules: this.parseDynamicModules(params.dynamicModules),
      dynamicModuleSource:
        typeof params.dynamicModuleSource === 'string' ? params.dynamicModuleSource : undefined,
      timeoutMs: typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined,
      allowAbsolutePaths:
        typeof params.allowAbsolutePaths === 'boolean' ? params.allowAbsolutePaths : undefined,
      mode: this.parseMode(params.mode)
    };
  }

  private parseAnalyzeParams(params: unknown): AnalyzeRequestParams {
    if (typeof params === 'string') {
      return { filepath: params };
    }

    if (!isRecord(params)) {
      throw new Error('analyze params must be a filepath string or object');
    }

    if (typeof params.filepath !== 'string') {
      throw new Error('analyze params.filepath must be a string');
    }

    return { filepath: params.filepath };
  }

  private parseMode(value: unknown): MlldMode | undefined {
    if (value === 'strict' || value === 'markdown') {
      return value;
    }
    return undefined;
  }

  private parseDynamicModules(
    value: unknown
  ): Record<string, string | Record<string, unknown>> | undefined {
    if (!isRecord(value)) {
      return undefined;
    }

    const parsed: Record<string, string | Record<string, unknown>> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string') {
        parsed[key] = entry;
      } else if (isRecord(entry)) {
        parsed[key] = entry;
      }
    }

    return Object.keys(parsed).length > 0 ? parsed : undefined;
  }

  private mergeDynamicModules(
    dynamicModules: Record<string, string | Record<string, unknown>> | undefined,
    payload: unknown,
    state: Record<string, unknown> | undefined
  ): Record<string, string | Record<string, unknown>> {
    const merged: Record<string, string | Record<string, unknown>> = {
      ...(dynamicModules ?? {})
    };

    if (payload !== undefined) {
      merged['@payload'] = payload as any;
    }

    if (state !== undefined) {
      merged['@state'] = state;
    }

    return merged;
  }

  private normalizeStructuredResult(result: StructuredResult): unknown {
    const { environment, ...rest } = result as StructuredResult & { environment?: unknown };
    void environment;
    return this.toSerializable(rest);
  }

  private normalizeEvent(event: SDKEvent): unknown {
    if (event.type === 'execution:complete' && event.result) {
      const completeEvent = event as SDKEvent & { result?: StructuredResult };
      return this.toSerializable({
        ...completeEvent,
        result: completeEvent.result ? this.normalizeStructuredResult(completeEvent.result) : undefined
      });
    }

    return this.toSerializable(event);
  }

  private normalizeError(error: unknown): LiveErrorPayload {
    if (error instanceof Error) {
      const withMeta = error as Error & { code?: unknown; filePath?: unknown };
      return {
        code: this.resolveErrorCode(error, withMeta.code),
        message: error.message || 'Unknown error',
        name: error.name,
        ...(typeof withMeta.filePath === 'string' ? { filePath: withMeta.filePath } : {}),
        ...(typeof error.stack === 'string' ? { stack: error.stack } : {})
      };
    }

    return {
      code: 'RUNTIME_ERROR',
      message: typeof error === 'string' ? error : 'Unknown error'
    };
  }

  private resolveErrorCode(error: Error, fallback: unknown): string {
    if (typeof fallback === 'string' && fallback.length > 0) {
      return fallback;
    }

    const message = error.message.toLowerCase();
    if (message.includes('abort')) {
      return 'ABORTED';
    }
    if (message.includes('timeout')) {
      return 'TIMEOUT';
    }

    return 'RUNTIME_ERROR';
  }

  private buildError(code: string, message: string): LiveErrorPayload {
    return { code, message };
  }

  private toSerializable(value: unknown): unknown {
    try {
      return JSON.parse(safeStringify(value));
    } catch {
      return {
        error: {
          code: 'SERIALIZATION_ERROR',
          message: 'Failed to serialize value'
        }
      };
    }
  }

  private toResultPayload(value: unknown): Record<string, unknown> {
    const serializable = this.toSerializable(value);
    if (isRecord(serializable)) {
      return serializable;
    }
    return { value: serializable };
  }

  private async writeEvent(requestId: RequestId, event: unknown): Promise<void> {
    await this.writeLine({
      event: {
        id: requestId,
        ...(isRecord(event) ? event : { payload: event })
      }
    });
  }

  private async writeResult(requestId: RequestId | null, payload: Record<string, unknown>): Promise<void> {
    await this.writeLine({
      result: {
        id: requestId,
        ...payload
      }
    });
  }

  private async writeLine(payload: unknown): Promise<void> {
    const line = `${safeStringify(payload)}\n`;

    this.writeChain = this.writeChain.then(async () => {
      await new Promise<void>((resolve) => {
        try {
          this.io.output.write(line, () => resolve());
        } catch {
          resolve();
        }
      });
    });

    await this.writeChain;
  }
}

export async function startLiveStdioServer(): Promise<void> {
  const server = new LiveStdioServer();
  await server.start();
}
