import type { TypedDirectiveNode } from './base';
import type { DirectiveNode, SourceLocation } from './primitives';

export interface CheckpointDirectiveValues {
  name: unknown;
}

export interface CheckpointDirectiveRaw {
  name: unknown;
}

export interface CheckpointDirectiveMeta {
  location?: SourceLocation | null;
  checkpointContext?: 'top-level-when-direct' | 'when-action-block' | 'when-expression-action';
}

export type CheckpointDirectiveNode = TypedDirectiveNode<'checkpoint', 'checkpoint'> & {
  values: CheckpointDirectiveValues;
  raw: CheckpointDirectiveRaw & Record<string, unknown>;
  meta: CheckpointDirectiveMeta & Record<string, unknown>;
};

export function isCheckpointDirective(node: DirectiveNode): node is CheckpointDirectiveNode {
  return node.kind === 'checkpoint';
}
