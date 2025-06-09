/**
 * Utility for accessing fields on objects/arrays
 */

import { FieldAccessNode } from '@core/types/primitives';

/**
 * Access a field on an object or array.
 * Handles dot notation (object.field), numeric fields (obj.123), 
 * array indexing (array[0]), and string indexing (obj["key"])
 */
export function accessField(value: any, field: FieldAccessNode): any {
  const fieldValue = field.value;
  
  switch (field.type) {
    case 'field':
    case 'stringIndex': {
      // Both handle string-based property access
      const name = String(fieldValue);
      
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Cannot access field "${name}" on non-object value`);
      }
      
      if (!(name in value)) {
        throw new Error(`Field "${name}" not found in object`);
      }
      
      return value[name];
    }
    
    case 'numericField': {
      // Handle numeric property access (obj.123)
      const numKey = String(fieldValue);
      
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Cannot access numeric field "${numKey}" on non-object value`);
      }
      
      if (!(numKey in value)) {
        throw new Error(`Numeric field "${numKey}" not found in object`);
      }
      
      return value[numKey];
    }
    
    case 'arrayIndex': {
      // Handle array index access (arr[0])
      const index = Number(fieldValue);
      
      if (!Array.isArray(value)) {
        // Try object access with numeric key as fallback
        const numKey = String(fieldValue);
        if (typeof value === 'object' && value !== null && numKey in value) {
          return value[numKey];
        }
        throw new Error(`Cannot access index ${index} on non-array value`);
      }
      
      if (index < 0 || index >= value.length) {
        throw new Error(`Array index ${index} out of bounds (array length: ${value.length})`);
      }
      
      return value[index];
    }
    
    default:
      throw new Error(`Unknown field access type: ${(field as any).type}`);
  }
}