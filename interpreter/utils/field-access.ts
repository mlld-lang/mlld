/**
 * Utility for accessing fields on objects/arrays
 */

import * as fs from 'fs';
import * as util from 'util';
import { FieldAccessNode } from '@core/types/primitives';
import { FieldAccessError } from '@core/errors';
import { isLoadContentResult, isLoadContentResultURL } from '@core/types/load-content';
import type { Variable } from '@core/types/variable/VariableTypes';
import { isVariable } from './variable-resolution';
import { ArrayOperationsHandler } from './array-operations';
import { Environment } from '@interpreter/env/Environment';
import { asData, asText, isStructuredValue } from './structured-value';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import type { DataObjectValue } from '@core/types/var';

/**
 * Helper to get a field from an object AST node.
 * Handles both new entries format and old properties format.
 */
function getObjectField(obj: any, fieldName: string): any | undefined {
  // New format: entries array
  if (obj.entries && Array.isArray(obj.entries)) {
    for (const entry of obj.entries) {
      if (entry.type === 'pair' && entry.key === fieldName) {
        return entry.value;
      }
    }
    return undefined;
  }

  // Old format: properties record (shouldn't happen with new grammar, but keep for safety)
  if (obj.properties && typeof obj.properties === 'object') {
    return obj.properties[fieldName];
  }

  return undefined;
}

/**
 * Helper to check if an object AST node has a specific field.
 */
function hasObjectField(obj: any, fieldName: string): boolean {
  // New format: entries array
  if (obj.entries && Array.isArray(obj.entries)) {
    return obj.entries.some((entry: any) => entry.type === 'pair' && entry.key === fieldName);
  }

  // Old format: properties record
  if (obj.properties && typeof obj.properties === 'object') {
    return fieldName in obj.properties;
  }

  return false;
}

/**
 * Helper to check if a value is an object AST node.
 */
function isObjectAST(value: any): boolean {
  if (!value || typeof value !== 'object' || value.type !== 'object') {
    return false;
  }

  if (Array.isArray(value.entries)) {
    return value.entries.every(
      (entry: any) =>
        entry &&
        typeof entry === 'object' &&
        ((entry.type === 'pair' && typeof entry.key === 'string' && 'value' in entry) ||
          (entry.type === 'spread' && 'value' in entry))
    );
  }

  return Boolean(value.properties && typeof value.properties === 'object');
}

