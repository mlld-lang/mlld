import { INode } from './INode';

/**
 * Interface for comment nodes
 */
export interface ICommentNode extends INode {
  type: 'Comment';
  content: string;
}