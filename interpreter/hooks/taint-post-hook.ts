import type { DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import { mergeDescriptors } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { EvalResult } from '../core/interpreter';
import type { Environment } from '../env/Environment';
import { isStructuredValue } from '../utils/structured-value';
import { isVariable } from '../utils/variable-resolution';
import type { PostHook } from './HookManager';

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
      const descriptor = input.metadata?.security;
      if (descriptor) {
        target.push(descriptor);
      }
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
    taint: 'unknown',
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
    const descriptor = value.metadata?.security;
    if (descriptor) {
      target.push(descriptor);
    }
    return;
  }

  if (isStructuredValue(value)) {
    const descriptor = value.metadata?.security as SecurityDescriptor | undefined;
    if (descriptor) {
      target.push(descriptor);
    }
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

  const metadata = obj.metadata as { security?: SecurityDescriptor } | undefined;
  if (metadata?.security) {
    target.push(metadata.security);
    return;
  }

  for (const key of Object.keys(obj)) {
    collectValueDescriptors(obj[key], target, seen);
  }
}
