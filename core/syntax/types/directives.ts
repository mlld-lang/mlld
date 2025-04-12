import { DirectiveNode, DirectiveData } from '@core/syntax/types/nodes.js';
import type { MeldNode, TextNode, VariableReferenceNode } from '@core/syntax/types/nodes.js';
import type { StructuredPath } from '@core/syntax/types/nodes.js';

export type DirectiveKind = 
  | 'run'
  | 'import'
  | 'embed'
  | 'define'
  | 'text'
  | 'path'
  | 'data';

/**
 * Risk level for commands
 */
export type RiskLevel = 'high' | 'med' | 'low';

/**
 * Import directive data
 */
export interface ImportDirectiveData extends DirectiveData {
  kind: 'import';
  path: StructuredPath;
}

/**
 * Embed directive data
 */
type EmbedSubtype = 'embedPath' | 'embedVariable' | 'embedTemplate';
type InterpolatableValue = Array<TextNode | VariableReferenceNode>;

export interface EmbedDirectiveData extends DirectiveData {
  kind: 'embed';
  subtype: EmbedSubtype;

  // --- Common --- 
  // Used for subtype = 'embedPath' AND 'embedVariable'
  // For embedVariable, the structure within PathValueObject differs for text vs path vars
  path?: StructuredPath;
  
  // --- Optional Modifiers --- 
  section?: string; // Optional section identifier (subtype = 'embedPath')
  names?: string[]; // Optional list of specific names (subtype = 'embedPath')
  options?: { [key: string]: string }; // Key-value options (multiple subtypes)
  headerLevel?: number; // Header level adjustment (multiple subtypes)
  underHeader?: string; // Target header for embedding (multiple subtypes)

  // --- Specific to subtypes --- 
  // subtype = 'embedTemplate' only
  content?: InterpolatableValue;
}

/**
 * Path directive data
 */
export interface PathDirectiveData extends DirectiveData {
  kind: 'path';
  identifier: string;
  path: StructuredPath;
}

/**
 * Command metadata fields
 * Only available for @define directives
 * Used for documentation and security
 */
export interface CommandMetadata {
  /** General risk description */
  risk?: string;
  /** High risk warning */
  'risk.high'?: string;
  /** Medium risk warning */
  'risk.med'?: string;
  /** Low risk warning */
  'risk.low'?: string;
  /** Command description/documentation */
  about?: string;
  /** Additional metadata as key-value pairs */
  meta?: Record<string, any>;
}

/**
 * Command definition with metadata
 */
export interface CommandDefinition {
  kind: 'define';
  name: string;
  command?: {
    kind: 'run';
    command: string;
  };
  parameters?: string[];
  metadata?: CommandMetadata;
} 