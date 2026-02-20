import type { BaseMlldNode } from './primitives';
import type { DataLabel } from './security';

export type LabelModifierKind =
  | 'add'
  | 'remove'
  | 'trusted'
  | 'untrusted'
  | 'bless'
  | 'clear';

export interface LabelModifierToken {
  kind: LabelModifierKind;
  label?: DataLabel;
}

export interface LabelModificationNode extends BaseMlldNode {
  type: 'LabelModification';
  modifiers: LabelModifierToken[];
  value: BaseMlldNode[];
  raw?: string;
}
