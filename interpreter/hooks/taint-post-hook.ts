import type { DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import { mergeDescriptors } from '@core/types/security';
import type { Variable, VariableContext } from '@core/types/variable';
import type { EvalResult } from '../core/interpreter';
import type { Environment } from '../env/Environment';
import { isStructuredValue } from '../utils/structured-value';
import { isVariable } from '../utils/variable-resolution';
import type { PostHook } from './HookManager';
import type { OperationContext } from '../env/ContextManager';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { StructuredValueContext } from '@interpreter/utils/structured-value';

export const taintPostHook: PostHook = async (
  _directive: DirectiveNode,
  result: EvalResult,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
): Promise<EvalResult> => {
  const descriptors: SecurityDescriptor[] = [];
  collectInputDescriptors(inputs, descriptors);
  collectValueDescriptors(result.value, descriptors);
  collectOperationLabels(operation, descriptors);

  if (descriptors.length > 0) {
    const merged = mergeDescriptors(...descriptors);
    if (merged) {
      env.recordSecurityDescriptor(merged);
    }
  }

  return result;
};

function collectInputDescriptors(
  inputs: readonly unknown[],
  target: SecurityDescriptor[]
): void {
  for (const input of inputs) {
    if (isVariable(input)) {
      pushVariableDescriptor(input, target);
      continue;
    }
    collectValueDescriptors(input, target);
  }
}

function collectOperationLabels(
  operation: OperationContext | undefined,
  target: SecurityDescriptor[]
): void {
  if (!operation?.labels || operation.labels.length === 0) {
    return;
  }

  target.push({
    labels: operation.labels,
    taint: operation.labels,
    sources: []
  });
}

function collectValueDescriptors(
  value: unknown,
  target: SecurityDescriptor[],
  seen: WeakSet<object> = new WeakSet()
): void {
  if (!value) {
    return;
  }

  if (isVariable(value)) {
    pushVariableDescriptor(value, target);
    return;
  }

  if (isStructuredValue(value)) {
    pushStructuredDescriptor(value, target);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectValueDescriptors(entry, target, seen);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  const obj = value as Record<string, unknown>;
  if (seen.has(obj)) {
    return;
  }
  seen.add(obj);

  const descriptor = extractDescriptorFromObject(obj);
  if (descriptor) {
    target.push(descriptor);
    return;
  }

  for (const key of Object.keys(obj)) {
    collectValueDescriptors(obj[key], target, seen);
  }
}

function pushVariableDescriptor(variable: Variable, target: SecurityDescriptor[]): void {
  const descriptor = descriptorFromVarMx(variable.mx);
  if (descriptor) {
    target.push(descriptor);
  }
}

function pushStructuredDescriptor(
  value: { mx?: VariableContext | StructuredValueContext },
  target: SecurityDescriptor[]
): void {
  const descriptor = descriptorFromVarMx(value.mx);
  if (descriptor) {
    target.push(descriptor);
  }
}

function extractDescriptorFromObject(value: Record<string, unknown>): SecurityDescriptor | undefined {
  const mx = value.mx as VariableContext | undefined;
  const descriptorFromContext = descriptorFromVarMx(mx);
  if (descriptorFromContext) {
    return descriptorFromContext;
  }
  return undefined;
}

function descriptorFromVarMx(
  mx?: VariableContext | StructuredValueContext
): SecurityDescriptor | undefined {
  if (!mx) {
    return undefined;
  }
  const hasLabels = Array.isArray(mx.labels) && mx.labels.length > 0;
  const hasSources = Array.isArray(mx.sources) && mx.sources.length > 0;
  const hasTaint = Array.isArray(mx.taint) && mx.taint.length > 0;
  if (!hasLabels && !hasSources && !hasTaint) {
    return undefined;
  }
  return varMxToSecurityDescriptor(mx);
}
