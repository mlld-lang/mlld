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
import { sanitizeSerializableValue, serializeError } from '@core/errors/errorSerialization';
import { collectFilesystemStatus } from './status';
import {
  createExecutionFileWriter,
  liveSignContent,
  liveSignFile,
  liveVerifyFile
} from './live-stdio-security';

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
  fsStatus: typeof collectFilesystemStatus;
  signFile: typeof liveSignFile;
  verifyFile: typeof liveVerifyFile;
  signContent: typeof liveSignContent;
  createExecutionFileWriter: typeof createExecutionFileWriter;
  makeFileSystem: () => IFileSystemService;
  makePathService: () => IPathService;
}

interface LiveStdioServerIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

interface ActiveExecution {
  abort: () => void;
  updateState?: (path: string, value: unknown, labels?: string[]) => Promise<void>;
  writeFile?: (path: string, content: string) => Promise<unknown>;
}

interface ProcessRequestParams {
  script: string;
  filePath?: string;
  mode?: MlldMode;
  payload?: unknown;
  payloadLabels?: Record<string, string[]>;
  state?: Record<string, unknown>;
  dynamicModules?: Record<string, string | Record<string, unknown>>;
  dynamicModuleSource?: string;
  dynamicModuleMode?: MlldMode;
  allowAbsolutePaths?: boolean;
  mcpServers?: Record<string, string>;
}

interface ExecuteRequestParams {
  filepath: string;
  payload?: unknown;
  payloadLabels?: Record<string, string[]>;
  state?: Record<string, unknown>;
  dynamicModules?: Record<string, string | Record<string, unknown>>;
  dynamicModuleSource?: string;
  timeoutMs?: number;
  allowAbsolutePaths?: boolean;
  mode?: MlldMode;
  mcpServers?: Record<string, string>;
}

interface AnalyzeRequestParams {
  filepath: string;
}

interface FsStatusRequestParams {
  basePath?: string;
  glob?: string;
}

interface SigSignRequestParams {
  path: string;
  basePath?: string;
  identity?: string;
  metadata?: Record<string, unknown>;
}

interface SigVerifyRequestParams {
  path: string;
  basePath?: string;
}

interface SigSignContentRequestParams {
  content: string;
  identity: string;
  id?: string;
  basePath?: string;
  metadata?: Record<string, string>;
}

interface FileWriteRequestParams {
  requestId: RequestId;
  path: string;
  content: string;
}

interface StateUpdateRequestParams {
  requestId: RequestId;
  path: string;
  value: unknown;
  labels?: string[];
}

