import type { TypedDirectiveNode } from './base';
import type { DirectiveNode, SourceLocation, TimeDurationNode } from './primitives';

export type CheckpointResumeMode = 'auto' | 'manual' | 'never';

export interface CheckpointWithClause {
  resume?: CheckpointResumeMode | string;
  ttl?: TimeDurationNode | string | number;
  complete?: unknown;
  [key: string]: unknown;
}

export interface ActiveCheckpointScope {
  name: string;
  resumeMode?: CheckpointResumeMode;
  ttlMs?: number;
  completeExpression?: unknown;
  hasCompleteCondition: boolean;
}

export interface EffectiveCheckpointPolicy {
  name?: string;
  resumeMode: CheckpointResumeMode;
  ttlMs?: number;
  hasCompleteCondition: boolean;
}

export interface CheckpointDirectiveValues {
  name: unknown;
  withClause?: CheckpointWithClause;
}

export interface CheckpointDirectiveRaw {
  name: unknown;
  withClause?: CheckpointWithClause;
}

export interface CheckpointDirectiveMeta {
  location?: SourceLocation | null;
  checkpointContext?: 'top-level-when-direct' | 'when-action-block' | 'when-expression-action';
  withClause?: CheckpointWithClause;
}

export type CheckpointDirectiveNode = TypedDirectiveNode<'checkpoint', 'checkpoint'> & {
  values: CheckpointDirectiveValues;
  raw: CheckpointDirectiveRaw & Record<string, unknown>;
  meta: CheckpointDirectiveMeta & Record<string, unknown>;
};

export function isCheckpointDirective(node: DirectiveNode): node is CheckpointDirectiveNode {
  return node.kind === 'checkpoint';
}
