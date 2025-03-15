/**
 * Shared base types with no dependencies
 * 
 * This file is the foundation for breaking circular dependencies in the type system.
 * It contains only primitive types with no imports that other modules can safely depend on.
 * 
 * IMPORTANT: This file must NOT import from any other module to avoid circular dependencies.
 */

// Core node types that everything depends on
export type NodeType = 
  | 'Directive'
  | 'Text'
  | 'CodeFence'
  | 'Comment'
  | 'Error'
  | 'VariableReference';

// Position in a source file
export interface Position {
  line: number;
  column: number;
}

// Location range in a source file
export interface SourceLocation {
  start: Position;
  end: Position;
}

// Base node properties that all AST nodes share
export interface BaseNode {
  type: NodeType;
  location?: SourceLocation;
}

// Directive kinds
export type DirectiveKind = 
  | 'text'
  | 'data'
  | 'define'
  | 'import'
  | 'embed'
  | 'path'
  | 'run';

// Variable reference field types  
export type FieldType = 'field' | 'index';

// Variable reference field
export interface Field {
  type: FieldType;
  value: string | number;
}

// Variable value types
export type VariableType = 
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'undefined'
  | 'function'
  | 'symbol'
  | 'bigint';

// Format operators for variable formatting
export type FormatOperator = 'json' | 'raw' | 'stringify';

// Special path variable constants
export const SPECIAL_PATH_VARS = {
  CURRENT_FILE: '$CURRENT_FILE',
  CURRENT_DIR: '$CURRENT_DIR',
  PROJECT_ROOT: '$PROJECT_ROOT'
};

// Environment variable prefix
export const ENV_VAR_PREFIX = 'ENV.';

// Variable patterns
export const VAR_PATTERNS = {
  VAR_START: '${',
  VAR_END: '}',
  BRACE_START: '{',
  BRACE_END: '}',
  FIELD_ACCESS: '.',
  INDEX_ACCESS_START: '[',
  INDEX_ACCESS_END: ']',
  FORMAT_OPERATOR: '|'
};