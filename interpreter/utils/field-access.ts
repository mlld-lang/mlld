/**
 * Utility for accessing fields on objects/arrays
 */

import { FieldAccessNode } from '@core/types/primitives';
import { isLoadContentResult, isLoadContentResultURL, isLoadContentResultArray } from '@core/types/load-content';
import type { Variable } from '@core/types/variable/VariableTypes';
import { isVariable } from './variable-resolution';
import { ArrayOperationsHandler } from './array-operations';
import { Environment } from '@interpreter/env/Environment';

/**
 * Result of field access that preserves context
 */
export interface FieldAccessResult {
  /** The accessed value */
  value: any;
  /** The parent Variable if available */
  parentVariable?: Variable;
  /** The access path taken */
  accessPath: string[];
  /** Whether the value itself is a Variable */
  isVariable: boolean;
}

/**
 * Options for field access
 */
export interface FieldAccessOptions {
  /** Whether to preserve context and return FieldAccessResult */
  preserveContext?: boolean;
  /** Parent path for building access path */
  parentPath?: string[];
  /** Whether to return undefined for missing fields instead of throwing */
  returnUndefinedForMissing?: boolean;
  /** Environment for async operations like filters */
  env?: Environment;
}

/**
 * Access a field on an object or array.
 * Handles dot notation (object.field), numeric fields (obj.123), 
 * array indexing (array[0]), string indexing (obj["key"]),
 * array slicing (array[0:5]), and array filtering (array[?field>100])
 * 
 * Phase 2: Handle normalized AST objects
 * Phase 5: Consolidated with enhanced field access for Variable preservation
 * Phase 6: Added array operations (slice and filter)
 */
