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
export * from './security';
export * from './state';
export * from './errors';

// Re-export directive types
export * from './import';
export * from './export';
export * from './show';
export * from './exe';
export * from './path';
export * from './run';
export * from './output';
export * from './when';
export * from './var'; // New unified var directive
export * from './for'; // For loop directive and expression
export * from './guard'; // Guard directives
export * from './policy'; // Policy directives
export * from './load-content'; // Load content types and utilities including URL metadata
export * from './while'; // While directives and stages
export * from './control'; // Control literals (done/continue)

// Parser modes
export * from './mode';

// Import node types for the MlldNode union
import {
  TextNode,
  DirectiveNode,
  CodeFenceNode,
  MlldRunBlockNode,
  CommentNode,
  VariableReferenceNode,
  LiteralNode,
  DotSeparatorNode,
  PathSeparatorNode,
  ErrorNode,
  FrontmatterNode,
  NewlineNode,
  SectionMarkerNode,
  SourceLocation,
  ExecInvocation,
  NegationNode,
  FileReferenceNode,
  BinaryExpression,
  TernaryExpression,
  UnaryExpression,
  TemplateForBlockNode,
  TemplateInlineShowNode
} from './nodes';

// Import WhenExpressionNode
import { WhenExpressionNode } from './when';

// Import ForExpression
import { ForExpression } from './for';

// Import Exe block nodes (used by when-expression actions)
import type { ExeBlockNode, ExeReturnNode } from './exe';

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
  | MlldRunBlockNode
  | CommentNode
  | VariableReferenceNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode
  | ErrorNode
  | FrontmatterNode
  | NewlineNode
  | SectionMarkerNode
  | ExecInvocation
  | NegationNode
  | FileReferenceNode
  | BinaryExpression
  | TernaryExpression
  | UnaryExpression
  | TemplateForBlockNode
  | TemplateInlineShowNode
  | WhenExpressionNode
  | ForExpression
  | ExeBlockNode
  | ExeReturnNode;

// =========================================================================
// VARIABLE TYPES
// =========================================================================

// Export variable types and enums
export * from './variables';
export * from './executable';
// Variable-legacy removed during Phase 6 cleanup
export * from './variable'; // New discriminated union variable system


// Base variable metadata interface
export interface VariableMetadata {
  createdAt?: number;
  modifiedAt?: number;
  definedAt?: SourceLocation;
  isImported?: boolean;
  importPath?: string;
  isComplex?: boolean;
  security?: import('./security').SecurityDescriptor;
  capability?: import('./security').CapabilityContext;
}

// Import ExecutableVariable for the union
import { ExecutableVariable } from './executable';
// Import ExtendedMlldVariable for the extended type guard
import { ExtendedMlldVariable } from './variable';


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


// =========================================================================
// TYPE GUARD FUNCTIONS
// =========================================================================

/**
 * Type guard to check if a variable is using the extended type system
 */
export function isExtendedVariable(variable: unknown): variable is ExtendedMlldVariable {
  return variable !== null && typeof variable === 'object' && 'type' in variable;
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
  isLiteralNode,
  isNegationNode,
  isFileReferenceNode,
  isBinaryExpression,
  isTernaryExpression,
  isUnaryExpression
} from './guards';
