import { INode } from './INode';

/**
 * Interface for error nodes
 */
export interface IErrorNode extends INode {
  type: 'Error';
  message: string;
  stack?: string;
}