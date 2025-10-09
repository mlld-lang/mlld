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
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';
import { isStructuredExecEnabled } from '@interpreter/utils/structured-exec';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';

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

/**
 * Create a proxy for a Variable that allows transparent value access
 * while exposing type information through special properties
 */
export function createVariableProxy(variable: Variable): any {
  const value = variable.value;
  
  // Can't proxy primitives (string, number, boolean, null)
  if (value === null || typeof value !== 'object') {
    // For primitives, we'll need a different strategy
    // Could wrap in an object but that changes behavior
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
          return variable.metadata || {};
          
        case VARIABLE_PROXY_PROPS.VARIABLE:
          return variable;
          
        case VARIABLE_PROXY_PROPS.IS_VARIABLE:
          return true;
          
        // Special handling for toString to preserve custom behavior
        case 'toString':
          if (variable.metadata?.customToString) {
            // Bind the custom toString to the target
            return variable.metadata.customToString.bind(target);
          }
          return Reflect.get(target, prop, receiver);
          
        // Special handling for toJSON
        case 'toJSON':
          if (variable.metadata?.customToJSON) {
            return variable.metadata.customToJSON;
          }
          return Reflect.get(target, prop, receiver);
          
        default:
          // Normal property access
          return Reflect.get(target, prop, receiver);
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
          metadata: value.metadata || {}
        });
      }
      return value.value;
    }
    return createVariableProxy(value);
  }
  if (isStructuredExecEnabled()) {
    if (isLoadContentResult(value) || isLoadContentResultArray(value)) {
      const wrapped = wrapLoadContentValue(value);
      const data = asData(wrapped);
      if (target && key) {
        recordPrimitiveMetadata(target, key, {
          isVariable: false,
          type: wrapped.type,
          metadata: wrapped.metadata || {},
          text: wrapped.text
        });
      }
      return data;
    }
    if (isStructuredValue(value)) {
      const data = asData(value);
      if (target && key) {
        recordPrimitiveMetadata(target, key, {
          isVariable: false,
          type: value.type,
          metadata: value.metadata || {},
          text: value.text
        });
      }
      return data;
    }
  }
  // TODO(Phase7): remove legacy shadow env passthrough.
  return value;
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
  return {
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
    getMetadata: (value: any, name?: string) => {
      if (isVariableProxy(value)) {
        try {
          return value[VARIABLE_PROXY_PROPS.METADATA];
        } catch {
          return undefined;
        }
      }
      // Check primitive metadata
      if (name && primitiveMetadata && primitiveMetadata[name]) {
        return primitiveMetadata[name].metadata || {};
      }
      return undefined;
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
      if (isVariableProxy(value)) {
        try {
          return value[VARIABLE_PROXY_PROPS.VARIABLE];
        } catch {
          return undefined;
        }
      }
      // Check primitive metadata
      if (name && primitiveMetadata && primitiveMetadata[name]) {
        const meta = primitiveMetadata[name];
        // Reconstruct a Variable-like object
        return {
          name,
          value,
          type: meta.type,
          subtype: meta.subtype,
          metadata: meta.metadata,
          isVariable: true
        };
      }
      return undefined;
    }
  };
}
