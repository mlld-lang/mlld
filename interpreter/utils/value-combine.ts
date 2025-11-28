/**
 * Value Combine Utility
 *
 * Implements the += augmented assignment operator for local scopes.
 * Supports: arrays (concat), strings (append), objects (shallow merge)
 */

import { MlldDirectiveError } from '@core/errors';
import { asText, asData, isStructuredValue } from './structured-value';

/**
 * Check if a value is a plain object (not null, not array, not special type)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Combine values for += operation
 *
 * Rules:
 * - Array += value: appends value (or spreads if value is array)
 * - String += value: appends string representation
 * - Object += object: shallow merge (later wins)
 *
 * @param target - The current value of the local variable
 * @param source - The value to combine with
 * @param targetName - Variable name for error messages
 * @returns The combined value
 */
export function combineValues(
  target: unknown,
  source: unknown,
  targetName: string
): unknown {
  // Unwrap StructuredValue if needed
  const targetValue = isStructuredValue(target) ? asData(target) : target;
  const sourceValue = isStructuredValue(source) ? asData(source) : source;

  // Array: concat
  if (Array.isArray(targetValue)) {
    // If source is array, spread it; otherwise wrap as single item
    const sourceArray = Array.isArray(sourceValue) ? sourceValue : [sourceValue];
    return [...targetValue, ...sourceArray];
  }

  // String: append
  if (typeof targetValue === 'string') {
    return targetValue + asText(sourceValue);
  }

  // Object: shallow merge
  if (isPlainObject(targetValue)) {
    if (!isPlainObject(sourceValue)) {
      const typeName = Array.isArray(sourceValue) ? 'array' : typeof sourceValue;
      throw new MlldDirectiveError(
        'let',
        `Cannot += non-object to object @${targetName}. ` +
        `Target is object, source is ${typeName}.`
      );
    }
    return { ...targetValue, ...sourceValue };
  }

  // Unsupported type
  const typeName = targetValue === null ? 'null' : typeof targetValue;
  throw new MlldDirectiveError(
    'let',
    `+= requires array, string, or object target. ` +
    `@${targetName} is ${typeName}.`
  );
}
