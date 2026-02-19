import type { TypedDirectiveNode } from './base';
import type { DirectiveNode, SourceLocation } from './primitives';

export interface CheckpointDirectiveValues {
  name: string;
}

export interface CheckpointDirectiveRaw {
  name: string;
}

export interface CheckpointDirectiveMeta {
  location?: SourceLocation | null;
}

export type CheckpointDirectiveNode = TypedDirectiveNode<'checkpoint', 'checkpoint'> & {
  values: CheckpointDirectiveValues;
  raw: CheckpointDirectiveRaw & Record<string, unknown>;
  meta: CheckpointDirectiveMeta & Record<string, unknown>;
};

export function isCheckpointDirective(node: DirectiveNode): node is CheckpointDirectiveNode {
  return node.kind === 'checkpoint';
}
