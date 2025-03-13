import { DirectiveNode, DirectiveData } from './nodes';
import { StructuredPath } from './nodes';

export type DirectiveKind = 
  | 'run'
  | 'import'
  | 'embed'
  | 'define'
  | 'text'
  | 'path'
  | 'data'
  | 'api'
  | 'call';

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
export interface EmbedDirectiveData extends DirectiveData {
  kind: 'embed';
  path: StructuredPath;
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