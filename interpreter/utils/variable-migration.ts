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
 * Creates a Variable that preserves RenamedContentArray behavior
 */
type RenamedContentOptions = {
  name?: string;
  ctx?: Partial<ArrayVariable['ctx']>;
  internal?: {
    fromGlobPattern?: boolean;
    globPattern?: string;
    fileCount?: number;
  };
  fromGlobPattern?: boolean;
  globPattern?: string;
  fileCount?: number;
};

export function createRenamedContentVariable(
  items: string[],
  options?: RenamedContentOptions
): ArrayVariable {
  const customToString = function() {
    return items.join('\n\n');
  };
  const customToJSON = function() {
    return [...items];
  };
  const baseInternal = {
    arrayType: 'renamed-content',
    joinSeparator: '\n\n',
    customToString,
    customToJSON
  };
  const internalOverrides: Record<string, unknown> = {};
  const internalSource = options?.internal ?? {};
  const legacySource = options ?? {};

  const applyOverride = (
    key: 'fromGlobPattern' | 'globPattern' | 'fileCount',
    source: Record<string, unknown>
  ) => {
    if (Object.prototype.hasOwnProperty.call(source, key) && (source as any)[key] !== undefined) {
      internalOverrides[key] = (source as any)[key];
    }
  };

  applyOverride('fromGlobPattern', internalSource);
  applyOverride('globPattern', internalSource);
  applyOverride('fileCount', internalSource);
  applyOverride('fromGlobPattern', legacySource);
  applyOverride('globPattern', legacySource);
  applyOverride('fileCount', legacySource);

  return {
    type: 'array',
    name: options?.name ?? options?.ctx?.name ?? 'renamed-content',
    value: items,
    source: {
      directive: 'var',
      syntax: 'array',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    ctx: {
      ...options?.ctx
    },
    internal: {
      ...baseInternal,
      ...internalOverrides
    }
  };
}

/**
 * Creates a Variable that preserves LoadContentResultArray behavior
 */
type LoadContentOptions = {
  name?: string;
  ctx?: Partial<ArrayVariable['ctx']>;
  internal?: {
    fromGlobPattern?: boolean;
    globPattern?: string;
    fileCount?: number;
  };
  fromGlobPattern?: boolean;
  globPattern?: string;
  fileCount?: number;
};

export function createLoadContentResultVariable(
  items: LoadContentResult[],
  options?: LoadContentOptions
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
  const internalOverrides: Record<string, unknown> = {};
  const internalSource = options?.internal ?? {};
  const legacySource = options ?? {};

  const applyOverride = (
    key: 'fromGlobPattern' | 'globPattern' | 'fileCount',
    source: Record<string, unknown>
  ) => {
    if (Object.prototype.hasOwnProperty.call(source, key) && (source as any)[key] !== undefined) {
      internalOverrides[key] = (source as any)[key];
    }
  };

  applyOverride('fromGlobPattern', internalSource);
  applyOverride('globPattern', internalSource);
  applyOverride('fileCount', internalSource);
  applyOverride('fromGlobPattern', legacySource);
  applyOverride('globPattern', legacySource);
  applyOverride('fileCount', legacySource);
  
  return {
    type: 'array',
    name: options?.name ?? options?.ctx?.name ?? 'load-content-result',
    value: items,
    source: {
      directive: 'var',
      syntax: 'array',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    ctx: {
      ...options?.ctx
    },
    internal: {
      arrayType: 'load-content-result',
      joinSeparator: '\n\n',
      customToString: toStringFunc,
      customToJSON: toJSONFunc,
      contentGetter: contentGetterFunc,
      ...internalOverrides
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
         variable.internal?.arrayType === 'renamed-content';
}

/**
 * Type guard that checks if a Variable is a LoadContentResultArray Variable
 */
export function isLoadContentResultVariable(variable: Variable): boolean {
  return variable.type === 'array' &&
         variable.internal?.arrayType === 'load-content-result';
}
