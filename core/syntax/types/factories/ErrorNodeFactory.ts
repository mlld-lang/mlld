import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  IErrorNode 
} from '@core/syntax/types/interfaces/index.js';
import { NodeFactory } from './NodeFactory.js';

/**
 * Factory for creating error nodes
 */
@injectable()
@Service({
  description: 'Factory for creating error nodes'
})
export class ErrorNodeFactory {
  /**
   * Creates a new instance of ErrorNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create an error node
   */
  createErrorNode(
    message: string,
    stack?: string,
    location?: SourceLocation
  ): IErrorNode {
    const baseNode = this.nodeFactory.createNode('Error', location);
    
    return {
      ...baseNode,
      message,
      ...(stack && { stack })
    };
  }

  /**
   * Check if a node is an error node
   */
  isErrorNode(node: any): node is IErrorNode {
    return (
      node.type === 'Error' &&
      typeof node.message === 'string'
    );
  }
}