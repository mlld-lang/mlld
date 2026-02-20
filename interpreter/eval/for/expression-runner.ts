import type {
  Environment,
  ForExpression,
  VariableReferenceNode
} from '@core/types';
import { evaluate, type EvalResult } from '@interpreter/core/interpreter';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from '@interpreter/eval/when';
import { evaluateWhenExpression } from '@interpreter/eval/when-expression';
import { isExeReturnControl } from '@interpreter/eval/exe-return';
import { isControlCandidate } from '@interpreter/eval/loop';
import { isVariable, extractVariableValue } from '@interpreter/utils/variable-resolution';
import {
  asData,
  asText,
  extractSecurityDescriptor,
  isStructuredValue,
  looksLikeJsonString,
  normalizeWhenShowEffect
} from '@interpreter/utils/structured-value';
import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { shouldKeepStructuredForForExpression } from './binding-utils';
import type { ForControlKindResolver } from './types';

export type ForExpressionIterationResult =
  | {
      outcome: 'value';
      value: unknown;
      childEnv: Environment;
    }
  | {
      outcome: 'skip' | 'done';
      childEnv: Environment;
    };

export type ForExpressionIterationParams = {
  expr: ForExpression;
  childEnv: Environment;
  value: unknown;
  sourceDescriptor?: SecurityDescriptor;
  extractControlKind: ForControlKindResolver;
};

function resolveForExpressionNodes(expr: ForExpression): unknown[] {
  if (!Array.isArray(expr.expression) || expr.expression.length === 0) {
    return [];
  }

  if (
    expr.expression.length === 1 &&
    (expr.expression[0] as any).content &&
    (expr.expression[0] as any).wrapperType &&
    (expr.expression[0] as any).hasInterpolation === false
  ) {
    return (expr.expression[0] as any).content;
  }

  return expr.expression;
}

function resolveSimpleVariableReference(nodesToEvaluate: unknown[]): VariableReferenceNode | null {
  if (nodesToEvaluate.length !== 1) return null;
  const node = nodesToEvaluate[0] as any;
  if (!node || node.type !== 'VariableReference') return null;
  const hasFields = Array.isArray(node.fields) && node.fields.length > 0;
  const hasPipes = Array.isArray(node.pipes) && node.pipes.length > 0;
  if (hasFields || hasPipes) return null;
  return node as VariableReferenceNode;
}

async function evaluateExpressionSequence(
  nodes: unknown[],
  startEnv: Environment
): Promise<EvalResult> {
  let currentEnv = startEnv;
  let lastResult: EvalResult = { value: undefined, env: currentEnv };

  for (const node of nodes) {
    if (isLetAssignment(node as any)) {
      currentEnv = await evaluateLetAssignment(node as any, currentEnv);
      lastResult = { value: undefined, env: currentEnv };
      continue;
    }

    if (isAugmentedAssignment(node as any)) {
      currentEnv = await evaluateAugmentedAssignment(node as any, currentEnv);
      lastResult = { value: undefined, env: currentEnv };
      continue;
    }

    if ((node as any)?.type === 'WhenExpression') {
      lastResult = await evaluateWhenExpression(node as any, currentEnv);
      currentEnv = lastResult.env || currentEnv;
      // Side-effect tags are not value-returning branches for sequence short-circuiting.
      if (lastResult.value !== null && lastResult.value !== undefined) {
        if (typeof lastResult.value === 'object' && (lastResult.value as any).__whenEffect) {
          continue;
        }
        break;
      }
      continue;
    }

    // Allow effects in for-expression blocks for progress logging behavior.
    lastResult = await evaluate(node as any, currentEnv, { isExpression: true, allowEffects: true });
    currentEnv = lastResult.env || currentEnv;
    if (isExeReturnControl(lastResult.value)) break;
    if (isControlCandidate(lastResult.value)) break;
  }

  return { value: lastResult.value, env: currentEnv };
}

function resolveControlOutcome(
  value: unknown,
  extractControlKind: ForControlKindResolver
): 'skip' | 'done' | null {
  if (value && typeof value === 'object' && '__whileControl' in (value as any)) {
    const control = (value as any).__whileControl;
    if (control === 'continue') return 'skip';
    if (control === 'done') return 'done';
  }

  if (isControlCandidate(value)) {
    const controlKind = extractControlKind(value);
    if (controlKind === 'continue') return 'skip';
    if (controlKind === 'done') return 'done';
  }

  return null;
}

export async function evaluateForExpressionIteration(
  params: ForExpressionIterationParams
): Promise<ForExpressionIterationResult> {
  const nodesToEvaluate = resolveForExpressionNodes(params.expr);
  if (nodesToEvaluate.length === 0) {
    return { outcome: 'value', value: null, childEnv: params.childEnv };
  }

  const simpleVarRef = resolveSimpleVariableReference(nodesToEvaluate);
  const sequenceResult = await evaluateExpressionSequence(nodesToEvaluate, params.childEnv);
  const childEnv = sequenceResult.env || params.childEnv;
  let branchValue = sequenceResult.value;

  if (isExeReturnControl(branchValue)) {
    branchValue = (branchValue as any).value;
  }

  const controlOutcome = resolveControlOutcome(branchValue, params.extractControlKind);
  if (controlOutcome === 'skip') {
    return { outcome: 'skip', childEnv };
  }
  if (controlOutcome === 'done') {
    return { outcome: 'done', childEnv };
  }

  const branchDescriptor = extractSecurityDescriptor(branchValue);
  const iterVarDescriptor = extractSecurityDescriptor(params.value);

  if (simpleVarRef) {
    const refVar = childEnv.getVariable(simpleVarRef.identifier);
    const refValue = refVar?.value;
    if (isStructuredValue(refValue) && shouldKeepStructuredForForExpression(refValue)) {
      branchValue = refValue;
    }
  }

  if (isStructuredValue(branchValue)) {
    if (shouldKeepStructuredForForExpression(branchValue)) {
      const derived = (() => {
        try {
          return asData(branchValue);
        } catch {
          return asText(branchValue);
        }
      })();
      if (derived === 'skip') {
        return { outcome: 'skip', childEnv };
      }
    } else {
      try {
        branchValue = asData(branchValue);
      } catch {
        branchValue = asText(branchValue);
      }
    }
  }

  if (branchValue === 'skip') {
    return { outcome: 'skip', childEnv };
  }

  let exprResult: unknown;
  if (isVariable(branchValue)) {
    exprResult = await extractVariableValue(branchValue, childEnv);
  } else {
    exprResult = branchValue;
  }

  exprResult = normalizeWhenShowEffect(exprResult).normalized;

  if (typeof exprResult === 'string' && looksLikeJsonString(exprResult)) {
    try {
      exprResult = JSON.parse(exprResult.trim());
    } catch {
      // Keep original string when JSON parsing fails.
    }
  }

  const elementDescriptors = [
    branchDescriptor,
    iterVarDescriptor,
    params.sourceDescriptor
  ].filter(Boolean) as SecurityDescriptor[];

  if (elementDescriptors.length > 0 && exprResult && typeof exprResult === 'object') {
    const mergedDescriptor = elementDescriptors.length === 1
      ? elementDescriptors[0]
      : mergeDescriptors(...elementDescriptors);
    if (
      mergedDescriptor.labels.length > 0 ||
      mergedDescriptor.taint.length > 0 ||
      mergedDescriptor.sources.length > 0
    ) {
      setExpressionProvenance(exprResult, mergedDescriptor);
    }
  }

  return {
    outcome: 'value',
    value: exprResult,
    childEnv
  };
}
