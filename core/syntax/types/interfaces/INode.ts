import { BaseNode } from '../shared-types.js';
import { SourceLocation } from './common.js';
import { NodeType } from '../nodes';
import { ISourceLocation, NodeId } from './common';

/**
 * Base interface for all AST nodes
 * Extends the minimal BaseNode from shared-types
 */
export interface INode extends BaseNode {
  readonly type: NodeType;
  readonly location: ISourceLocation;
  readonly nodeId: NodeId;
}