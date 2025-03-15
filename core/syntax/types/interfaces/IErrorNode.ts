import { INode } from './INode.js';

/**
 * Interface for error nodes
 */
export interface IErrorNode extends INode {
  type: 'Error';
  message: string;
  stack?: string;
}