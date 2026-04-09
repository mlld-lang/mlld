import type { ExeReturnNode } from '@core/types';
import type { ToolReturnMode } from '@core/types/executable';
import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';

export interface ExeReturnControl {
  __exeReturn: true;
  value: unknown;
}

export interface ExeToolReturnState {
  reaches: unknown[];
  strict: boolean;
  allToolSigilsInForBodies: boolean;
}

export interface ExeExecutionContext {
  allowReturn?: boolean;
  scope?: string;
  hasFunctionBoundary?: boolean;
  toolReturnState?: ExeToolReturnState;
}

export function createExeReturnControl(value: unknown): ExeReturnControl {
  return { __exeReturn: true, value };
}

export function isExeReturnControl(value: unknown): value is ExeReturnControl {
  return !!value && typeof value === 'object' && (value as Record<string, unknown>).__exeReturn === true;
}

export function unwrapExeReturnControl<T = unknown>(value: T | ExeReturnControl): T | unknown {
  return isExeReturnControl(value) ? value.value : value;
}

export function getExeReturnKind(node: Pick<ExeReturnNode, 'kind'> | null | undefined): ExeReturnNode['kind'] {
  return node?.kind ?? 'canonical';
}

export function createExeToolReturnState(mode: ToolReturnMode | undefined): ExeToolReturnState | undefined {
  if (!mode?.strict) {
    return undefined;
  }

  return {
    reaches: [],
    strict: true,
    allToolSigilsInForBodies: mode.allToolSigilsInForBodies === true
  };
}

export function appendExeToolReturnValue(env: Environment, value: unknown): void {
  const exeContext = env.getExecutionContext<ExeExecutionContext>('exe');
  exeContext?.toolReturnState?.reaches.push(value);
}

export function finalizeExeToolReturn(state: ExeToolReturnState | undefined): unknown {
  if (!state?.strict) {
    return undefined;
  }
  if (state.reaches.length === 0) {
    return state.allToolSigilsInForBodies ? [] : null;
  }
  if (state.reaches.length === 1) {
    return state.reaches[0];
  }
  return [...state.reaches];
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