export async function accessField(value: any, field: FieldAccessNode, options?: FieldAccessOptions): Promise<any | FieldAccessResult> {
  // CRITICAL: Variable metadata properties whitelist
  // Only these properties access the Variable itself, not its value
  const VARIABLE_METADATA_PROPS = ['type', 'isComplex', 'source', 'metadata'];
  
  // Check if the input is a Variable
  const parentVariable = isVariable(value) ? value : (value as any)?.__variable;
  
  // Special handling for Variable metadata properties
  if (isVariable(value) && field.type === 'field') {
    const fieldName = String(field.value);
    
    if (VARIABLE_METADATA_PROPS.includes(fieldName)) {
      // Return metadata property
      const metadataValue = value[fieldName as keyof typeof value];
      
      if (options?.preserveContext) {
        return {
          value: metadataValue,
          parentVariable: value,
          accessPath: [...(options.parentPath || []), fieldName],
          isVariable: false
        };
      }
      return metadataValue;
    }
  }
  
  // Extract the raw value if we have a Variable
  const rawValue = isVariable(value) ? value.value : value;
  const fieldValue = field.value;
  
  // DEBUG: Log what we're working with
  if (process.env.MLLD_DEBUG === 'true' && String(fieldValue) === 'try') {
    console.log('🔍 FIELD ACCESS PRE-CHECK:', {
      isVar: isVariable(value),
      rawValueType: typeof rawValue,
      rawValueKeys: Object.keys(rawValue || {}),
      rawValueTypeField: rawValue?.type,
      rawValuePropertiesField: rawValue?.properties,
      hasProperties: rawValue?.properties && typeof rawValue.properties === 'object'
    });
  }
  
  // Perform the actual field access
  let accessedValue: any;
  const fieldName = String(fieldValue);
  
  switch (field.type) {
    case 'field':
    case 'stringIndex':
    case 'bracketAccess': {
      // All handle string-based property access
      const name = String(fieldValue);
      
      if (typeof rawValue !== 'object' || rawValue === null) {
        throw new Error(`Cannot access field "${name}" on non-object value`);
      }
      
      // Handle LoadContentResult objects - access metadata properties
      if (isLoadContentResult(rawValue)) {
        // First check if it's a metadata property that exists directly on LoadContentResult
        if (name in rawValue) {
          const result = (rawValue as any)[name];
          if (result !== undefined) {
            accessedValue = result;
            break;
          }
        }
        
        // For JSON files, try to access properties in the parsed JSON
        if (rawValue.json !== undefined) {
          const jsonData = rawValue.json;
          if (jsonData && typeof jsonData === 'object' && name in jsonData) {
            accessedValue = jsonData[name];
            break;
          }
        }
        
        throw new Error(`Field "${name}" not found in LoadContentResult`);
      }
      
      // Handle LoadContentResultArray - special case for .content
      if (isLoadContentResultArray(rawValue)) {
        if (name === 'content') {
          // Return concatenated content
          accessedValue = rawValue.map(item => item.content).join('\n\n');
          break;
        }
        // Try to access as array property
        const result = (rawValue as any)[name];
        if (result !== undefined) {
          accessedValue = result;
          break;
        }
        throw new Error(`Field "${name}" not found in LoadContentResultArray`);
      }
      
      // Handle Variable objects with type 'object' and value field
      if (rawValue.type === 'object' && rawValue.value && !rawValue.properties) {
        // This is a Variable object, access fields in the value
        const actualValue = rawValue.value;
        if (!(name in actualValue)) {
          if (options?.returnUndefinedForMissing) {
            accessedValue = undefined;
            break;
          }
          throw new Error(`Field "${name}" not found in object`);
        }
        accessedValue = actualValue[name];
        break;
      }
      
      // Handle normalized AST objects (must have both type and properties)
      if (rawValue.type === 'object' && rawValue.properties && typeof rawValue.properties === 'object') {
        // Access the properties object for normalized AST objects
        if (!(name in rawValue.properties)) {
          if (options?.returnUndefinedForMissing) {
            accessedValue = undefined;
            break;
          }
          throw new Error(`Field "${name}" not found in object`);
        }
        accessedValue = rawValue.properties[name];
        break;
      }
      
      // DEBUG: Log what we're checking
      if (process.env.MLLD_DEBUG === 'true' && name === 'try') {
        console.log('🔍 FIELD ACCESS DEBUG:', {
          fieldName: name,
          rawValueType: typeof rawValue,
          rawValueKeys: Object.keys(rawValue || {}),
          hasField: name in rawValue,
          fieldValue: rawValue?.[name]
        });
      }
      
      // Handle regular objects (including Variables with type: 'object')
      if (!(name in rawValue)) {
        if (options?.returnUndefinedForMissing) {
          accessedValue = undefined;
          break;
        }
        throw new Error(`Field "${name}" not found in object`);
      }
      
      accessedValue = rawValue[name];
      break;
    }
    
    case 'numericField': {
      // Handle numeric property access (obj.123)
      const numKey = String(fieldValue);
      
      if (typeof rawValue !== 'object' || rawValue === null) {
        throw new Error(`Cannot access numeric field "${numKey}" on non-object value`);
      }
      
      // Handle normalized AST objects (must have both type and properties)
      if (rawValue.type === 'object' && rawValue.properties && typeof rawValue.properties === 'object') {
        if (!(numKey in rawValue.properties)) {
          if (options?.returnUndefinedForMissing) {
            accessedValue = undefined;
            break;
          }
          throw new Error(`Numeric field "${numKey}" not found in object`);
        }
        accessedValue = rawValue.properties[numKey];
        break;
      }
      
      // Handle regular objects
      if (!(numKey in rawValue)) {
        if (options?.returnUndefinedForMissing) {
          accessedValue = undefined;
          break;
        }
        throw new Error(`Numeric field "${numKey}" not found in object`);
      }
      
      accessedValue = rawValue[numKey];
      break;
    }
    
    case 'arrayIndex': {
      // Handle array index access (arr[0])
      const index = Number(fieldValue);
      
      // Handle normalized AST arrays
      if (rawValue && typeof rawValue === 'object' && rawValue.type === 'array' && rawValue.items) {
        const items = rawValue.items;
        if (index < 0 || index >= items.length) {
          throw new Error(`Array index ${index} out of bounds (array length: ${items.length})`);
        }
        accessedValue = items[index];
        break;
      }
      
      // Handle regular arrays
      if (!Array.isArray(rawValue)) {
        // Try object access with numeric key as fallback
        const numKey = String(fieldValue);
        if (typeof rawValue === 'object' && rawValue !== null) {
          // Handle normalized AST objects (must have both type and properties)
          if (rawValue.type === 'object' && rawValue.properties && typeof rawValue.properties === 'object') {
            if (numKey in rawValue.properties) {
              accessedValue = rawValue.properties[numKey];
              break;
            }
          } else if (numKey in rawValue) {
            accessedValue = rawValue[numKey];
            break;
          }
        }
        throw new Error(`Cannot access index ${index} on non-array value`);
      }
      
      if (index < 0 || index >= rawValue.length) {
        throw new Error(`Array index ${index} out of bounds (array length: ${rawValue.length})`);
      }
      
      accessedValue = rawValue[index];
      break;
    }
    
    case 'arraySlice':
    case 'arrayFilter': {
      // Handle array operations (slice and filter)
      const arrayOps = new ArrayOperationsHandler();
      
      // Use the full value (including Variable wrapper if present) for array operations
      // This allows the handler to properly extract and preserve metadata
      const env = options?.env;
      if (!env && field.type === 'arrayFilter') {
        throw new Error('Environment required for array filter operations');
      }
      
      accessedValue = await arrayOps.handle(value, field, env!);
      break;
    }
    
    default:
      throw new Error(`Unknown field access type: ${(field as any).type}`);
  }
  
  // Check if we need to return context-preserving result
  if (options?.preserveContext) {
    const accessPath = [...(options.parentPath || []), fieldName];
    const resultIsVariable = isVariable(accessedValue);
    
    return {
      value: accessedValue,
      parentVariable,
      accessPath,
      isVariable: resultIsVariable
    };
  }
  
  // Return raw value for backward compatibility
  return accessedValue;
}

