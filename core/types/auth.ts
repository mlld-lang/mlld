import type { TypedDirectiveNode } from './base';
import type { DirectiveNode, SourceLocation } from './primitives';
import type { TextNode } from './values';

export interface AuthDirectiveValues {
  name: TextNode[];
  expr: unknown;
}

export interface AuthDirectiveRaw {
  name: string;
  expr: unknown;
}

export interface AuthDirectiveMeta {
  location?: SourceLocation | null;
}

export type AuthDirectiveNode = TypedDirectiveNode<'auth', 'auth'> & {
  values: AuthDirectiveValues;
  raw: AuthDirectiveRaw & Record<string, unknown>;
  meta: AuthDirectiveMeta & Record<string, unknown>;
};

export function isAuthDirective(node: DirectiveNode): node is AuthDirectiveNode {
  return node.kind === 'auth';
}
