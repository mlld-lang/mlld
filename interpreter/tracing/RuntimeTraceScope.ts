import type { RuntimeTraceScope } from '@core/types/trace';

export interface RuntimeTraceScopeSnapshot {
  operationType?: string;
  operationName?: string;
  operationNamed?: string;
  guardTry?: number;
  guardAttempt?: number;
  pipelineStage?: number;
  boxName?: string;
  bridgeBox?: string;
  currentFile?: string;
  frameId?: string;
  parentFrameId?: string;
}

export function buildRuntimeTraceScope(
  snapshot: RuntimeTraceScopeSnapshot,
  overrides?: Partial<RuntimeTraceScope>
): RuntimeTraceScope {
  const scope: RuntimeTraceScope = {};

  if (snapshot.operationType === 'exe' && snapshot.operationName) {
    scope.exe = ensureAtPrefix(snapshot.operationName);
  } else if (snapshot.operationName) {
    scope.operation = ensureAtPrefix(snapshot.operationName);
  } else if (snapshot.operationNamed) {
    scope.operation = snapshot.operationNamed;
  } else if (snapshot.operationType) {
    scope.operation = snapshot.operationType;
  }

  const guardTry =
    typeof snapshot.guardTry === 'number'
      ? snapshot.guardTry
      : typeof snapshot.guardAttempt === 'number'
        ? snapshot.guardAttempt
        : undefined;
  if (guardTry !== undefined) {
    scope.guard_try = guardTry;
  }

  if (typeof snapshot.pipelineStage === 'number') {
    scope.pipeline_stage = snapshot.pipelineStage;
  }

  const boxName =
    typeof snapshot.boxName === 'string' && snapshot.boxName.trim().length > 0
      ? snapshot.boxName.trim()
      : snapshot.bridgeBox;
  if (boxName) {
    scope.box = boxName;
  }

  if (typeof snapshot.currentFile === 'string' && snapshot.currentFile.trim().length > 0) {
    scope.file = snapshot.currentFile;
  }

  if (typeof snapshot.frameId === 'string' && snapshot.frameId.trim().length > 0) {
    scope.frameId = snapshot.frameId.trim();
  }

  if (typeof snapshot.parentFrameId === 'string' && snapshot.parentFrameId.trim().length > 0) {
    scope.parentFrameId = snapshot.parentFrameId.trim();
  }

  return {
    ...scope,
    ...(overrides ?? {})
  };
}

export function buildRuntimeTraceScopeSignature(scope: RuntimeTraceScope): string {
  return JSON.stringify(scope);
}

function ensureAtPrefix(value: string): string {
  return value.startsWith('@') ? value : `@${value}`;
}
