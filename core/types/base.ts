/**
 * Base type definitions for Mlld AST nodes with structured directive objects
 */
import {
  SourceLocation,
  BaseMlldNode,
  DirectiveNode,
  DirectiveSource,
  DirectiveKind,
  DirectiveSubtype
} from './primitives';

/**
 * Generic directive node with a specific kind
 */
export interface TypedDirectiveNode<K extends DirectiveKind, S extends DirectiveSubtype> extends DirectiveNode {
  kind: K;
  subtype: S;
}

