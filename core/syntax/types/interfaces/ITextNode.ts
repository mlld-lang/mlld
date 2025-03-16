import { INode } from './INode.js';

/**
 * Interface for text nodes
 */
export interface ITextNode extends INode {
  type: 'Text';
  content: string;
  /**
   * Optional metadata for formatting context preservation
   * Used to maintain proper formatting during transformations
   */
  formattingMetadata?: {
    /** Whether this node was created from a directive transformation */
    isFromDirective?: boolean;
    /** The original node type that created this text node */
    originalNodeType?: string;
    /** Whether to preserve exact formatting of this node */
    preserveFormatting?: boolean;
  };
}