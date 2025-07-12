/**
 * Utility for accessing fields on objects/arrays
 */

import { FieldAccessNode } from '@core/types/primitives';
import { isLoadContentResult, isLoadContentResultURL } from '@core/types/load-content';

/**
 * Access a field on an object or array.
 * Handles dot notation (object.field), numeric fields (obj.123), 
 * array indexing (array[0]), and string indexing (obj["key"])
 * 
 * Phase 2: Handle normalized AST objects
 */
export function accessField(value: any, field: FieldAccessNode): any {
  const fieldValue = field.value;
  
  switch (field.type) {
    case 'field':
    case 'stringIndex':
    case 'bracketAccess': {
      // All handle string-based property access
      const name = String(fieldValue);
      
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Cannot access field "${name}" on non-object value`);
      }
      
      // Handle LoadContentResult objects - access metadata properties
      if (isLoadContentResult(value)) {
        // Try to access the property - getters will be invoked
        const result = (value as any)[name];
        if (result !== undefined) {
          return result;
        }
        throw new Error(`Field "${name}" not found in LoadContentResult`);
      }
      
      // Handle normalized AST objects
      if (value.type === 'object' && value.properties) {
        // Access the properties object for normalized AST objects
        if (!(name in value.properties)) {
          throw new Error(`Field "${name}" not found in object`);
        }
        return value.properties[name];
      }
      
      // Handle regular objects
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
      
      // Handle normalized AST objects
      if (value.type === 'object' && value.properties) {
        if (!(numKey in value.properties)) {
          throw new Error(`Numeric field "${numKey}" not found in object`);
        }
        return value.properties[numKey];
      }
      
      // Handle regular objects
      if (!(numKey in value)) {
        throw new Error(`Numeric field "${numKey}" not found in object`);
      }
      
      return value[numKey];
    }
    
    case 'arrayIndex': {
      // Handle array index access (arr[0])
      const index = Number(fieldValue);
      
      // Handle normalized AST arrays
      if (value && typeof value === 'object' && value.type === 'array' && value.items) {
        const items = value.items;
        if (index < 0 || index >= items.length) {
          throw new Error(`Array index ${index} out of bounds (array length: ${items.length})`);
        }
        return items[index];
      }
      
      // Handle regular arrays
      if (!Array.isArray(value)) {
        // Try object access with numeric key as fallback
        const numKey = String(fieldValue);
        if (typeof value === 'object' && value !== null) {
          // Handle normalized AST objects
          if (value.type === 'object' && value.properties) {
            if (numKey in value.properties) {
              return value.properties[numKey];
            }
          } else if (numKey in value) {
            return value[numKey];
          }
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