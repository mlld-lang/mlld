import type { TypedDirectiveNode } from './base';
import type { BaseMlldNode, DirectiveNode, SourceLocation } from './primitives';
import type { LetAssignmentNode } from './when';
import type { DataLabel } from './security';

export type GuardScope = 'perInput' | 'perOperation';
export type GuardFilterKind = 'data' | 'operation';
export type GuardDecisionType = 'allow' | 'deny' | 'retry' | 'prompt' | 'env';
export type GuardTiming = 'before' | 'after' | 'always';

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
  addLabels?: DataLabel[];
  removeLabels?: DataLabel[];
  warning?: string;
}

export interface GuardLabelModifications {
  addLabels?: DataLabel[];
  removeLabels?: DataLabel[];
}

export interface GuardRuleNode extends BaseMlldNode {
  type: 'GuardRule';
  condition?: BaseMlldNode[];
  isWildcard?: boolean;
  action: GuardActionNode;
}

/**
 * Union type for guard block entries (let assignments and guard rules)
 */
export type GuardEntry = GuardRuleNode | LetAssignmentNode;

export interface GuardBlockNode extends BaseMlldNode {
  type: 'GuardBlock';
  modifier?: string;
  rules: GuardEntry[];  // Mixed let assignments and guard rules
}

export interface GuardDirectiveValues {
  name?: BaseMlldNode[];
  filter: GuardFilterNode[];
  guard: GuardBlockNode[];
}

export interface GuardDirectiveRaw {
  name?: string;
  filter: string;
  timing: GuardTiming;
  modifier?: string;
}

export interface GuardDirectiveMeta {
  filterKind: GuardFilterKind;
  filterValue: string;
  scope: GuardScope;
  modifier: string;
  ruleCount: number;
  hasName: boolean;
  timing: GuardTiming;
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

export interface GuardHint {
  guardName: string | null;
  hint: string;
  severity?: 'info' | 'warn';
}

export interface GuardResult {
  guardName: string | null;
  decision: GuardDecisionType;
  reason?: string;
  hint?: GuardHint;
  replacement?: unknown;
  labelModifications?: GuardLabelModifications;
  envConfig?: unknown;
  metadata?: Record<string, unknown>;
  timing?: 'before' | 'after';
}

export interface GuardAggregateDecision {
  decision: 'allow' | 'deny' | 'retry';
  reasons?: string[];
  hints?: GuardHint[];
  transformedInputs?: unknown[];
  guardResults: GuardResult[];
}
