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
import { ctxToSecurityDescriptor } from '@core/types/variable/CtxHelpers';
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
  const descriptor = descriptorFromCtx(variable.ctx);
  if (descriptor) {
    target.push(descriptor);
  }
}

function pushStructuredDescriptor(
  value: { ctx?: VariableContext | StructuredValueContext },
  target: SecurityDescriptor[]
): void {
  const descriptor = descriptorFromCtx(value.ctx);
  if (descriptor) {
    target.push(descriptor);
  }
}

function extractDescriptorFromObject(value: Record<string, unknown>): SecurityDescriptor | undefined {
  const ctx = value.ctx as VariableContext | undefined;
  const descriptorFromContext = descriptorFromCtx(ctx);
  if (descriptorFromContext) {
    return descriptorFromContext;
  }
  return undefined;
}

function descriptorFromCtx(
  ctx?: VariableContext | StructuredValueContext
): SecurityDescriptor | undefined {
  if (!ctx) {
    return undefined;
  }
  const hasLabels = Array.isArray(ctx.labels) && ctx.labels.length > 0;
  const hasSources = Array.isArray(ctx.sources) && ctx.sources.length > 0;
  const hasTaint = Array.isArray(ctx.taint) && ctx.taint.length > 0;
  if (!hasLabels && !hasSources && !hasTaint) {
    return undefined;
  }
  return ctxToSecurityDescriptor(ctx);
}
