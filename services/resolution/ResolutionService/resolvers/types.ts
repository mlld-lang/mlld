import type { 
  MeldNode, 
  TextNode, 
  VariableReferenceNode, 
  DirectiveNode 
} from '@core/ast/types';
import { 
  isTextNode, 
  isVariableReferenceNode, 
  isDirectiveNode 
} from '@core/ast/types/guards';
import { VariableType } from '@core/types/variables';

/**
 * Represents a field access in a variable reference
 * Examples: object.field, array[0]
 */
export interface Field {
  type: 'field' | 'index';
  value: string | number;
}

/**
 * Text variable reference node
 */
export interface TextVarNode extends VariableReferenceNode {
  valueType: VariableType.TEXT;
}

/**
 * Data variable reference node
 */
export interface DataVarNode extends VariableReferenceNode {
  valueType: VariableType.DATA;
}

/**
 * Type guard for text variable nodes
 */
export function isTextVarNode(node: MeldNode): node is TextVarNode {
  return isVariableReferenceNode(node) && 
         (!('valueType' in node) || node.valueType === VariableType.TEXT);
}

/**
 * Type guard for data variable nodes
 */
export function isDataVarNode(node: MeldNode): node is DataVarNode {
  return isVariableReferenceNode(node) && 
         'valueType' in node && 
         node.valueType === VariableType.DATA;
}

// Re-export the imported type guards for convenience
export { isTextNode, isVariableReferenceNode, isDirectiveNode };