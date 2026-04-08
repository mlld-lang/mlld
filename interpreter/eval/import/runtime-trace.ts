import type { DirectiveNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import {
  traceImportEvent,
  traceImportFailure
} from '@interpreter/tracing/events';
import type { ImportResolution } from './ImportPathResolver';

const IMPORT_TRACE_FAILURES = new WeakSet<object>();

type ImportTraceEventName =
  | 'import.resolve'
  | 'import.cache_hit'
  | 'import.read'
  | 'import.parse'
  | 'import.evaluate'
  | 'import.exports';

type ImportTraceData = {
  ref: string;
  resolvedPath?: string;
  transport?: string;
  importType?: string;
  directive?: string;
  contentType?: string;
  resolverName?: string;
  cacheKey?: string;
  entryCount?: number;
  exportCount?: number;
};

type ImportTraceFailureData = ImportTraceData & {
  phase: string;
  error: unknown;
};

export function emitImportTrace(
  env: Environment,
  event: ImportTraceEventName,
  data: ImportTraceData
): void {
  env.emitRuntimeTraceEvent(traceImportEvent(event, sanitizeImportTraceData(data) as never));
}

export function emitImportFailure(
  env: Environment,
  data: ImportTraceFailureData
): void {
  if (isImportFailureAlreadyTraced(data.error)) {
    return;
  }

  markImportFailureTraced(data.error);
  env.emitRuntimeTraceEvent(traceImportFailure({
    ...sanitizeImportTraceData(data),
    phase: data.phase,
    error: normalizeImportTraceError(data.error)
  }));
}

export function buildImportTraceData(
  directive: DirectiveNode,
  data: Omit<ImportTraceData, 'directive'>
): ImportTraceData {
  return sanitizeImportTraceData({
    ...data,
    directive: directive.subtype
  });
}

export function buildImportTraceDataFromResolution(
  directive: DirectiveNode,
  resolution: ImportResolution,
  overrides: Partial<ImportTraceData> = {}
): ImportTraceData {
  return buildImportTraceData(directive, {
    ref: readImportDirectiveRef(directive) ?? resolution.resolvedPath,
    resolvedPath: resolution.resolvedPath,
    transport: resolution.type,
    importType: resolution.importType,
    resolverName: resolution.resolverName,
    ...overrides
  });
}

function sanitizeImportTraceData(data: Partial<ImportTraceData>): ImportTraceData {
  const result: ImportTraceData = {
    ref: data.ref ?? 'unknown'
  };

  if (typeof data.resolvedPath === 'string' && data.resolvedPath.length > 0) {
    result.resolvedPath = data.resolvedPath;
  }
  if (typeof data.transport === 'string' && data.transport.length > 0) {
    result.transport = data.transport;
  }
  if (typeof data.importType === 'string' && data.importType.length > 0) {
    result.importType = data.importType;
  }
  if (typeof data.directive === 'string' && data.directive.length > 0) {
    result.directive = data.directive;
  }
  if (typeof data.contentType === 'string' && data.contentType.length > 0) {
    result.contentType = data.contentType;
  }
  if (typeof data.resolverName === 'string' && data.resolverName.length > 0) {
    result.resolverName = data.resolverName;
  }
  if (typeof data.cacheKey === 'string' && data.cacheKey.length > 0) {
    result.cacheKey = data.cacheKey;
  }
  if (typeof data.entryCount === 'number') {
    result.entryCount = data.entryCount;
  }
  if (typeof data.exportCount === 'number') {
    result.exportCount = data.exportCount;
  }

  return result;
}

function readImportDirectiveRef(directive: DirectiveNode): string | undefined {
  const rawPath = (directive as { raw?: { path?: unknown } }).raw?.path;
  if (typeof rawPath === 'string' && rawPath.trim().length > 0) {
    return rawPath.trim().replace(/^['"]|['"]$/g, '');
  }

  const firstPathNode = directive.values?.path?.[0] as
    | { type?: unknown; content?: unknown; identifier?: unknown }
    | undefined;
  if (!firstPathNode || typeof firstPathNode !== 'object') {
    return undefined;
  }

  if (firstPathNode.type === 'Text' && typeof firstPathNode.content === 'string') {
    return firstPathNode.content;
  }
  if (firstPathNode.type === 'VariableReference' && typeof firstPathNode.identifier === 'string') {
    return `@${firstPathNode.identifier}`;
  }

  return undefined;
}

function normalizeImportTraceError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isImportFailureAlreadyTraced(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && IMPORT_TRACE_FAILURES.has(error as object));
}

function markImportFailureTraced(error: unknown): void {
  if (error && typeof error === 'object') {
    IMPORT_TRACE_FAILURES.add(error as object);
  }
}
