/**
 * Type definitions for directive raw text values
 */

/**
 * Import directive raw values
 */
export interface ImportRaw {
  imports?: string;
  namespace?: string;
  path: string;
  importType?: string;
  securityLabels?: string;
}

/**
 * Export directive raw values
 */
export interface ExportRaw {
  exports: string;
}

/**
 * Text directive raw values
 */
export interface TextRaw {
  variable: string;
  format?: string;
}

/**
 * Embed directive raw values
 */
export interface EmbedRaw {
  path?: string;
  variable?: string;
  content?: string;
  section?: string;
  options?: string;
}

/**
 * Path directive raw values
 */
export interface PathRaw {
  identifier: string;
  path: string;
}

/**
 * Run directive raw values
 */
export interface RunRaw {
  command: string;
  parameters?: string;
  options?: string;
  securityLabels?: string;
}

/**
 * Define directive raw values
 */
export interface DefineRaw {
  name: string;
  command?: string;
  parameters?: string;
}

/**
 * Data directive raw values
 */
export interface DataRaw {
  identifier: string;
  value: string;
}
