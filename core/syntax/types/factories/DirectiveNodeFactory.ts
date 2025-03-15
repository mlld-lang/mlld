import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  IDirectiveNode,
  DirectiveData,
  DirectiveKindString
} from '@core/syntax/types/interfaces/index.js';
import { NodeFactory } from './NodeFactory.js';

/**
 * Factory for creating directive nodes
 */
@injectable()
@Service({
  description: 'Factory for creating directive nodes'
})
export class DirectiveNodeFactory {
  /**
   * Creates a new instance of DirectiveNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create a directive node
   */
  createDirectiveNode(
    kind: DirectiveKindString,
    data: Partial<DirectiveData>,
    location?: SourceLocation
  ): IDirectiveNode {
    const baseNode = this.nodeFactory.createNode('Directive', location);
    
    return {
      ...baseNode,
      directive: {
        kind,
        ...data
      }
    };
  }

  /**
   * Check if a node is a directive node
   */
  isDirectiveNode(node: any): node is IDirectiveNode {
    return (
      node.type === 'Directive' &&
      node.directive &&
      typeof node.directive.kind === 'string'
    );
  }
}