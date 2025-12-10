import type { DirectiveNode } from './nodes';
import type { VariableReferenceNode } from './primitives';
import type { WithClause } from './run';

export interface WhileDirective extends DirectiveNode {
  kind: 'while';
  subtype: 'while';
  values: {
    cap: number;
    processor: VariableReferenceNode[];
    rateMs?: number | null;
    tail?: WithClause;
  };
  raw: {
    cap: number;
    processor: string;
    rateMs?: number;
    tail?: WithClause;
  };
  meta: {
    hasCap: true;
    hasRate: boolean;
    parallel?: { parallel?: number; delayMs?: number } | null;
    comment?: unknown;
  };
}

export function isWhileDirective(node: DirectiveNode): node is WhileDirective {
  return node.kind === 'while';
}
