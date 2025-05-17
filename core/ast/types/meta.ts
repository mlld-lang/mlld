/**
 * Metadata type definitions for Meld directives
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
  hasVariables: boolean;    // Contains any variables (text or path)
}

/**
 * Import directive metadata
 */
export interface ImportMeta extends DirectiveMeta {
  path: PathMeta; // Path metadata is required for import directives
}

/**
 * Text directive metadata
 */
export interface TextMeta extends DirectiveMeta {
  // Currently just the base metadata
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
export interface PathMeta extends DirectiveMeta {
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