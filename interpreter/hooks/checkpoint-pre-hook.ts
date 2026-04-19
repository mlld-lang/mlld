import { CheckpointManager } from '@interpreter/checkpoint/CheckpointManager';
import '@interpreter/checkpoint/normalizers';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { logger } from '@core/utils/logger';
import { resolveCheckpointPolicy, shouldServeCheckpointHit } from '@interpreter/checkpoint/policy';
import type { PreHook } from './HookManager';

const CHECKPOINT_START_TIME_MS_KEY = 'checkpointStartTimeMs';

function hasLlmLabel(labels: readonly string[] | undefined): boolean {
  if (!labels || labels.length === 0) {
    return false;
  }
  return labels.includes('llm');
}

function isRuntimeExecutableOperation(operation: OperationContext): boolean {
  const metadata =
    operation && operation.metadata && typeof operation.metadata === 'object'
      ? (operation.metadata as Record<string, unknown>)
      : null;
  return metadata?.sourceRetryable === true;
}

// mlld-internal control-flow pseudo-languages on /exe definitions. These are
// pure mlld code (exe-block, for-expression, loop-expression, etc.), not
// external invocations worth caching — they commonly read mutable runtime
// state (shelves, other exes) so caching by args alone poisons subsequent
// calls. The `llm` label on such an exe usually propagates from an enclosing
// llm tool-call and doesn't indicate the exe itself is an LLM invocation.
function isMlldInternalLanguage(language: unknown): boolean {
  return typeof language === 'string' && language.startsWith('mlld-');
}

function isCheckpointEligibleOperation(operation?: OperationContext): boolean {
  if (!operation) {
    return false;
  }

  if (operation.type === 'exe' || operation.type === 'run') {
    if (!hasLlmLabel(operation.labels) || !isRuntimeExecutableOperation(operation)) {
      return false;
    }
    const metadata = operation.metadata as Record<string, unknown> | undefined;
    if (isMlldInternalLanguage(metadata?.executableLanguage)) {
      return false;
    }
    return true;
  }

  return operation.subtype === 'effect' && hasLlmLabel(operation.labels);
}

function normalizeCheckpointInput(input: unknown): unknown {
  const normalized = isVariable(input) ? input.value : input;
  if (isStructuredValue(normalized)) {
    return asData(normalized);
  }
  // Other non-plain class instances (slot refs, handles) are handled by
  // registered CheckpointNormalizerRules; see interpreter/checkpoint/normalizers.ts.
  return normalized;
}

function resolveOperationName(operation: OperationContext): string {
  if (typeof operation.name === 'string' && operation.name.length > 0) {
    return operation.name;
  }
  return operation.type;
}

function readNumericField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function resolveLocationPosition(
  location: unknown
): { line?: number; column?: number; offset?: number } | null {
  if (!location || typeof location !== 'object') {
    return null;
  }
  const locationRecord = location as Record<string, unknown>;
  const start =
    locationRecord.start && typeof locationRecord.start === 'object'
      ? (locationRecord.start as Record<string, unknown>)
      : locationRecord;
  const line = readNumericField(start.line);
  const column = readNumericField(start.column);
  const offset = readNumericField(start.offset);
  if (line === undefined && column === undefined && offset === undefined) {
    return null;
  }
  return { line, column, offset };
}

function resolveInvocationSite(operation: OperationContext, env: { getCurrentFilePath?: () => string | undefined }): string | undefined {
  const filePath =
    typeof env.getCurrentFilePath === 'function'
      ? env.getCurrentFilePath()
      : undefined;
  const position = resolveLocationPosition(operation.location);
  if (!position) {
    return filePath && filePath.length > 0 ? `${filePath}#unknown` : undefined;
  }

  const positionLabel =
    position.line !== undefined && position.column !== undefined
      ? `${position.line}:${position.column}`
      : position.offset !== undefined
        ? `offset:${position.offset}`
        : 'unknown';
  if (filePath && filePath.length > 0) {
    return `${filePath}#${positionLabel}`;
  }
  return positionLabel;
}

