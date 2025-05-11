import { DirectiveNode, TypedDirectiveNode } from '@grammar/types/base';
import { ContentNodeArray, VariableNodeArray } from '@grammar/types/values';

/**
 * DirectiveNode
 */
export interface DirectiveNode extends TypedDirectiveNode<'add', 'addTemplate'> {
  values: {
    identifier: any[];
    content: any[];
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
 * Type guard for DirectiveNode
 */
export function isDirectiveNode(node: DirectiveNode): node is DirectiveNode {
  return node.kind === 'add' && node.subtype === 'addTemplate';
}
