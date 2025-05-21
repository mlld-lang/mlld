import { BaseMeldNode, SourceLocation } from '@core/types/base';
import { DirectiveKind, DirectiveSubtype } from '@core/ast/types/primitives';

/**
 * Source values for content origin in directives
 */
export type DirectiveSource = 'literal' | 'variable' | 'template' | 'path' | 'command' | 'code' | 'exec' | string;

/**
 * Base directive node with structured values, raw and meta objects
 */
export interface DirectiveNode extends BaseMeldNode {
  type: 'Directive';
  
  // Top-level directive properties
  kind: DirectiveKind;
  subtype: DirectiveSubtype;
  
  // Source of content (where the content originated)
  source?: DirectiveSource;
  
  // Structured values with semantic grouping
  values: { [key: string]: BaseMeldNode[] };
  
  // Raw text segments parallel to values
  raw: { [key: string]: string };
  
  // Metadata and derived information
  meta: { [key: string]: unknown };
  
  // Parsing phase fields
  location?: SourceLocation;
}

/**
 * Generic directive node with a specific kind
 */
export interface TypedDirectiveNode<K extends DirectiveKind, S extends DirectiveSubtype> extends DirectiveNode {
  kind: K;
  subtype: S;
}