import type { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import type { OutputFormat } from '@services/pipeline/OutputService/IOutputService.js';
import type { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import type { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { StateService } from '@services/state/StateService/StateService.js';
import type { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import type { PathService } from '@services/fs/PathService/PathService.js';
import type { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import type { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import type { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import type { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import type { StateDebuggerService as DebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import type { TransformationOptions } from './state.js';
import type { StateServiceLike } from '@core/shared-service-types';
import type { ResolutionContext } from './resolution';
import type { MeldNode } from '@core/syntax/types';

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
  fs?: NodeFileSystem;
  /** Optional service overrides */
  services?: Partial<Services>;
  /** Controls whether to apply Prettier formatting to the output */
  pretty?: boolean;
}

/**
 * Centralized export point for core Meld types.
 */

// Fix: Explicitly export from common.js, excluding SourceLocation
export {
  type JsonValue,
  type JsonObject,
  type JsonArray,
  type Result,
  success,
  failure,
  type DirectiveReplacement,
  StringLiteralType
} from './common.js';

export * from './variables.js';
export * from './paths.js';
export * from './define.js';
export * from './state.js';
export * from '../errors/index.js';
export * from './embed.js';
export * from './dependencies.js';

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
 */
export interface FormattingContext {
  isOutputLiteral?: boolean; // True if output should be treated literally (e.g., transformation mode)
  contextType?: 'inline' | 'block'; // Hints whether the context is inline text or a block element
  nodeType?: string; // The type of the node being processed
  atLineStart?: boolean; // True if the current processing point is at the start of a line
  atLineEnd?: boolean; // True if the current processing point is at the end of a line
  [key: string]: any; // Allow for additional properties
}

/**
 * Context specific to the execution of @run directives.
 * Based on _spec/types/run-spec.md
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
  state: StateServiceLike;
  /** The context for resolving variables within the directive. */
  resolutionContext: ResolutionContext;
  /** The context related to formatting (e.g., newline handling). */
  formattingContext: FormattingContext;
  /** The context specific to command execution (only present for @run directives). */
  executionContext?: ExecutionContext;
  /** The original directive node being processed. */
  directiveNode: MeldNode; // Added to provide direct access to the node
}

// --- END NEW CONTEXT TYPE DEFINITIONS ---

export type {
  FormattingContext,
  ExecutionContext,
  DirectiveProcessingContext,
} 