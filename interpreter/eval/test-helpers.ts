import { asData, isStructuredValue } from '../utils/structured-value';
import type { StructuredValue, StructuredValueMetadata } from '../utils/structured-value';

export interface UnwrappedStructured<T> {
  data: T;
  metadata?: StructuredValueMetadata;
  wrapper?: StructuredValue<T>;
}

export function unwrapStructuredForTest<T>(value: T | StructuredValue<T>): UnwrappedStructured<T> {
  if (isStructuredValue<T>(value)) {
    return {
      data: asData<T>(value),
      metadata: value.metadata,
      wrapper: value
    };
  }

  return {
    data: value as T
  };
}
