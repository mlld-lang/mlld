import { ensureStructuredValue, isStructuredValue, type StructuredValue } from './structured-value';

/**
 * Feature flag for structured exec behaviour.
 * When disabled, legacy string behaviour is preserved.
 */
export function isStructuredExecEnabled(): boolean {
  const flag = process.env.MLLD_ENABLE_STRUCTURED_EXEC;
  if (!flag) return false;
  return flag === '1' || flag.toLowerCase() === 'true';
}

/**
 * Wrap exec results when the feature flag is enabled.
 * When disabled, returns the legacy string representation.
 */
export function wrapExecResult<T>(value: T, options?: { type?: string; text?: string }): StructuredValue<T> | string {
  if (!isStructuredExecEnabled()) {
    if (isStructuredValue(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    return typeof value === 'string' ? value : String(value);
  }

  return ensureStructuredValue(value, options?.type as any, options?.text);
}

export function wrapPipelineResult<T>(value: T, options?: { type?: string; text?: string }): StructuredValue<T> | string {
  return wrapExecResult(value, options);
}
