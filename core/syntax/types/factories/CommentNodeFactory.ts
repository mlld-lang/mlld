import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  ICommentNode 
} from '@core/syntax/types/interfaces/index.js';
import { NodeFactory } from './NodeFactory.js';

/**
 * Factory for creating comment nodes
 */
@injectable()
@Service({
  description: 'Factory for creating comment nodes'
})
export class CommentNodeFactory {
  /**
   * Creates a new instance of CommentNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create a comment node
   */
  createCommentNode(
    content: string,
    location?: SourceLocation
  ): ICommentNode {
    const baseNode = this.nodeFactory.createNode('Comment', location);
    
    return {
      ...baseNode,
      type: 'Comment',
      content
    };
  }

  /**
   * Check if a node is a comment node
   */
  isCommentNode(node: any): node is ICommentNode {
    return (
      node.type === 'Comment' &&
      typeof node.content === 'string'
    );
  }
}