import type { Environment } from '@interpreter/env/Environment';
import type { SecurityDescriptor } from '@core/types/security';
import {
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue,
  looksLikeJsonString
} from '@interpreter/utils/structured-value';
import { wrapExecResult } from '@interpreter/utils/structured-exec';

export type FinalizeResult = (
  value: unknown,
  options?: { type?: string; text?: string }
) => unknown;

export interface CreateFinalizerOptions {
  env: Environment;
  getOutputPolicyDescriptor: () => SecurityDescriptor | undefined;
}

export function createCommandExecutionFinalizer(
  options: CreateFinalizerOptions
): FinalizeResult {
  const { env, getOutputPolicyDescriptor } = options;

  return (value, wrapOptions) => {
    let wrapped: unknown;
    if (
      typeof value === 'string' &&
      (!wrapOptions || !wrapOptions.type || wrapOptions.type === 'text') &&
      looksLikeJsonString(value)
    ) {
      try {
        const parsed = JSON.parse(value.trim());
        const typeHint = Array.isArray(parsed) ? 'array' : 'object';
        wrapped = wrapExecResult(parsed, { type: typeHint, text: wrapOptions?.text ?? value });
      } catch {
        // Fall through to default wrapping when JSON.parse fails.
      }
    }

    if (wrapped === undefined) {
      wrapped = wrapExecResult(value, wrapOptions);
    }

    const outputPolicyDescriptor = getOutputPolicyDescriptor();
    if (!outputPolicyDescriptor || !isStructuredValue(wrapped)) {
      return wrapped;
    }

    const existing = extractSecurityDescriptor(wrapped, { recursive: true, mergeArrayElements: true });
    const merged = existing
      ? env.mergeSecurityDescriptors(existing, outputPolicyDescriptor)
      : outputPolicyDescriptor;
    applySecurityDescriptorToStructuredValue(wrapped, merged);
    return wrapped;
  };
}
