import { NodeType, SourceLocation } from './common.js';

/**
 * Base interface for all AST nodes
 */
export interface INode {
  type: NodeType;
  location?: SourceLocation;
}