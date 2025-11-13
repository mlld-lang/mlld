import type { TypedDirectiveNode } from './base';
import type { BaseMlldNode, DirectiveNode, SourceLocation } from './primitives';

export type GuardScope = 'perInput' | 'perOperation';
export type GuardFilterKind = 'data' | 'operation';
export type GuardDecisionType = 'allow' | 'deny' | 'retry' | 'prompt';

export interface GuardFilterNode extends BaseMlldNode {
  type: 'GuardFilter';
  filterKind: GuardFilterKind;
  scope: GuardScope;
  value: string;
  raw: string;
}

export interface GuardActionNode extends BaseMlldNode {
  type: 'GuardAction';
  decision: GuardDecisionType;
  message?: string;
  rawMessage?: string;
  value?: BaseMlldNode[];
}

export interface GuardRuleNode extends BaseMlldNode {
  type: 'GuardRule';
  condition?: BaseMlldNode[];
  isWildcard?: boolean;
  action: GuardActionNode;
}

export interface GuardBlockNode extends BaseMlldNode {
  type: 'GuardBlock';
  modifier?: string;
  rules: GuardRuleNode[];
}

export interface GuardDirectiveValues {
  name?: BaseMlldNode[];
  filter: GuardFilterNode[];
  guard: GuardBlockNode[];
}

export interface GuardDirectiveRaw {
  name?: string;
  filter: string;
  modifier?: string;
}

export interface GuardDirectiveMeta {
  filterKind: GuardFilterKind;
  filterValue: string;
  scope: GuardScope;
  modifier: string;
  ruleCount: number;
  hasName: boolean;
  location?: SourceLocation | null;
}

export type GuardDirectiveNode = TypedDirectiveNode<'guard', 'guard'> & {
  values: GuardDirectiveValues;
  raw: GuardDirectiveRaw & Record<string, unknown>;
  meta: GuardDirectiveMeta & Record<string, unknown>;
};

export function isGuardDirective(node: DirectiveNode): node is GuardDirectiveNode {
  return node.kind === 'guard';
}
