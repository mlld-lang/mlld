/**
 * Variable Type Definitions
 * 
 * Pure type definitions for mlld's unified variable system.
 * This module contains only interfaces, types, and enums with no implementation.
 */

import { SourceLocation } from '../index';

// =========================================================================
// BASE TYPES
// =========================================================================

/**
 * Common fields shared by all variable types
 */
export interface BaseVariable {
  name: string;
  createdAt: number;
  modifiedAt: number;
  definedAt?: SourceLocation;
  source: VariableSource;
}

/**
 * Metadata about how a variable was created
 */
export interface VariableSource {
  directive: 'var'; // Always 'var' in the new system
  syntax: 'quoted' | 'template' | 'array' | 'object' | 'command' | 'code' | 'path' | 'reference';
  wrapperType?: 'singleQuote' | 'doubleQuote' | 'backtick' | 'brackets' | 'doubleColon' | 'tripleColon';
  hasInterpolation: boolean;
  isMultiLine: boolean;
}

/**
 * Extended metadata for variables
 */
export interface VariableMetadata extends Record<string, any> {
  isImported?: boolean;
  importPath?: string;
  isComplex?: boolean;
  isPipelineInput?: boolean;
  pipelineStage?: number;
  
  // Retryability tracking for pipelines
  isRetryable?: boolean; // true if variable came from function execution
  sourceFunction?: any;  // Reference to the original function for re-execution
  
  // Array-specific metadata
  arrayType?: 'renamed-content' | 'load-content-result' | 'regular';
  joinSeparator?: string; // '\n\n' for special arrays
  
  // Behavior preservation
  customToString?: () => string;
  customToJSON?: () => any;
  contentGetter?: () => string;
  
  // Content loading metadata
  fromGlobPattern?: boolean;
  globPattern?: string;
  fileCount?: number;
  
  // Header transformation metadata
  headerTransform?: {
    applied: boolean;
    template: string;
  };
  
  // Namespace metadata
  isNamespace?: boolean;
  
  // Template metadata
  templateAst?: any[]; // For lazy-evaluated templates
}

// =========================================================================
// VARIABLE TYPE DISCRIMINATORS
// =========================================================================

/**
 * Discriminator values for each variable type
 */
export type VariableTypeDiscriminator =
  | 'simple-text'
  | 'interpolated-text'
  | 'template'
  | 'file-content'
  | 'section-content'
  | 'object'
  | 'array'
  | 'computed'
  | 'command-result'
  | 'path'
  | 'imported'
  | 'executable'
  | 'pipeline-input'
  | 'primitive';

// =========================================================================
// TEXT VARIABLE TYPES
// =========================================================================

/**
 * Simple text without interpolation (single-quoted strings)
 */
export interface SimpleTextVariable extends BaseVariable {
  type: 'simple-text';
  value: string;
  metadata?: VariableMetadata;
}

/**
 * Text with interpolation (double-quoted or backtick strings)
 */
export interface InterpolatedTextVariable extends BaseVariable {
  type: 'interpolated-text';
  value: string;
  interpolationPoints: Array<{
    start: number;
    end: number;
    expression: string;
  }>;
  metadata?: VariableMetadata;
}

/**
 * Template strings with various interpolation syntaxes
 */
export interface TemplateVariable extends BaseVariable {
  type: 'template';
  value: string | any[]; // Allow array for lazy-evaluated templates
  parameters?: string[];
  templateSyntax: 'double-bracket' | 'backtick' | 'doubleColon' | 'tripleColon';
  metadata?: VariableMetadata;
}

// =========================================================================
// CONTENT VARIABLE TYPES
// =========================================================================

/**
 * Content loaded from a file
 */
export interface FileContentVariable extends BaseVariable {
  type: 'file-content';
  value: string;
  filePath: string;
  encoding?: string;
  metadata?: VariableMetadata;
}

/**
 * Content from a specific file section
 */
export interface SectionContentVariable extends BaseVariable {
  type: 'section-content';
  value: string;
  filePath: string;
  sectionName: string;
  sectionSyntax: 'hash' | 'bracket';
  metadata?: VariableMetadata;
}

// =========================================================================
// STRUCTURED DATA TYPES
// =========================================================================

/**
 * JavaScript objects
 */
