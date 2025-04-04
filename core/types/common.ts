/**
 * Common types shared across Meld services and modules.
 */

// Placeholder for MeldNode - assumed defined elsewhere
import type { MeldNode } from '@core/syntax/types.js';

/**
 * JSON-compatible value types supported in data variables.
 */
export type JsonValue = 
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;

/**
 * JSON object type for data variables.
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * JSON array type for data variables.
 */
export type JsonArray = JsonValue[];

/**
 * Source location information for tracking definitions and operations.
 *
 * @remarks Enhanced based on ParserCore service lead feedback to support
 * more detailed source mapping.
 */
export interface SourceLocation {
  /** File path where the item was defined or originated */
  filePath: string;
  
  /** Line number in the file */
  line: number;
  
  /** Column number in the file */
  column: number;
  
  /** Offset from the start of the file */
  offset?: number;
  
  /** Length of the source text */
  length?: number;
  
  /** Original source text */
  sourceText?: string;
}

/**
 * Generic Result type for non-throwing error handling.
 * 
 * @remarks Added based on ResolutionCore, FileSystemCore, and CoreDirective
 * service lead feedback to enable more explicit error flows without excessive
 * try/catch blocks.
 */
export interface Result<T, E = Error> {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** The value if the operation succeeded */
  value?: T;
  
  /** The error if the operation failed */
  error?: E;
}

/**
 * Create a successful result.
 */
export const success = <T, E = Error>(value: T): Result<T, E> => ({
  success: true,
  value
});

/**
 * Create a failed result.
 */
export const failure = <T, E = Error>(error: E): Result<T, E> => ({
  success: false,
  error
});

/**
 * Node replacement result from directive handlers.
 * 
 * @remarks Added based on InterpreterCore service lead feedback to formalize
 * the directive handler replacement pattern.
 */
export interface DirectiveReplacement {
  /** Nodes to replace the directive with */
  nodes: MeldNode[];
  
  /** Whether the replacement should be transformed */
  shouldTransform: boolean;
  
  /** Whether to include the replacement in the output */
  includeInOutput: boolean;
  
  /** Metadata about the replacement */
  metadata?: Record<string, unknown>;
}

/**
 * Types of string literals to parse.
 * 
 * @remarks Added based on ContentResolution service lead feedback to support
 * string literal validation and parsing.
 */
export enum StringLiteralType {
  // Add specific types if needed based on future parsing requirements
  SINGLE_QUOTED = 'single',
  DOUBLE_QUOTED = 'double',
  BACKTICK = 'backtick'
} 