/**
 * Base type definitions for Meld AST nodes with structured directive objects
 */
import {
  SourceLocation,
  BaseMeldNode,
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

