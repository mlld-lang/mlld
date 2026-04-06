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

function isDescendantEnvironment(candidate: Environment, ancestor: Environment): boolean {
  let current: Environment | undefined = candidate;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

function normalizeReturnEnvironment(baseEnv: Environment, evaluatedEnv: Environment | undefined): Environment {
  if (!evaluatedEnv || evaluatedEnv === baseEnv) {
    return baseEnv;
  }
  if (isDescendantEnvironment(evaluatedEnv, baseEnv)) {
    baseEnv.mergeChild(evaluatedEnv);
    return baseEnv;
  }
  return evaluatedEnv;
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
  const preserveBareVariableReference =
    returnNodes.length === 1 &&
    returnNodes[0] &&
    typeof returnNodes[0] === 'object' &&
    (returnNodes[0] as { type?: string }).type === 'VariableReference' &&
    (!Array.isArray((returnNodes[0] as { fields?: unknown[] }).fields) ||
      ((returnNodes[0] as { fields?: unknown[] }).fields?.length ?? 0) === 0) &&
    (!Array.isArray((returnNodes[0] as { pipes?: unknown[] }).pipes) ||
      ((returnNodes[0] as { pipes?: unknown[] }).pipes?.length ?? 0) === 0);
  const result = await evaluate(returnNodes, env, {
    isExpression: true,
    preserveBareVariableReference
  });
  const resolvedEnv = normalizeReturnEnvironment(env, result.env || env);
  return { value: result.value, env: resolvedEnv };
}
