/**
 * Utility for accessing fields on objects/arrays
 */

export interface FieldAccess {
  type: 'field' | 'arrayIndex';
  name?: string;
  index?: number;
}

/**
 * Access a field on an object or array.
 * Handles both dot notation (object.field) and bracket notation (array[0])
 */
export function accessField(value: any, field: FieldAccess): any {
  if (field.type === 'arrayIndex') {
    const index = field.index;
    if (index === undefined) {
      throw new Error('Array index access missing index');
    }
    
    if (!Array.isArray(value)) {
      throw new Error(`Cannot access index ${index} on non-array value`);
    }
    
    if (index < 0 || index >= value.length) {
      throw new Error(`Array index ${index} out of bounds (array length: ${value.length})`);
    }
    
    return value[index];
  } else if (field.type === 'field') {
    const name = field.name;
    if (!name) {
      throw new Error('Field access missing field name');
    }
    
    if (typeof value !== 'object' || value === null) {
      throw new Error(`Cannot access field "${name}" on non-object value`);
    }
    
    if (!(name in value)) {
      throw new Error(`Field "${name}" not found in object`);
    }
    
    return value[name];
  } else {
    throw new Error(`Unknown field access type: ${(field as any).type}`);
  }
}