import { CheckpointManager } from '@interpreter/checkpoint/CheckpointManager';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import type { PostHook } from './HookManager';

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

function isCheckpointEligibleOperation(operation?: OperationContext): boolean {
  if (!operation) {
    return false;
  }

  if (operation.type === 'exe' || operation.type === 'run') {
    return hasLlmLabel(operation.labels) && isRuntimeExecutableOperation(operation);
  }

  return operation.subtype === 'effect' && hasLlmLabel(operation.labels);
}

function normalizeCheckpointInput(input: unknown): unknown {
  const normalized = isVariable(input) ? input.value : input;
  if (isStructuredValue(normalized)) {
    return asData(normalized);
  }
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

export const checkpointPostHook: PostHook = async (_node, result, inputs, env, operation) => {
  if (!isCheckpointEligibleOperation(operation)) {
    return result;
  }

  const manager = env.getCheckpointManager();
  if (!manager) {
    return result;
  }

  const metadata = getCheckpointMetadata(operation);
  const checkpointHit = metadata.checkpointHit === true;
  if (checkpointHit) {
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
  await manager.put(checkpointKey, {
    fn: resolveOperationName(operation),
    args: normalizedInputs,
    argsHash: CheckpointManager.computeArgsHash(normalizedInputs),
    argsPreview: CheckpointManager.buildArgsPreview(normalizedInputs),
    result: normalizeCheckpointResult(result.value),
    ...(invocationSite ? { invocationSite } : {}),
    ...(invocationIndex !== undefined ? { invocationIndex } : {}),
    ...(invocationOrdinal !== undefined ? { invocationOrdinal } : {})
  });

  return result;
};
