/**
 * Value Combine Utility
 *
 * Implements the += augmented assignment operator for local scopes.
 * Supports: arrays (concat), strings (append), objects (shallow merge)
 */

import { MlldDirectiveError } from '@core/errors';
import {
  createArrayVariable,
  type Variable,
  type VariableSource
} from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { asText, asData, isStructuredValue } from './structured-value';
import { toNumber } from '../eval/expressions';

const ARRAY_APPEND_ACCUMULATOR = Symbol.for('mlld.arrayAppendAccumulator');

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

function isVariableLike(value: unknown): value is Variable {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    'name' in value &&
    'value' in value &&
    'source' in value
  );
}

function hasComplexContent(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  if (isStructuredValue(value)) {
    return true;
  }

  if (isVariableLike(value)) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some(item => hasComplexContent(item, seen));
  }

  if ('type' in value) {
    return true;
  }

  return Object.values(value).some(item => hasComplexContent(item, seen));
}

function isArrayAppendAccumulator(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    (value as Record<PropertyKey, unknown>)[ARRAY_APPEND_ACCUMULATOR] === true
  );
}

function markArrayAppendAccumulator<T extends unknown[]>(value: T): T {
  try {
    Object.defineProperty(value, ARRAY_APPEND_ACCUMULATOR, {
      value: true,
      enumerable: false,
      configurable: true
    });
  } catch {
    // Frozen arrays still behave correctly; they just fall back to copy-on-write next time.
  }
  return value;
}

function getArrayAppendItems(source: unknown): unknown[] {
  if (isStructuredValue(source)) {
    const sourceData = asData(source);
    return Array.isArray(sourceData) ? sourceData : [source];
  }
  return Array.isArray(source) ? source : [source];
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
  // Array append has to preserve proof-bearing element wrappers. Only unwrap a
  // StructuredValue source when the source itself is an array to be spread.
  const targetValue = isStructuredValue(target) ? asData(target) : target;

  // Array: concat
  if (Array.isArray(targetValue)) {
    const destination = isArrayAppendAccumulator(targetValue)
      ? targetValue
      : markArrayAppendAccumulator([...targetValue]);
    // when-expressions return null on no-match; += null/undefined is a no-op
    // so partition idioms (`let @bucket += when [pred => [@r]]`) work without
    // smearing nulls into the accumulator.
    if (source === null || source === undefined) {
      return destination;
    }
    destination.push(...getArrayAppendItems(source));
    return destination;
  }

  // Unwrap StructuredValue if needed for scalar/object operators.
  const sourceValue = isStructuredValue(source) ? asData(source) : source;

  // Number: add (numeric)
  if (typeof targetValue === 'number') {
    const rhsNumber = toNumber(sourceValue);
    if (Number.isNaN(rhsNumber)) {
      throw new MlldDirectiveError(
        'let',
        `Cannot += non-numeric value to number @${targetName}.`
      );
    }
    return targetValue + rhsNumber;
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
    `+= requires array, number, string, or object target. ` +
    `@${targetName} is ${typeName}.`
  );
}

const LET_ARRAY_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'array',
  hasInterpolation: false,
  isMultiLine: false
};

export function createCombinedAssignmentVariable(
  targetName: string,
  combined: unknown,
  existing: Variable,
  env: Environment
): Variable {
  if (Array.isArray(combined)) {
    return createArrayVariable(
      targetName,
      combined,
      hasComplexContent(combined),
      existing.source ?? LET_ARRAY_SOURCE,
      {
        mx: {
          ...(existing.mx ?? {}),
          importPath: existing.mx?.importPath ?? 'let'
        },
        internal: { ...(existing.internal ?? {}) }
      }
    );
  }

  const importer = new VariableImporter();
  return importer.createVariableFromValue(
    targetName,
    combined,
    'let',
    undefined,
    { env }
  );
}
