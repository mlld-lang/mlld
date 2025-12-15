/**
 * Helper utilities for migrating from special array classes to Variables
 * while preserving all special behaviors
 */

import type { Variable } from '@core/types/variable/VariableTypes';

/**
 * Extracts the value from a Variable while preserving special behaviors
 * through metadata. This allows us to migrate away from special classes
 * while maintaining backward compatibility.
 */
export function extractVariableValue(variable: Variable): any {
  let value = variable.value;
  
  // For arrays with custom toString behavior
  const internalMeta = variable.internal as Record<string, unknown> | undefined;
  const customToString =
    (internalMeta?.customToString as (() => string) | undefined);
  if (variable.type === 'array' && customToString) {
    if (Array.isArray(value)) {
      // Preserve the custom toString method
      Object.defineProperty(value, 'toString', {
        value: customToString,
        enumerable: false,
        configurable: true
      });
    }
  }
  
  // For arrays with custom toJSON behavior
  const customToJSON =
    (internalMeta?.customToJSON as (() => unknown) | undefined);
  if (variable.type === 'array' && customToJSON) {
    if (Array.isArray(value)) {
      Object.defineProperty(value, 'toJSON', {
        value: customToJSON,
        enumerable: false,
        configurable: true
      });
    }
  }
  
  // For LoadContentResultArray, add the content getter
  const contentGetter =
    (internalMeta?.contentGetter as (() => string) | undefined);
  if (variable.type === 'array' && contentGetter) {
    if (Array.isArray(value)) {
      Object.defineProperty(value, 'content', {
        get: contentGetter,
        enumerable: false,
        configurable: true
      });
    }
  }
  
  // Tag the value with the original Variable for type recovery
  // This allows type guards to check metadata instead of using instanceof
  if (value !== null && typeof value === 'object') {
    Object.defineProperty(value, '__variable', {
      value: variable,
      enumerable: false,
      configurable: true,
      writable: false
    });
  }
  
  return value;
}


/**
 * Helper to check if a value has Variable metadata attached
 */
export function hasVariableMetadata(value: unknown): value is { __variable: Variable } {
  return value !== null && 
         typeof value === 'object' && 
         '__variable' in value &&
         typeof (value as any).__variable === 'object';
}

/**
 * Helper to get Variable metadata from a tagged value
 */
export function getVariableMetadata(value: unknown): Variable | undefined {
  if (hasVariableMetadata(value)) {
    return value.__variable;
  }
  return undefined;
}

