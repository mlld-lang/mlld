import type { INode } from './INode';
import { 
  Field as BaseField,
  FormatOperator as BaseFormatOperator,
  SPECIAL_PATH_VARS as BASE_SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX as BASE_ENV_VAR_PREFIX,
  VAR_PATTERNS as BASE_VAR_PATTERNS
} from '../shared-types';
import { VariableType } from '@core/types/variables';

// Re-export core types from shared-types
export type { Field } from '../shared-types';
export type { FormatOperator } from '../shared-types';

/**
 * Format operator specification
 */
export interface ExtendedFormatOperator {
  /** The format operator token '>>' */
  operator: '>>';
  /** The format specification */
  format: string;
  /** The variable being formatted */
  variable: {
    type: VariableType.TEXT | VariableType.DATA;  
    identifier: string;
    field?: string[];  
  };
}

/**
 * Interface for variable reference nodes
 */
export interface IVariableReference extends INode {
  type: 'VariableReference';
  identifier: string;
  valueType: VariableType;
  fields?: BaseField[];
  isVariableReference: true;
  format?: string;
}

/**
 * Special path variables
 * For legacy compatibility, re-export the base constants with local extensions
 */
export const SPECIAL_PATH_VARS = {
  ...BASE_SPECIAL_PATH_VARS,
  HOME: ['$HOMEPATH', '$~'],
  PROJECT: ['$PROJECTPATH', '$.']
} as const;

/**
 * Environment variable prefix
 * Re-export from shared-types for consistency
 */
export const ENV_VAR_PREFIX = BASE_ENV_VAR_PREFIX;

/**
 * Variable reference patterns
 * Extended patterns specific to Meld syntax
 */
export const VAR_PATTERNS = {
  ...BASE_VAR_PATTERNS,
  TEXT: /\${([^}]+)}/,
  DATA: /#{([^}]+)}/,
  PATH: /\$([A-Za-z0-9_~]+)/,
  FORMAT: />>\(([^)]+)\)/
} as const;