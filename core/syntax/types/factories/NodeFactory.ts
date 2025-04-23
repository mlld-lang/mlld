import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { NodeType, SourceLocation, INode } from '@core/syntax/types/interfaces/index';

/**
 * Factory for creating base nodes
 */
@injectable()
@Service({
  description: 'Factory for creating AST nodes'
})
export class NodeFactory {
  /**
   * Create a base node with the specified type and location
   */
  createNode(
    type: NodeType,
    location?: SourceLocation
  ): INode {
    return {
      type,
      location: location || {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 0 }
      }
    };
  }
}