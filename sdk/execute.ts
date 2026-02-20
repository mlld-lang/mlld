/// <reference types="node" />

import { performance } from 'node:perf_hooks';
import { interpret } from '@interpreter/index';
import type {
  InterpretOptions,
  StructuredResult,
  StreamExecution,
  SDKEvent,
  ExecuteMetrics,
  ExecuteErrorCode
} from './types';
import { MemoryAstCache } from './cache/memory-ast-cache';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { ExecuteError } from './types';
import { MlldParseError } from '@core/errors';
import { resolveMlldMode } from '@core/utils/mode';
import type { MlldMode } from '@core/types/mode';

export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Execution exceeded timeout of ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export interface ExecuteOptions {
  state?: Record<string, unknown>;
  dynamicModules?: Record<string, string | Record<string, unknown>>;
  dynamicModuleSource?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  stream?: boolean;
  fileSystem?: IFileSystemService;
  pathService?: IPathService;
  allowAbsolutePaths?: boolean;
  mode?: MlldMode;
  checkpoint?: boolean;
  noCheckpoint?: boolean;
  fresh?: boolean;
  resume?: string | true;
  fork?: string;
  checkpointScriptName?: string;
  checkpointCacheRootDir?: string;
}

const astCache = new MemoryAstCache();

export async function execute(
  filePath: string,
  payload: unknown,
  options: ExecuteOptions = {}
): Promise<StructuredResult | StreamExecution> {
  const overallStart = performance.now();
  const fileSystem = options.fileSystem ?? new NodeFileSystem();
  const pathService = options.pathService ?? new PathService();

  const languageMode = resolveMlldMode(options.mode, filePath, 'strict');
  const cacheEntry = await getCachedAst(filePath, fileSystem, languageMode);

  const dynamicModules: Record<string, string | Record<string, unknown>> = {
    ...(options.dynamicModules ?? {}),
    ...(payload !== undefined ? { '@payload': payload as any } : {}),
    ...(options.state ? { '@state': options.state } : {})
  };

  const interpretOptions: InterpretOptions = {
    mode: options.stream ? 'stream' : 'structured',
    filePath,
    mlldMode: languageMode,
    fileSystem,
    pathService,
    allowAbsolutePaths: options.allowAbsolutePaths,
    dynamicModules,
    dynamicModuleSource: options.dynamicModuleSource,
    ast: cacheEntry.ast,
    checkpoint: options.checkpoint,
    noCheckpoint: options.noCheckpoint,
    fresh: options.fresh,
    resume: options.resume,
    fork: options.fork,
    checkpointScriptName: options.checkpointScriptName,
    checkpointCacheRootDir: options.checkpointCacheRootDir
  } as InterpretOptions;

  const metricsContext = {
    startTime: overallStart,
    evaluateStart: performance.now(),
    parseMs: cacheEntry.parseDurationMs ?? 0,
    cacheHit: cacheEntry.cacheHit
  };

  if (options.stream) {
    const handle = (await runInterpret(cacheEntry.source, interpretOptions, filePath)) as StreamExecution;
    attachSignalAndTimeout(handle, options);
    return attachStreamMetrics(handle, metricsContext, filePath);
  }

  const run = async (): Promise<StructuredResult> => {
    const result = (await runInterpret(cacheEntry.source, interpretOptions, filePath)) as StructuredResult;
    return withMetrics(result, metricsContext);
  };

  if (!options.timeoutMs && !options.signal) {
    return await run();
  }

  return await runWithGuards(run, options);
}

