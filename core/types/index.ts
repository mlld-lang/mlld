/**
 * Mlld Core Types
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
export * from './output';

// Import node types for the MlldNode union
import {
  TextNode,
  DirectiveNode,
  CodeFenceNode,
  CommentNode,
  VariableReferenceNode,
  LiteralNode,
  DotSeparatorNode,
  PathSeparatorNode,
  ErrorNode,
  FrontmatterNode,
  NewlineNode,
  SectionMarkerNode,
  SourceLocation
} from './nodes';

/**
 * Unified AST node type - MlldNode
 * 
 * This discriminated union encompasses all possible nodes
 * in the Mlld AST. Each node type has a unique 'type' field
 * that allows TypeScript to narrow types during processing.
 */
export type MlldNode =
  | TextNode 
  | DirectiveNode 
  | CodeFenceNode
  | CommentNode
  | VariableReferenceNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode
  | ErrorNode
  | FrontmatterNode
  | NewlineNode
  | SectionMarkerNode;

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
export interface MlldVariable {
  type: VariableType;
  name: string;
  value: any;
  metadata?: {
    createdAt?: number;
    modifiedAt?: number;
    definedAt?: any; // SourceLocation
    isImported?: boolean;
    importPath?: string;
  };
}

// =========================================================================
// VARIABLE FACTORY FUNCTIONS
// =========================================================================

/**
 * Convert AST SourceLocation (with start/end) to unified SourceLocation format
 */
export function astLocationToSourceLocation(
  astLocation?: { start: Position; end: Position },
  filePath?: string
): SourceLocation | undefined {
  if (!astLocation) return undefined;
  
  return {
    line: astLocation.start.line,
    column: astLocation.start.column,
    offset: astLocation.start.offset,
    filePath
  };
}

/**
 * Create a text variable
 */
export function createTextVariable(
  name: string,
  value: string,
  metadata?: any
): MlldVariable {
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
): MlldVariable {
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
): MlldVariable {
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
): MlldVariable {
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
): MlldVariable {
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

/**
 * Unified source location type that replaces both InterpreterLocation and ErrorSourceLocation.
 * This type serves as the single source of truth for representing source locations
 * throughout the codebase, supporting both precise locations (with line/column) and
 * partial locations (file-only references).
 */
export interface SourceLocation {
  /** The file path where this location occurs */
  filePath?: string;
  /** Line number (1-based) - required for precise locations */
  line?: number;
  /** Column number (1-based) - required for precise locations */
  column?: number;
  /** Byte offset in the file (0-based) - optional for enhanced tooling support */
  offset?: number;
}

/**
 * Creates a precise SourceLocation with line and column information
 */
export function createPreciseLocation(
  line: number,
  column: number,
  filePath?: string,
  offset?: number
): SourceLocation {
  return { filePath, line, column, offset };
}

/**
 * Creates a file-only SourceLocation for references without precise position
 */
export function createFileLocation(filePath: string): SourceLocation {
  return { filePath };
}

/**
 * Type guard to check if a SourceLocation has precise position information
 */
export function isPreciseLocation(location: SourceLocation): location is Required<Pick<SourceLocation, 'line' | 'column'>> & SourceLocation {
  return typeof location.line === 'number' && typeof location.column === 'number';
}

// =========================================================================
// TYPE UTILITIES
// =========================================================================

// Export any additional utilities from sub-modules
export { 
  isDirectiveNode as isDirective,
  isTextNode as isText, 
  isCommentNode as isComment, 
  isCodeFenceNode as isCodeFence,
  isTextNode,
  isDirectiveNode,
  isCommentNode,
  isCodeFenceNode,
  isVariableReferenceNode,
  isLiteralNode
} from './guards';