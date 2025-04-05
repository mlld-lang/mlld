/**
 * Types related to variable resolution context.
 */

import type { VariableType } from './variables.js';
import type { IStateService } from './state.js';
import type { StringLiteralType } from './common.js';
import type { MeldNode } from './ast-types';
import type { MeldValue } from './variables.js';
import type { Result } from './common.js';
import type { MeldPath, PathContentType, PathPurpose } from './paths.js';

/**
 * Context passed during variable resolution.
 *
 * @remarks Enhanced based on feedback from multiple service leads to support
 * more comprehensive context flags and immutable context manipulation.
 */
export interface ResolutionContext {
  /** State service for accessing variables */
  readonly state: IStateService;
  
  /** Whether to throw errors for missing variables */
  readonly strict: boolean;
  
  /** Current resolution depth (for circular reference detection) */
  readonly depth: number;
  
  /** Variable types allowed in this context */
  readonly allowedVariableTypes?: VariableType[];
  
  /** Special flags for modifying resolution behavior */
  readonly flags: ResolutionFlags;
  
  /** Formatting context for output generation */
  readonly formattingContext?: FormattingContext;
  
  /** Path resolution context for path handling */
  readonly pathContext?: PathResolutionContext;
  
  /** Parser-specific flags */
  readonly parserFlags?: ParserFlags;
  
  /** Create a new context with increased depth */
  withIncreasedDepth(): ResolutionContext;
  
  /** Create a new context with different strictness */
  withStrictMode(strict: boolean): ResolutionContext;
  
  /** Create a new context with specific allowed variable types */
  withAllowedTypes(types: VariableType[]): ResolutionContext;
  
  /** Create a new context with additional flags */
  withFlags(flags: Partial<ResolutionFlags>): ResolutionContext;
  
  /** Create a new context with formatting context */
  withFormattingContext(formatting: Partial<FormattingContext>): ResolutionContext;
  
  /** Create a new context with path context */
  withPathContext(pathContext: Partial<PathResolutionContext>): ResolutionContext;
  
  /** Create a new context with parser flags */
  withParserFlags(flags: Partial<ParserFlags>): ResolutionContext;
}

/**
 * Flags that modify variable resolution behavior.
 *
 * @remarks Enhanced based on feedback from multiple service leads to support
 * more comprehensive flags for controlling resolution behavior.
 */
export interface ResolutionFlags {
  /** Disable path prefixing for variable embedding */
  isVariableEmbed: boolean;
  
  /** Enable transformation mode */
  isTransformation: boolean;
  
  /** Allow resolution in raw content (pre-parsing) */
  allowRawContentResolution: boolean;
  
  /** Whether we're in a directive handler */
  isDirectiveHandler: boolean;
  
  /** Whether we're in an import context */
  isImportContext: boolean;
  
  /** Whether to process nested variables */
  processNestedVariables: boolean;
}

/**
 * Context for formatting resolved variable values.
 *
 * @remarks Enhanced based on feedback from multiple service leads to support
 * more comprehensive formatting options.
 */
export interface FormattingContext {
  /** Whether the variable is in a block context */
  isBlock: boolean;
  
  /** Type of node containing the variable */
  nodeType?: string;
  
  /** Position of the variable in the line */
  linePosition?: 'start' | 'middle' | 'end';
  
  /** Indentation level for block formatting */
  indentationLevel?: number;
  
  /** Whether to preserve literal output formatting */
  preserveLiteralFormatting: boolean;
  
  /** Whether to preserve whitespace */
  preserveWhitespace: boolean;
  
  /** Context about surrounding content */
  surroundingContent?: {
    before?: string;
    after?: string;
  };
  
  /** Document formatting settings */
  documentSettings?: DocumentFormattingSettings;
}

/**
 * Document-level formatting settings.
 *
 * @remarks Added based on ContentResolution service lead feedback to help
 * maintain document formatting during resolution.
 */
export interface DocumentFormattingSettings {
  /** Line ending style */
  lineEnding: 'lf' | 'crlf';
  
  /** Indentation style */
  indentation: 'spaces' | 'tabs';
  
  /** Indentation size */
  indentSize: number;
}

/**
 * Context for path resolution operations.
 *
 * @remarks Added based on ResolutionCore, FileSystemCore, and CoreDirective
 * service lead feedback to strengthen path handling security.
 */
export interface PathResolutionContext {
  /** Base directory for relative path resolution */
  baseDir: string;
  
  /** Whether to allow traversal outside the project root */
  allowTraversal: boolean;
  
  /** Purpose of the path resolution for validation */
  purpose: PathPurpose;
  
  /** Additional validation constraints */
  constraints?: PathConstraints;
}

/**
 * Purpose of path resolution for validation.
 */
export enum PathPurpose {
  READ = 'read',
  WRITE = 'write',
  EXECUTE = 'execute',
  IMPORT = 'import',
  EMBED = 'embed'
}

/**
 * Additional constraints for path validation.
 */
export interface PathConstraints {
  /** Allowed file extensions */
  allowedExtensions?: string[];
  
  /** Allowed path patterns */
  allowedPatterns?: RegExp[];
  
  /** Denied path patterns */
  deniedPatterns?: RegExp[];
  
  /** Whether to require the file to exist */
  mustExist?: boolean;
}

/**
 * Parser-specific flags for resolution context.
 *
 * @remarks Added based on ParserCore service lead feedback to support
 * parser-specific resolution needs.
 */
export interface ParserFlags {
  /** Whether to parse variable references in raw content */
  parseInRawContent: boolean;
  
  /** Whether to parse variable references in code blocks */
  parseInCodeBlocks: boolean;
  
  /** Whether to resolve variables during parsing */
  resolveVariablesDuringParsing: boolean;
  
  /** Types of literals to parse */
  parseLiteralTypes: StringLiteralType[];
}

// Define FieldAccessType enum here
export enum FieldAccessType {
  PROPERTY = 'property',
  INDEX = 'index'
}

// Define FieldAccess interface here (or ensure it exists)
export interface FieldAccess {
  type: FieldAccessType; // Use the enum
  key: string | number;
}

/**
 * Defines the type of variable being referenced or resolved.
 */
export interface VariableReference {
  // Add any necessary properties for a variable reference
} 