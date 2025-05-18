/**
 * Unified node types for the Meld AST
 * This file defines all the base node interfaces used by the parser
 */

import { SourceLocation } from '@core/syntax/types/nodes';

/**
 * Base interface for all Meld nodes
 */
export interface BaseMeldNode {
  type: string;
  nodeId: string;
  location?: SourceLocation;
}

// Re-export base node types from existing locations
// These are the core node types that the parser produces
export { TextNode } from '@core/syntax/types/nodes';
export { DirectiveNode } from '@core/syntax/types/nodes';
export { CodeFenceNode } from '@core/syntax/types/nodes';
export { CommentNode } from '@core/syntax/types/nodes';
export { VariableReferenceNode } from '@core/syntax/types/nodes';
export { LiteralNode } from '@core/syntax/types/nodes';
export { DotSeparatorNode } from '@core/syntax/types/nodes';
export { PathSeparatorNode } from '@core/syntax/types/nodes';