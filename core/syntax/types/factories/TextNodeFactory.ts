import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { 
  SourceLocation, 
  ITextNode 
} from '@core/syntax/types/interfaces/index';
import { NodeFactory } from './NodeFactory';

/**
 * Factory for creating text nodes
 */
@injectable()
@Service({
  description: 'Factory for creating text nodes'
})
export class TextNodeFactory {
  /**
   * Creates a new instance of TextNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create a text node
   */
  createTextNode(
    content: string,
    location?: SourceLocation
  ): ITextNode {
    const baseNode = this.nodeFactory.createNode('Text', location);
    
    return {
      ...baseNode,
      type: 'Text',
      content
    };
  }

  /**
   * Check if a node is a text node
   */
  isTextNode(node: any): node is ITextNode {
    return (
      node.type === 'Text' &&
      typeof node.content === 'string'
    );
  }
}