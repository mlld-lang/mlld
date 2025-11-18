import type { SecurityDescriptor } from '@core/types/security';
import { mergeDescriptors } from '@core/types/security';

export interface EvaluatorResult<T = unknown> {
  value: T;
  descriptor?: SecurityDescriptor;
}

export function createEvaluatorResult<T>(
  value: T,
  descriptor?: SecurityDescriptor
): EvaluatorResult<T> {
  return descriptor ? { value, descriptor } : { value };
}

export function mergeEvaluatorDescriptors(
  ...results: Array<EvaluatorResult | undefined>
): SecurityDescriptor | undefined {
  const descriptors = results
    .map(result => result?.descriptor)
    .filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));
  if (descriptors.length === 0) {
    return undefined;
  }
  return mergeDescriptors(...descriptors);
}

export function unwrapEvaluatorResult<T>(result: EvaluatorResult<T>): T {
  return result.value;
}
