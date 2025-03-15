import { INode } from './INode.js';

/**
 * Interface for text nodes
 */
export interface ITextNode extends INode {
  type: 'Text';
  content: string;
}