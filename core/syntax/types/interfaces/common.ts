import { BaseNode } from '../shared-types.js';

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
}