function buildCheckpointMetadata(
  cacheKey: string,
  invocationMetadata: {
    invocationSite?: string;
    invocationIndex?: number;
    invocationOrdinal: number;
    executionOrder: number;
  },
  options: {
    hit: boolean;
    cachedResult?: unknown;
    workspaceSnapshot?: unknown;
    startTimeMs?: number;
  }
): Record<string, unknown> {
  const { hit, cachedResult, workspaceSnapshot, startTimeMs } = options;
  return {
    checkpointHit: hit,
    checkpointKey: cacheKey,
    ...(cachedResult !== undefined ? { cachedResult } : {}),
    ...(workspaceSnapshot !== undefined ? { checkpointWorkspaceSnapshot: workspaceSnapshot } : {}),
    ...(invocationMetadata.invocationSite ? { checkpointInvocationSite: invocationMetadata.invocationSite } : {}),
    ...(invocationMetadata.invocationIndex !== undefined
      ? { checkpointInvocationIndex: invocationMetadata.invocationIndex }
      : {}),
    checkpointInvocationOrdinal: invocationMetadata.invocationOrdinal,
    checkpointExecutionOrder: invocationMetadata.executionOrder,
    ...(typeof startTimeMs === 'number' ? { [CHECKPOINT_START_TIME_MS_KEY]: startTimeMs } : {})
  };
}

export const checkpointPreHook: PreHook = async (_node, inputs, env, operation) => {
  if (!isCheckpointEligibleOperation(operation)) {
    return { action: 'continue' };
  }

  const manager = await env.ensureCheckpointManager();
  if (!manager) {
    return { action: 'continue' };
  }

  const normalizedInputs = inputs.map(normalizeCheckpointInput);
  const operationName = resolveOperationName(operation);
  const cacheKey = CheckpointManager.computeCacheKey(operationName, normalizedInputs);
  const invocationMetadata = manager.assignInvocationMetadata(
    operationName,
    resolveInvocationSite(operation, env)
  );
  let cachedEntry:
    | { value: unknown; ts?: string; workspaceSnapshot?: unknown; source?: 'local' | 'fork' }
    | null = null;
  try {
    if (typeof (manager as CheckpointManager & { getWithMetadata?: unknown }).getWithMetadata === 'function') {
      cachedEntry = await (manager as CheckpointManager).getWithMetadata(cacheKey);
    } else {
      const cachedResult = await manager.get(cacheKey);
      cachedEntry = cachedResult === null ? null : { value: cachedResult };
    }
  } catch (error) {
    logger.warn('[checkpoint] cache read failed; treating as cache miss', {
      operation: operationName,
      key: cacheKey,
      error
    });
    return {
      action: 'continue',
      metadata: buildCheckpointMetadata(cacheKey, invocationMetadata, {
        hit: false,
        startTimeMs: Date.now()
      })
    };
  }

  if (cachedEntry !== null) {
    const policy = resolveCheckpointPolicy(
      env.getCheckpointScriptResumeMode?.(),
      env.getActiveCheckpointScope?.()
    );
    const managerRef = manager as CheckpointManager & {
      wasWrittenThisRun?: (key: string) => boolean;
      isCheckpointComplete?: (name: string) => boolean | undefined;
    };
    const shouldUseCachedResult =
      managerRef.wasWrittenThisRun?.(cacheKey) === true ||
      (cachedEntry.source === 'fork' &&
        policy.resumeMode === 'manual' &&
        env.hasCheckpointResumeOverride?.() !== true) ||
      shouldServeCheckpointHit({
        policy,
        entryTimestamp: cachedEntry.ts,
        checkpointComplete: policy.name ? managerRef.isCheckpointComplete?.(policy.name) : undefined,
        resumeOverride: env.hasCheckpointResumeOverride?.() === true
      });

    if (shouldUseCachedResult) {
      return {
        action: 'fulfill',
        metadata: buildCheckpointMetadata(cacheKey, invocationMetadata, {
          hit: true,
          cachedResult: cachedEntry.value,
          workspaceSnapshot: cachedEntry.workspaceSnapshot
        })
      };
    }

    return {
      action: 'continue',
      metadata: buildCheckpointMetadata(cacheKey, invocationMetadata, {
        hit: false,
        startTimeMs: Date.now()
      })
    };
  }

  return {
    action: 'continue',
    metadata: buildCheckpointMetadata(cacheKey, invocationMetadata, {
      hit: false,
      startTimeMs: Date.now()
    })
  };
};
