/**
 * Consolidated exports for all Meld grammar types
 */

// Base types
export * from './base';

// Node types
export * from './nodes';

// Meta types
export * from './meta';

// Values types
export * from './values';

// Raw types
export * from './raw';

// Directive-specific types
export * from './import';
export * from './text'; // Implemented
export * from './add'; // Renamed from 'embed'
export * from './exec'; // Renamed from 'define'
export * from './path'; // Implemented
export * from './data'; // Implemented
export * from './run'; // Now implemented

// Type guards
export * from './guards';

// Import all node types for the union
import {
  TextNode,
  DirectiveNode,
  CodeFenceNode,
  CommentNode,
  VariableReferenceNode,
  LiteralNode,
  DotSeparatorNode,
  PathSeparatorNode
} from './nodes';

/**
 * Define unified AST node union - MeldNode
 * 
 * This discriminated union encompasses all possible nodes
 * in the Meld AST. Each node type has a unique 'type' field
 * that allows TypeScript to narrow types during processing.
 * 
 * All nodes extend BaseMeldNode and have:
 * - type: string (discriminator)
 * - nodeId: string
 * - location?: SourceLocation
 */
export type MeldNode =
  | TextNode 
  | DirectiveNode 
  | CodeFenceNode
  | CommentNode
  | VariableReferenceNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode;