/**
 * Variable Proxy System for Shadow Environments
 * Part of Phase 4: System-wide Variable Flow
 * 
 * Creates proxy objects that allow shadow environment code to:
 * 1. Use Variables normally (transparent value access)
 * 2. Introspect type information via special properties
 * 3. Access metadata for advanced use cases
 */

import type { Variable } from '@core/types/variable/VariableTypes';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { wrapLoadContentValue, isFileLoadedValue } from '@interpreter/utils/load-content-structured';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';

function cloneValue<T>(input: T | undefined): T | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(input);
    } catch {
      // Fall through to JSON cloning
    }
  }
  try {
    return JSON.parse(JSON.stringify(input));
  } catch {
    return input;
  }
}

/**
 * Special property names for Variable introspection
 */
export const VARIABLE_PROXY_PROPS = {
  TYPE: '__mlld_type',
  SUBTYPE: '__mlld_subtype',
  METADATA: '__mlld_metadata',
  VARIABLE: '__mlld_variable',
  IS_VARIABLE: '__mlld_is_variable'
} as const;

function unwrapStructuredRecursively(
  value: any,
  seen: WeakMap<object, any> = new WeakMap()
): any {
  if (isStructuredValue(value)) {
    return unwrapStructuredRecursively(asData(value), seen);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const existing = seen.get(value as object);
  if (existing) {
    return existing;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value as object);
  const hasAccessor = Object.values(descriptors).some(
    descriptor => typeof descriptor.get === 'function' || typeof descriptor.set === 'function'
  );
  if (hasAccessor) {
    return value;
  }

  if (Array.isArray(value)) {
    let changed = false;
    const normalized: any[] = new Array(value.length);
    seen.set(value, normalized);
    for (let i = 0; i < value.length; i++) {
      const next = unwrapStructuredRecursively(value[i], seen);
      normalized[i] = next;
      if (next !== value[i]) {
        changed = true;
      }
    }
    if (!changed) {
      seen.set(value, value);
      return value;
    }
    return normalized;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  let changed = false;
  const record = value as Record<string, any>;
  const normalized: Record<string, any> = {};
  seen.set(value, normalized);
  for (const [key, entry] of Object.entries(record)) {
    const next = unwrapStructuredRecursively(entry, seen);
    normalized[key] = next;
    if (next !== entry) {
      changed = true;
    }
  }

  if (!changed) {
    seen.set(value, value);
    return value;
  }

  return normalized;
}

/**
 * Create a proxy for a Variable that allows transparent value access
 * while exposing type information through special properties
 */
export function createVariableProxy(variable: Variable): any {
  let value = variable.value;

  // Unwrap StructuredValue to its .data so the proxy target is the native
  // JS value (array/object). This ensures Array.isArray(), .flat(), .map()
  // etc. all work correctly in js {} blocks.
  // Respect .keep/.keepStructured — when set, preserve the wrapper for
  // metadata access in JS.
  if (isStructuredValue(value) && !(value.internal as any)?.keepStructured) {
    value = unwrapStructuredRecursively(asData(value));
  }

  // Can't proxy primitives (string, number, boolean, null)
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Create proxy for objects and arrays
  return new Proxy(value, {
    get(target, prop, receiver) {
      // Handle special Variable introspection properties
      switch (prop) {
        case VARIABLE_PROXY_PROPS.TYPE:
          return variable.type;
          
        case VARIABLE_PROXY_PROPS.SUBTYPE:
          return variable.subtype;
          
        case VARIABLE_PROXY_PROPS.METADATA:
          return {
            mx: variable.mx,
            internal: variable.internal
          };
          
        case VARIABLE_PROXY_PROPS.VARIABLE:
          return variable;
          
        case VARIABLE_PROXY_PROPS.IS_VARIABLE:
          return true;
          
        // Special handling for toString to preserve custom behavior
        case 'toString':
          const customToString = variable.internal?.customToString;
          if (customToString) {
            // Bind the custom toString to the target
            return customToString.bind(target);
          }
          return Reflect.get(target, prop, receiver);
          
        // Special handling for toJSON
        case 'toJSON':
          const customToJSON = variable.internal?.customToJSON;
          if (customToJSON) {
            return customToJSON;
          }
          return Reflect.get(target, prop, receiver);
          
        default:
          // Resolve nested structured wrappers as properties are accessed.
          return unwrapStructuredRecursively(Reflect.get(target, prop, receiver));
      }
    },
    
    // Preserve normal array/object behavior for other operations
    set(target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver);
    },
    
    has(target, prop) {
      // Report that we have the special properties
      if (Object.values(VARIABLE_PROXY_PROPS).includes(prop as any)) {
        return true;
      }
      return Reflect.has(target, prop);
    },
    
    ownKeys(target) {
      // Don't include special properties in enumeration
      // This keeps JSON.stringify and for...in loops clean
      return Reflect.ownKeys(target);
    },
    
    getOwnPropertyDescriptor(target, prop) {
      // Special properties are non-enumerable
      if (Object.values(VARIABLE_PROXY_PROPS).includes(prop as any)) {
        return {
          configurable: true,
          enumerable: false,
          get: () => this.get!(target, prop, target)
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    }
  });
}

/**
 * Prepare a value for passing to shadow environment
 * Variables become proxies, non-Variables pass through
 */
function recordPrimitiveMetadata(
  target: Record<string, any>,
  key: string,
  metadata: Record<string, any>
): void {
  if (!target.__mlldPrimitiveMetadata) {
    Object.defineProperty(target, '__mlldPrimitiveMetadata', {
      value: {},
      enumerable: false,
      configurable: true
    });
  }
  target.__mlldPrimitiveMetadata[key] = metadata;
}

export function prepareValueForShadow(value: any, key?: string, target?: Record<string, any>): any {
  if (isVariable(value)) {
    if (value.type === 'primitive' || value.type === 'simple-text' || value.type === 'interpolated-text') {
      if (target && key) {
        recordPrimitiveMetadata(target, key, {
          isVariable: true,
          type: value.type,
          subtype: (value as any).primitiveType,
          mx: value.mx,
          internal: value.internal
        });
      }
      return value.value;
    }
    // Handle imported variables with primitive values - return raw value for JS semantics
    if (value.type === 'imported' && 'originalType' in value) {
      const originalType = (value as any).originalType;
      if (originalType === 'simple-text' || originalType === 'primitive') {
        const rawValue = value.value;
        // Return primitives directly so typeof works correctly in JS
        if (typeof rawValue === 'number' || typeof rawValue === 'boolean' || typeof rawValue === 'string') {
          if (target && key) {
            recordPrimitiveMetadata(target, key, {
              isVariable: true,
              type: 'imported',
              subtype: originalType,
              mx: value.mx,
              internal: value.internal
            });
          }
          return rawValue;
        }
      }
    }
    return createVariableProxy(value);
  }

  // Handle file-loaded values (both StructuredValue and legacy LoadContentResult)
  if (isFileLoadedValue(value)) {
    if (isStructuredValue(value)) {
      // StructuredValue with file metadata
      if (target && key) {
        recordPrimitiveMetadata(target, key, {
          isVariable: false,
          type: 'load-content',
          mx: value.mx,
          internal: value.internal,
          text: value.text
        });
      }
      return value.text;
    } else {
      // Legacy LoadContentResult
      if (target && key) {
        recordPrimitiveMetadata(target, key, {
          isVariable: false,
          type: 'load-content',
          mx: undefined,
          internal: undefined
        });
      }
      return (value as any).content;
    }
  }

  // Handle other StructuredValue types
  if (isStructuredValue(value)) {
    // For load-content arrays, use .text (concatenated content)
    if (value.type === 'array') {
      const isLoadContentArray = value.mx?.source === 'load-content' ||
                                   value.metadata?.source === 'load-content';

      if (isLoadContentArray) {
        // Return text for display - preserves concatenation
        if (target && key) {
          recordPrimitiveMetadata(target, key, {
            isVariable: false,
            type: value.type,
            mx: value.mx,
            internal: value.internal,
            text: value.text
          });
        }
        return value.text;
      }
    }

    // For non-load-content structured values, extract data
    const data = unwrapStructuredRecursively(asData(value));
    if (target && key) {
      recordPrimitiveMetadata(target, key, {
        isVariable: false,
        type: value.type,
        mx: value.mx,
        internal: value.internal,
        text: value.text
      });
    }
    return data;
  }
  return unwrapStructuredRecursively(value);
}

/**
 * Prepare parameters object for shadow environment
 * Converts all Variable values to proxies
 */
export function prepareParamsForShadow(params: Record<string, any>): Record<string, any> {
  const shadowParams: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    shadowParams[key] = prepareValueForShadow(value, key, shadowParams);
  }
  
  return shadowParams;
}

/**
 * Helper function for shadow environments to check if a value is a Variable proxy
 */
export function isVariableProxy(value: any): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  
  try {
    // Try to access the special property
    return value[VARIABLE_PROXY_PROPS.IS_VARIABLE] === true;
  } catch {
    return false;
  }
}

/**
 * Helper function to get Variable type from a proxy
 */
export function getVariableType(value: any): string | undefined {
  if (!isVariableProxy(value)) {
    return undefined;
  }
  
  try {
    return value[VARIABLE_PROXY_PROPS.TYPE];
  } catch {
    return undefined;
  }
}

/**
 * Create mlld helper object for shadow environments
 * @param primitiveMetadata - Optional metadata for primitive values that can't be proxied
 */
export function createMlldHelpers(primitiveMetadata?: Record<string, any>) {
  const getProxyVariable = (value: any) => {
    if (isVariableProxy(value)) {
      try {
        return value[VARIABLE_PROXY_PROPS.VARIABLE] as Variable | undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const helpers = {
    // Type checking - also check primitive metadata
    isVariable: (value: any, name?: string) => {
      // First check if it's a proxy
      if (isVariableProxy(value)) {
        return true;
      }
      // Then check if we have metadata for this primitive
      if (name && primitiveMetadata && primitiveMetadata[name]) {
        return primitiveMetadata[name].isVariable === true;
      }
      return false;
    },
    
    getType: (value: any, name?: string) => {
      // First check if it's a proxy
      const proxyType = getVariableType(value);
      if (proxyType !== undefined) {
        return proxyType;
      }
      // Then check primitive metadata
      if (name && primitiveMetadata && primitiveMetadata[name]) {
        return primitiveMetadata[name].type;
      }
      return undefined;
    },
    
    // Property names for direct access
    TYPE: VARIABLE_PROXY_PROPS.TYPE,
    SUBTYPE: VARIABLE_PROXY_PROPS.SUBTYPE,
    METADATA: VARIABLE_PROXY_PROPS.METADATA,
    VARIABLE: VARIABLE_PROXY_PROPS.VARIABLE,
    
    // Metadata helpers - also check primitive metadata
    getCtx: (value: any, name?: string) => {
      const proxyVariable = getProxyVariable(value);
      if (proxyVariable) {
        return cloneValue(proxyVariable.mx);
      }
      if (name && primitiveMetadata && primitiveMetadata[name]) {
        return cloneValue(primitiveMetadata[name].mx);
      }
      return undefined;
    },

    getInternal: (value: any, name?: string) => {
      const proxyVariable = getProxyVariable(value);
      if (proxyVariable) {
        return cloneValue(proxyVariable.internal);
      }
      if (name && primitiveMetadata && primitiveMetadata[name]) {
        return cloneValue(primitiveMetadata[name].internal);
      }
      return undefined;
    },

    getMetadata: (value: any, name?: string) => {
      const mx = helpers.getCtx(value, name);
      const internal = helpers.getInternal(value, name);
      if (!mx && !internal) {
        return undefined;
      }
      return { mx, internal };
    },
    
    // Get subtype - also check primitive metadata
    getSubtype: (value: any, name?: string) => {
      if (isVariableProxy(value)) {
        try {
          return value[VARIABLE_PROXY_PROPS.SUBTYPE];
        } catch {
          return undefined;
        }
      }
      // Check primitive metadata
      if (name && primitiveMetadata && primitiveMetadata[name]) {
        return primitiveMetadata[name].subtype;
      }
      return undefined;
    },
    
    // Get the full Variable object - or reconstruct from metadata
    getVariable: (value: any, name?: string) => {
      const proxyVariable = getProxyVariable(value);
      if (proxyVariable) {
        return proxyVariable;
      }
      if (name && primitiveMetadata && primitiveMetadata[name]) {
        const meta = primitiveMetadata[name];
        return {
          name,
          value,
          type: meta.type,
          subtype: meta.subtype,
          mx: meta.mx || {},
          internal: meta.internal || {},
          isVariable: true
        };
      }
      return undefined;
    }
  } as const;

  return {
    ...helpers,
    mx: helpers.getCtx
  };
}
