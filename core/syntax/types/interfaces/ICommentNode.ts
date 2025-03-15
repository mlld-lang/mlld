import { INode } from './INode.js';

/**
 * Interface for comment nodes
 */
export interface ICommentNode extends INode {
  type: 'Comment';
  content: string;
}