function isPlainObjectValue(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  if (isObjectAST(value)) {
    return false;
  }
  if (isLoadContentResult(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function createObjectUtilityMxView(
  mx: unknown,
  data: unknown
): unknown {
  if (!mx || typeof mx !== 'object') {
    return mx;
  }
  if (!isPlainObjectValue(data)) {
    return mx;
  }

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);
  const view = Object.create(mx as object) as Record<string, unknown>;
  Object.defineProperty(view, 'keys', {
    value: keys,
    enumerable: true,
    configurable: true
  });
  Object.defineProperty(view, 'values', {
    value: keys.map(key => obj[key]),
    enumerable: true,
    configurable: true
  });
  Object.defineProperty(view, 'entries', {
    value: keys.map(key => [key, obj[key]]),
    enumerable: true,
    configurable: true
  });
  return view;
}

const STRING_JSON_ACCESSORS = new Set(['data', 'json']);
const STRING_TEXT_ACCESSORS = new Set(['text']);

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
    'mx',
    'any',
    'all',
    'none',
    'raw',
    'totalTokens',
    'maxTokens'
  ];

  // Check if the input is a Variable
  const parentVariable = isVariable(value) ? value : (value as any)?.__variable;

  // Extract the raw value if we have a Variable (do this BEFORE metadata check)
  let rawValue = isVariable(value) ? value.value : value;

  const structuredWrapper = isStructuredValue(rawValue) ? rawValue : undefined;
  const structuredCtx = (structuredWrapper?.mx ?? undefined) as Record<string, unknown> | undefined;
  if (structuredWrapper) {
    rawValue = structuredWrapper.data;
  }

  // Special handling for Variable metadata properties
  // IMPORTANT: Check metadata for core properties (.type, .mx, etc.),
  // but allow data precedence for guard quantifiers (.all, .any, .none)
  if (isVariable(value) && field.type === 'field') {
    const fieldName = String(field.value);

    // Core metadata properties always come from Variable, never from data
    const CORE_METADATA = ['isComplex', 'source', 'metadata', 'internal', 'mx', 'raw', 'totalTokens', 'maxTokens'];

    if (CORE_METADATA.includes(fieldName)) {
      const metadataValue = (() => {
        if (fieldName !== 'mx') {
          return value[fieldName as keyof typeof value];
        }

        const baseMx =
          structuredCtx ??
          (isLoadContentResult(rawValue) ? (rawValue as any).mx : undefined) ??
          (value as any).mx;

        return createObjectUtilityMxView(baseMx, rawValue);
      })();

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

    // Properties that check data first, then fall back to Variable metadata
    // For 'type': only check data first for user data containers (object/array),
    // since other Variable types (executable, string, etc.) have internal 'type' fields
    const GUARD_QUANTIFIERS = ['all', 'any', 'none'];
    const isUserDataContainer = value.type === 'object' || value.type === 'array';

    // For 'type' on non-user-data containers, ALWAYS return Variable.type
    // (executables, strings, etc. have internal 'type' fields that shouldn't be exposed)
    if (fieldName === 'type' && !isUserDataContainer) {
      const metadataValue = value.type;
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

    // For guard quantifiers and 'type' on user data containers, check data first
    const shouldCheckDataFirst = GUARD_QUANTIFIERS.includes(fieldName) ||
      (fieldName === 'type' && isUserDataContainer);

    if (shouldCheckDataFirst) {
      // Check if this field exists in the actual data first
      const fieldExistsInData = rawValue && typeof rawValue === 'object' && fieldName in rawValue;

      if (!fieldExistsInData) {
        // Field doesn't exist in data, so return metadata property
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
  }
  const fieldValue = field.value;
  
  // DEBUG: Log what we're working with
  if (process.env.MLLD_DEBUG === 'true' && String(fieldValue) === 'try') {
    console.log('🔍 FIELD ACCESS PRE-CHECK:', {
      isVar: isVariable(value),
      rawValueType: typeof rawValue,
      rawValueKeys: Object.keys(rawValue || {}),
      rawValueTypeField: rawValue?.type,
      isObjectAST: isObjectAST(rawValue)
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
      if (process.env.MLLD_DEBUG_FIX === 'true' && name === 'length') {
        console.error('[field-access] length access', {
          isVariable: isVariable(value),
          rawType: typeof rawValue,
          rawKeys: rawValue && typeof rawValue === 'object' ? Object.keys(rawValue) : null,
          rawValueTypeField: (rawValue as any)?.type
        });
        try {
          const preview =
            Array.isArray(rawValue) && rawValue.length > 0
              ? { isArray: true, length: rawValue.length, first: rawValue[0] }
              : rawValue && typeof rawValue === 'object'
                ? {
                    isArray: Array.isArray(rawValue),
                    sample: util.inspect(rawValue, { depth: 2, breakLength: 120 })
                  }
                : rawValue;
          fs.appendFileSync(
            '/tmp/mlld-debug.log',
            JSON.stringify({
              source: 'field-access',
              field: name,
              isVariable: isVariable(value),
              rawType: typeof rawValue,
              rawKeys: rawValue && typeof rawValue === 'object' ? Object.keys(rawValue) : null,
              rawValueTypeField: (rawValue as any)?.type,
              preview
            }) + '\n'
          );
        } catch {}
      }
      if (structuredWrapper) {
        if (name === 'text') {
          if (
            rawValue &&
            typeof rawValue === 'object' &&
            name in (rawValue as any) &&
            structuredWrapper.mx?.source !== 'load-content'
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
          if (structuredWrapper.internal) {
            (structuredWrapper.internal as Record<string, unknown>).keepStructured = true;
          } else {
            (structuredWrapper as Record<string, unknown>).internal = { keepStructured: true };
          }
          accessedValue = structuredWrapper;
          break;
        }
        if (name === 'keep') {
          if (structuredWrapper.internal) {
            (structuredWrapper.internal as Record<string, unknown>).keepStructured = true;
          } else {
            (structuredWrapper as Record<string, unknown>).internal = { keepStructured: true };
          }
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
        if (name === 'mx') {
          accessedValue = createObjectUtilityMxView(structuredWrapper.mx, rawValue);
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

        // Support .length on strings (like JavaScript)
        if (name === 'length') {
          accessedValue = rawValue.length;
          break;
        }

        // Check if this looks like a JSON string - provide helpful error
        const trimmed = rawValue.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          const chain = [...(options?.parentPath || []), name];
          throw new FieldAccessError(
            `Cannot access field "${name}" on JSON string. Use \`.data.${name}\` or pipe through \`| @json\` first.`,
            {
              baseValue: rawValue,
              fieldAccessChain: [],
              failedAtIndex: Math.max(0, chain.length - 1),
              failedKey: name,
              isJsonString: true
            },
            { sourceLocation: options?.sourceLocation, env: options?.env }
          );
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
      
      // Handle StructuredValue arrays - special case for .text and .length
      if (structuredWrapper && structuredWrapper.type === 'array') {
        // For .text, return the pre-joined text
        if (name === 'text') {
          accessedValue = structuredWrapper.text;
          break;
        }
        // For .length, use the array data
        if (name === 'length') {
          accessedValue = (structuredWrapper.data as any[]).length;
          break;
        }
        // For other properties, try to access on the array itself
        const result = (rawValue as any)[name];
        if (result !== undefined) {
          accessedValue = result;
          break;
        }
        // If property not found, fall through to error handling below
      }
      
      // Handle Variable objects with type 'object' and value field
      if (rawValue.type === 'object' && rawValue.value && !isObjectAST(rawValue)) {
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

      // Handle normalized AST objects (with entries or properties)
      if (isObjectAST(rawValue)) {
        // Access the field using helper that handles both formats
        if (!hasObjectField(rawValue, name)) {
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
        accessedValue = getObjectField(rawValue, name);
        break;
      }

      // Handle normalized AST arrays with direct length access
      if (rawValue && typeof rawValue === 'object' && rawValue.type === 'array' && Array.isArray(rawValue.items)) {
        if (name === 'length') {
          if (process.env.MLLD_DEBUG_FIX === 'true') {
            console.error('[field-access] AST array length', {
              length: rawValue.items.length,
              itemsPreview: rawValue.items.slice(0, 2)
            });
          }
          accessedValue = rawValue.items.length;
          break;
        }
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

      // Handle normalized AST objects (with entries or properties)
      if (isObjectAST(rawValue)) {
        if (!hasObjectField(rawValue, numKey)) {
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
        accessedValue = getObjectField(rawValue, numKey);
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
          // Handle normalized AST objects (with entries or properties)
          if (isObjectAST(arrayData)) {
            if (hasObjectField(arrayData, numKey)) {
              accessedValue = getObjectField(arrayData, numKey);
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

      const { evaluateDataValue } = await import('../eval/data-value-evaluator');
      // Build a VariableReference node when only an identifier string is provided
      const indexNode =
        typeof field.value === 'object'
          ? (field.value as any)
          : {
              type: 'VariableReference',
              valueType: 'varIdentifier',
              identifier: String(field.value)
            };

      const indexValue = await evaluateDataValue(indexNode as any, env);
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
