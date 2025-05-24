/**
 * Types for variables in Meld grammar
 */

/**
 * Enumeration of variable types used in the new grammar
 */
export enum VariableValueType {
  // Core variable types
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path',
  EXEC = 'exec',
  IMPORT = 'import',
  
  // New universal variable syntax types
  VAR_INTERPOLATION = 'varInterpolation',
  VAR_IDENTIFIER = 'varIdentifier'
}

/**
 * List of all valid variable types that should pass validation
 * This is centralized here to avoid hard-coding in validation logic
 */
export const VALID_VARIABLE_TYPES = [
  // Core types
  'text',
  'data',
  'path',
  'exec',
  'import',
  
  // New universal types
  'varInterpolation',
  'varIdentifier'
];

/**
 * Function to validate if a given string is a valid variable type
 */
export function isValidVariableType(type: string): boolean {
  return VALID_VARIABLE_TYPES.includes(type);
}

/**
 * Interface for fields in a variable reference
 */
export interface Field {
  type: 'field' | 'index';
  value: string | number;
}

/**
 * Create a variable reference node with proper type checking
 */
export function createVariableReferenceNode(
  identifier: string,
  valueType: string,
  fields?: Field[],
  format?: string,
  location?: { start: { line: number; column: number }; end: { line: number; column: number } }
): any {  // Return any for now since we need VariableReferenceNode
  return {
    type: 'VariableReference',
    identifier,
    valueType,
    fields,
    isVariableReference: true,
    nodeId: 'generated-' + Date.now() + '-' + Math.random(),  // Simple ID generation
    ...(format && { format }),
    ...(location && { location })
  };
}