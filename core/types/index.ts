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