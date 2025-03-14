/**
 * Types of variables supported in Meld
 */
export type VariableType = 'text' | 'data' | 'path';

/**
 * Format operator specification
 * Must follow these rules:
 * - Must be inside ${} or #{} braces
 * - No whitespace around >>
 * - No format chaining (only one format per variable)
 * - Must be the last operation in the variable reference
 * - Only available for text and data variables (not path variables)
 */
export interface FormatOperator {
  /** The format operator token '>>' */
  operator: '>>';
  /** The format specification */
  format: string;
  /** The variable being formatted */
  variable: {
    type: 'text' | 'data';  // Path variables cannot be formatted
    identifier: string;
    field?: string[];  // For data variables only
  };
}

/**
 * Field access in a variable reference
 */
export interface Field {
  type: 'field' | 'index';
  value: string | number;
}

/**
 * Base interface for variable references
 * This is the consolidated type that replaces TextVarNode, DataVarNode, and PathVarNode
 */
export interface VariableReferenceNode {
  type: 'VariableReference';
  identifier: string;
  valueType: VariableType;
  fields?: Field[];
  isVariableReference: true;  // Always true for variable references
  format?: string;  // Optional formatting hint
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/**
 * Type guard to check if a node is a variable reference
 */
export function isVariableReferenceNode(node: any): node is VariableReferenceNode {
  return (
    node &&
    node.type === 'VariableReference' &&
    typeof node.identifier === 'string' &&
    typeof node.isVariableReference === 'boolean' &&
    node.isVariableReference === true &&
    (node.valueType === 'text' || node.valueType === 'data' || node.valueType === 'path')
  );
}

/**
 * Type guard to check if a field array is valid
 */
export function isValidFieldArray(fields: any[]): fields is Field[] {
  return fields.every(
    field =>
      field &&
      (field.type === 'field' || field.type === 'index') &&
      (typeof field.value === 'string' || typeof field.value === 'number')
  );
}

/**
 * Create a variable reference node with proper type checking
 */
export function createVariableReferenceNode(
  identifier: string,
  valueType: VariableType,
  fields?: Field[],
  format?: string,
  location?: { start: { line: number; column: number }; end: { line: number; column: number } }
): VariableReferenceNode {
  // Validate fields if provided
  if (fields && !isValidFieldArray(fields)) {
    throw new Error('Invalid fields array provided to createVariableReferenceNode');
  }

  return {
    type: 'VariableReference',
    identifier,
    valueType,
    fields,
    isVariableReference: true,
    ...(format && { format }),
    ...(location && { location })
  };
}

/**
 * Reference to a variable in the code
 */
export interface VariableReference {
  type: VariableType;
  name: string;
  field?: string[];  // For data variables only
  format?: FormatOperator;   // For text/data variables, must be last operation
}

/**
 * Special path variables
 */
export const SPECIAL_PATH_VARS = {
  HOME: ['$HOMEPATH', '$~'],
  PROJECT: ['$PROJECTPATH', '$.']
} as const;

/**
 * Environment variable prefix
 */
export const ENV_VAR_PREFIX = 'ENV_';

/**
 * Variable reference patterns
 */
export const VAR_PATTERNS = {
  TEXT: /\${([^}]+)}/,
  DATA: /#{([^}]+)}/,
  PATH: /\$([A-Za-z0-9_~]+)/,
  FORMAT: />>\(([^)]+)\)/
} as const; 