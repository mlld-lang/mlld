import type { BaseMlldNode, DirectiveNode, VariableReferenceNode } from './primitives';

export type LoopLimitValue = number | VariableReferenceNode | 'endless';

export interface LoopDirective extends DirectiveNode {
  kind: 'loop';
  subtype: 'loop';
  values: {
    limit?: LoopLimitValue | null;
    rateMs?: number | null;
    until?: BaseMlldNode[] | null;
    block: BaseMlldNode[];
  };
  raw: {
    limit?: string | null;
    rateMs?: number | null;
    until?: string | null;
  };
  meta: {
    hasLimit: boolean;
    hasRate: boolean;
    hasUntil: boolean;
    isEndless?: boolean;
    statementCount?: number;
    comment?: unknown;
  };
}

export interface LoopExpression extends BaseMlldNode {
  type: 'LoopExpression';
  limit?: LoopLimitValue | null;
  rateMs?: number | null;
  until?: BaseMlldNode[] | null;
  block: BaseMlldNode[];
  meta: {
    isLoopExpression: true;
    hasLimit: boolean;
    hasRate: boolean;
    hasUntil: boolean;
  };
}

export function isLoopDirective(node: DirectiveNode): node is LoopDirective {
  return node.kind === 'loop';
}

export function isLoopExpression(node: BaseMlldNode): node is LoopExpression {
  return node.type === 'LoopExpression';
}
