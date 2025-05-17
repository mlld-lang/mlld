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