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