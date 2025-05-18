/**
 * Base type definitions for Meld AST nodes with structured directive objects
 */
// TODO: Move these referenced nodes to core/syntax/types
import {
  SourceLocation,
  MeldNode,
  DirectiveSource,
} from '@core/syntax/types/nodes';
import { DirectiveKind, DirectiveSubtype } from '@core/syntax/types/directives';

/**
 * Base directive node with structured values, raw and meta objects
 */
export interface DirectiveNode extends MeldNode {
  type: 'Directive';
  kind: DirectiveKind;
  subtype: DirectiveSubtype;
  /**
   * Source of content for this directive
   */
  source?: DirectiveSource;
  values: { [key: string]: MeldNode[] };
  raw: { [key: string]: string };
  meta: { [key: string]: unknown };
}

/**
 * Generic directive node with a specific kind
 */
export interface TypedDirectiveNode<K extends DirectiveKind, S extends DirectiveSubtype> extends DirectiveNode {
  kind: K;
  subtype: S;
}