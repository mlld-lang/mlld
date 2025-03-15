import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  ICodeFenceNode 
} from '@core/syntax/types/interfaces/index.js';
import { NodeFactory } from './NodeFactory.js';

/**
 * Factory for creating code fence nodes
 */
@injectable()
@Service({
  description: 'Factory for creating code fence nodes'
})
export class CodeFenceNodeFactory {
  /**
   * Creates a new instance of CodeFenceNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create a code fence node
   */
  createCodeFenceNode(
    content: string,
    language?: string,
    location?: SourceLocation
  ): ICodeFenceNode {
    const baseNode = this.nodeFactory.createNode('CodeFence', location);
    
    return {
      ...baseNode,
      content,
      ...(language && { language })
    };
  }

  /**
   * Check if a node is a code fence node
   */
  isCodeFenceNode(node: any): node is ICodeFenceNode {
    return (
      node.type === 'CodeFence' &&
      typeof node.content === 'string'
    );
  }
}