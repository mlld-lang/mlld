/**
 * Meld Core Types
 * 
 * Clean export of all types used by the interpreter and API.
 * This is the single source of truth for type definitions.
 */

// =========================================================================
// AST NODE TYPES
// =========================================================================

// Re-export all AST node types and utilities
export * from './base';
export * from './nodes';
export * from './meta';
export * from './values';
export * from './raw';
export * from './guards';
export * from './errors';

// Re-export directive types
export * from './import';
export * from './text';
export * from './add';
export * from './exec';
export * from './path';
export * from './data';
export * from './run';

// Import node types for the MeldNode union
import {
  TextNode,
  DirectiveNode,
  CodeFenceNode,
  CommentNode,
  VariableReferenceNode,
  LiteralNode,
  DotSeparatorNode,
  PathSeparatorNode,
  ErrorNode
} from './nodes';

/**
 * Unified AST node type - MeldNode
 * 
 * This discriminated union encompasses all possible nodes
 * in the Meld AST. Each node type has a unique 'type' field
 * that allows TypeScript to narrow types during processing.
 */
export type MeldNode =
  | TextNode 
  | DirectiveNode 
  | CodeFenceNode
  | CommentNode
  | VariableReferenceNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode
  | ErrorNode;

// =========================================================================
// VARIABLE TYPES
// =========================================================================

// Export variable types and enums
export * from './variables';

// Simple variable type enum for the interpreter
export enum VariableType {
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path',
  COMMAND = 'command',
  IMPORT = 'import'
}

// Base variable interface
export interface MeldVariable {
  type: VariableType;
  name: string;
  value: any;
  metadata?: {
    createdAt?: number;
    modifiedAt?: number;
    definedAt?: any; // SourceLocation
  };
}

// =========================================================================
// VARIABLE FACTORY FUNCTIONS
// =========================================================================

/**
 * Create a text variable
 */
export function createTextVariable(
  name: string,
  value: string,
  metadata?: any
): MeldVariable {
  return {
    type: VariableType.TEXT,
    name,
    value,
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ...metadata
    }
  };
}

/**
 * Create a data variable (JSON value)
 */
export function createDataVariable(
  name: string,
  value: any,
  metadata?: any
): MeldVariable {
  return {
    type: VariableType.DATA,
    name,
    value,
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ...metadata
    }
  };
}

/**
 * Create a complex data variable (with lazy evaluation support)
 */
export function createComplexDataVariable(
  name: string,
  value: any,
  metadata?: any
): MeldVariable {
  return {
    type: VariableType.DATA,
    name,
    value,
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      isComplex: true,
      ...metadata
    }
  };
}

/**
 * Create a path variable
 */
export function createPathVariable(
  name: string,
  value: any, // Can be string or path state object
  metadata?: any
): MeldVariable {
  return {
    type: VariableType.PATH,
    name,
    value,
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ...metadata
    }
  };
}

/**
 * Create a command variable (from @exec directive)
 */
export function createCommandVariable(
  name: string,
  value: any, // Command definition
  metadata?: any
): MeldVariable {
  return {
    type: VariableType.COMMAND,
    name,
    value,
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ...metadata
    }
  };
}

// =========================================================================
// COMMON TYPES
// =========================================================================

/**
 * Source location in a file
 */
export interface Position {
  line: number;
  column: number;
  offset?: number;
}

export interface Location {
  start: Position;
  end: Position;
}

// =========================================================================
// TYPE UTILITIES
// =========================================================================

// Export any additional utilities from sub-modules
export { isDirective, isText, isComment, isCodeFence } from './guards';