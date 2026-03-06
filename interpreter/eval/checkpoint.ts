import type { DirectiveNode } from '@core/types';
import type { CheckpointDirectiveNode } from '@core/types/checkpoint';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { evaluateDataValue } from './data-value-evaluator';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import {
  checkpointDurationToMs,
  normalizeCheckpointResumeMode
} from '@interpreter/checkpoint/policy';

async function readCheckpointName(
  node: CheckpointDirectiveNode,
  env: Environment
): Promise<string> {
  const rawName = node.values?.name;
  if (typeof rawName === 'string') {
    return rawName.trim();
  }

  if (rawName === null || rawName === undefined) {
    return '';
  }

  const resolvedName = await evaluateDataValue(rawName as any, env);
  if (typeof resolvedName === 'string') {
    return resolvedName.trim();
  }
  if (resolvedName === null || resolvedName === undefined) {
    return '';
  }
  return String(resolvedName).trim();
}

async function readCheckpointResumeMode(
  node: CheckpointDirectiveNode,
  env: Environment
) {
  const rawResume = node.values?.withClause?.resume;
  if (rawResume === undefined) {
    return undefined;
  }

  if (typeof rawResume === 'string') {
    return normalizeCheckpointResumeMode(rawResume, {
      sourceLabel: 'checkpoint resume'
    });
  }

  const resolved = await evaluateDataValue(rawResume as any, env);
  return normalizeCheckpointResumeMode(resolved, {
    sourceLabel: 'checkpoint resume'
  });
}

async function readCheckpointCompleteValue(rawComplete: unknown, env: Environment): Promise<boolean> {
  const resolvedValue = await evaluateDataValue(rawComplete as any, env);
  const resolved = isVariable(resolvedValue)
    ? resolvedValue.value
    : isStructuredValue(resolvedValue)
      ? asData(resolvedValue)
      : resolvedValue;

  if (typeof resolved === 'boolean') {
    return resolved;
  }
  if (typeof resolved === 'string') {
    const normalized = resolved.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false' || normalized.length === 0) {
      return false;
    }
  }
  if (typeof resolved === 'number') {
    return resolved !== 0;
  }
  return Boolean(resolved);
}

export async function finalizePendingCheckpointScope(env: Environment): Promise<void> {
  const scope = env.getActiveCheckpointScope();
  if (!scope) {
    return;
  }

  const manager = await env.ensureCheckpointManager();
  if (manager && scope.hasCompleteCondition && scope.completeExpression !== undefined) {
    const complete = await readCheckpointCompleteValue(scope.completeExpression, env);
    await manager.recordCheckpointState(scope.name, { complete });
  }

  env.setActiveCheckpointScope(undefined);
}

export async function evaluateCheckpoint(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const checkpointNode = directive as CheckpointDirectiveNode;
  const name = await readCheckpointName(checkpointNode, env);
  if (!name) {
    throw new Error('checkpoint directive requires a non-empty name');
  }

  await finalizePendingCheckpointScope(env);

  const manager = await env.ensureCheckpointManager();
  if (!manager) {
    return { value: undefined, env };
  }

  await manager.registerNamedCheckpoint(name);
  env.setActiveCheckpointScope({
    name,
    resumeMode: await readCheckpointResumeMode(checkpointNode, env),
    ttlMs: checkpointDurationToMs(checkpointNode.values?.withClause?.ttl),
    completeExpression: checkpointNode.values?.withClause?.complete,
    hasCompleteCondition: checkpointNode.values?.withClause?.complete !== undefined
  });
  return { value: undefined, env };
}
