import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { NodeType, SourceLocation, INode, NodeId } from '@core/syntax/types/interfaces/index';
import { randomUUID } from 'crypto';

/**
 * Factory for creating base nodes
 */
@injectable()
@Service({
  description: 'Factory for creating AST nodes'
})
export class NodeFactory {
  /**
   * Generate a unique node ID
   */
  generateNodeId(): NodeId {
    return randomUUID();
  }

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
      },
      nodeId: this.generateNodeId()
    };
  }
}