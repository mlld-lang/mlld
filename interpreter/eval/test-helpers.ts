import { asData, isStructuredValue } from '../utils/structured-value';
import type { StructuredValue, StructuredValueContext } from '../utils/structured-value';

export interface UnwrappedStructured<T> {
  data: T;
  mx?: StructuredValueContext;
  metadata?: StructuredValueContext;
  wrapper?: StructuredValue<T>;
}

export function unwrapStructuredForTest<T>(value: T | StructuredValue<T>): UnwrappedStructured<T> {
  if (isStructuredValue<T>(value)) {
    const mx = value.mx;
    return {
      data: asData<T>(value),
      mx,
      metadata: mx,
      wrapper: value
    };
  }

  return {
    data: value as T
  };
}
