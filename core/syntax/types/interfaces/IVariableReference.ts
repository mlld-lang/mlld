import { INode } from './INode.js';

/**
 * Types of variables supported in Meld
 */
export type VariableType = 'text' | 'data' | 'path';

/**
 * Field access in a variable reference
 */
export interface Field {
  type: 'field' | 'index';
  value: string | number;
}

/**
 * Format operator specification
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
 * Interface for variable reference nodes
 */
export interface IVariableReference extends INode {
  type: 'VariableReference';
  identifier: string;
  valueType: VariableType;
  fields?: Field[];
  isVariableReference: true;
  format?: string;
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