import { INode } from './INode.js';

/**
 * Interface for code fence nodes
 */
export interface ICodeFenceNode extends INode {
  type: 'CodeFence';
  content: string;
  language?: string;
}