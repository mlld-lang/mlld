import type { ExeReturnNode } from '@core/types';
import type { ToolReturnMode } from '@core/types/executable';
import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { isExecutableVariable } from '@core/types/variable';
import { hasSecurityVarMx } from '@core/types/variable/VarMxHelpers';
import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { isStructuredValue } from '../utils/structured-value';

const NON_PRESERVING_TOP_LEVEL_FIELDS = new Set([
  'mx',
  'type',
  'text',
  'data',
  'internal',
  'raw',
  'metadata',
  'source',
  'isComplex'
]);

export interface ExeReturnControl {
  __exeReturn: true;
  value: unknown;
}

export interface ExeToolReturnState {
  reaches: unknown[];
  strict: boolean;
  allToolSigilsInForBodies: boolean;
  descriptor?: SecurityDescriptor;
}

export interface ExeExecutionContext {
  allowReturn?: boolean;
  scope?: string;
  hasFunctionBoundary?: boolean;
  toolReturnState?: ExeToolReturnState;
}

export interface ResolveExeReturnOptions {
  isolateSecurityDescriptor?: boolean;
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

export function appendExeToolReturnValue(
  env: Environment,
  value: unknown,
  descriptor?: SecurityDescriptor
): void {
  const exeContext = env.getExecutionContext<ExeExecutionContext>('exe');
  const state = exeContext?.toolReturnState;
  if (!state) {
    return;
  }
  state.reaches.push(value);
  if (!descriptor) {
    return;
  }
  state.descriptor = state.descriptor
    ? mergeDescriptors(state.descriptor, descriptor)
    : descriptor;
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

export function getExeToolReturnDescriptor(
  state: ExeToolReturnState | undefined
): SecurityDescriptor | undefined {
  return state?.descriptor;
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
  env: Environment,
  options: ResolveExeReturnOptions = {}
): Promise<{ value: unknown; env: Environment; descriptor?: SecurityDescriptor }> {
  const hasReturnValue = node?.meta?.hasValue !== false;
  if (!hasReturnValue) {
    return { value: undefined, env };
  }
  const returnNodes = Array.isArray(node.values) ? node.values : [];
  if (returnNodes.length === 0) {
    return { value: undefined, env };
  }
  const topLevelFieldName =
    returnNodes.length === 1 &&
    returnNodes[0] &&
    typeof returnNodes[0] === 'object' &&
    Array.isArray((returnNodes[0] as { fields?: unknown[] }).fields) &&
    ((returnNodes[0] as { fields?: unknown[] }).fields?.length ?? 0) > 0 &&
    typeof ((returnNodes[0] as { fields?: Array<{ type?: string; value?: unknown }> }).fields?.[0]) === 'object' &&
    ((returnNodes[0] as { fields?: Array<{ type?: string; value?: unknown }> }).fields?.[0]?.type === 'field')
      ? String((returnNodes[0] as { fields?: Array<{ type?: string; value?: unknown }> }).fields?.[0]?.value)
      : undefined;
  const preserveBareVariableReference =
    returnNodes.length === 1 &&
    returnNodes[0] &&
    typeof returnNodes[0] === 'object' &&
    (returnNodes[0] as { type?: string }).type === 'VariableReference' &&
    (returnNodes[0] as { identifier?: string }).identifier !== 'mx' &&
    (!topLevelFieldName || !NON_PRESERVING_TOP_LEVEL_FIELDS.has(topLevelFieldName)) &&
    (!Array.isArray((returnNodes[0] as { pipes?: unknown[] }).pipes) ||
      ((returnNodes[0] as { pipes?: unknown[] }).pipes?.length ?? 0) === 0);
  const evaluationEnv = options.isolateSecurityDescriptor ? env.createChild() : env;
  const result = await evaluate(returnNodes, evaluationEnv, {
    isExpression: true,
    preserveBareVariableReference
  });
  let returnValue = result.value;
  const { extractVariableValue, isVariable } = await import('../utils/variable-resolution');
  if (isVariable(returnValue) && !isExecutableVariable(returnValue)) {
    const extractedValue = await extractVariableValue(returnValue, result.env || evaluationEnv);
    const preserveVariableWrapper =
      preserveBareVariableReference &&
      Boolean(returnValue.mx && hasSecurityVarMx(returnValue.mx)) &&
      !isStructuredValue(extractedValue);
    if (!preserveVariableWrapper) {
      returnValue = extractedValue;
    }
  }
  const descriptor = options.isolateSecurityDescriptor
    ? (result.env || evaluationEnv).getLocalSecurityDescriptor()
    : undefined;
  const resolvedEnv = normalizeReturnEnvironment(env, result.env || evaluationEnv);
  return {
    value: returnValue,
    env: resolvedEnv,
    ...(descriptor ? { descriptor } : {})
  };
}
