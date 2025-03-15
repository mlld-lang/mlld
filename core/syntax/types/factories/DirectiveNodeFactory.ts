import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  IDirectiveNode,
  DirectiveData,
  DirectiveKind
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
   * Creates a directive node with the specified kind and data
   */
  createDirectiveNode(
    kind: DirectiveKind,
    data: Partial<DirectiveData>,
    location?: SourceLocation
  ): IDirectiveNode {
    return {
      type: 'Directive',
      directive: {
        kind,
        ...data
      },
      location
    };
  }

  /**
   * Checks if a node is a directive node
   */
  isDirectiveNode(node: any): node is IDirectiveNode {
    return node && 
      node.type === 'Directive' && 
      node.directive && 
      typeof node.directive.kind === 'string';
  }
}