import { CheckpointManager } from '@interpreter/checkpoint/CheckpointManager';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import type { PreHook } from './HookManager';

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

function resolveOperationName(operation: OperationContext): string {
  if (typeof operation.name === 'string' && operation.name.length > 0) {
    return operation.name;
  }
  return operation.type;
}

export const checkpointPreHook: PreHook = async (_node, inputs, env, operation) => {
  if (!isCheckpointEligibleOperation(operation)) {
    return { action: 'continue' };
  }

  const manager = env.getCheckpointManager();
  if (!manager) {
    return { action: 'continue' };
  }

  const normalizedInputs = inputs.map(normalizeCheckpointInput);
  const cacheKey = CheckpointManager.computeCacheKey(
    resolveOperationName(operation),
    normalizedInputs
  );
  const cachedResult = await manager.get(cacheKey);

  if (cachedResult !== null) {
    return {
      action: 'fulfill',
      metadata: {
        checkpointHit: true,
        checkpointKey: cacheKey,
        cachedResult
      }
    };
  }

  return {
    action: 'continue',
    metadata: {
      checkpointHit: false,
      checkpointKey: cacheKey
    }
  };
};
