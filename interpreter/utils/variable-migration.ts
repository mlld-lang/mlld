/**
 * Helper utilities for migrating from special array classes to Variables
 * while preserving all special behaviors
 */

import type { Variable, ArrayVariable } from '@core/types/variable/VariableTypes';
import type { LoadContentResult } from '@core/types/load-content';

/**
 * Extracts the value from a Variable while preserving special behaviors
 * through metadata. This allows us to migrate away from special classes
 * while maintaining backward compatibility.
 */
export function extractVariableValue(variable: Variable): any {
  let value = variable.value;
  
  // For arrays with custom toString behavior
  if (variable.type === 'array' && variable.metadata?.customToString) {
    if (Array.isArray(value)) {
      // Preserve the custom toString method
      Object.defineProperty(value, 'toString', {
        value: variable.metadata.customToString,
        enumerable: false,
        configurable: true
      });
    }
  }
  
  // For arrays with custom toJSON behavior
  if (variable.type === 'array' && variable.metadata?.customToJSON) {
    if (Array.isArray(value)) {
      Object.defineProperty(value, 'toJSON', {
        value: variable.metadata.customToJSON,
        enumerable: false,
        configurable: true
      });
    }
  }
  
  // For LoadContentResultArray, add the content getter
  if (variable.type === 'array' && variable.metadata?.contentGetter) {
    if (Array.isArray(value)) {
      Object.defineProperty(value, 'content', {
        get: variable.metadata.contentGetter,
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
 * Creates a Variable that preserves RenamedContentArray behavior
 */
export function createRenamedContentVariable(
  items: string[], 
  metadata?: Partial<ArrayVariable['metadata']>
): ArrayVariable {
  return {
    type: 'array',
    name: metadata?.name || 'renamed-content',
    value: items,
    source: {
      directive: 'var',
      syntax: 'array',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {
      arrayType: 'renamed-content',
      joinSeparator: '\n\n',
      customToString: function() { return items.join('\n\n'); },
      customToJSON: function() { return [...items]; },
      ...metadata
    }
  };
}

/**
 * Creates a Variable that preserves LoadContentResultArray behavior
 */
export function createLoadContentResultVariable(
  items: LoadContentResult[], 
  metadata?: Partial<ArrayVariable['metadata']>
): ArrayVariable {
  // Define the functions outside to avoid circular references
  const toStringFunc = function() {
    return items.map(item => item.content).join('\n\n');
  };
  
  const toJSONFunc = function() {
    return items.map(item => item.toJSON());
  };
  
  const contentGetterFunc = function() {
    return items.map(item => item.content).join('\n\n');
  };
  
  return {
    type: 'array',
    name: metadata?.name || 'load-content-result',
    value: items,
    source: {
      directive: 'var',
      syntax: 'array',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {
      arrayType: 'load-content-result',
      joinSeparator: '\n\n',
      customToString: toStringFunc,
      customToJSON: toJSONFunc,
      contentGetter: contentGetterFunc,
      ...metadata
    }
  };
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

/**
 * Type guard that checks if a Variable is a RenamedContentArray Variable
 */
export function isRenamedContentVariable(variable: Variable): boolean {
  return variable.type === 'array' && 
         variable.metadata?.arrayType === 'renamed-content';
}

/**
 * Type guard that checks if a Variable is a LoadContentResultArray Variable
 */
export function isLoadContentResultVariable(variable: Variable): boolean {
  return variable.type === 'array' && 
         variable.metadata?.arrayType === 'load-content-result';
}