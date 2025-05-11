import { DirectiveNode, TypedDirectiveNode } from '@grammar/types/base';
import { ContentNodeArray, VariableNodeArray } from '@grammar/types/values';

/**
 * NameDirectiveNode
 */
export interface NameDirectiveNode extends TypedDirectiveNode<'text', 'textAssignment'> {
  values: {
    identifier: string[];
    content: string[];
  };

  raw: {
    identifier: string;
    content: string;
  };

  meta: {
    sourceType: string;
  };
}

/**
 * Type guard for NameDirectiveNode
 */
export function isNameDirectiveNode(node: DirectiveNode): node is NameDirectiveNode {
  return node.kind === 'text' && node.subtype === 'textAssignment';
}
