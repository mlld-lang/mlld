```typescript
/**
 * Supported programming languages for language-specific execution.
 */
export type RunLanguage = 'javascript' | 'typescript' | 'python' | 'shell' | string;

/**
 * Execution context for run directives.
 */
export type ExecutionContext = 'local' | 'remote' | 'sandbox' | 'container' | 'shell' | 'direct';

/**
 * Command types for the run directive.
 */
export type CommandType = 'basic' | 'language' | 'defined';

/**
 * Error handling strategies for run directives.
 */
export type ErrorHandlingStrategy = 'continue' | 'fail' | ((error: Error) => any);

/**
 * Source location information for the directive.
 */
export interface Range {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
}

/**
 * Base interface for all run directive parameters.
 */
export interface MeldRunDirectiveBaseParams {
  /**
   * The command to execute.
   * @required This must be a non-empty string.
   */
  command: string;

  /**
   * Unique identifier for the run directive instance.
   * Required by InterpreterService and StateService for tracking execution state.
   * @required Must be unique within a session/document.
   */
  id: string;

  /**
   * Arguments to be passed to the command execution.
   * Can be an array of strings or a record object.
   */
  args?: string[] | Record<string, any>;

  /**
   * Working directory for command execution.
   */
  cwd?: string;
  
  /**
   * Alias for cwd - working directory for command execution.
   */
  workingDir?: string;

  /**
   * Environment variables for command execution.
   * @validation Values must be strings or valid variable references.
   */
  env?: Record<string, string>;

  /**
   * Whether to capture and return command output.
   * Acts as a discriminator for output handling.
   */
  captureOutput?: boolean;

  /**
   * Maximum execution time in milliseconds.
   * @validation Must be a positive integer.
   */
  timeout?: number;

  /**
   * Whether to cache/execute the result of this run directive only once.
   * @validation Directive must have deterministic inputs when true.
   */
  memoize?: boolean;
  
  /**
   * Alias for memoize - execute the result of this run directive only once.
   * @validation Directive must have deterministic inputs when true.
   */
  once?: boolean;

  /**
   * The shell to use for execution.
   */
  shell?: string | boolean;

  /**
   * Source location information for the directive.
   * @required Must have valid start and end positions.
   */
  range: Range;

  /**
   * The key to store the result in state.
   * @validation Must follow state key naming conventions.
   */
  stateKey?: string;

  /**
   * Error handling strategy.
   */
  errorHandling?: ErrorHandlingStrategy;

  /**
   * Whether to capture stderr separately.
   */
  captureError?: boolean;

  /**
   * Distinguishes between different types of commands.
   */
  commandType?: CommandType;

  /**
   * Distinguishes between different execution contexts.
   */
  executionContext?: ExecutionContext;
}

/**
 * Interface for run directives that capture output.
 */
export interface MeldRunDirectiveWithOutputParams extends MeldRunDirectiveBaseParams {
  /**
   * Indicates that output will be captured.
   */
  captureOutput: true;

  /**
   * Variable name where captured output will be stored.
   * @required When captureOutput is true.
   * @validation Must be a valid variable name string.
   */
  outputVariable: string;

  /**
   * Variable name where error output will be stored.
   * Only relevant when captureError is true.
   */
  errorOutputVariable?: string;
}

/**
 * Interface for run directives that don't capture output.
 */
export interface MeldRunDirectiveWithoutOutputParams extends MeldRunDirectiveBaseParams {
  captureOutput?: false;
  outputVariable?: never;
  errorOutputVariable?: never;
}

/**
 * Interface for language-specific run directives.
 */
export interface MeldRunDirectiveLanguageParams extends MeldRunDirectiveBaseParams {
  /**
   * Indicates this is a language-specific command.
   */
  commandType: 'language';

  /**
   * Programming language of the code to be executed.
   * @required For language commands.
   * @validation Must be one of the supported languages.
   */
  language: RunLanguage;
}

/**
 * Discriminated union type for all run directive parameter variations.
 */
export type MeldRunDirectiveParams = 
  | MeldRunDirectiveWithOutputParams 
  | MeldRunDirectiveWithoutOutputParams
  | MeldRunDirectiveLanguageParams;

/**
 * Represents a run directive node in the Meld AST.
 */
export interface MeldRunDirective {
  /**
   * Type of the directive.
   */
  type: 'run';

  /**
   * Parameters for the run directive.
   */
  params: MeldRunDirectiveParams;
}
```