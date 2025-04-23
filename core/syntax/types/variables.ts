import type { MeldNode } from '@core/syntax/types/index';

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
export interface VariableReferenceNode extends MeldNode {
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
 * Check if a node is a variable reference node
 * This includes both the new VariableReference type and legacy variable types
 */
export function isVariableReferenceNode(node: MeldNode): node is VariableReferenceNode {
  // Only check for new VariableReference type
  const n = node as any;
  return (
    n.type === 'VariableReference' &&
    typeof n.identifier === 'string' &&
    typeof n.valueType === 'string'
  );

  // // Check for legacy TextVar nodes
  // if (
  //   node.type === 'TextVar' &&
  //   'value' in node &&
  //   typeof node.value === 'string'
  // ) {
  //   return true;
  // }

  // // Check for legacy DataVar nodes
  // if (
  //   node.type === 'DataVar' &&
  //   'value' in node &&
  //   typeof node.value === 'string'
  // ) {
  //   return true;
  // }

  // // Check for legacy PathVar nodes
  // if (
  //   node.type === 'PathVar' &&
  //   'value' in node &&
  //   typeof node.value === 'string'
  // ) {
  //   return true;
  // }

  // return false;
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
    nodeId: crypto.randomUUID(),
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
 * Legacy TextVarNode type for compatibility with meld-ast.
 * @deprecated Use VariableReferenceNode with valueType: 'text' instead
 */
// export interface TextVarNode {
//   type: 'TextVar';
//   value: string;
//   fields?: Field[];
//   location?: Location;
// }

/**
 * Legacy DataVarNode type for compatibility with meld-ast.
 * @deprecated Use VariableReferenceNode with valueType: 'data' instead
 */
// export interface DataVarNode {
//   type: 'DataVar';
//   value: string;
//   fields?: Field[];
//   location?: Location;
// }

/**
 * Legacy PathVarNode type for compatibility with meld-ast.
 * @deprecated Use VariableReferenceNode with valueType: 'path' instead
 */
// export interface PathVarNode {
//   type: 'PathVar';
//   value: string;
//   location?: Location;
// }

/**
 * Convert a legacy variable node to the new VariableReferenceNode type
 * @deprecated Remove once all code is updated to use VariableReferenceNode
 */
// export function convertLegacyVariableNode(node: TextVarNode | DataVarNode | PathVarNode): VariableReferenceNode {
//   const valueType = 
//     node.type === 'TextVar' ? 'text' :
//     node.type === 'DataVar' ? 'data' : 'path';

//   const fields = [];
//   if (node.type === 'DataVar') {
//     fields.push(...(node.fields || []));
//   } else if (node.type === 'TextVar' && node.fields) {
//     fields.push(...node.fields);
//   }

//   return {
//     type: 'VariableReference',
//     identifier: node.value,
//     valueType,
//     fields,
//     location: node.location
//   };
// }

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