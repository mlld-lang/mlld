/**
 * Type definitions for the if directive
 */

import type { DirectiveNode, BaseMlldNode } from './nodes';

export interface IfBlockNode extends DirectiveNode {
  kind: 'if';
  subtype: 'ifBlock';
  values: {
    condition: BaseMlldNode[];
    then: BaseMlldNode[];
    else?: BaseMlldNode[];
  };
  meta: {
    hasElse?: boolean;
    hasReturn?: boolean;
  };
}

export type IfNode = IfBlockNode;

export function isIfNode(node: DirectiveNode): node is IfNode {
  return node.kind === 'if';
}