const SDK_EVENT_TYPES: SDKEvent['type'][] = [
  'effect',
  'command:start',
  'command:complete',
  'stream:chunk',
  'stream:progress',
  'execution:complete',
  'state:write',
  'guard_denial',
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
  fsStatus: collectFilesystemStatus,
  signFile: liveSignFile,
  verifyFile: liveVerifyFile,
  signContent: liveSignContent,
  createExecutionFileWriter,
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
  const text = JSON.stringify(sanitizeSerializableValue(value, {
    maxDepth: 8,
    maxObjectKeys: 100,
    maxArrayLength: 200,
    errorOptions: {
      includeStack: true,
      includeDetails: false,
      maxCauseDepth: 2,
      maxDepth: 6,
      maxObjectKeys: 50,
      maxArrayLength: 50,
      maxStackLength: 12000
    }
  }));

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
      await this.writeError(
        null,
        this.buildError(
          'INVALID_JSON',
          error instanceof Error ? error.message : 'Invalid JSON request'
        )
      );
      return;
    }

    await this.dispatch(request);
  }

  private async dispatch(request: LiveRequest): Promise<void> {
    const method = typeof request.method === 'string' ? request.method : '';
    const requestId = this.normalizeId(request.id);

    if (!method) {
      await this.writeError(requestId, this.buildError('INVALID_REQUEST', 'Request method is required'));
      return;
    }

    if (method === 'cancel') {
      await this.handleCancel(requestId);
      return;
    }

    if (requestId === null) {
      await this.writeError(null, this.buildError('INVALID_REQUEST', 'Request id is required'));
      return;
    }

    if (method === 'state:update') {
      await this.handleStateUpdate(requestId, request.params);
      return;
    }

    if (method === 'file:write') {
      await this.handleFileWrite(requestId, request.params);
      return;
    }

    if (this.active.has(requestId)) {
      await this.writeError(
        requestId,
        this.buildError('REQUEST_IN_PROGRESS', `Request ${String(requestId)} is already active`)
      );
      return;
    }

    void this.runRequest(requestId, method, request.params);
  }

  private async handleCancel(requestId: RequestId | null): Promise<void> {
    if (requestId === null) {
      await this.writeError(null, this.buildError('INVALID_REQUEST', 'Cancel id is required'));
      return;
    }

    const active = this.active.get(requestId);
    if (!active) {
      await this.writeError(
        requestId,
        this.buildError('REQUEST_NOT_FOUND', `No active request for id ${String(requestId)}`)
      );
      return;
    }

    active.abort();
  }

  private async handleStateUpdate(requestId: RequestId, params: unknown): Promise<void> {
    let parsed: StateUpdateRequestParams;
    try {
      parsed = this.parseStateUpdateParams(params);
    } catch (error) {
      await this.writeError(
        requestId,
        this.buildError(
          'INVALID_REQUEST',
          error instanceof Error ? error.message : 'state:update params must be an object'
        )
      );
      return;
    }

    const active = this.active.get(parsed.requestId);
    if (!active) {
      await this.writeError(
        requestId,
        this.buildError('REQUEST_NOT_FOUND', `No active request for id ${String(parsed.requestId)}`)
      );
      return;
    }

    if (!active.updateState) {
      await this.writeError(
        requestId,
        this.buildError(
          'STATE_UNAVAILABLE',
          `Request ${String(parsed.requestId)} has no dynamic @state to update`
        )
      );
      return;
    }

    try {
      await active.updateState(parsed.path, parsed.value, parsed.labels);
      await this.writeResult(requestId, {
        requestId: parsed.requestId,
        path: parsed.path
      });
    } catch (error) {
      await this.writeError(requestId, this.normalizeError(error));
    }
  }

  private async handleFileWrite(requestId: RequestId, params: unknown): Promise<void> {
    let parsed: FileWriteRequestParams;
    try {
      parsed = this.parseFileWriteParams(params);
    } catch (error) {
      await this.writeError(
        requestId,
        this.buildError(
          'INVALID_REQUEST',
          error instanceof Error ? error.message : 'file:write params must be an object'
        )
      );
      return;
    }

    const active = this.active.get(parsed.requestId);
    if (!active) {
      await this.writeError(
        requestId,
        this.buildError('REQUEST_NOT_FOUND', `No active request for id ${String(parsed.requestId)}`)
      );
      return;
    }

    if (!active.writeFile) {
      await this.writeError(
        requestId,
        this.buildError(
          'FILE_WRITE_UNAVAILABLE',
          `Request ${String(parsed.requestId)} does not support file writes`
        )
      );
      return;
    }

    try {
      const result = await active.writeFile(parsed.path, parsed.content);
      await this.writeResult(requestId, result);
    } catch (error) {
      await this.writeError(requestId, this.normalizeError(error));
    }
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
        case 'fs:status':
          await this.runFsStatus(requestId, params);
          break;
        case 'sig:sign':
          await this.runSigSign(requestId, params);
          break;
        case 'sig:verify':
          await this.runSigVerify(requestId, params);
          break;
        case 'sig:sign-content':
          await this.runSigSignContent(requestId, params);
          break;
        default:
          await this.writeError(
            requestId,
            this.buildError('METHOD_NOT_FOUND', `Method '${method}' is not supported`)
          );
          break;
      }
    } catch (error) {
      await this.writeError(requestId, this.normalizeError(error));
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
      payloadLabels: parsed.payloadLabels,
      dynamicModuleMode: parsed.dynamicModuleMode,
      allowAbsolutePaths: parsed.allowAbsolutePaths,
      mcpServers: parsed.mcpServers
    } as any)) as StreamExecution;

    await this.streamExecution(requestId, streamHandle);
  }

  private async runExecute(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseExecuteParams(params);
    const fileSystem = this.deps.makeFileSystem();
    const pathService = this.deps.makePathService();
    const writeFile = await this.deps.createExecutionFileWriter({
      requestId,
      scriptPath: parsed.filepath,
      fileSystem
    });

    const options: ExecuteOptions = {
      state: parsed.state,
      dynamicModules: parsed.dynamicModules,
      dynamicModuleSource: parsed.dynamicModuleSource,
      payloadLabels: parsed.payloadLabels,
      timeoutMs: parsed.timeoutMs,
      allowAbsolutePaths: parsed.allowAbsolutePaths,
      mode: parsed.mode,
      mcpServers: parsed.mcpServers,
      fileSystem,
      pathService,
      stream: true
    };

    const streamHandle = (await this.deps.executeFile(parsed.filepath, parsed.payload, options)) as StreamExecution;
    await this.streamExecution(requestId, streamHandle, { writeFile });
  }

  private async runAnalyze(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseAnalyzeParams(params);
    const result = await this.deps.analyze(parsed.filepath);
    await this.writeResult(requestId, result);
  }

  private async runFsStatus(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseFsStatusParams(params);
    const result = await this.deps.fsStatus({
      basePath: parsed.basePath,
      glob: parsed.glob
    });
    await this.writeResult(requestId, result);
  }

  private async runSigSign(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseSigSignParams(params);
    const result = await this.deps.signFile({
      path: parsed.path,
      basePath: parsed.basePath,
      identity: parsed.identity,
      metadata: parsed.metadata,
      fileSystem: this.deps.makeFileSystem()
    });
    await this.writeResult(requestId, result);
  }

  private async runSigVerify(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseSigVerifyParams(params);
    const result = await this.deps.verifyFile({
      path: parsed.path,
      basePath: parsed.basePath,
      fileSystem: this.deps.makeFileSystem()
    });
    await this.writeResult(requestId, result);
  }

  private async runSigSignContent(requestId: RequestId, params: unknown): Promise<void> {
    const parsed = this.parseSigSignContentParams(params);
    const result = await this.deps.signContent({
      content: parsed.content,
      identity: parsed.identity,
      id: parsed.id,
      basePath: parsed.basePath,
      metadata: parsed.metadata,
      fileSystem: this.deps.makeFileSystem()
    });
    await this.writeResult(requestId, result);
  }

  private async streamExecution(
    requestId: RequestId,
    execution: StreamExecution,
    activeExtensions: Partial<ActiveExecution> = {}
  ): Promise<void> {
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
      abort: () => execution.abort?.(),
      updateState: execution.updateState
        ? async (path: string, value: unknown, labels?: string[]) => {
            await execution.updateState?.(path, value, labels);
          }
        : undefined,
      ...activeExtensions
    });

    try {
      const result = await execution.result();
      await this.writeResult(requestId, this.normalizeStructuredResult(result));
    } catch (error) {
      await this.writeError(requestId, this.normalizeError(error));
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
      payloadLabels: this.parsePayloadLabels(params.payloadLabels),
      state: isRecord(params.state) ? (params.state as Record<string, unknown>) : undefined,
      dynamicModules: this.parseDynamicModules(params.dynamicModules),
      dynamicModuleSource:
        typeof params.dynamicModuleSource === 'string' ? params.dynamicModuleSource : undefined,
      dynamicModuleMode: this.parseMode(params.dynamicModuleMode),
      allowAbsolutePaths:
        typeof params.allowAbsolutePaths === 'boolean' ? params.allowAbsolutePaths : undefined,
      mcpServers: this.parseMcpServers(params.mcpServers)
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
      payloadLabels: this.parsePayloadLabels(params.payloadLabels),
      state: isRecord(params.state) ? (params.state as Record<string, unknown>) : undefined,
      dynamicModules: this.parseDynamicModules(params.dynamicModules),
      dynamicModuleSource:
        typeof params.dynamicModuleSource === 'string' ? params.dynamicModuleSource : undefined,
      timeoutMs: typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined,
      allowAbsolutePaths:
        typeof params.allowAbsolutePaths === 'boolean' ? params.allowAbsolutePaths : undefined,
      mode: this.parseMode(params.mode),
      mcpServers: this.parseMcpServers(params.mcpServers)
    };
  }

  private parseMcpServers(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string') {
        result[k] = v;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
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

  private parseFsStatusParams(params: unknown): FsStatusRequestParams {
    if (typeof params === 'string') {
      return { glob: params };
    }

    if (!isRecord(params)) {
      return {};
    }

    return {
      basePath: typeof params.basePath === 'string' ? params.basePath : undefined,
      glob: typeof params.glob === 'string' ? params.glob : undefined
    };
  }

  private parseSigSignParams(params: unknown): SigSignRequestParams {
    if (typeof params === 'string') {
      return { path: params };
    }

    if (!isRecord(params) || typeof params.path !== 'string') {
      throw new Error('sig:sign params.path must be a string');
    }

    return {
      path: params.path,
      basePath: typeof params.basePath === 'string' ? params.basePath : undefined,
      identity: typeof params.identity === 'string' ? params.identity : undefined,
      metadata: isRecord(params.metadata) ? (params.metadata as Record<string, unknown>) : undefined
    };
  }

  private parseSigVerifyParams(params: unknown): SigVerifyRequestParams {
    if (typeof params === 'string') {
      return { path: params };
    }

    if (!isRecord(params) || typeof params.path !== 'string') {
      throw new Error('sig:verify params.path must be a string');
    }

    return {
      path: params.path,
      basePath: typeof params.basePath === 'string' ? params.basePath : undefined
    };
  }

  private parseSigSignContentParams(params: unknown): SigSignContentRequestParams {
    if (!isRecord(params) || typeof params.content !== 'string') {
      throw new Error('sig:sign-content params.content must be a string');
    }

    if (typeof params.identity !== 'string' || params.identity.trim().length === 0) {
      throw new Error('sig:sign-content params.identity must be a non-empty string');
    }

    return {
      content: params.content,
      identity: params.identity.trim(),
      id: typeof params.id === 'string' ? params.id : undefined,
      basePath: typeof params.basePath === 'string' ? params.basePath : undefined,
      metadata: isRecord(params.metadata)
        ? Object.fromEntries(
            Object.entries(params.metadata)
              .filter(([, value]) => typeof value === 'string')
              .map(([key, value]) => [key, value as string])
          )
        : undefined
    };
  }

  private parseFileWriteParams(params: unknown): FileWriteRequestParams {
    if (!isRecord(params)) {
      throw new Error('file:write params must be an object');
    }

    const requestId = this.normalizeId(params.requestId);
    if (requestId === null) {
      throw new Error('file:write params.requestId must be a string or number');
    }

    if (typeof params.path !== 'string' || params.path.trim().length === 0) {
      throw new Error('file:write params.path must be a non-empty string');
    }

    if (typeof params.content !== 'string') {
      throw new Error('file:write params.content must be a string');
    }

    return {
      requestId,
      path: params.path.trim(),
      content: params.content
    };
  }

  private parseStateUpdateParams(params: unknown): StateUpdateRequestParams {
    if (!isRecord(params)) {
      throw new Error('state:update params must be an object');
    }

    const requestId = this.normalizeId(params.requestId);
    if (requestId === null) {
      throw new Error('state:update params.requestId must be a string or number');
    }

    if (typeof params.path !== 'string' || params.path.trim().length === 0) {
      throw new Error('state:update params.path must be a non-empty string');
    }

    const labels = Array.isArray(params.labels)
      ? params.labels.filter((l: unknown) => typeof l === 'string')
      : undefined;

    return {
      requestId,
      path: params.path.trim(),
      value: params.value,
      labels: labels && labels.length > 0 ? labels : undefined
    };
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

  private parsePayloadLabels(value: unknown): Record<string, string[]> | undefined {
    if (!isRecord(value)) {
      return undefined;
    }

    const parsed: Record<string, string[]> = {};
    for (const [key, rawLabels] of Object.entries(value)) {
      if (!Array.isArray(rawLabels)) {
        continue;
      }

      const seen = new Set<string>();
      const labels: string[] = [];
      for (const label of rawLabels) {
        if (typeof label !== 'string') {
          continue;
        }
        const trimmed = label.trim();
        if (!trimmed || seen.has(trimmed)) {
          continue;
        }
        seen.add(trimmed);
        labels.push(trimmed);
      }

      if (labels.length > 0) {
        parsed[key] = labels;
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
      const summary = serializeError(error, {
        includeStack: true,
        includeDetails: false,
        maxCauseDepth: 0
      });
      const withMeta = summary as Record<string, unknown>;
      return {
        code: this.resolveErrorCode(error, withMeta.code),
        message: typeof withMeta.message === 'string' ? withMeta.message : 'Unknown error',
        name: typeof withMeta.name === 'string' ? withMeta.name : error.name,
        ...(typeof withMeta.filePath === 'string' ? { filePath: withMeta.filePath } : {}),
        ...(typeof withMeta.stack === 'string' ? { stack: withMeta.stack } : {})
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

  private async writeEvent(requestId: RequestId, event: unknown): Promise<void> {
    await this.writeLine({
      event: {
        requestId,
        ...(isRecord(event) ? event : { payload: event })
      }
    });
  }

  private async writeResult(requestId: RequestId | null, payload: unknown): Promise<void> {
    await this.writeLine({
      id: requestId,
      result: this.toSerializable(payload)
    });
  }

  private async writeError(requestId: RequestId | null, error: LiveErrorPayload): Promise<void> {
    await this.writeLine({
      id: requestId,
      error: this.toSerializable(error)
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
