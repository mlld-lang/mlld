import { ensureStructuredValue, isStructuredValue, type StructuredValue } from './structured-value';

/**
 * Feature flag for structured exec behaviour.
 * When disabled, legacy string behaviour is preserved.
 */
export function isStructuredExecEnabled(): boolean {
  return true;
}

/**
 * Wrap exec results when the feature flag is enabled.
 * When disabled, returns the legacy string representation.
 */
export function wrapExecResult<T>(value: T, options?: { type?: string; text?: string }): StructuredValue<T> {
  if (isStructuredValue(value)) {
    if (options?.type || options?.text) {
      return ensureStructuredValue(value, options?.type as any, options?.text);
    }
    return value;
  }

  return ensureStructuredValue(value, options?.type as any, options?.text);
}

export function wrapPipelineResult<T>(value: T, options?: { type?: string; text?: string }): StructuredValue<T> {
  return wrapExecResult(value, options);
}
