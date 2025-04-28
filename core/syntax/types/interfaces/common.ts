import { BaseNode } from '../shared-types';

// Define the node types
export type NodeType = 
  | 'Directive'
  | 'Text'
  | 'CodeFence'
  | 'Comment'
  | 'Error'
  | 'VariableReference';

/**
 * Position in source code
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * Location in source code
 */
export interface SourceLocation {
  start: Position;
  end: Position;
  filePath?: string;
  source?: string | undefined;
}

/**
 * Describes the location of a node in the source file.
 */
export interface ISourceLocation {
  start: Position;
  end: Position;
  filePath?: string;
  source?: string | undefined;
}

export type NodeId = string;

/**
 * Base interface for all AST nodes.
 * Specific node types should extend this interface.
 */
// Moved INode definition to INode.ts