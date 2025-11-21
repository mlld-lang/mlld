/**
 * Utility for accessing fields on objects/arrays
 */

import { FieldAccessNode } from '@core/types/primitives';
import { FieldAccessError } from '@core/errors';
import { isLoadContentResult, isLoadContentResultURL, isLoadContentResultArray } from '@core/types/load-content';
import type { Variable } from '@core/types/variable/VariableTypes';
import { isVariable } from './variable-resolution';
import { ArrayOperationsHandler } from './array-operations';
import { Environment } from '@interpreter/env/Environment';
import { asData, asText, isStructuredValue } from './structured-value';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';

const STRING_JSON_ACCESSORS = new Set(['data', 'json']);
const STRING_TEXT_ACCESSORS = new Set(['text', 'content']);

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
  /** Optional source location for better error reporting */
  sourceLocation?: SourceLocation;
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
  const VARIABLE_METADATA_PROPS = [
    'type',
    'isComplex',
    'source',
    'metadata',
    'internal',
    'ctx',
    'any',
    'all',
    'none',
    'raw',
    'totalTokens',
    'maxTokens'
  ];

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
  let rawValue = isVariable(value) ? value.value : value;
  const structuredWrapper = isStructuredValue(rawValue) ? rawValue : undefined;
  const structuredCtx = (structuredWrapper?.ctx ?? undefined) as Record<string, unknown> | undefined;
  if (structuredWrapper) {
    rawValue = structuredWrapper.data;
  }
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
      if (structuredWrapper) {
        if (name === 'text') {
          if (
            rawValue &&
            typeof rawValue === 'object' &&
            name in (rawValue as any) &&
            structuredWrapper.ctx?.source !== 'load-content'
          ) {
            accessedValue = (rawValue as any)[name];
          } else {
            accessedValue = asText(structuredWrapper);
          }
          break;
        }
        if (name === 'data') {
          if (rawValue && typeof rawValue === 'object' && name in (rawValue as any)) {
            accessedValue = (rawValue as any)[name];
          } else {
            accessedValue = asData(structuredWrapper);
          }
          break;
        }
        if (name === 'keepStructured') {
          accessedValue = structuredWrapper;
          break;
        }
        if (name === 'keep') {
          accessedValue = structuredWrapper;
          break;
        }
        if (name === 'type') {
          accessedValue = structuredWrapper.type;
          break;
        }
        if (name === 'metadata') {
          accessedValue = structuredWrapper.metadata;
          break;
        }
        if (name === 'ctx') {
          accessedValue = structuredWrapper.ctx;
          break;
        }
        if (
          structuredCtx &&
          typeof structuredCtx === 'object' &&
          name in structuredCtx &&
          structuredCtx[name] !== undefined
        ) {
          accessedValue = structuredCtx[name];
          break;
        }
      }
      if (process.env.MLLD_DEBUG_STRUCTURED === 'true') {
        const debugKeys = typeof rawValue === 'object' && rawValue !== null ? Object.keys(rawValue) : undefined;
        const dataKeys = structuredWrapper && structuredWrapper.data && typeof structuredWrapper.data === 'object'
          ? Object.keys(structuredWrapper.data as Record<string, unknown>)
          : undefined;
        console.error('[field-access]', {
          name,
          rawValueType: typeof rawValue,
          hasStructuredWrapper: Boolean(structuredWrapper),
          keys: debugKeys,
          dataKeys
        });
      }
      if (typeof rawValue === 'string') {
        if (STRING_JSON_ACCESSORS.has(name)) {
          const trimmed = rawValue.trim();
          try {
            accessedValue = JSON.parse(trimmed);
            break;
          } catch {
            const chain = [...(options?.parentPath || []), name];
            throw new FieldAccessError(`String value cannot be parsed as JSON for accessor "${name}"`, {
              baseValue: rawValue,
              fieldAccessChain: [],
              failedAtIndex: Math.max(0, chain.length - 1),
              failedKey: name
            }, { sourceLocation: options?.sourceLocation, env: options?.env });
          }
        }

        if (STRING_TEXT_ACCESSORS.has(name)) {
          accessedValue = rawValue;
          break;
        }
      }

      if (typeof rawValue !== 'object' || rawValue === null) {
        if (
          structuredCtx &&
          typeof structuredCtx === 'object' &&
          name in structuredCtx &&
          structuredCtx[name] !== undefined
        ) {
          accessedValue = structuredCtx[name];
          break;
        }
        const chain = [...(options?.parentPath || []), name];
        const msg = `Cannot access field "${name}" on non-object value (${typeof rawValue})`;
        throw new FieldAccessError(msg, {
          baseValue: rawValue,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, chain.length - 1),
          failedKey: name
        }, { sourceLocation: options?.sourceLocation, env: options?.env });
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
        
        {
          const chain = [...(options?.parentPath || []), name];
          const msg = `Field "${name}" not found in LoadContentResult`;
          throw new FieldAccessError(msg, {
            baseValue: rawValue,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, chain.length - 1),
            failedKey: name
          }, { sourceLocation: options?.sourceLocation, env: options?.env });
        }
      }
      
      // Handle LoadContentResultArray - special case for .content
      if (isLoadContentResultArray(rawValue)) {
        if (name === 'content') {
          // CRITICAL: rawValue might be wrapped in StructuredValue, ensure we have the actual array
          const actualArray = isStructuredValue(rawValue) ? asData(rawValue) : rawValue;
          if (isLoadContentResultArray(actualArray)) {
            accessedValue = actualArray.map(item => item.content).join('\n\n');
          } else {
            accessedValue = rawValue.map(item => item.content).join('\n\n');
          }
          break;
        }
        // Try to access as array property
        const result = (rawValue as any)[name];
        if (result !== undefined) {
          accessedValue = result;
          break;
        }
        {
          const chain = [...(options?.parentPath || []), name];
          const msg = `Field "${name}" not found in LoadContentResultArray`;
          throw new FieldAccessError(msg, {
            baseValue: rawValue,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, chain.length - 1),
            failedKey: name
          }, { sourceLocation: options?.sourceLocation, env: options?.env });
        }
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
          {
            const chain = [...(options?.parentPath || []), name];
            const msg = `Field "${name}" not found in object`;
            throw new FieldAccessError(msg, {
              baseValue: actualValue,
              fieldAccessChain: [],
              failedAtIndex: Math.max(0, chain.length - 1),
              failedKey: name
            }, { sourceLocation: options?.sourceLocation, env: options?.env });
          }
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
          {
            const chain = [...(options?.parentPath || []), name];
            const msg = `Field "${name}" not found in object`;
          throw new FieldAccessError(msg, {
            baseValue: rawValue,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, chain.length - 1),
            failedKey: name
          }, { sourceLocation: options?.sourceLocation, env: options?.env });
          }
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
        if (
          structuredCtx &&
          typeof structuredCtx === 'object' &&
          name in structuredCtx &&
          structuredCtx[name] !== undefined
        ) {
          accessedValue = structuredCtx[name];
          break;
        }
        if (options?.returnUndefinedForMissing) {
          accessedValue = undefined;
          break;
        }
        const chain = [...(options?.parentPath || []), name];
        const availableKeys = rawValue && typeof rawValue === 'object' ? Object.keys(rawValue) : [];
        throw new FieldAccessError(`Field "${name}" not found in object`, {
          baseValue: rawValue,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, chain.length - 1),
          failedKey: name,
          accessPath: chain,
          availableKeys
        }, { sourceLocation: options?.sourceLocation, env: options?.env });
      }
      
      accessedValue = rawValue[name];
      break;
    }
    
    case 'numericField': {
      // Handle numeric property access (obj.123)
      const numKey = String(fieldValue);
      
      if (typeof rawValue !== 'object' || rawValue === null) {
        const chain = [...(options?.parentPath || []), numKey];
        throw new FieldAccessError(`Cannot access numeric field "${numKey}" on non-object value`, {
          baseValue: rawValue,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, chain.length - 1),
          failedKey: numKey,
          accessPath: chain
        });
      }
      
      // Deprecation warning: dot-notation numeric access on arrays (e.g., arr.1)
      // Recommend bracket access instead (arr[1])
      // Historically this path emitted a deprecation warning for array access
      // like obj.0. Property style access is now supported, so we skip the warning.

      // Handle normalized AST objects (must have both type and properties)
      if (rawValue.type === 'object' && rawValue.properties && typeof rawValue.properties === 'object') {
        if (!(numKey in rawValue.properties)) {
          if (options?.returnUndefinedForMissing) {
            accessedValue = undefined;
            break;
          }
          const chain = [...(options?.parentPath || []), numKey];
          throw new FieldAccessError(`Numeric field "${numKey}" not found in object`, {
            baseValue: rawValue,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, chain.length - 1),
            failedKey: numKey,
            accessPath: chain
          });
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
        const chain = [...(options?.parentPath || []), numKey];
        throw new FieldAccessError(`Numeric field "${numKey}" not found in object`, {
          baseValue: rawValue,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, chain.length - 1),
          failedKey: numKey,
          accessPath: chain
        });
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
          const chain = [...(options?.parentPath || []), String(index)];
          throw new FieldAccessError(`Array index ${index} out of bounds (array length: ${items.length})`, {
            baseValue: rawValue,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, chain.length - 1),
            failedKey: index,
            accessPath: chain,
            availableKeys: Array.from({ length: items.length }, (_, i) => String(i))
          });
        }
        accessedValue = items[index];
        break;
      }
      
      // Handle regular arrays
      // CRITICAL: rawValue might itself be a StructuredValue (nested wrapping)
      // We need to unwrap it before array operations
      const arrayData = isStructuredValue(rawValue) ? asData(rawValue) : rawValue;

      if (!Array.isArray(arrayData)) {
        // Try object access with numeric key as fallback
        const numKey = String(fieldValue);
        if (typeof arrayData === 'object' && arrayData !== null) {
          // Handle normalized AST objects (must have both type and properties)
          if (arrayData.type === 'object' && arrayData.properties && typeof arrayData.properties === 'object') {
            if (numKey in arrayData.properties) {
              accessedValue = arrayData.properties[numKey];
              break;
            }
          } else if (numKey in arrayData) {
            accessedValue = arrayData[numKey];
            break;
          }
        }
        {
          const chain = [...(options?.parentPath || []), String(index)];
          const msg = `Cannot access index ${index} on non-array value (${typeof arrayData})`;
          throw new FieldAccessError(msg, {
            baseValue: arrayData,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, chain.length - 1),
            failedKey: index
          });
        }
      }

      if (index < 0 || index >= arrayData.length) {
        const chain = [...(options?.parentPath || []), String(index)];
        const msg = `Array index ${index} out of bounds (length: ${arrayData.length})`;
        throw new FieldAccessError(msg, {
          baseValue: arrayData,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, chain.length - 1),
          failedKey: index
        });
      }

      accessedValue = arrayData[index];
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
        throw new FieldAccessError('Environment required for array filter operations', {
          baseValue: value,
          fieldAccessChain: options?.parentPath || [],
          failedAtIndex: options?.parentPath ? options.parentPath.length : 0,
          failedKey: 'arrayFilter'
        });
      }
      
      accessedValue = await arrayOps.handle(value, field, env!);
      break;
    }

    case 'variableIndex': {
      const env = options?.env;
      if (!env) {
        throw new FieldAccessError('Environment required for variable index resolution', {
          baseValue: value,
          fieldAccessChain: options?.parentPath || [],
          failedAtIndex: options?.parentPath ? options.parentPath.length : 0,
          failedKey: field.value
        });
      }

      const indexVar = env.getVariable(field.value);
      if (!indexVar) {
        throw new FieldAccessError(`Variable not found for index: ${field.value}`, {
          baseValue: value,
          fieldAccessChain: options?.parentPath || [],
          failedAtIndex: options?.parentPath ? options.parentPath.length : 0,
          failedKey: field.value
        });
      }

      const { resolveValue, ResolutionContext } = await import('./variable-resolution');
      const indexValue = await resolveValue(indexVar, env, ResolutionContext.StringInterpolation);
      const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
      return accessField(value, resolvedField, options);
    }
    
    default:
      throw new FieldAccessError(`Unknown field access type: ${(field as any).type}`, {
        baseValue: value,
        fieldAccessChain: options?.parentPath || [],
        failedAtIndex: options?.parentPath ? options.parentPath.length : 0,
        failedKey: String((field as any).type || 'unknown')
      });
  }

  const provenanceSource = parentVariable ?? structuredWrapper ?? value;
  if (provenanceSource) {
    inheritExpressionProvenance(accessedValue, provenanceSource);
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
      env: options?.env,
      sourceLocation: options?.sourceLocation
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
  const internalSource = source ?? result.parentVariable?.source;
  // Create a computed Variable to preserve context
  return {
    type: 'computed',
    name: result.accessPath.join('.'),
    value: result.value,
    internal: {
      source: internalSource,
      parentVariable: result.parentVariable,
      accessPath: result.accessPath,
      fieldAccess: true
    }
  } as Variable;
}
