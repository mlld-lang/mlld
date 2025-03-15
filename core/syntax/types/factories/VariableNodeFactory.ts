import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { 
  SourceLocation, 
  IVariableReference, 
  VariableType, 
  Field 
} from '@core/syntax/types/interfaces/index.js';
import { NodeFactory } from './NodeFactory.js';

/**
 * Factory for creating variable reference nodes
 */
@injectable()
@Service({
  description: 'Factory for creating variable reference nodes'
})
export class VariableNodeFactory {
  /**
   * Creates a new instance of VariableNodeFactory
   */
  constructor(
    @inject(NodeFactory) private nodeFactory: NodeFactory
  ) {}

  /**
   * Create a variable reference node
   */
  createVariableReferenceNode(
    identifier: string,
    valueType: VariableType,
    fields?: Field[],
    format?: string,
    location?: SourceLocation
  ): IVariableReference {
    // Validate fields if provided
    if (fields && !this.isValidFieldArray(fields)) {
      throw new Error('Invalid fields array provided to createVariableReferenceNode');
    }

    const baseNode = this.nodeFactory.createNode('VariableReference', location);
    
    return {
      ...baseNode,
      type: 'VariableReference',
      identifier,
      valueType,
      fields,
      isVariableReference: true,
      ...(format && { format })
    };
  }

  /**
   * Validate a field array
   */
  isValidFieldArray(fields: any[]): fields is Field[] {
    return fields.every(
      field =>
        field &&
        (field.type === 'field' || field.type === 'index') &&
        (typeof field.value === 'string' || typeof field.value === 'number')
    );
  }

  /**
   * Check if a node is a variable reference node
   */
  isVariableReferenceNode(node: any): node is IVariableReference {
    return (
      node.type === 'VariableReference' &&
      typeof node.identifier === 'string' &&
      typeof node.valueType === 'string'
    );
  }
}