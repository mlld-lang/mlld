/**
 * Metadata type definitions for Mlld directives
 */

/**
 * Base metadata interface with optional categories
 */
export interface DirectiveMeta {
  path?: PathMeta;
  // Other metadata categories can be added here in the future
}

/**
 * Path-specific metadata used by multiple directives
 */
export interface PathMeta {
  hasVariables: boolean;
  isAbsolute: boolean;
  hasExtension: boolean;
  extension: string | null;
}

/**
 * Import directive metadata
 */
export interface ImportMeta extends DirectiveMeta {
  path: PathMeta; // Path metadata is required for import directives
}

/**
 * Export directive metadata
 */
export interface ExportMeta extends DirectiveMeta {
  exportCount: number; // Number of exports in the directive
  isWildcard: boolean; // True if exports contain '*'
}

/**
 * Text directive metadata
 */
export interface TextMeta extends DirectiveMeta {
  sourceType?: 'literal' | 'embed' | 'run' | 'directive';
  directive?: 'run' | 'add';
  hasVariables?: boolean;
  run?: {
    language?: string;
    isMultiLine?: boolean;
    isCommandRef?: boolean;
    commandName?: string;
  };
  add?: Record<string, unknown>;
}

/**
 * Embed directive metadata
 */
export interface EmbedMeta extends DirectiveMeta {
  path: PathMeta; // Path metadata is required for embed directives
  section?: {
    name: string;
    // Section-specific metadata
  };
}

/**
 * Path directive metadata
 */
export interface PathDirectiveMeta extends DirectiveMeta {
  path: PathMeta; // Path metadata is required for path directives
}

/**
 * Run directive metadata
 */
export interface RunMeta extends DirectiveMeta {
  riskLevel?: 'low' | 'medium' | 'high';
  // Command execution metadata
}

/**
 * Define directive metadata
 */
export interface DefineMeta extends DirectiveMeta {
  // Definition metadata
}

/**
 * Data directive metadata
 */
export interface DataMeta extends DirectiveMeta {
  // Data-specific metadata
}