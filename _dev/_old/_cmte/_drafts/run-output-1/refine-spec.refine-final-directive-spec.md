Based on the initial draft and feedback from all service teams, here's the refined TypeScript type specification for the `run` directive:

```typescript
/**
 * Supported programming languages for language-specific execution.
 * 
 * @remarks Using a string union instead of 'string' to improve type safety while
 * allowing for future language additions through the string fallback.
 */
export type RunLanguage = 
  | 'javascript' 
  | 'typescript' 
  | 'python' 
  | 'shell' 
  | 'bash'
  | 'powershell'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp'
  | string;

/**
 * Execution context for run directives.
 * Specifies where and how the command should be executed.
 */
export type ExecutionContext = 'local' | 'remote' | 'sandbox' | 'container' | 'shell' | 'direct';

/**
 * Command types for the run directive.
 * Distinguishes between different kinds of commands.
 */
export type CommandType = 'basic' | 'language' | 'defined';

/**
 * Error handling strategies for run directives.
 * Determines how execution errors should be handled.
 */
export type ErrorHandlingStrategy = 'continue' | 'fail' | 'retry' | ((error: Error) => any);

/**
 * State update strategies for run directive results.
 * Controls how command results are stored in state.
 */
export type StateUpdateStrategy = 'replace' | 'merge' | 'append';

/**
 * State persistence scope for run directive results.
 * Determines how long and where results should be stored.
 */
export type StatePersistenceScope = 'session' | 'document' | 'global' | 'temporary';

/**
 * Resolution strategy for variable interpolation.
 * Controls how aggressively variables should be resolved.
 */
export type ResolutionStrategy = 'strict' | 'lenient' | 'none';

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
 * Execution context configuration with constraints.
 */
export interface ExecutionContextConfig {
  /**
   * Type of execution context.
   */
  type: ExecutionContext;
  
  /**
   * Optional constraints for the execution environment.
   */
  constraints?: {
    /**
     * Maximum memory allowed in MB.
     */
    maxMemory?: number;
    
    /**
     * Maximum CPU usage allowed (percentage or cores).
     */
    maxCpu?: number;
    
    /**
     * Whether network access is allowed.
     */
    networkAccess?: boolean;
    
    /**
     * List of paths the command is allowed to access.
     */
    allowedPaths?: string[];
  };
}

/**
 * Structure for embedded code blocks in language commands.
 */
export interface CodeBlock {
  /**
   * The source code content.
   */
  content: string;
  
  /**
   * The programming language of the code.
   */
  language: RunLanguage;
  
  /**
   * Source location of the code block.
   */
  range?: Range;
}

/**
 * Result of a run directive execution.
 */
export interface RunResult {
  /**
   * Exit code returned by the command.
   */
  exitCode: number;
  
  /**
   * Standard output from the command.
   */
  stdout?: string;
  
  /**
   * Standard error output from the command.
   */
  stderr?: string;
  
  /**
   * Execution duration in milliseconds.
   */
  duration: number;
  
  /**
   * ISO timestamp when execution started.
   */
  startTime: string;
  
  /**
   * ISO timestamp when execution completed.
   */
  endTime: string;
  
  /**
   * The command that was executed.
   */
  command: string;
  
  /**
   * Unique identifier of the run directive.
   */
  id: string;
  
  /**
   * Whether the execution was successful.
   */
  success: boolean;
}

/**
 * Base interface for all run directive parameters.
 */
export interface RunDirectiveBaseParams {
  /**
   * The command to execute.
   * @required This must be a non-empty string.
   * @remarks For language commands, this may be omitted if a codeBlock is provided.
   */
  command?: string;

  /**
   * Unique identifier for the run directive instance.
   * Required for tracking execution state.
   * @required Must be unique within a session/document.
   */
  id: string;

  /**
   * Arguments to be passed to the command execution.
   * Can be an array of strings or a record object.
   * @remarks These will undergo variable interpolation by the ResolutionService.
   */
  args?: string[] | Record<string, any>;

  /**
   * Working directory for command execution.
   * @remarks Path will be normalized by the PathResolver.
   */
  cwd?: string;

  /**
   * Environment variables for command execution.
   * @validation Values must be strings or valid variable references.
   * @remarks These will undergo variable interpolation by the ResolutionService.
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
   * The shell to use for execution.
   * Boolean true uses the default shell, false uses direct execution.
   */
  shell?: string | boolean;

  /**
   * Source location information for the directive.
   */
  range?: Range;

  /**
   * The key to store the result in state.
   * @validation Must follow state key naming conventions: alphanumeric, dots for hierarchy.
   */
  stateKey?: string;

  /**
   * Error handling strategy.
   */
  errorHandling?: ErrorHandlingStrategy;

  /**
   * Number of retry attempts for failed commands.
   * Only applicable when errorHandling is 'retry'.
   */
  retryCount?: number;

  /**
   * Whether to capture stderr separately.
   */
  captureError?: boolean;

  /**
   * Distinguishes between different types of commands.
   */
  commandType?: CommandType;

  /**
   * Execution context configuration.
   */
  executionContext?: ExecutionContext | ExecutionContextConfig;

  /**
   * Standard input to be provided to the command.
   */
  stdin?: string;

  /**
   * Whether to execute the command asynchronously.
   */
  async?: boolean;

  /**
   * Whether to suppress command output in logs/console.
   */
  quiet?: boolean;

  /**
   * Identifier for a predefined command.
   * Required when commandType is 'defined'.
   */
  definedCommandId?: string;

  /**
   * The original source text of the directive.
   * Used for error reporting and debugging.
   */
  sourceText?: string;

  /**
   * The file path where this directive was found.
   */
  sourcePath?: string;

  /**
   * Non-fatal parsing issues encountered while processing the directive.
   */
  parseErrors?: string[];

  /**
   * Whether the directive was properly formed.
   */
  isValid?: boolean;

  /**
   * Dependencies on other run directives by their IDs.
   * Used for tracking execution dependencies.
   */
  dependsOn?: string[];

  /**
   *