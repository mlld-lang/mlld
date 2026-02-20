import type { TypedDirectiveNode } from './base';
import type { BaseMlldNode, DirectiveNode, SourceLocation } from './primitives';

export type HookScope = 'perInput' | 'perOperation' | 'perFunction';
export type HookFilterKind = 'data' | 'operation' | 'function';
export type HookTiming = 'before' | 'after';

export interface HookFilterNode extends BaseMlldNode {
  type: 'HookFilter';
  filterKind: HookFilterKind;
  scope: HookScope;
  value: string;
  raw: string;
  argPattern?: string | null;
}

export interface HookBlockNode extends BaseMlldNode {
  type: 'HookBlock';
  statements: BaseMlldNode[];
  meta?: {
    statementCount?: number;
    hasReturn?: boolean;
  };
}

export type HookBodyNode = BaseMlldNode | HookBlockNode;

export interface HookDirectiveValues {
  name?: BaseMlldNode[];
  filter: HookFilterNode[];
  body: HookBodyNode[];
}

export interface HookDirectiveRaw {
  name?: string;
  filter: string;
  timing: HookTiming;
  argPattern?: string;
}

export interface HookDirectiveMeta {
  filterKind: HookFilterKind;
  filterValue: string;
  scope: HookScope;
  hasName: boolean;
  timing: HookTiming;
  hasArgPattern: boolean;
  bodyKind: 'when' | 'block';
  location?: SourceLocation | null;
}

export type HookDirectiveNode = TypedDirectiveNode<'hook', 'hook'> & {
  values: HookDirectiveValues;
  raw: HookDirectiveRaw & Record<string, unknown>;
  meta: HookDirectiveMeta & Record<string, unknown>;
};

export function isHookDirective(node: DirectiveNode): node is HookDirectiveNode {
  return node.kind === 'hook';
}
