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
export * from './when';

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

// Base variable metadata interface
export interface VariableMetadata {
  createdAt?: number;
  modifiedAt?: number;
  definedAt?: any; // SourceLocation
  isImported?: boolean;
  importPath?: string;
  isComplex?: boolean;
}

// Discriminated union for properly typed variables
export type MlldVariable = 
  | TextVariable
  | DataVariable
  | PathVariable
  | CommandVariable
  | ImportVariable;

// Individual variable types with strong typing
export interface TextVariable {
  type: VariableType.TEXT;
  name: string;
  value: string;
  metadata?: VariableMetadata;
}

export interface DataVariable {
  type: VariableType.DATA;
  name: string;
  value: unknown; // Data can be any JSON-serializable value
  metadata?: VariableMetadata;
}

export interface PathVariable {
  type: VariableType.PATH;
  name: string;
  value: {
    resolvedPath: string;
    isURL?: boolean;
    security?: any; // SecurityOptions type if defined
  };
  metadata?: VariableMetadata;
}

// Command definition structure
export interface BaseCommandDefinition {
  type: 'command' | 'commandRef' | 'code';
  paramNames?: string[];
}

export interface CommandTemplateDefinition extends BaseCommandDefinition {
  type: 'command';
  commandTemplate: MlldNode[];
}

export interface CommandRefDefinition extends BaseCommandDefinition {
  type: 'commandRef';
  commandRef: string;
  commandArgs?: MlldNode[];
}

export interface CodeDefinition extends BaseCommandDefinition {
  type: 'code';
  codeTemplate: MlldNode[];
  language?: string;
}

export type CommandDefinition = CommandTemplateDefinition | CommandRefDefinition | CodeDefinition;

export interface CommandVariable {
  type: VariableType.COMMAND;
  name: string;
  value: CommandDefinition;
  metadata?: VariableMetadata;
}

export interface ImportVariable {
  type: VariableType.IMPORT;
  name: string;
  value: {
    source: string;
    imported: string[];
  };
  metadata?: VariableMetadata;
}

// Legacy interface for backward compatibility (deprecated)
/** @deprecated Use discriminated MlldVariable types instead */
export interface LegacyMlldVariable {
  type: VariableType;
  name: string;
  value: any;
  metadata?: VariableMetadata;
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
  metadata?: Partial<VariableMetadata>
): TextVariable {
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
  value: unknown,
  metadata?: Partial<VariableMetadata>
): DataVariable {
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
  value: unknown,
  metadata?: Partial<VariableMetadata>
): DataVariable {
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
  resolvedPath: string,
  options?: {
    isURL?: boolean;
    security?: any;
  },
  metadata?: Partial<VariableMetadata>
): PathVariable {
  return {
    type: VariableType.PATH,
    name,
    value: {
      resolvedPath,
      isURL: options?.isURL || false,
      ...(options?.security && { security: options.security })
    },
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
  commandDef: CommandDefinition,
  metadata?: Partial<VariableMetadata>
): CommandVariable {
  return {
    type: VariableType.COMMAND,
    name,
    value: commandDef,
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ...metadata
    }
  };
}

/**
 * Create an import variable
 */
export function createImportVariable(
  name: string,
  source: string,
  imported: string[],
  metadata?: Partial<VariableMetadata>
): ImportVariable {
  return {
    type: VariableType.IMPORT,
    name,
    value: {
      source,
      imported
    },
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ...metadata
    }
  };
}

// =========================================================================
// TYPE GUARD FUNCTIONS
// =========================================================================

/**
 * Type guard functions for safe runtime type checking
 */
export function isTextVariable(variable: MlldVariable): variable is TextVariable {
  return variable.type === VariableType.TEXT;
}

export function isDataVariable(variable: MlldVariable): variable is DataVariable {
  return variable.type === VariableType.DATA;
}

export function isPathVariable(variable: MlldVariable): variable is PathVariable {
  return variable.type === VariableType.PATH;
}

export function isCommandVariable(variable: MlldVariable): variable is CommandVariable {
  return variable.type === VariableType.COMMAND;
}

export function isImportVariable(variable: MlldVariable): variable is ImportVariable {
  return variable.type === VariableType.IMPORT;
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