import type { DirectiveNode } from '@core/types';
import type { CheckpointDirectiveNode } from '@core/types/checkpoint';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';

function readCheckpointName(node: CheckpointDirectiveNode): string {
  const rawName = node.values?.name;
  if (typeof rawName === 'string') {
    return rawName.trim();
  }
  return '';
}

export async function evaluateCheckpoint(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const checkpointNode = directive as CheckpointDirectiveNode;
  const name = readCheckpointName(checkpointNode);
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