/**
 * Access multiple fields in sequence, preserving context
 */
export async function accessFields(
  value: any,
  fields: FieldAccessNode[],
  options?: FieldAccessOptions
): Promise<any | FieldAccessResult> {
  let current = value;
  let path = options?.parentPath || [];
  let parentVar = isVariable(value) ? value : undefined;
  
  const shouldPreserveContext = options?.preserveContext !== false;
  
  for (const field of fields) {
    const result = await accessField(current, field, {
      preserveContext: shouldPreserveContext,
      parentPath: path,
      returnUndefinedForMissing: options?.returnUndefinedForMissing,
      env: options?.env
    });
    
    if (shouldPreserveContext) {
      // Update tracking variables
      current = (result as FieldAccessResult).value;
      path = (result as FieldAccessResult).accessPath;
      
      // Update parent variable if we accessed through a Variable
      if ((result as FieldAccessResult).isVariable && isVariable((result as FieldAccessResult).value)) {
        parentVar = (result as FieldAccessResult).value;
      }
    } else {
      // Simple mode - just get the value
      current = result;
    }
  }
  
  if (shouldPreserveContext) {
    return {
      value: current,
      parentVariable: parentVar,
      accessPath: path,
      isVariable: isVariable(current)
    };
  }
  
  return current;
}

/**
 * Create a Variable wrapper for field access results when needed
 */
export function createFieldAccessVariable(
  result: FieldAccessResult,
  source: any
): Variable {
  // If the result is already a Variable, return it
  if (result.isVariable && isVariable(result.value)) {
    return result.value;
  }
  
  // Create a computed Variable to preserve context
  return {
    type: 'computed',
    name: result.accessPath.join('.'),
    value: result.value,
    metadata: {
      source,
      parentVariable: result.parentVariable,
      accessPath: result.accessPath,
      fieldAccess: true
    }
  } as Variable;
}