export interface ObjectVariable extends BaseVariable {
  type: 'object';
  value: Record<string, any>;
  isComplex?: boolean; // Contains embedded directives
  metadata?: VariableMetadata;
}

/**
 * JavaScript arrays
 */
export interface ArrayVariable extends BaseVariable {
  type: 'array';
  value: unknown[];
  isComplex?: boolean; // Contains embedded directives
  metadata?: VariableMetadata;
}

// =========================================================================
// COMPUTED VARIABLE TYPES
// =========================================================================

/**
 * Results from code execution (JS, Node, etc.)
 */
export interface ComputedVariable extends BaseVariable {
  type: 'computed';
  value: unknown;
  language: 'js' | 'node' | 'python' | 'sh';
  sourceCode: string;
  metadata?: VariableMetadata;
}

/**
 * Output from shell commands
 */
export interface CommandResultVariable extends BaseVariable {
  type: 'command-result';
  value: string;
  command: string;
  exitCode?: number;
  stderr?: string;
  metadata?: VariableMetadata;
}

// =========================================================================
// SPECIAL VARIABLE TYPES
// =========================================================================

/**
 * Resolved file paths with security metadata
 */
export interface PathVariable extends BaseVariable {
  type: 'path';
  value: {
    resolvedPath: string;
    originalPath: string;
    isURL: boolean;
    isAbsolute: boolean;
    security?: {
      trust?: 'high' | 'medium' | 'low';
      ttl?: number;
    };
  };
  metadata?: VariableMetadata;
}

/**
 * Variables imported from files/modules
 */
export interface ImportedVariable extends BaseVariable {
  type: 'imported';
  value: unknown; // The actual imported value
  originalType: VariableTypeDiscriminator; // Type in the source file
  importSource: {
    path: string;
    isModule: boolean;
    variableName: string;
  };
  metadata?: VariableMetadata;
}

/**
 * Executable command definitions from @exe directive
 */
export interface ExecutableVariable extends BaseVariable {
  type: 'executable';
  value: {
    type: 'command' | 'code';
    template: string;
    language?: 'js' | 'node' | 'python' | 'sh' | 'bash';
  };
  paramNames: string[];
  metadata?: VariableMetadata;
}

/**
 * Special wrapper for pipeline stage inputs
 */
export interface PipelineInputVariable extends BaseVariable {
  type: 'pipeline-input';
  value: PipelineInput; // The lazy-parsed wrapper object
  format: 'json' | 'csv' | 'xml' | 'text';
  rawText: string; // Original text before wrapping
  metadata: VariableMetadata & {
    isPipelineInput: true;
    pipelineStage?: number;
  };
}

/**
 * Primitive values (numbers, booleans, null)
 */
export interface PrimitiveVariable extends BaseVariable {
  type: 'primitive';
  value: number | boolean | null;
  primitiveType: 'number' | 'boolean' | 'null';
  metadata?: VariableMetadata;
}

/**
 * Pipeline input wrapper interface
 */
export interface PipelineInput {
  text: string;
  data?: unknown;
  csv?: unknown;
  xml?: unknown;
  json?: unknown;
  toString(): string;
}


// =========================================================================
// DISCRIMINATED UNION
// =========================================================================

/**
 * Unified variable type - discriminated union of all variable types
 */
export type Variable =
  | SimpleTextVariable
  | InterpolatedTextVariable
  | TemplateVariable
  | FileContentVariable
  | SectionContentVariable
  | ObjectVariable
  | ArrayVariable
  | ComputedVariable
  | CommandResultVariable
  | PathVariable
  | ImportedVariable
  | ExecutableVariable
  | PipelineInputVariable
  | PrimitiveVariable;

// =========================================================================
// COMPOSITE TYPE ALIASES
// =========================================================================

/**
 * Union type for text-like variables
 */
export type TextLikeVariable = SimpleTextVariable | InterpolatedTextVariable | TemplateVariable | FileContentVariable | SectionContentVariable | CommandResultVariable;

/**
 * Union type for structured data variables
 */
export type StructuredVariable = ObjectVariable | ArrayVariable;

/**
 * Union type for variables created from external content
 */
export type ExternalVariable = FileContentVariable | SectionContentVariable | ImportedVariable | CommandResultVariable | ComputedVariable;