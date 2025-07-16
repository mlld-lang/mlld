/**
 * Enhanced field access that preserves Variable context
 * Part of Variable Type System refactor
 */

import { FieldAccessNode } from '@core/types/primitives';
import type { Variable } from '@core/types/variable/VariableTypes';
import { isVariable } from './variable-resolution';
import { accessField as accessFieldLegacy } from './field-access';

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
 * Enhanced field access that preserves Variable context
 * 
 * This function wraps the legacy accessField to provide context preservation,
 * allowing us to track where values came from and maintain type information.
 */
export function accessFieldEnhanced(
  value: any,
  field: FieldAccessNode,
  parentPath: string[] = []
): FieldAccessResult {
  // Check if the input is a Variable
  const parentVariable = isVariable(value) ? value : (value as any)?.__variable;
  
  // Special handling for Variable properties
  if (isVariable(value) && field.type === 'field') {
    const fieldName = String(field.value);
    
    // Check if accessing a Variable's own property (e.g., 'type')
    // Only return Variable metadata for specific properties, not general field access
    const variableMetadataProps = ['type', 'isComplex', 'source', 'metadata'];
    if (variableMetadataProps.includes(fieldName)) {
      return {
        value: value[fieldName as keyof typeof value],
        parentVariable,
        accessPath: [...parentPath, fieldName],
        isVariable: false
      };
    }
  }
  
  // Extract the raw value if we have a Variable
  const rawValue = isVariable(value) ? value.value : value;
  
  // Use legacy access to get the raw value
  const accessedValue = accessFieldLegacy(rawValue, field);
  
  // Build the access path
  const fieldName = String(field.value);
  const newPath = [...parentPath, fieldName];
  
  // Check if the accessed value is itself a Variable
  const resultIsVariable = isVariable(accessedValue);
  
  return {
    value: accessedValue,
    parentVariable,
    accessPath: newPath,
    isVariable: resultIsVariable
  };
}

/**
 * Access multiple fields in sequence, preserving context
 */
export function accessFieldsEnhanced(
  value: any,
  fields: FieldAccessNode[],
  initialPath: string[] = []
): FieldAccessResult {
  let current = value;
  let path = initialPath;
  let parentVar = isVariable(value) ? value : undefined;
  
  for (const field of fields) {
    const result = accessFieldEnhanced(current, field, path);
    current = result.value;
    path = result.accessPath;
    
    // Update parent variable if we accessed through a Variable
    if (result.isVariable && isVariable(result.value)) {
      parentVar = result.value;
    }
  }
  
  return {
    value: current,
    parentVariable: parentVar,
    accessPath: path,
    isVariable: isVariable(current)
  };
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
  };
}