import { asData, isStructuredValue } from '../utils/structured-value';
import type { StructuredValue, StructuredValueContext } from '../utils/structured-value';

export interface UnwrappedStructured<T> {
  data: T;
  ctx?: StructuredValueContext;
  metadata?: StructuredValueContext;
  wrapper?: StructuredValue<T>;
}

export function unwrapStructuredForTest<T>(value: T | StructuredValue<T>): UnwrappedStructured<T> {
  if (isStructuredValue<T>(value)) {
    const ctx = value.ctx;
    return {
      data: asData<T>(value),
      ctx,
      metadata: ctx,
      wrapper: value
    };
  }

  return {
    data: value as T
  };
}
