/**
 * Main export point for all node types
 */

// Base types
export * from './text';
export * from './directive';
export * from './codefence';
export * from './comment';
export * from './variable';
export * from './literal';
export * from './separators';

// Import all node types for the union
import { TextNode } from './text';
import { DirectiveNode } from './directive';
import { CodeFenceNode } from './codefence';
import { CommentNode } from './comment';
import { Variable, VariableReference } from './variable';
import { LiteralNode } from './literal';
import { DotSeparatorNode, PathSeparatorNode } from './separators';

/**
 * Define union of all node types
 * 
 * This is the main MeldNode type that encompasses all possible nodes
 * in the Meld AST. Uses discriminated union based on the 'type' field.
 */
export type MeldNode =
  | TextNode 
  | DirectiveNode 
  | CodeFenceNode
  | CommentNode
  | Variable
  | VariableReference
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode;

// Export type guards
export * from './guards';