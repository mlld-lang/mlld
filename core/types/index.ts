import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import type { OutputFormat } from '@services/pipeline/OutputService/IOutputService';
import type { ParserService } from '@services/pipeline/ParserService/ParserService';
import type { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import type { StateService } from '@services/state/StateService/StateService';
import type { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import type { PathService } from '@services/fs/PathService/PathService';
import type { ValidationService } from '@services/resolution/ValidationService/ValidationService';
import type { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import type { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import type { OutputService } from '@services/pipeline/OutputService/OutputService';
import type { StateDebuggerService as DebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService';
import type { TransformationOptions } from './state';
import type { StateServiceLike } from '@core/shared-service-types';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import type { DependencyContainer } from 'tsyringe';
import type {
  ResolutionContext as ResolutionContextImport,
  ResolutionFlags,
  FormattingContext as ResolutionFormattingContext,
  DocumentFormattingSettings,
  PathResolutionContext,
  PathConstraints,
  ParserFlags
} from './resolution';
import type {
  EmbedType,
  BaseEmbedParams,
  PathEmbedParams,
  VariableEmbedParams,
  TemplateEmbedParams,
  VariableReference as EmbedVariableReference,
  FieldAccess,
  EmbedParams,
  EmbedResolutionContext,
  SourceLocation as EmbedSourceLocation,
  EmbedResult
} from './add';
import type { MeldNode } from '@core/ast/types/index';
import type { DirectiveNode } from '@core/ast/types/index';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';

/**
 * Represents a position in a file
 */
export interface Position {
  /** The line number (1-based) */
  line: number;
  /** The column number (1-based) */
  column: number;
}

/**
 * Represents a location in a file
 */
export interface Location {
  /** Start position */
  start: Position;
  /** End position */
  end: Position;
  /** Optional file path */
  filePath?: string;
}

/**
 * Represents a range in a file with start and end positions
 * @deprecated Use Location instead as it already includes start/end positions
 */
export interface Range {
  start: Position;
  end: Position;
  filePath?: string;
}

export interface Services {
  parser: ParserService;
  interpreter: InterpreterService;
  state: StateService;
  resolution: ResolutionService;
  path: PathService;
  validation: ValidationService;
  circularity: CircularityService;
  directive: DirectiveService;
  output: OutputService;
  debug?: DebuggerService;
}

export interface ProcessOptions {
  /** 
   * Controls whether directives should be transformed 
   * @deprecated This option is maintained for backward compatibility but has no effect.
   * Transformation is always enabled regardless of this setting.
   */
  transformation?: boolean | TransformationOptions;
  /** Controls output format */
  format?: OutputFormat;
  /** Enables/disables debugging */
  debug?: boolean;
  /** Optional custom filesystem */
  fs?: IFileSystem;
  /** Optional service overrides - DEPRECATED: Pass individual services instead */
  services?: Partial<Services>;
  /** Controls whether to apply Prettier formatting to the output */
  pretty?: boolean;
  /** Optional pre-configured DI container - Might become redundant if passing services */
  container?: DependencyContainer;
  /**
   * A file path associated with the input content. Used for resolving relative paths in directives like @import.
   */
  filePath?: string;
}

/**
 * Centralized export point for core Meld types.
 */

// New unified type structure exports
export * from './base';
export * from './nodes';
export * from './directives';
export * from './services';
export * from './system';
export * from './extensions';

// Export types from common.js, including SourceLocation
export {
  type JsonValue,
  type JsonObject,
  type JsonArray,
  type Result,
  success,
  failure,
  type DirectiveReplacement,
  StringLiteralType,
  type SourceLocation
} from './common';

export * from './variables';
export * from './paths';
export * from './exec';
export * from './state';
export * from '../errors/index';
export * from './dependencies';
export * from './guards';

// Explicitly export types from resolution and embed using aliases where needed
export type { 
  ResolutionContextImport as ResolutionContext, 
  ResolutionFlags, 
  ResolutionFormattingContext,
  DocumentFormattingSettings, 
  PathResolutionContext, 
  PathConstraints, 
  ParserFlags 
};
export type { 
  EmbedType,
  BaseEmbedParams,
  PathEmbedParams,
  VariableEmbedParams,
  TemplateEmbedParams,
  EmbedVariableReference as VariableReference,
  FieldAccess,
  EmbedParams,
  EmbedResolutionContext,
  EmbedResult
};

// Generic utility types (if any, keep minimal)
export type Maybe<T> = T | null | undefined;

// TODO: Consolidate other core types (e.g., from specs) here. 

// Fix: Remove .js extension from exports
// export * from './result'; // Commented out - file might be missing
// export * from './ast-types'; // Commented out - file might be missing

// Add export for the new guards file 

// --- NEW CONTEXT TYPE DEFINITIONS ---

/**
 * Context related to formatting output, particularly newline handling.
 * Renamed to avoid conflict with ResolutionFormattingContext.
 */
export interface OutputFormattingContext {
  isOutputLiteral?: boolean; // True if output should be treated literally (e.g., transformation mode)
  contextType?: 'inline' | 'block'; // Hints whether the context is inline text or a block element
  nodeType?: string; // The type of the node being processed
  atLineStart?: boolean; // True if the current processing point is at the start of a line
  atLineEnd?: boolean; // True if the current processing point is at the end of a line
  [key: string]: any; // Allow for additional properties
}

/**
 * Context specific to the execution of @run directives.
 */
export interface ExecutionContext {
  /** The current working directory for the command execution. */
  cwd: string;
  /** Environment variables for the command execution. */
  env?: Record<string, string>;
  /** Optional timeout for the command execution in milliseconds. */
  timeout?: number;
  /** Optional shell to use for execution. */
  shell?: string | boolean;
  /** Input string to pipe to the command's stdin. */
  stdin?: string;
  /** Whether to capture stdout. Defaults to true. */
  captureStdout?: boolean;
  /** Whether to capture stderr. Defaults to true. */
  captureStderr?: boolean;
  /** Whether to stream output (stdout/stderr) during execution. */
  streamOutput?: boolean;
  /** Risk level associated with the command. */
  riskLevel?: 'low' | 'medium' | 'high';
  /** Optional description of the command's purpose. */
  description?: string;
}

/**
 * Combined context object passed to directive handlers during interpretation.
 */
export interface DirectiveProcessingContext {
  /** The current state service instance for the directive to operate on. */
  state: IStateService;
  /** The context for resolving variables within the directive. */
  resolutionContext: ResolutionContextImport;
  /** The context related to formatting (e.g., newline handling). */
  formattingContext: OutputFormattingContext;
  /** The context specific to command execution (only present for @run directives). */
  executionContext?: ExecutionContext;
  /** The original directive node being processed. */
  directiveNode: DirectiveNode;
  /** Optional service for tracking circular imports during processing. */
  circularityService?: ICircularityService;
}

// --- END NEW CONTEXT TYPE DEFINITIONS ---

// Remove duplicate export block for these types
/*
export type {
  FormattingContext,
  ExecutionContext,
  DirectiveProcessingContext,
}
*/