function attachSignalAndTimeout(handle: StreamExecution, options: ExecuteOptions): void {
  let timer: NodeJS.Timeout | undefined;

  if (options.timeoutMs !== undefined) {
    timer = setTimeout(() => {
      handle.abort?.();
    }, options.timeoutMs);
  }

  if (options.signal) {
    if (options.signal.aborted) {
      handle.abort?.();
    } else {
      const onAbort = () => handle.abort?.();
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  void handle.done().finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

async function runWithGuards<T>(
  fn: () => Promise<T>,
  options: Pick<ExecuteOptions, 'timeoutMs' | 'signal'>
): Promise<T> {
  if (!options.timeoutMs && !options.signal) {
    return await fn();
  }

  return await new Promise<T>((resolve, reject) => {
    let completed = false;
    let timer: NodeJS.Timeout | undefined;

    const rejectOnce = (error: Error) => {
      if (completed) return;
      completed = true;
      if (timer) clearTimeout(timer);
      reject(error);
    };

    const resolveOnce = (value: T) => {
      if (completed) return;
      completed = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    if (options.timeoutMs !== undefined) {
      timer = setTimeout(() => rejectOnce(new TimeoutError(options.timeoutMs!)), options.timeoutMs);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        rejectOnce(new Error('Execution aborted'));
        return;
      }
      const onAbort = () => rejectOnce(new Error('Execution aborted'));
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    fn()
      .then(resolveOnce)
      .catch(rejectOnce);
  });
}

type MetricsContext = {
  startTime: number;
  evaluateStart: number;
  parseMs: number;
  cacheHit: boolean;
};

function withMetrics(result: StructuredResult, context: MetricsContext): StructuredResult {
  if (result.metrics) return result;
  const metrics = buildMetrics(result, context);
  return { ...result, metrics };
}

function attachStreamMetrics(handle: StreamExecution, context: MetricsContext, filePath: string): StreamExecution {
  let cached: StructuredResult | undefined;
  const build = (result: StructuredResult): StructuredResult => {
    if (!cached) {
      cached = withMetrics(result, { ...context, evaluateStart: context.evaluateStart || performance.now() });
    }
    return cached;
  };

  const patchEvent = (event: SDKEvent): void => {
    if (event.type === 'execution:complete' && event.result) {
      event.result = build(event.result);
    }
  };

  handle.on('execution:complete', patchEvent);
  void handle.done().finally(() => handle.off('execution:complete', patchEvent));

  const originalResult = handle.result.bind(handle);
  handle.result = async () => {
    try {
      return build(await originalResult());
    } catch (error) {
      throw wrapExecuteError(error, filePath);
    }
  };
  return handle;
}

function buildMetrics(result: StructuredResult, context: MetricsContext, now = performance.now()): ExecuteMetrics {
  const totalMs = Math.max(0, now - context.startTime);
  const evaluateMs = Math.max(0, now - context.evaluateStart);
  return {
    totalMs,
    parseMs: context.parseMs,
    evaluateMs,
    cacheHit: context.cacheHit,
    effectCount: result.effects?.length ?? 0,
    stateWriteCount: result.stateWrites?.length ?? 0
  };
}

export { astCache as MemoryAstCache };

async function getCachedAst(filePath: string, fileSystem: IFileSystemService, mode: MlldMode) {
  try {
    return await astCache.get(filePath, fileSystem, mode);
  } catch (error) {
    throw wrapExecuteError(error, filePath);
  }
}

async function runInterpret(source: string, options: InterpretOptions, filePath: string) {
  try {
    return await interpret(source, options);
  } catch (error) {
    throw wrapExecuteError(error, filePath);
  }
}

function wrapExecuteError(error: unknown, filePath?: string): ExecuteError {
  if (error instanceof ExecuteError) return error;

  if (error instanceof TimeoutError) {
    return new ExecuteError(error.message, 'TIMEOUT', filePath, { cause: error });
  }

  if (error instanceof MlldParseError) {
    return new ExecuteError(error.message, 'PARSE_ERROR', filePath, { cause: error });
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new ExecuteError(error.message, 'ABORTED', filePath, { cause: error });
    }

    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return new ExecuteError(error.message, 'FILE_NOT_FOUND', filePath, { cause: error });
    }

    return new ExecuteError(error.message, 'RUNTIME_ERROR', filePath, { cause: error });
  }

  return new ExecuteError('Execution failed', 'RUNTIME_ERROR', filePath, { cause: error });
}
