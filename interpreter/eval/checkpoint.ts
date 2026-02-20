import type { DirectiveNode } from '@core/types';
import type { CheckpointDirectiveNode } from '@core/types/checkpoint';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { evaluateDataValue } from './data-value-evaluator';

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

export async function evaluateCheckpoint(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const checkpointNode = directive as CheckpointDirectiveNode;
  const name = await readCheckpointName(checkpointNode, env);
  if (!name) {
    throw new Error('checkpoint directive requires a non-empty name');
  }

  const manager = await env.ensureCheckpointManager();
  if (!manager) {
    return { value: undefined, env };
  }

  await manager.registerNamedCheckpoint(name);
  return { value: undefined, env };
}
