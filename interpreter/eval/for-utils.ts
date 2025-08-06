import { isVariable } from '../utils/variable-resolution';

export function toIterable(value: unknown): Iterable<[string | null, unknown]> | null {
  // Handle Variable wrappers first
  if (isVariable(value)) {
    // Recursively handle the wrapped value
    return toIterable(value.value);
  }
  
  // Handle arrays - preserve Variable items
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]); // Use index as key for arrays
  }
  
  // Handle objects
  if (value && typeof value === 'object') {
    return Object.entries(value); // Values may be Variables
  }
  
  // Not iterable
  return null;
}