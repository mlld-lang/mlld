```typescript
/**
 * Source code range information for error reporting and debugging
 */
export interface ISourceRange {
  // This is a placeholder for the actual ISourceRange interface
  // which would be defined elsewhere in the codebase
}

/**
 * Defines the possible command types that can be executed in a run directive
 */
export enum RunCommandType {
  BASIC = "basic",
  LANGUAGE = "language",
  DEFINED = "defined",
  SERVICE = "service",
  SHELL = "shell",
  NODE = "node",
  PYTHON = "python"
}

/**
 * Defines how the output of the run command should be processed
 */
export enum RunOutputMode {
  RAW = "raw",
  TEXT = "text",
  JSON = "json",
  LINES = "lines",
  NONE = "none"
}

/**
 * Determines what output streams should be captured
 */
export enum RunCaptureMode {
  STDOUT = "stdout",
  STDERR = "stderr",
  BOTH = "both",
  NONE = "none"
}

/**
 * Determines how the command should be executed
 */
export enum RunExecutionMode {
  SYNC = "sync",
  ASYNC = "async",
  STREAM = "stream"
}

/**
 * Determines behavior when command fails
 */
export enum RunErrorHandling {
  IGNORE = "ignore",
  WARN = "warn",
  ERROR = "error"
}

/**
 * Result of the command execution
 */
export interface RunExecutionResult {
  /** Standard output from the command */
  stdout: string;
  
  /** Standard error from the command */
  stderr: string;
  
  /** Exit code from the command */
  exitCode: number;
}

/**
 * Represents the core structure for a run directive in Meld.
 * This defines the parameters for executing commands through the run directive.
 */
export interface MeldRunDirective {
  /**
   * Identifies this as a run directive
   * Required by InterpreterService and StateService for directive type discrimination
   */
  directiveType: "run";
  
  /**
   * The command to be executed in the run directive
   * Required by all services (ParserService, InterpreterService, DirectiveService, ResolutionService)
   * @validation Must be a non-empty string
   */
  command: string;
  
  /**
   * Arguments to be passed to the command
   * Required by all services
   * @validation Must be an array of strings or properly structured objects based on commandType
   */
  args: string[];
  
  /**
   * Input to be piped to the command's standard input
   * Optional input mentioned by ParserService and DirectiveService
   */
  stdin?: string;
  
  /**
   * Working directory for the command execution
   * Required for proper command execution context
   * @validation If provided, must be a valid directory path or resolvable to one
   */
  cwd?: string;
  
  /**
   * Environment variables for the command execution
   * Necessary for command execution context
   * @validation If provided, all values must be strings or resolvable to strings
   */
  env?: Record<string, string>;
  
  /**
   * Whether to run the command in a shell
   * Can be boolean or string for specific shell path
   */
  shell: boolean | string;
  
  /**
   * Maximum execution time in milliseconds
   * @validation If provided, must be a positive number
   */
  timeout?: number;
  
  /**
   * Source code range information for error reporting and debugging
   * Required by ParserService
   */
  sourceRange: ISourceRange;
  
  /**
   * Result of the command execution
   */
  executionResult?: RunExecutionResult;
  
  /**
   * Key to store execution state in StateService
   * Required by StateService to properly store and retrieve command outputs
   * @validation If provided, must be a valid string identifier (no spaces, special characters limited to underscore and dot)
   */
  stateKey?: string;
  
  /**
   * Distinguishes between different types of commands that can be executed
   */
  commandType?: RunCommandType;
  
  /**
   * Determines how the output of the run command should be processed
   * @validation If specified, must be one of the allowed values
   */
  outputMode?: RunOutputMode;
  
  /**
   * Determines what output streams should be captured
   */
  captureMode?: RunCaptureMode;
  
  /**
   * Determines how the command should be executed
   */
  executionMode?: RunExecutionMode;
  
  /**
   * Determines behavior when command fails
   */
  errorHandling?: RunErrorHandling;
  
  /**
   * Unique identifier for this directive instance
   * @validation Must be unique within the current execution context
   */
  id?: string;
}
```