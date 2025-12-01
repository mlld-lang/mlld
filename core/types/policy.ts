import type { TypedDirectiveNode } from './base';
import type { DirectiveNode, SourceLocation } from './primitives';
import type { TextNode } from './values';

export interface PolicyReferenceNode {
  type: 'ref';
  name: string;
  location?: SourceLocation;
}

export interface PolicyUnionExpression {
  type: 'union';
  args: PolicyReferenceNode[];
  location?: SourceLocation;
}

export interface PolicyDirectiveValues {
  name: TextNode[];
  expr: PolicyUnionExpression;
}

export interface PolicyDirectiveRaw {
  name: string;
  expr: PolicyUnionExpression;
}

export interface PolicyDirectiveMeta {
  location?: SourceLocation | null;
}

export type PolicyDirectiveNode = TypedDirectiveNode<'policy', 'policy'> & {
  values: PolicyDirectiveValues;
  raw: PolicyDirectiveRaw & Record<string, unknown>;
  meta: PolicyDirectiveMeta & Record<string, unknown>;
};

export function isPolicyDirective(node: DirectiveNode): node is PolicyDirectiveNode {
  return node.kind === 'policy';
}
