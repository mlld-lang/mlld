import { DirectiveNode, TypedDirectiveNode } from '@grammar/types/base';
import { ContentNodeArray, VariableNodeArray } from '@grammar/types/values';

/**
 * GreetingDirectiveNode
 */
export interface GreetingDirectiveNode extends TypedDirectiveNode<'text', 'textAssignment'> {
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
 * Type guard for GreetingDirectiveNode
 */
export function isGreetingDirectiveNode(node: DirectiveNode): node is GreetingDirectiveNode {
  return node.kind === 'text' && node.subtype === 'textAssignment';
}
