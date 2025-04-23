import { INode } from './INode';

/**
 * Interface for code fence nodes
 */
export interface ICodeFenceNode extends INode {
  type: 'CodeFence';
  content: string;
  language?: string;
}