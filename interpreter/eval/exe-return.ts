import type { ExeReturnNode } from '@core/types';
import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';

export interface ExeReturnControl {
  __exeReturn: true;
  value: unknown;
}

export function createExeReturnControl(value: unknown): ExeReturnControl {
  return { __exeReturn: true, value };
}

export function isExeReturnControl(value: unknown): value is ExeReturnControl {
  return !!value && typeof value === 'object' && (value as Record<string, unknown>).__exeReturn === true;
}

export async function resolveExeReturnValue(
  node: ExeReturnNode,
  env: Environment
): Promise<{ value: unknown; env: Environment }> {
  const hasReturnValue = node?.meta?.hasValue !== false;
  if (!hasReturnValue) {
    return { value: undefined, env };
  }
  const returnNodes = Array.isArray(node.values) ? node.values : [];
  if (returnNodes.length === 0) {
    return { value: undefined, env };
  }
  const result = await evaluate(returnNodes, env, { isExpression: true });
  return { value: result.value, env: result.env || env };
}
