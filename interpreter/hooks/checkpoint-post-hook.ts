import { CheckpointManager } from '@interpreter/checkpoint/CheckpointManager';
import '@interpreter/checkpoint/normalizers';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { logger } from '@core/utils/logger';
import {
  isWorkspaceCheckpointSnapshot,
  type WorkspaceCheckpointSnapshot,
  type WorkspaceValue
} from '@core/types/workspace';
import {
  resolveCheckpointPolicy,
  shouldPersistCheckpointEntry
} from '@interpreter/checkpoint/policy';
import type { PostHook } from './HookManager';

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

// See checkpoint-pre-hook.ts for the rationale — these are mlld-internal
// control-flow pseudo-languages, not external invocations worth caching.
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

function normalizeCheckpointResult(value: unknown): unknown {
  const normalized = isVariable(value) ? value.value : value;
  if (isStructuredValue(normalized)) {
    return asData(normalized);
  }
  return normalized;
}

function resolveOperationName(operation: OperationContext): string {
  if (typeof operation.name === 'string' && operation.name.length > 0) {
    return operation.name;
  }
  return operation.type;
}

function getCheckpointMetadata(operation: OperationContext): Record<string, unknown> {
  const operationRef = operation as OperationContext & { metadata?: Record<string, unknown> };
  if (!operationRef.metadata || typeof operationRef.metadata !== 'object') {
    operationRef.metadata = {};
  }
  return operationRef.metadata as Record<string, unknown>;
}

function readCheckpointInvocationSite(metadata: Record<string, unknown>): string | undefined {
  const value = metadata.checkpointInvocationSite;
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function readCheckpointInvocationIndex(metadata: Record<string, unknown>): number | undefined {
  const value = metadata.checkpointInvocationIndex;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return undefined;
}

function readCheckpointInvocationOrdinal(metadata: Record<string, unknown>): number | undefined {
  const value = metadata.checkpointInvocationOrdinal;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return undefined;
}

function readCheckpointExecutionOrder(metadata: Record<string, unknown>): number | undefined {
  const value = metadata.checkpointExecutionOrder;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return undefined;
}

function readCheckpointStartTimeMs(metadata: Record<string, unknown>): number | undefined {
  const value = metadata[CHECKPOINT_START_TIME_MS_KEY];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return undefined;
}

function computeDurationMs(startTimeMs: number | undefined): number | undefined {
  if (startTimeMs === undefined) {
    return undefined;
  }
  return Math.max(0, Date.now() - startTimeMs);
}

function readWorkspaceSnapshot(
  metadata: Record<string, unknown>
): WorkspaceCheckpointSnapshot | undefined {
  const value = metadata.checkpointWorkspaceSnapshot;
  return isWorkspaceCheckpointSnapshot(value) ? value : undefined;
}

function captureWorkspaceSnapshot(workspace: WorkspaceValue): WorkspaceCheckpointSnapshot {
  return {
    vfsPatch: workspace.fs.export(),
    descriptions: Object.fromEntries(workspace.descriptions.entries())
  };
}

function restoreWorkspaceSnapshot(
  workspace: WorkspaceValue,
  snapshot: WorkspaceCheckpointSnapshot
): void {
  workspace.fs.reset();
  workspace.fs.apply(snapshot.vfsPatch);
  workspace.descriptions = new Map(Object.entries(snapshot.descriptions));
  workspace.shellSession = undefined;
}

export const checkpointPostHook: PostHook = async (_node, result, inputs, env, operation) => {
  if (!isCheckpointEligibleOperation(operation)) {
    return result;
  }

  const manager = await env.ensureCheckpointManager();
  if (!manager) {
    return result;
  }

  const metadata = getCheckpointMetadata(operation);
  const checkpointHit = metadata.checkpointHit === true;
  if (checkpointHit) {
    const snapshot = readWorkspaceSnapshot(metadata);
    if (metadata.checkpointWorkspaceSnapshot !== undefined && !snapshot) {
      logger.warn('[checkpoint] ignoring malformed workspace snapshot on cache hit', {
        operation: resolveOperationName(operation)
      });
      return result;
    }
    if (!snapshot) {
      return result;
    }

    const workspace = env.getActiveWorkspace();
    if (!workspace) {
      return result;
    }

    try {
      restoreWorkspaceSnapshot(workspace, snapshot);
    } catch (error) {
      logger.warn('[checkpoint] workspace snapshot restore failed; continuing without restore', {
        operation: resolveOperationName(operation),
        error
      });
    }
    return result;
  }

  const checkpointKey = typeof metadata.checkpointKey === 'string' ? metadata.checkpointKey : undefined;
  if (!checkpointKey) {
    return result;
  }

  const normalizedInputs = inputs.map(normalizeCheckpointInput);
  const invocationSite = readCheckpointInvocationSite(metadata);
  const invocationIndex = readCheckpointInvocationIndex(metadata);
  const invocationOrdinal = readCheckpointInvocationOrdinal(metadata);
  const executionOrder = readCheckpointExecutionOrder(metadata);
  const durationMs = computeDurationMs(readCheckpointStartTimeMs(metadata));
  const policy = resolveCheckpointPolicy(
    env.getCheckpointScriptResumeMode?.(),
    env.getActiveCheckpointScope?.()
  );
  const resumeOverride = env.hasCheckpointResumeOverride?.() === true;
  if (!shouldPersistCheckpointEntry({ policy, resumeOverride })) {
    return result;
  }

  const workspace = env.getActiveWorkspace();
  try {
    await manager.put(checkpointKey, {
      fn: resolveOperationName(operation),
      args: normalizedInputs,
      argsHash: CheckpointManager.computeArgsHash(normalizedInputs),
      argsPreview: CheckpointManager.buildArgsPreview(normalizedInputs),
      result: normalizeCheckpointResult(result.value),
      ...(workspace ? { workspaceSnapshot: captureWorkspaceSnapshot(workspace) } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(invocationSite ? { invocationSite } : {}),
      ...(invocationIndex !== undefined ? { invocationIndex } : {}),
      ...(invocationOrdinal !== undefined ? { invocationOrdinal } : {}),
      ...(executionOrder !== undefined ? { executionOrder } : {})
    });
  } catch (error) {
    logger.warn('[checkpoint] cache write failed; skipping checkpoint persistence', {
      operation: resolveOperationName(operation),
      key: checkpointKey,
      error
    });
  }

  return result;
};
